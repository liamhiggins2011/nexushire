import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/anthropic";
import { CANDIDATE_RANKER_SYSTEM } from "@/lib/prompts/candidate-ranker";

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

  // Get the most recent search query for context
  const { data: history } = await supabase
    .from("search_history")
    .select("natural_language_query")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const query = history?.natural_language_query || "general fit assessment";

  const profileSummary = [
    `Name: ${candidate.full_name}`,
    `Headline: ${candidate.headline || "N/A"}`,
    `Location: ${candidate.location || "N/A"}`,
    `Current: ${candidate.current_title || "N/A"} at ${candidate.current_company || "N/A"}`,
    candidate.skills ? `Skills: ${candidate.skills.join(", ")}` : "",
    candidate.experience
      ? `Experience: ${candidate.experience.map((e: { title: string; company: string }) => `${e.title} at ${e.company}`).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const rankingInput = `Search Query: "${query}"\n\nCandidate Profile:\n${profileSummary}`;
  const response = await generateText(CANDIDATE_RANKER_SYSTEM, rankingInput, 256);

  let fitScore = candidate.fit_score;
  let fitReasoning = candidate.fit_reasoning;

  try {
    const parsed = JSON.parse(response);
    fitScore = Math.min(100, Math.max(1, parsed.fitScore || 50));
    fitReasoning = parsed.fitReasoning || fitReasoning;
  } catch {
    // keep existing values
  }

  const { error: updateError } = await supabase
    .from("candidates")
    .update({
      fit_score: fitScore,
      fit_reasoning: fitReasoning,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ fit_score: fitScore, fit_reasoning: fitReasoning });
}
