import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { scrapeUrl, resetFirecrawlFailures } from "@/lib/firecrawl";
import { enrichWithApollo } from "@/lib/apollo";
import { generateText } from "@/lib/llm";
import { STRUCTURED_EXTRACTOR_SYSTEM } from "@/lib/prompts/structured-extractor";
import { CANDIDATE_RANKER_SYSTEM } from "@/lib/prompts/candidate-ranker";
import {
  calculateStabilityScore,
  calculateGrowthVelocity,
  calculateTotalYOE,
  calculateAvgTenure,
  calculateTenureMath,
  detectCompanyPedigree,
  detectOpenToWork,
  parseMonthsFromDuration,
} from "@/lib/career-analytics";
import type { Candidate } from "@/types";

/**
 * On-demand deep enrichment — triggered when user clicks "Expand" on a candidate card.
 *
 * Flow: Apollo → (if sparse) Firecrawl fallback → code extraction → LLM extraction → save
 *
 * ?force=true — re-run LLM extraction from existing raw_scraped_markdown (no re-scrape, no re-Apollo)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const force = request.nextUrl.searchParams.get("force") === "true";
  const supabase = createServerClient();

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Skip if already enriched — unless force=true (re-extract from stored markdown)
  if (candidate.raw_scraped_markdown && !force) {
    return NextResponse.json(candidate);
  }

  // ─── Step 1: Try Apollo enrichment first (LinkedIn-free) ───
  let apolloData: Partial<Candidate> & { _email?: string; _github_url?: string; _twitter_url?: string } = {};
  let apolloFound = false;
  let apolloSparse = true;
  let enrichmentSource: "apollo" | "apollo_search" | "firecrawl" | "snippet" | null = null;

  if (!force) {
    const apolloResult = await enrichWithApollo(candidate as Candidate, candidate.apollo_id || undefined);
    if (apolloResult) {
      apolloFound = apolloResult.found;
      apolloSparse = apolloResult.sparse;
      apolloData = apolloResult.data;
    }
  }

  // ─── Step 2: Determine if we need Firecrawl ───
  let markdown: string | null = null;

  if (force && candidate.raw_scraped_markdown) {
    // Force re-extract from stored markdown
    markdown = candidate.raw_scraped_markdown;
    enrichmentSource = candidate.enrichment_source || "firecrawl";
  } else if (apolloFound && !apolloSparse) {
    // Apollo returned good data — skip Firecrawl entirely
    enrichmentSource = "apollo";
  } else {
    // Apollo failed/sparse — fall back to Firecrawl scrape
    resetFirecrawlFailures();
    markdown = await scrapeUrl(candidate.profile_url);

    if (!markdown && !apolloFound) {
      // Both Apollo and Firecrawl failed
      return NextResponse.json(
        { error: "Could not enrich profile. Apollo returned no match and LinkedIn scrape failed. Try again later." },
        { status: 502 }
      );
    }

    enrichmentSource = markdown ? "firecrawl" : "apollo";
  }

  // ─── Step 3: Code-based extraction (only when markdown exists) ───
  let techStack: string[] = [];
  const experience: { title: string; company: string; start_date?: string; end_date?: string; months: number; description?: string }[] = [];
  let locMatch: RegExpMatchArray | null = null;

  if (markdown) {
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
    techStack = TECH_KEYWORDS.filter((kw) => textLower.includes(kw));

    // Parse experience from markdown
    const expRegex =
      /(?:^|\n)([A-Z][^\n]{3,60})\n([A-Z][^\n]{2,60})\n((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s*[-–]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|Present|Current)/gi;
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
    locMatch =
      markdown.match(/(?:Location|Based in|📍)\s*[:.]?\s*([A-Z][a-zA-Z\s,]+(?:Area|States|City|County)?)/) ||
      markdown.match(/([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*,\s*[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/);
  }

  // ─── Step 4: Merge Apollo experience as primary if available ───
  // If Apollo provided experience, use it; only add Firecrawl regex extras that don't overlap
  const finalExperience = apolloData.experience && apolloData.experience.length > 0
    ? apolloData.experience
    : (experience.length > 0 ? experience : candidate.experience);

  const finalEducation = apolloData.education && apolloData.education.length > 0
    ? apolloData.education
    : candidate.education;

  // Use whatever experience we have for metric calculations
  const metricsExperience = Array.isArray(finalExperience) ? finalExperience : [];

  const totalYoe = metricsExperience.length > 0 ? calculateTotalYOE(metricsExperience) : 0;
  const avgTenure = metricsExperience.length > 0 ? calculateAvgTenure(metricsExperience) : 0;
  const stabilityScore = metricsExperience.length > 0 ? calculateStabilityScore(metricsExperience) : 0;
  const growthVelocity = metricsExperience.length > 0 ? calculateGrowthVelocity(metricsExperience) : 0;
  const companyPedigree = metricsExperience.length > 0 ? detectCompanyPedigree(metricsExperience) : [];
  const isOpenToWork = detectOpenToWork(candidate.headline, markdown);

  // ─── Step 5: LLM fit scoring — only when markdown exists ───
  let fitScore = candidate.fit_score || 50;
  let fitReasoning = candidate.fit_reasoning || null;

  if (!force && markdown) {
    try {
      const { data: history } = await supabase
        .from("search_history")
        .select("natural_language_query")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const query = history?.natural_language_query || "general fit assessment";

      const profileSummary = [
        `Name: ${apolloData.full_name || candidate.full_name}`,
        `Current Role: ${apolloData.headline || candidate.headline || "N/A"}`,
        `Location: ${apolloData.location || locMatch?.[1]?.trim() || candidate.location || "N/A"}`,
        `YOE: ${totalYoe}`,
        `Tech Stack: ${techStack.join(", ") || "N/A"}`,
        metricsExperience.length > 0
          ? `Experience: ${metricsExperience.map((e) => `${e.title} at ${e.company}`).join("; ")}`
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
  }

  // ─── Step 6: LLM extraction for rich fields — only when markdown exists ───
  let aboutSection: string | null = apolloData.headline || null;
  let certifications: string[] = [];
  let languages: string[] = [];
  let volunteerWork: { role: string; organization: string; description?: string }[] = [];

  if (markdown) {
    try {
      const extractResponse = await generateText(STRUCTURED_EXTRACTOR_SYSTEM, markdown, 2048);
      const extracted = JSON.parse(extractResponse);

      // If code-based extraction found no experience and Apollo had none, use LLM experience
      if (experience.length === 0 && !apolloData.experience?.length && extracted.experience?.length > 0) {
        experience.push(...extracted.experience);
      } else if (experience.length > 0 && extracted.experience?.length > 0) {
        // Merge LLM descriptions into code-based experience entries
        for (const codeExp of experience) {
          const llmMatch = extracted.experience.find(
            (e: { company: string; title: string }) =>
              e.company?.toLowerCase() === codeExp.company?.toLowerCase() &&
              e.title?.toLowerCase() === codeExp.title?.toLowerCase()
          );
          if (llmMatch?.description) {
            codeExp.description = llmMatch.description;
          }
        }
      }

      // Extract new rich fields
      aboutSection = extracted.about_section || aboutSection;
      certifications = Array.isArray(extracted.certifications) ? extracted.certifications : [];
      languages = Array.isArray(extracted.languages) ? extracted.languages : [];
      volunteerWork = Array.isArray(extracted.volunteer_work) ? extracted.volunteer_work : [];

      // Merge tech stack from LLM if code-based found few
      if (techStack.length < 3 && extracted.tech_stack?.length > 0) {
        for (const skill of extracted.tech_stack) {
          if (!techStack.includes(skill.toLowerCase())) {
            techStack.push(skill.toLowerCase());
          }
        }
      }
    } catch {
      // Code extraction only if LLM fails
    }
  }

  // ─── Step 7: Tenure math (job hopper detection) ───
  const tenureMath = metricsExperience.length > 0 ? calculateTenureMath(metricsExperience) : null;

  // ─── Step 8: Save enriched data ───
  const updateData: Record<string, unknown> = {
    // Apollo-provided fields take priority
    full_name: apolloData.full_name || candidate.full_name,
    current_title: apolloData.current_title || candidate.current_title,
    current_company: apolloData.current_company || candidate.current_company,
    location: apolloData.location || locMatch?.[1]?.trim() || candidate.location,
    headline: apolloData.headline || candidate.headline,
    profile_photo_url: apolloData.profile_photo_url || candidate.profile_photo_url,
    // Replace apollo:// synthetic URL with real LinkedIn URL from enrichment
    profile_url: (candidate.profile_url?.startsWith("apollo://") && apolloData.profile_url && !apolloData.profile_url.startsWith("apollo://"))
      ? apolloData.profile_url
      : (apolloData.profile_url || candidate.profile_url),

    // Merge email from Apollo if discovered
    ...(apolloData._email && !candidate.email ? { email: apolloData._email } : {}),
    // Merge social URLs from Apollo if discovered
    ...(apolloData._github_url && !candidate.github_url ? { github_url: apolloData._github_url } : {}),
    ...(apolloData._twitter_url && !candidate.twitter_url ? { twitter_url: apolloData._twitter_url } : {}),

    // Structured data
    raw_scraped_markdown: markdown || candidate.raw_scraped_markdown,
    tech_stack: techStack.length > 0 ? techStack : (candidate.tech_stack || []),
    experience: finalExperience || candidate.experience,
    education: finalEducation || candidate.education,

    // Computed metrics
    total_yoe: totalYoe || candidate.total_yoe,
    avg_tenure: avgTenure || candidate.avg_tenure,
    stability_score: stabilityScore || candidate.stability_score,
    growth_velocity: growthVelocity || candidate.growth_velocity,
    company_pedigree: companyPedigree.length > 0 ? companyPedigree : (candidate.company_pedigree || []),
    is_open_to_work: isOpenToWork || candidate.is_open_to_work,
    fit_score: fitScore,
    fit_reasoning: fitReasoning,

    // Rich fields
    about_section: aboutSection,
    certifications,
    languages,
    volunteer_work: volunteerWork,

    // Source tracking
    enrichment_source: enrichmentSource,

    updated_at: new Date().toISOString(),
  };

  const enrichmentMeta: Record<string, unknown> = {
    hydration_layer: 3,
    is_job_hopper: tenureMath?.isJobHopper ?? false,
    job_hopper_reason: tenureMath?.jobHopperReason ?? null,
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

  return NextResponse.json({ ...updated, ...enrichmentMeta });
}
