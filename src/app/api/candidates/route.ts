import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);

  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "fit_score";
  const order = searchParams.get("order") === "asc" ? true : false;

  const { data, error, count } = await supabase
    .from("candidates")
    .select("*", { count: "exact" })
    .order(sort, { ascending: order })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidates: data, total: count });
}
