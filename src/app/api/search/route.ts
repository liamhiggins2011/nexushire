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

const firecrawlLimiter = new RateLimiter(3, 500);
const claudeLimiter = new RateLimiter(2, 300);

function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function processProfile(
  result: SerperResult,
  query: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<Candidate | null> {
  // Scrape with Firecrawl
  const markdown = await firecrawlLimiter.execute(() => scrapeUrl(result.link));

  // Build raw text for Claude to extract from
  let rawText: string;
  if (markdown) {
    rawText = markdown;
  } else {
    rawText = `Name from title: ${result.title}\nSnippet: ${result.snippet}\nURL: ${result.link}`;
  }

  // Claude structured extraction
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

  // Rank with Claude
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
        // ── Phase 1 (5-15%): Generate queries ──
        send("progress", {
          phase: "generating",
          detail: "Generating search queries...",
          progress: 5,
          counts: {},
        });

        let dorks: string[] = [];

        // Try multi-dork generation first
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

        // Optional: cross-platform queries for Wide Net mode
        let allQueries = [...dorks];
        if (wideNet) {
          const crossPlatform = generateCrossPlatformQueries(query);
          allQueries = [...dorks, ...crossPlatform];
        }

        send("queries", allQueries);
        send("dork", dorks[0]); // primary dork for backward compat
        send("progress", {
          phase: "generating",
          detail: `Generated ${allQueries.length} search queries`,
          progress: 15,
          counts: { queries: allQueries.length },
        });

        // ── Phase 2 (15-40%): Execute all queries with multi-page pagination ──
        send("progress", {
          phase: "searching",
          detail: "Searching across all queries...",
          progress: 20,
          counts: { queries: allQueries.length },
        });

        const pagesToFetch = offset > 0 ? 1 : maxPages;
        const startPage = offset > 0 ? Math.floor(offset / 10) + 1 : 1;

        const allResults: SerperResult[] = [];
        await Promise.all(
          allQueries.map(async (q) => {
            try {
              let results: SerperResult[];
              if (pagesToFetch > 1 && offset === 0) {
                results = await searchGoogleMultiPage(q, pagesToFetch, 10);
              } else {
                results = await searchGoogle(q, 10);
              }
              allResults.push(...results);
            } catch (err) {
              console.error(`Query failed: ${q}`, err);
            }
          })
        );

        send("progress", {
          phase: "searching",
          detail: `Found ${allResults.length} raw results`,
          progress: 40,
          counts: { queries: allQueries.length, rawResults: allResults.length },
        });

        // ── Phase 3 (40-55%): Deduplicate + previews + cache check ──
        send("progress", {
          phase: "deduplicating",
          detail: "Deduplicating results...",
          progress: 42,
          counts: { rawResults: allResults.length },
        });

        const deduplicated = deduplicateResults(allResults);
        const linkedinResults = deduplicated.filter(
          (r) =>
            r.link.includes("linkedin.com/in/") ||
            r.source === "github" ||
            r.source === "stackoverflow"
        );

        if (linkedinResults.length === 0) {
          send("status", "No profiles found. Try a different query.");
          send("done", { count: 0, hasMore: false, nextOffset: 0 });
          controller.close();
          return;
        }

        // Send preview cards immediately
        for (const r of linkedinResults) {
          send("preview", {
            id: `preview-${Buffer.from(r.link).toString("base64").slice(0, 12)}`,
            name: r.title
              .replace(/\s*[-–|·]\s*(LinkedIn|GitHub|Stack Overflow).*$/i, "")
              .trim(),
            snippet: r.snippet,
            url: r.link,
            source: r.source,
          });
        }

        send("progress", {
          phase: "deduplicating",
          detail: `${linkedinResults.length} unique profiles`,
          progress: 50,
          counts: {
            rawResults: allResults.length,
            uniqueResults: linkedinResults.length,
          },
        });

        // Check Supabase for cached candidates
        let supabase;
        try {
          supabase = createServerClient();
        } catch {
          send("error", {
            message:
              "Supabase not configured. Set your env vars in .env.local",
          });
          send("done", { count: 0, hasMore: false, nextOffset: 0 });
          controller.close();
          return;
        }

        const profileUrls = linkedinResults.map((r) => r.link);
        const { cached: cachedUrls, toProcess } =
          await filterExistingCandidates(supabase as never, profileUrls);

        // Send cached candidates instantly
        let processedCount = 0;
        if (cachedUrls.length > 0) {
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
          progress: 55,
          counts: {
            rawResults: allResults.length,
            uniqueResults: linkedinResults.length,
            cached: cachedUrls.length,
          },
        });

        // Save search history
        const { error: historyError } = await supabase
          .from("search_history")
          .insert({
            natural_language_query: query,
            generated_dork: dorks[0],
            result_count: linkedinResults.length,
            query_count: allQueries.length,
            wide_net: wideNet,
            pages_fetched: pagesToFetch,
          });
        if (historyError) {
          console.error("Failed to save search history:", historyError);
        }

        // ── Phase 4 (55-95%): Enrich new profiles in batches of 3 ──
        const toEnrich = linkedinResults.filter((r) =>
          toProcess.includes(r.link)
        );

        if (toEnrich.length > 0) {
          resetFirecrawlFailures();

          for (let i = 0; i < toEnrich.length; i += 3) {
            const batch = toEnrich.slice(i, i + 3);
            const batchProgress =
              55 + Math.round(((i + batch.length) / toEnrich.length) * 40);

            send("progress", {
              phase: "enriching",
              detail: `Enriching profiles ${i + 1}-${Math.min(i + 3, toEnrich.length)} of ${toEnrich.length}...`,
              progress: Math.min(batchProgress, 95),
              counts: {
                rawResults: allResults.length,
                uniqueResults: linkedinResults.length,
                cached: cachedUrls.length,
                enriched: processedCount,
              },
            });

            const results = await Promise.all(
              batch.map(async (result) => {
                try {
                  return await processProfile(result, query, supabase);
                } catch (error) {
                  console.error(`Error processing ${result.link}:`, error);
                  send("error", {
                    message: `Failed to process ${result.link}`,
                  });
                  return null;
                }
              })
            );

            for (const candidate of results) {
              if (candidate) {
                processedCount++;
                send("candidate", candidate);
              }
            }
          }
        }

        // ── Phase 5 (100%): Done ──
        const hasMore = linkedinResults.length >= maxPages * 10;
        const nextOffset = offset + linkedinResults.length;

        send("progress", {
          phase: "complete",
          detail: `Found ${processedCount} candidates`,
          progress: 100,
          counts: {
            rawResults: allResults.length,
            uniqueResults: linkedinResults.length,
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
