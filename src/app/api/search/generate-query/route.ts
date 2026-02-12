import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/anthropic";
import { DORK_GENERATOR_SYSTEM } from "@/lib/prompts/dork-generator";

export async function POST(request: NextRequest) {
  const { query } = await request.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const dork = await generateText(DORK_GENERATOR_SYSTEM, query, 256);
  return NextResponse.json({ dork: dork.trim() });
}
