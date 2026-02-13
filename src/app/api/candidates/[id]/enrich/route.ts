import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { scrapeUrl, resetFirecrawlFailures } from "@/lib/firecrawl";
import { generateText } from "@/lib/llm";
import { STRUCTURED_EXTRACTOR_SYSTEM } from "@/lib/prompts/structured-extractor";
import { CANDIDATE_RANKER_SYSTEM } from "@/lib/prompts/candidate-ranker";
import {
  calculateStabilityScore,
  calculateGrowthVelocity,
  calculateTotalYOE,
  calculateAvgTenure,
  detectCompanyPedigree,
  detectOpenToWork,
  parseMonthsFromDuration,
} from "@/lib/career-analytics";

/**
 * On-demand deep enrichment — triggered when user clicks "Expand" on a candidate card.
 * Scrapes the full LinkedIn profile via Firecrawl, then extracts structured data.
 */
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

  // Skip if already enriched (has raw_scraped_markdown)
  if (candidate.raw_scraped_markdown) {
    return NextResponse.json(candidate);
  }

  // 1. Scrape the profile
  resetFirecrawlFailures();
  const markdown = await scrapeUrl(candidate.profile_url);

  if (!markdown) {
    return NextResponse.json(
      { error: "Could not scrape profile (LinkedIn may be blocking). Try again later." },
      { status: 502 }
    );
  }

  // 2. Code-based extraction (Left Brain)
  const textLower = markdown.toLowerCase();
  const TECH_KEYWORDS = [
    "javascript", "typescript", "python", "java", "go", "rust", "c++", "c#",
    "ruby", "php", "swift", "kotlin", "scala", "sql",
    "react", "angular", "vue", "svelte", "next.js", "nuxt",
    "node.js", "express", "fastapi", "django", "flask", "spring",
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform",
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
    "graphql", "rest", "kafka",
    "machine learning", "deep learning", "nlp", "computer vision",
    "pytorch", "tensorflow", "pandas",
    "tailwind", "git", "ci/cd", "linux",
  ];
  const techStack = TECH_KEYWORDS.filter((kw) => textLower.includes(kw));

  // Parse experience from markdown
  const expRegex =
    /(?:^|\n)([A-Z][^\n]{3,60})\n([A-Z][^\n]{2,60})\n((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s*[-–]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|Present|Current)/gi;
  const experience: { title: string; company: string; start_date?: string; end_date?: string; months: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = expRegex.exec(markdown)) !== null) {
    experience.push({
      title: match[1].trim(),
      company: match[2].trim(),
      start_date: match[3],
      end_date: match[4],
      months: parseMonthsFromDuration(`${match[3]} - ${match[4]}`),
    });
  }

  // Location extraction
  const locMatch =
    markdown.match(/(?:Location|Based in|📍)\s*[:.]?\s*([A-Z][a-zA-Z\s,]+(?:Area|States|City|County)?)/) ||
    markdown.match(/([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*,\s*[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/);

  const totalYoe = experience.length > 0 ? calculateTotalYOE(experience) : 0;
  const avgTenure = experience.length > 0 ? calculateAvgTenure(experience) : 0;
  const stabilityScore = experience.length > 0 ? calculateStabilityScore(experience) : 0;
  const growthVelocity = experience.length > 0 ? calculateGrowthVelocity(experience) : 0;
  const companyPedigree = experience.length > 0 ? detectCompanyPedigree(experience) : [];
  const isOpenToWork = detectOpenToWork(candidate.headline, markdown);

  // 3. LLM fit scoring (Right Brain) — optional, best-effort
  let fitScore = candidate.fit_score || 50;
  let fitReasoning = candidate.fit_reasoning || null;

  try {
    // Get most recent search query for context
    const { data: history } = await supabase
      .from("search_history")
      .select("natural_language_query")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const query = history?.natural_language_query || "general fit assessment";

    const profileSummary = [
      `Name: ${candidate.full_name}`,
      `Current Role: ${candidate.headline || "N/A"}`,
      `Location: ${locMatch?.[1]?.trim() || candidate.location || "N/A"}`,
      `YOE: ${totalYoe}`,
      `Tech Stack: ${techStack.join(", ") || "N/A"}`,
      experience.length > 0
        ? `Experience: ${experience.map((e) => `${e.title} at ${e.company}`).join("; ")}`
        : "",
    ].filter(Boolean).join("\n");

    const rankingInput = `Search Query: "${query}"\n\nCandidate Profile:\n${profileSummary}`;
    const response = await generateText(CANDIDATE_RANKER_SYSTEM, rankingInput, 256);
    const parsed = JSON.parse(response);
    fitScore = Math.min(100, Math.max(1, parsed.fitScore || fitScore));
    fitReasoning = parsed.fitReasoning || fitReasoning;
  } catch {
    // Keep existing scores if LLM fails
  }

  // 4. Also try LLM extraction if code found no experience
  if (experience.length === 0) {
    try {
      const extractResponse = await generateText(STRUCTURED_EXTRACTOR_SYSTEM, markdown, 1024);
      const extracted = JSON.parse(extractResponse);
      if (extracted.experience?.length > 0) {
        experience.push(...extracted.experience);
      }
    } catch {
      // code extraction only
    }
  }

  // 5. Save enriched data
  const updateData: Record<string, unknown> = {
    raw_scraped_markdown: markdown,
    tech_stack: techStack.length > 0 ? techStack : (candidate.tech_stack || []),
    experience: experience.length > 0 ? experience : candidate.experience,
    location: locMatch?.[1]?.trim() || candidate.location,
    total_yoe: totalYoe || candidate.total_yoe,
    avg_tenure: avgTenure || candidate.avg_tenure,
    stability_score: stabilityScore || candidate.stability_score,
    growth_velocity: growthVelocity || candidate.growth_velocity,
    company_pedigree: companyPedigree.length > 0 ? companyPedigree : (candidate.company_pedigree || []),
    is_open_to_work: isOpenToWork || candidate.is_open_to_work,
    fit_score: fitScore,
    fit_reasoning: fitReasoning,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await supabase
    .from("candidates")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
