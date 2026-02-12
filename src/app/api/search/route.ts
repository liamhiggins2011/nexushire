import { NextRequest } from "next/server";
import { generateText } from "@/lib/anthropic";
import { searchGoogle, searchGoogleMultiPage } from "@/lib/serper";
import { scrapeUrl, resetFirecrawlFailures } from "@/lib/firecrawl";
import {
  DORK_GENERATOR_SYSTEM,
  MULTI_DORK_GENERATOR_SYSTEM,
} from "@/lib/prompts/dork-generator";
import { CANDIDATE_RANKER_SYSTEM } from "@/lib/prompts/candidate-ranker";
import { STRUCTURED_EXTRACTOR_SYSTEM } from "@/lib/prompts/structured-extractor";
import { RateLimiter, withRetry } from "@/lib/rate-limiter";
import { createServerClient } from "@/lib/supabase/server";
import { Candidate, SerperResult, StructuredProfile } from "@/types";
import {
  calculateStabilityScore,
  calculateGrowthVelocity,
  detectCompanyPedigree,
  detectOpenToWork,
} from "@/lib/career-analytics";
import { deduplicateResults, filterExistingCandidates } from "@/lib/deduplication";
import { generateCrossPlatformQueries } from "@/lib/query-diversifier";

const firecrawlLimiter = new RateLimiter(5, 300);
const claudeLimiter = new RateLimiter(4, 200);

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function extractNameFromSerper(title: string): string {
  return title
    .replace(/\s*[-–|·]\s*(LinkedIn|GitHub|Stack Overflow).*$/i, "")
    .split(/\s*[-–·|]\s*/)[0]
    .trim();
}

// Fast snippet-based extraction: parse Serper title/snippet without Firecrawl or Claude
function extractFromSnippet(result: SerperResult): Partial<Candidate> {
  const cleanTitle = result.title.replace(/\s*[\|·\-–]\s*LinkedIn$/i, "").trim();
  const parts = cleanTitle.split(/\s*[-–·|]\s*/);
  const name = parts[0]?.trim() || "Unknown";
  const headline = parts.slice(1).join(" - ").trim() || null;

  // Try to extract location from snippet
  const locationMatch = result.snippet.match(
    /(?:Location|Based in|in)\s*[:.]?\s*([A-Z][a-zA-Z\s,]+(?:Area|States|City)?)/
  ) || result.snippet.match(
    /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*,\s*[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/
  );

  return {
    full_name: name,
    headline,
    current_title: headline,
    profile_url: result.link,
    location: locationMatch?.[1]?.trim() || null,
    fit_score: null,
    fit_reasoning: null,
  };
}

// Full enrichment: Firecrawl scrape + Claude extraction + Claude ranking
async function enrichProfile(
  result: SerperResult,
  query: string,
  supabase: ReturnType<typeof createServerClient>,
  send: (event: string, data: unknown) => void
): Promise<Candidate | null> {
  const name = extractNameFromSerper(result.title);

  // Scrape
  send("activity", `Scraping ${name}...`);
  const markdown = await firecrawlLimiter.execute(() => scrapeUrl(result.link));

  let rawText: string;
  if (markdown) {
    rawText = markdown;
  } else {
    rawText = `Name from title: ${result.title}\nSnippet: ${result.snippet}\nURL: ${result.link}`;
  }

  // Extract
  send("activity", `Extracting profile for ${name}...`);
  const extractionResponse = await claudeLimiter.execute(() =>
    withRetry(
      () => generateText(STRUCTURED_EXTRACTOR_SYSTEM, rawText, 1024),
      2
    )
  );

  let structured: Partial<StructuredProfile> = {};
  try {
    structured = JSON.parse(extractionResponse);
  } catch {
    const cleanTitle = result.title.replace(/\s*[\|·\-–]\s*LinkedIn$/i, "").trim();
    const parts = cleanTitle.split(/\s*[\-–·]\s*/);
    structured = {
      full_name: parts[0]?.trim() || "Unknown",
      current_role: parts[1]?.trim() || "",
      total_yoe: 0,
      avg_tenure: 0,
      is_open_to_work: false,
      tech_stack: [],
      career_highlights: [],
      experience: [],
    };
  }

  // Compute analytics
  const experience = (structured.experience || []).map((e) => ({
    title: e.title,
    company: e.company,
    start_date: e.start_date || undefined,
    end_date: e.end_date || undefined,
    months: e.months || 0,
    duration:
      e.start_date && e.end_date
        ? `${e.start_date} - ${e.end_date}`
        : undefined,
  }));

  const stabilityScore =
    experience.length > 0
      ? calculateStabilityScore(experience)
      : structured.stability_score || 0;
  const growthVelocity =
    experience.length > 0
      ? calculateGrowthVelocity(experience)
      : structured.growth_velocity || 0;
  const companyPedigree =
    experience.length > 0
      ? detectCompanyPedigree(experience)
      : structured.company_pedigree || [];
  const isOpenToWork =
    structured.is_open_to_work ||
    detectOpenToWork(structured.current_role || null, markdown);

  // Rank
  send("activity", `Analyzing fit for ${structured.full_name || name}...`);
  const profileSummary = [
    `Name: ${structured.full_name}`,
    `Current Role: ${structured.current_role || "N/A"}`,
    `Location: ${structured.location || "N/A"}`,
    `YOE: ${structured.total_yoe || 0}`,
    `Tech Stack: ${(structured.tech_stack || []).join(", ") || "N/A"}`,
    `Career Highlights: ${(structured.career_highlights || []).join("; ") || "N/A"}`,
    experience.length > 0
      ? `Experience: ${experience.map((e) => `${e.title} at ${e.company}`).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const rankingInput = `Search Query: "${query}"\n\nCandidate Profile:\n${profileSummary}`;

  const rankingResponse = await claudeLimiter.execute(() =>
    withRetry(
      () => generateText(CANDIDATE_RANKER_SYSTEM, rankingInput, 256),
      2
    )
  );

  let fitScore = 50;
  let fitReasoning = "Unable to generate reasoning.";
  try {
    const parsed = JSON.parse(rankingResponse);
    fitScore = Math.min(100, Math.max(1, parsed.fitScore || 50));
    fitReasoning = parsed.fitReasoning || fitReasoning;
  } catch {
    const scoreMatch = rankingResponse.match(/(\d{1,3})/);
    if (scoreMatch) fitScore = parseInt(scoreMatch[1]);
  }

  const candidateData: Partial<Candidate> = {
    full_name: structured.full_name || "Unknown",
    headline: structured.current_role || null,
    location: structured.location || null,
    current_title: structured.current_role || null,
    current_company: experience[0]?.company || null,
    profile_url: result.link,
    experience: experience.length > 0 ? experience : null,
    skills: structured.tech_stack || null,
    fit_score: fitScore,
    fit_reasoning: fitReasoning,
    raw_scraped_markdown: markdown || null,
    total_yoe: structured.total_yoe || 0,
    avg_tenure: structured.avg_tenure || 0,
    stability_score: stabilityScore,
    growth_velocity: growthVelocity,
    is_open_to_work: isOpenToWork,
    company_pedigree: companyPedigree,
    tech_stack: structured.tech_stack || [],
    career_highlights: structured.career_highlights || [],
  };

  // Upsert
  const { data: saved, error: upsertError } = await supabase
    .from("candidates")
    .upsert(
      {
        ...candidateData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_url" }
    )
    .select()
    .single();

  if (upsertError) {
    console.error(`Upsert failed for ${result.link}:`, upsertError);
    return null;
  }

  return saved as Candidate;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const query: string = body.query;
  const wideNet: boolean = body.wideNet ?? false;
  const maxPages: number = body.maxPages ?? 3;
  const offset: number = body.offset ?? 0;

  if (!query || typeof query !== "string") {
    return new Response("Query is required", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSSE(event, data)));
      };

      try {
        // ── Phase 1: Generate queries ──
        send("progress", {
          phase: "generating",
          detail: "Generating search queries...",
          progress: 5,
          counts: {},
        });

        let dorks: string[] = [];

        try {
          const multiDorkResponse = await withRetry(() =>
            generateText(MULTI_DORK_GENERATOR_SYSTEM, query, 512)
          );
          const parsed = JSON.parse(multiDorkResponse);
          if (Array.isArray(parsed) && parsed.length > 0) {
            dorks = parsed.map((d: string) => d.trim()).filter(Boolean);
          }
        } catch {
          // Fallback to single dork
        }

        if (dorks.length === 0) {
          const singleDork = await withRetry(() =>
            generateText(DORK_GENERATOR_SYSTEM, query, 256)
          );
          dorks = [singleDork.trim()];
        }

        let allQueries = [...dorks];
        if (wideNet) {
          const crossPlatform = generateCrossPlatformQueries(query);
          allQueries = [...dorks, ...crossPlatform];
        }

        send("queries", allQueries);
        send("dork", dorks[0]);
        send("progress", {
          phase: "generating",
          detail: `Generated ${allQueries.length} search queries`,
          progress: 15,
          counts: { queries: allQueries.length },
        });

        // ── Phase 2: Parallel search + immediate snippet candidates ──
        send("progress", {
          phase: "searching",
          detail: "Searching across all queries...",
          progress: 20,
          counts: { queries: allQueries.length },
        });

        // Initialize Supabase early for cache checks
        let supabase;
        try {
          supabase = createServerClient();
        } catch {
          send("error", {
            message: "Supabase not configured. Set your env vars in .env.local",
          });
          send("done", { count: 0, hasMore: false, nextOffset: 0 });
          controller.close();
          return;
        }

        const pagesToFetch = offset > 0 ? 1 : maxPages;

        // Fire all search queries in parallel
        const allResults: SerperResult[] = [];
        await Promise.all(
          allQueries.map(async (q) => {
            try {
              const results =
                pagesToFetch > 1 && offset === 0
                  ? await searchGoogleMultiPage(q, pagesToFetch, 10)
                  : await searchGoogle(q, 10);
              allResults.push(...results);
            } catch (err) {
              console.error(`Query failed: ${q}`, err);
            }
          })
        );

        send("progress", {
          phase: "searching",
          detail: `Found ${allResults.length} raw results`,
          progress: 35,
          counts: { queries: allQueries.length, rawResults: allResults.length },
        });

        // ── Phase 3: Deduplicate + snippet candidates + cache ──
        send("activity", `Deduplicating ${allResults.length} results...`);
        const deduplicated = deduplicateResults(allResults);
        const profileResults = deduplicated.filter(
          (r) =>
            r.link.includes("linkedin.com/in/") ||
            r.source === "github" ||
            r.source === "stackoverflow"
        );

        if (profileResults.length === 0) {
          send("status", "No profiles found. Try a different query.");
          send("done", { count: 0, hasMore: false, nextOffset: 0 });
          controller.close();
          return;
        }

        send("progress", {
          phase: "deduplicating",
          detail: `${profileResults.length} unique profiles`,
          progress: 40,
          counts: {
            rawResults: allResults.length,
            uniqueResults: profileResults.length,
          },
        });

        // Send preview cards immediately
        for (const r of profileResults) {
          send("preview", {
            id: `preview-${Buffer.from(r.link).toString("base64url")}`,
            name: extractNameFromSerper(r.title),
            snippet: r.snippet,
            url: r.link,
            source: r.source,
          });
        }

        // Check Supabase cache
        const profileUrls = profileResults.map((r) => r.link);
        const { cached: cachedUrls, toProcess } =
          await filterExistingCandidates(supabase as never, profileUrls);

        // Send cached candidates instantly
        let processedCount = 0;
        if (cachedUrls.length > 0) {
          send("activity", `Loading ${cachedUrls.length} cached candidates...`);
          const { data: cachedCandidates } = await supabase
            .from("candidates")
            .select("*")
            .in("profile_url", cachedUrls);

          if (cachedCandidates) {
            for (const c of cachedCandidates) {
              processedCount++;
              send("candidate", c);
            }
          }
        }

        send("progress", {
          phase: "deduplicating",
          detail: `${cachedUrls.length} cached, ${toProcess.length} to enrich`,
          progress: 50,
          counts: {
            rawResults: allResults.length,
            uniqueResults: profileResults.length,
            cached: cachedUrls.length,
          },
        });

        // Save search history (non-blocking)
        supabase
          .from("search_history")
          .insert({
            natural_language_query: query,
            generated_dork: dorks[0],
            result_count: profileResults.length,
            query_count: allQueries.length,
            wide_net: wideNet,
            pages_fetched: pagesToFetch,
          })
          .then(({ error }) => {
            if (error) console.error("Failed to save search history:", error);
          });

        // ── Phase 4: Enrich new profiles in batches of 5 ──
        const toEnrich = profileResults.filter((r) =>
          toProcess.includes(r.link)
        );

        if (toEnrich.length > 0) {
          resetFirecrawlFailures();
          const BATCH_SIZE = 5;

          for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
            const batch = toEnrich.slice(i, i + BATCH_SIZE);
            const batchProgress =
              50 + Math.round(((i + batch.length) / toEnrich.length) * 45);

            send("progress", {
              phase: "enriching",
              detail: `Enriching ${i + 1}-${Math.min(i + BATCH_SIZE, toEnrich.length)} of ${toEnrich.length}...`,
              progress: Math.min(batchProgress, 95),
              counts: {
                rawResults: allResults.length,
                uniqueResults: profileResults.length,
                cached: cachedUrls.length,
                enriched: processedCount,
              },
            });

            // Process entire batch in parallel
            const results = await Promise.all(
              batch.map(async (result) => {
                try {
                  const candidate = await enrichProfile(result, query, supabase, send);
                  return candidate;
                } catch (error) {
                  console.error(`Error processing ${result.link}:`, error);
                  send("error", {
                    message: `Failed to process ${extractNameFromSerper(result.title)}`,
                  });
                  return null;
                }
              })
            );

            // Stream each candidate as it completes
            for (const candidate of results) {
              if (candidate) {
                processedCount++;
                send("candidate", candidate);
              }
            }
          }
        }

        // ── Phase 5: Done ──
        const hasMore = profileResults.length >= maxPages * 10;
        const nextOffset = offset + profileResults.length;

        send("progress", {
          phase: "complete",
          detail: `Found ${processedCount} candidates`,
          progress: 100,
          counts: {
            rawResults: allResults.length,
            uniqueResults: profileResults.length,
            cached: cachedUrls.length,
            enriched: processedCount,
          },
        });

        send("done", { count: processedCount, hasMore, nextOffset });
      } catch (error) {
        console.error("Search pipeline error:", error);
        send("error", {
          message:
            error instanceof Error ? error.message : "Search pipeline failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
