import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/anthropic";
import { searchGoogle } from "@/lib/serper";

const DEEP_DIVE_SYSTEM = `You are an expert talent researcher. Given aggregated data about a candidate from LinkedIn, GitHub, and Twitter/X, generate a comprehensive talent intelligence report.

Respond with valid JSON only (no markdown, no code fences):
{
  "career_narrative": "A 3-sentence summary of their professional journey, highlighting key transitions, growth patterns, and current trajectory.",
  "github_summary": "1-2 sentence summary of their GitHub presence, top languages, notable repos, or 'No GitHub activity found' if none.",
  "github_repos": <number or null>,
  "github_contributions": "Brief description of contribution patterns or null",
  "twitter_summary": "1-2 sentence summary of their Twitter/X presence, topics they discuss, or 'No Twitter activity found' if none.",
  "twitter_interests": ["array of topics/interests from their social presence"]
}`;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Search for GitHub profile
  const githubQuery = `site:github.com "${candidate.full_name}" ${candidate.current_company || ""}`.trim();
  let githubData = "";
  try {
    const githubResults = await searchGoogle(githubQuery, 3);
    const ghProfile = githubResults.find((r) => r.link.match(/github\.com\/[a-zA-Z0-9-]+$/));
    if (ghProfile) {
      githubData = `GitHub Profile: ${ghProfile.link}\nSnippet: ${ghProfile.snippet}`;
      // Update candidate's github_url if not set
      if (!candidate.github_url) {
        await supabase
          .from("candidates")
          .update({ github_url: ghProfile.link })
          .eq("id", id);
      }
    }
  } catch (e) {
    console.error("GitHub search failed:", e);
  }

  // Search for Twitter/X profile
  const twitterQuery = `(site:twitter.com OR site:x.com) "${candidate.full_name}" ${candidate.current_title || ""}`.trim();
  let twitterData = "";
  try {
    const twitterResults = await searchGoogle(twitterQuery, 3);
    const xProfile = twitterResults.find((r) =>
      r.link.match(/(twitter\.com|x\.com)\/[a-zA-Z0-9_]+$/)
    );
    if (xProfile) {
      twitterData = `Twitter/X Profile: ${xProfile.link}\nSnippet: ${xProfile.snippet}`;
      if (!candidate.twitter_url) {
        await supabase
          .from("candidates")
          .update({ twitter_url: xProfile.link })
          .eq("id", id);
      }
    }
  } catch (e) {
    console.error("Twitter search failed:", e);
  }

  // Build context for Claude
  const context = [
    `Candidate: ${candidate.full_name}`,
    `Current Role: ${candidate.current_title || "N/A"} at ${candidate.current_company || "N/A"}`,
    `Location: ${candidate.location || "N/A"}`,
    candidate.experience
      ? `Career History: ${candidate.experience
          .map((e: { title: string; company: string }) => `${e.title} at ${e.company}`)
          .join(" → ")}`
      : "",
    candidate.tech_stack
      ? `Tech Stack: ${candidate.tech_stack.join(", ")}`
      : "",
    candidate.career_highlights
      ? `Highlights: ${candidate.career_highlights.join("; ")}`
      : "",
    githubData ? `\n--- GitHub Data ---\n${githubData}` : "",
    twitterData ? `\n--- Twitter/X Data ---\n${twitterData}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await generateText(DEEP_DIVE_SYSTEM, context, 1024);

  let deepDive;
  try {
    deepDive = JSON.parse(response);
  } catch {
    deepDive = {
      career_narrative: response.slice(0, 500),
      github_summary: githubData ? "GitHub profile found" : null,
      github_repos: null,
      github_contributions: null,
      twitter_summary: twitterData ? "Twitter profile found" : null,
      twitter_interests: [],
    };
  }

  deepDive.enriched_at = new Date().toISOString();

  // Save to DB
  const { error: updateError } = await supabase
    .from("candidates")
    .update({
      deep_dive_data: deepDive,
      career_narrative: deepDive.career_narrative,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(deepDive);
}
