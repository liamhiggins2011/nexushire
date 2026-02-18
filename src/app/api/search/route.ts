import { NextRequest } from "next/server";
import { getLLMConfig } from "@/lib/config";
import { createServerClient } from "@/lib/supabase/server";
import { Candidate, SerperResult, StructuredProfile } from "@/types";
import { deduplicateResults, filterExistingCandidates } from "@/lib/deduplication";
import { parseBooleanQuery } from "@/lib/boolean-parser";
import { createOrchestrator, generateRelaxedDorks } from "@/lib/search-orchestrator";
import { indexCandidates } from "@/lib/meilisearch";
import { expandLocation, isLocationMatch } from "@/lib/geo-expansion";
import { searchGoogleMultiPage } from "@/lib/serper";
import { parseSnippetExperience, computeTenure } from "@/lib/tenure-engine";
import { searchApollo, buildApolloSearchParams } from "@/lib/apollo";
import type { ApolloPersonResult } from "@/types";


function encodeSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function extractNameFromSerper(title: string): string {
  return title
    .replace(/\s*[-–|·]\s*(LinkedIn|GitHub|Stack Overflow).*$/i, "")
    .split(/\s*[-–·|]\s*/)[0]
    .trim();
}

// ─── Code-based fit scoring (instant, no LLM) ───

function computeCodeFitScore(
  profile: Partial<StructuredProfile>,
  query: string,
  result: SerperResult
): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const searchText = `${result.title} ${result.snippet} ${profile.current_role || ""} ${(profile.tech_stack || []).join(" ")}`.toLowerCase();

  let score = 30;

  let keywordHits = 0;
  for (const word of queryWords) {
    if (searchText.includes(word)) keywordHits++;
  }
  score += Math.min(30, keywordHits * (30 / Math.max(queryWords.length, 1)));

  const techStack = profile.tech_stack || [];
  if (techStack.length > 0) {
    const techHits = queryWords.filter((w) =>
      techStack.some((t) => t.toLowerCase().includes(w))
    );
    if (techHits.length > 0) score += 15;
  }

  if ((profile.experience?.length || 0) > 0) score += 10;
  if ((profile.total_yoe || 0) > 2) score += 5;

  const seniorityTerms = ["senior", "staff", "principal", "lead", "director"];
  const querySeniority = seniorityTerms.find((s) => query.toLowerCase().includes(s));
  if (querySeniority && searchText.includes(querySeniority)) score += 10;

  return Math.min(100, Math.round(score));
}

// ─── Snippet parser ───

function parseSnippet(result: SerperResult): {
  name: string;
  headline: string | null;
  location: string | null;
  company: string | null;
  skills: string[];
} {
  const name = extractNameFromSerper(result.title);
  const cleanTitle = result.title.replace(/\s*[\|·\-–]\s*LinkedIn$/i, "").trim();
  const parts = cleanTitle.split(/\s*[-–·|]\s*/);

  const ROLE_KEYWORDS = /engineer|developer|architect|manager|designer|analyst|scientist|director|lead|head|vp|cto|ceo|founder|consultant|specialist|coordinator/i;
  let headline: string | null = null;
  let company: string | null = null;

  for (const part of parts.slice(1)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!headline && ROLE_KEYWORDS.test(trimmed)) {
      headline = trimmed;
    } else if (!company && !ROLE_KEYWORDS.test(trimmed) && /^[A-Z]/.test(trimmed) && trimmed.length > 2 && trimmed.length < 40) {
      const lower = trimmed.toLowerCase().replace(/[.,]/g, "");
      const SKIP = new Set(["react", "reactjs", "nextjs", "next", "python", "django", "node", "nodejs", "typescript", "javascript", "java", "go", "rust", "php", "ruby", "swift", "kotlin", "scala", "sql", "aws", "gcp", "azure", "docker", "kubernetes", "linux", "full", "stack", "frontend", "backend", "remote", "freelance", "contract"]);
      if (!SKIP.has(lower)) company = trimmed;
    }
  }
  if (!headline && parts.length > 1) {
    headline = parts[1].trim() || null;
  }

  const TECH_TERMS = new Set([
    "tensorflow", "pytorch", "javascript", "typescript", "react", "angular", "node",
    "python", "docker", "kubernetes", "redis", "kafka", "jenkins", "elasticsearch",
    "aws", "azure", "gcp", "java", "scala", "ruby", "swift", "kotlin", "sql",
    "graphql", "mongodb", "linux", "django", "flask", "fastapi", "spring",
    "rust", "go", "c++", "c#", "php", "sass", "tailwind", "vite", "webpack",
    "pandas", "numpy", "nlp", "ml", "ai", "devops", "sre",
  ]);
  const locMatch = result.snippet.match(
    /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*,\s*[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*(?:\s+(?:Area|States|United States))?)/g
  );
  let location: string | null = null;
  if (locMatch) {
    for (const match of locMatch) {
      const [left, right] = match.split(",").map((s) => s.trim().toLowerCase());
      if (!TECH_TERMS.has(left) && !TECH_TERMS.has(right)) {
        location = match.trim();
        break;
      }
    }
  }

  if (!company) {
    const companyMatch = result.snippet.match(
      /(?:\bat\b|@)\s+([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+){0,3})/
    );
    company = companyMatch?.[1]?.trim() || null;
  }

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
  const textLower = `${result.title} ${result.snippet}`.toLowerCase();
  const skills = TECH_KEYWORDS.filter((kw) => textLower.includes(kw));

  return { name, headline, location, company, skills };
}

async function createFromSnippet(
  result: SerperResult,
  query: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<Candidate | null> {
  const { name, headline, location, company, skills } = parseSnippet(result);

  const snippetProfile: Partial<StructuredProfile> = {
    full_name: name,
    current_role: headline || undefined,
    location: location || undefined,
    tech_stack: skills,
  };

  // Extract experience entries from snippet text (e.g. "Software Engineer. Palantir. Oct 2024 - Present 5 months")
  const snippetExperience = parseSnippetExperience(result.snippet);
  const tenure = snippetExperience.length > 0 ? computeTenure(snippetExperience) : null;

  const candidateData: Record<string, unknown> = {
    full_name: name,
    headline,
    location,
    current_title: headline,
    current_company: company,
    profile_url: result.link,
    fit_score: computeCodeFitScore(snippetProfile, query, result),
    tech_stack: skills,
    company_pedigree: [],
    career_highlights: [],
    experience: snippetExperience.length > 0 ? snippetExperience : null,
    total_yoe: tenure?.total_yoe ?? 0,
    avg_tenure: tenure?.avg_tenure_years ?? 0,
    stability_score: 0,
    growth_velocity: 0,
    is_open_to_work: /open to work|#opentowork|#openforwork|seeking|actively looking|in transition|between roles|available for hire|exploring opportunities|laid off|on the market/i.test(result.snippet),
    career_narrative: result.snippet || null,
    profile_photo_url: result.thumbnailUrl || null,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("candidates")
    .upsert(candidateData, { onConflict: "profile_url" })
    .select()
    .single();

  if (error) {
    console.error(`Upsert failed for ${result.link}:`, error);
    return null;
  }

  return saved as Candidate;
}

async function createFromApollo(
  person: ApolloPersonResult,
  query: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<Candidate | null> {
  const fullName = `${person.first_name} ${person.last_name}`.trim();
  const profileUrl = `apollo://${person.id}`;
  const orgName = person.organization?.name || null;
  const locationParts = [person.city, person.state, person.country].filter(Boolean);
  const location = locationParts.join(", ") || null;

  const candidateData: Record<string, unknown> = {
    full_name: fullName,
    headline: person.headline || person.title || null,
    location,
    current_title: person.title || null,
    current_company: orgName,
    profile_url: profileUrl,
    fit_score: 50,
    tech_stack: [],
    company_pedigree: [],
    career_highlights: [],
    experience: null,
    total_yoe: 0,
    avg_tenure: 0,
    stability_score: 0,
    growth_velocity: 0,
    is_open_to_work: false,
    career_narrative: person.headline || null,
    profile_photo_url: person.photo_url || null,
    enrichment_source: "apollo_search",
    apollo_id: person.id,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("candidates")
    .upsert(candidateData, { onConflict: "profile_url" })
    .select()
    .single();

  if (error) {
    console.error(`Apollo upsert failed for ${person.id}:`, error);
    return null;
  }

  return saved as Candidate;
}

// ─── Main search endpoint ───

export async function POST(request: NextRequest) {
  const body = await request.json();
  const query: string = body.query;
  const wideNet: boolean = body.wideNet ?? false;
  const maxPages: number = body.maxPages ?? 5;
  const offset: number = body.offset ?? 0;
  const dorkBatch: number = body.dorkBatch ?? 0;
  const structuredLocation: string | undefined = body.location;
  const structuredJobTitle: string | undefined = body.jobTitle;
  const structuredBooleanQuery: string | undefined = body.booleanQuery;
  const sources: string[] = body.sources ?? ["linkedin"];

  if (!query || typeof query !== "string") {
    return new Response("Query is required", { status: 400 });
  }

  const searchConfig = getLLMConfig();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSSE(event, data)));
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        send("activity", `Using ${searchConfig.provider === "local" ? `local LLM (${searchConfig.localModel})` : "Anthropic Cloud"} — batch size: ${searchConfig.enrichBatchSize}`);

        // ── Stage 1: Parse Boolean query ──
        send("progress", {
          phase: "generating",
          detail: "Parsing query...",
          progress: 5,
          counts: {},
        });

        // Parse Boolean from structured field or from raw query
        const booleanInput = structuredBooleanQuery || query;
        const parsed = parseBooleanQuery(booleanInput);

        console.log("[Search] Structured params:", {
          query,
          location: structuredLocation,
          jobTitle: structuredJobTitle,
          booleanQuery: structuredBooleanQuery?.slice(0, 80),
        });
        const meiliQuery = parsed.toMeilisearchQuery();

        // Determine location: prefer structured, fallback to parsed from query
        const locationMatch = query.match(/\b(?:in|at|from|near)\s+([A-Z][a-zA-Z\s,]+)/i);
        const effectiveLocation = structuredLocation || locationMatch?.[1]?.trim();
        const expandedLocations = effectiveLocation ? expandLocation(effectiveLocation) : undefined;

        send("parsed_query", {
          original: query,
          meilisearchQuery: meiliQuery,
          dorkCount: 0,
        });

        if (effectiveLocation) {
          send("activity", `Location constraint: "${effectiveLocation}" (${expandedLocations?.length ?? 1} cities)`);
        }

        // ── Stage 2: Orchestrated search (Serper + Apollo in parallel) ──
        send("progress", {
          phase: "generating",
          detail: "Generating search queries...",
          progress: 10,
          counts: {},
        });

        const useSerper = sources.some((s) => ["linkedin", "github", "stackoverflow"].includes(s));
        const useApollo = sources.includes("apollo") && !!process.env.APOLLO_API_KEY;

        // Run Serper and Apollo in parallel
        const pagesToFetch = Math.min(maxPages, 2);
        const orchestrator = createOrchestrator();

        const [serperResult, apolloResult] = await Promise.all([
          useSerper
            ? orchestrator.search(parsed, query, {
                wideNet,
                maxPages: pagesToFetch,
                expandedLocations,
                location: effectiveLocation,
                jobTitle: structuredJobTitle,
                booleanQuery: structuredBooleanQuery,
                dorkBatch,
                sources,
              })
            : Promise.resolve({ results: [] as SerperResult[], dorks: [] as string[] }),
          useApollo
            ? (async () => {
                send("activity", "Searching Apollo database...");
                const apolloParams = buildApolloSearchParams(
                  structuredJobTitle,
                  effectiveLocation,
                  structuredBooleanQuery,
                );
                const apolloPage = dorkBatch + 1;
                return searchApollo(apolloParams, apolloPage, 25);
              })()
            : Promise.resolve({ people: [] as ApolloPersonResult[], totalEntries: 0 }),
        ]);

        const { results: allResults, dorks } = serperResult;
        const apolloPeople = apolloResult.people;

        if (useApollo && apolloPeople.length > 0) {
          send("activity", `Apollo returned ${apolloPeople.length} candidates`);
        }

        send("parsed_query", {
          original: query,
          meilisearchQuery: meiliQuery,
          dorkCount: dorks.length,
        });
        if (dorks.length > 0) {
          console.log("[Search] Generated dorks:", dorks);
          send("queries", dorks);
          send("dork", dorks[0]);
        }
        send("progress", {
          phase: "searching",
          detail: `Found ${allResults.length} raw results${apolloPeople.length > 0 ? ` + ${apolloPeople.length} from Apollo` : ""}`,
          progress: 35,
          counts: { queries: dorks.length, rawResults: allResults.length + apolloPeople.length },
        });

        // ── Stage 3: Deduplicate + cache ──
        let supabase;
        try {
          supabase = createServerClient();
        } catch {
          send("error", {
            message: "Supabase not configured. Set your env vars in .env.local",
          });
          send("done", { count: 0, hasMore: false, nextOffset: 0 });
          safeClose();
          return;
        }

        send("activity", `Deduplicating ${allResults.length} results...`);
        const deduplicated = deduplicateResults(allResults);
        let profileResults = deduplicated.filter(
          (r) =>
            (sources.includes("linkedin") && r.link.includes("linkedin.com/in/")) ||
            (sources.includes("github") && r.source === "github") ||
            (sources.includes("stackoverflow") && r.source === "stackoverflow")
        );

        console.log(`[Search] ${profileResults.length} profile results after dedup. First 5:`, profileResults.slice(0, 5).map(r => ({ link: r.link, title: r.title.slice(0, 60) })));

        // ── Server-side location filtering ──
        // Drop results whose snippet clearly indicates a non-matching location
        if (effectiveLocation && expandedLocations && expandedLocations.length > 0) {
          const expandedLower = expandedLocations.map((c) => c.toLowerCase());
          const locLower = effectiveLocation.toLowerCase();

          const beforeCount = profileResults.length;
          profileResults = profileResults.filter((r) => {
            const text = `${r.title} ${r.snippet}`.toLowerCase();
            // Keep if: snippet mentions any expanded city, OR no clear foreign location
            const matchesLocation = expandedLower.some((city) => text.includes(city)) || text.includes(locLower);
            // Also keep results where we can't determine location (no location info in snippet)
            const hasForeignLocation = /\b(?:india|bangalore|bengaluru|hyderabad|pune|mumbai|chennai|delhi|noida|gurgaon|uk|london|canada|toronto|singapore|australia|sydney|nigeria|lagos|pakistan|karachi|lahore|philippines|manila|brazil|sao paulo|germany|berlin|france|paris|netherlands|amsterdam|kenya|nairobi)\b/i.test(text);
            return matchesLocation || !hasForeignLocation;
          });

          if (beforeCount !== profileResults.length) {
            send("activity", `Location filter: dropped ${beforeCount - profileResults.length} non-local results (${profileResults.length} remaining)`);
          }
        }

        // ── Auto-relax: retry with broader query if 0 results ──
        if (profileResults.length === 0) {
          send("activity", "No results found — auto-relaxing search terms...");
          send("progress", {
            phase: "searching",
            detail: "Retrying with broader query...",
            progress: 38,
            counts: { queries: dorks.length, rawResults: 0 },
          });

          // Smart boolean relaxation: remove NOT clauses first, then drop last AND term
          let relaxedBooleanQuery = structuredBooleanQuery;
          if (relaxedBooleanQuery) {
            const withoutNot = relaxedBooleanQuery
              .replace(/\bNOT\s+"[^"]+"/gi, "")
              .replace(/\bNOT\s+\S+/gi, "")
              .replace(/\s+/g, " ")
              .trim();

            if (withoutNot !== relaxedBooleanQuery && withoutNot.length > 0) {
              send("activity", "Removed NOT clauses from boolean query for broader match");
              relaxedBooleanQuery = withoutNot;
            } else {
              const andTerms = relaxedBooleanQuery.split(/\bAND\b/i).map((t) => t.trim()).filter(Boolean);
              if (andTerms.length > 1) {
                relaxedBooleanQuery = andTerms.slice(0, -1).join(" AND ");
                send("activity", `Dropped last AND term, searching with: ${relaxedBooleanQuery.slice(0, 80)}...`);
              }
            }
          }

          const relaxedDorks = generateRelaxedDorks(query, effectiveLocation, structuredJobTitle, relaxedBooleanQuery);
          const relaxedResults: SerperResult[] = [];
          await Promise.all(
            relaxedDorks.map(async (q) => {
              try {
                const results = await searchGoogleMultiPage(q, 3, 10);
                relaxedResults.push(...results);
              } catch (err) {
                console.error(`Relaxed query failed: ${q}`, err);
              }
            })
          );

          const relaxedDeduped = deduplicateResults(relaxedResults);
          const relaxedProfiles = relaxedDeduped.filter(
            (r) =>
              (sources.includes("linkedin") && r.link.includes("linkedin.com/in/")) ||
              (sources.includes("github") && r.source === "github") ||
              (sources.includes("stackoverflow") && r.source === "stackoverflow")
          );

          if (relaxedProfiles.length === 0) {
            send("status", "No profiles found even after broadening search. Try different keywords.");
            send("done", { count: 0, hasMore: false, nextOffset: 0 });
            safeClose();
            return;
          }

          profileResults.push(...relaxedProfiles);
          send("activity", `Auto-relax found ${relaxedProfiles.length} profiles with broader query`);
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

        // Send previews
        for (const r of profileResults) {
          send("preview", {
            id: `preview-${Buffer.from(r.link).toString("base64url")}`,
            name: extractNameFromSerper(r.title),
            snippet: r.snippet,
            url: r.link,
            source: r.source,
          });
        }

        // ── Stage 4: Filter cached candidates ──
        const profileUrls = profileResults.map((r) => r.link);
        const { cached: cachedUrls, toProcess } =
          await filterExistingCandidates(supabase as never, profileUrls);

        let processedCount = 0;
        const allCandidates: Candidate[] = [];

        if (cachedUrls.length > 0) {
          send("activity", `Loading ${cachedUrls.length} cached candidates (zero-latency)...`);
          const { data: cachedCandidates } = await supabase
            .from("candidates")
            .select("*")
            .in("profile_url", cachedUrls);

          if (cachedCandidates) {
            for (const c of cachedCandidates) {
              processedCount++;
              allCandidates.push(c as Candidate);
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

        // Non-blocking history save
        supabase
          .from("search_history")
          .insert({
            natural_language_query: query,
            generated_dork: dorks[0] || query,
            result_count: profileResults.length,
          })
          .then(({ error }) => {
            if (error) console.error("Failed to save search history:", error);
          });

        // ── Stage 5: Create Layer 1 candidates from snippets ──
        const toCreate = profileResults.filter((r) =>
          toProcess.includes(r.link)
        );

        if (toCreate.length > 0) {
          send("activity", `Creating ${toCreate.length} candidates from search results...`);
          send("progress", {
            phase: "enriching",
            detail: `Processing ${toCreate.length} new profiles...`,
            progress: 55,
            counts: {
              rawResults: allResults.length,
              uniqueResults: profileResults.length,
              cached: cachedUrls.length,
              enriched: processedCount,
            },
          });

          const BATCH_SIZE = 20;
          for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
            const batch = toCreate.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(
              batch.map((result) =>
                createFromSnippet(result, query, supabase).catch(() => null)
              )
            );

            for (const candidate of results) {
              if (candidate) {
                processedCount++;
                allCandidates.push(candidate);
                send("candidate", candidate);
              }
            }
          }
        }

        // ── Stage 5b: Create candidates from Apollo results ──
        if (apolloPeople.length > 0) {
          // Cross-source dedup: skip Apollo people already found via Serper
          const serperNames = new Set(
            allCandidates.map((c) => {
              const firstName = c.full_name.split(/\s+/)[0]?.toLowerCase() || "";
              const org = (c.current_company || "").toLowerCase();
              return `${firstName}::${org}`;
            })
          );

          const uniqueApollo = apolloPeople.filter((p) => {
            const key = `${p.first_name.toLowerCase()}::${(p.organization?.name || "").toLowerCase()}`;
            return !serperNames.has(key);
          });

          if (uniqueApollo.length < apolloPeople.length) {
            send("activity", `Cross-source dedup: filtered ${apolloPeople.length - uniqueApollo.length} Apollo duplicates`);
          }

          if (uniqueApollo.length > 0) {
            send("activity", `Creating ${uniqueApollo.length} candidates from Apollo...`);
            const apolloBatchSize = 20;
            for (let i = 0; i < uniqueApollo.length; i += apolloBatchSize) {
              const batch = uniqueApollo.slice(i, i + apolloBatchSize);
              const results = await Promise.all(
                batch.map((person) =>
                  createFromApollo(person, query, supabase).catch(() => null)
                )
              );

              for (const candidate of results) {
                if (candidate) {
                  processedCount++;
                  allCandidates.push(candidate);
                  send("candidate", candidate);
                }
              }
            }
          }
        }

        // ── Stage 6: Index in Meilisearch ──
        try {
          await indexCandidates(
            allCandidates.map((c) => ({
              ...c,
              is_job_hopper: c.is_job_hopper ?? false,
            }))
          );
          send("activity", `Indexed ${allCandidates.length} candidates in Meilisearch`);
        } catch (err) {
          // Meilisearch is optional — log but don't fail
          console.error("Meilisearch indexing failed (non-fatal):", err);
          send("activity", "Meilisearch indexing skipped (not running)");
        }

        // ── Stage 7: Boolean re-rank with location boost ──
        const rankedIds = allCandidates
          .map((c) => {
            const text = [
              c.full_name,
              c.headline,
              c.current_title,
              c.current_company,
              c.location,
              ...(c.tech_stack || []),
            ].filter(Boolean).join(" ");

            const booleanScore = parsed.scoreCandidate(text);
            const fitScore = c.fit_score ?? 0;

            // Location relevance bonus/penalty
            let locationBonus = 0;
            if (effectiveLocation) {
              if (isLocationMatch(c.location || "", effectiveLocation)) {
                locationBonus = 40; // Strong boost for matching location
              } else if (c.location) {
                locationBonus = -30; // Heavy penalty for wrong location when location was specified
              }
              // No location data = small penalty (prefer candidates we can verify)
              if (!c.location) {
                locationBonus = -5;
              }
            }

            return {
              id: c.id,
              combinedScore: booleanScore * 0.4 + fitScore * 0.3 + locationBonus + 30,
            };
          })
          .sort((a, b) => b.combinedScore - a.combinedScore)
          .map((r) => r.id);

        send("reranked", rankedIds);

        // ── Stage 8: Done ──
        const hasMore = dorkBatch < 2;
        const nextDorkBatch = dorkBatch + 1;
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

        send("done", { count: processedCount, hasMore, nextOffset, nextDorkBatch });
      } catch (error) {
        console.error("Search pipeline error:", error);
        send("error", {
          message:
            error instanceof Error ? error.message : "Search pipeline failed",
        });
      } finally {
        safeClose()
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
