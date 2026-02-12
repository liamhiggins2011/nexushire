import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/anthropic";
import { OUTREACH_WRITER_SYSTEM } from "@/lib/prompts/outreach-writer";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const { tone = "professional", project_id } = await request.json();

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  let projectContext = "";
  if (project_id) {
    const { data: project, error: projError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .single();
    if (!projError && project) {
      projectContext = `\nJob/Project: ${project.name}\nDescription: ${project.description || "N/A"}`;
    }
  }

  const candidateInfo = [
    `Name: ${candidate.full_name}`,
    `Current Role: ${candidate.current_title || "N/A"} at ${candidate.current_company || "N/A"}`,
    `Location: ${candidate.location || "N/A"}`,
    candidate.skills ? `Skills: ${candidate.skills.join(", ")}` : "",
    candidate.fit_reasoning ? `Why they're a fit: ${candidate.fit_reasoning}` : "",
    projectContext,
    `Tone: ${tone}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await generateText(OUTREACH_WRITER_SYSTEM, candidateInfo, 512);

  let subject = "";
  let body = "";
  try {
    const parsed = JSON.parse(response);
    subject = parsed.subject;
    body = parsed.body;
  } catch {
    body = response;
    subject = `Exciting opportunity for ${candidate.full_name}`;
  }

  // Save as draft
  const { error: insertError } = await supabase.from("outreach_drafts").insert({
    candidate_id: id,
    project_id: project_id || null,
    subject,
    body,
    tone,
    status: "draft",
  });

  if (insertError) {
    console.error("Failed to save outreach draft:", insertError);
  }

  return NextResponse.json({ subject, body });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const { subject, body, tone, project_id } = await request.json();

  // Insert a new draft (no unique constraint on candidate_id alone)
  const { data, error } = await supabase
    .from("outreach_drafts")
    .insert({
      candidate_id: id,
      project_id: project_id || null,
      subject,
      body,
      tone: tone || "professional",
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
