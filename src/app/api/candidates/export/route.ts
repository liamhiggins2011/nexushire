import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean);

  let query = supabase
    .from("candidates")
    .select("*")
    .order("fit_score", { ascending: false });

  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "Name",
    "Title",
    "Company",
    "Location",
    "Headline",
    "Fit Score",
    "YOE",
    "Avg Tenure",
    "Stability Score",
    "Growth Velocity",
    "Open to Work",
    "Company Pedigree",
    "Tech Stack",
    "Career Highlights",
    "Email",
    "GitHub",
    "Twitter",
    "Profile URL",
  ];

  const rows = (data || []).map((c) => [
    c.full_name,
    c.current_title || "",
    c.current_company || "",
    c.location || "",
    c.headline || "",
    c.fit_score?.toString() || "",
    c.total_yoe?.toString() || "",
    c.avg_tenure?.toString() || "",
    c.stability_score?.toString() || "",
    c.growth_velocity?.toString() || "",
    c.is_open_to_work ? "Yes" : "No",
    (c.company_pedigree || []).join("; "),
    (c.tech_stack || c.skills || []).join("; "),
    (c.career_highlights || []).join("; "),
    c.email || "",
    c.github_url || "",
    c.twitter_url || "",
    c.profile_url,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=candidates.csv",
    },
  });
}
