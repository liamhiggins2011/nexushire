import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("project_candidates")
    .select("*, candidate:candidates(*)")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidates: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const { candidate_ids } = await request.json();

  if (!candidate_ids || !Array.isArray(candidate_ids)) {
    return NextResponse.json(
      { error: "candidate_ids array is required" },
      { status: 400 }
    );
  }

  const records = candidate_ids.map((candidate_id: string) => ({
    project_id: id,
    candidate_id,
    status: "new",
  }));

  const { data, error } = await supabase
    .from("project_candidates")
    .upsert(records, { onConflict: "project_id,candidate_id" })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ added: data?.length || 0 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const { candidate_id, status, notes } = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from("project_candidates")
    .update(updates)
    .eq("project_id", id)
    .eq("candidate_id", candidate_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
