import { NextRequest } from "next/server";
import { getLLMConfig } from "@/lib/config";
import { searchGoogle, searchGoogleMultiPage } from "@/lib/serper";
import { createServerClient } from "@/lib/supabase/server";
import { Candidate, SerperResult, StructuredProfile } from "@/types";
import { deduplicateResults, filterExistingCandidates } from "@/lib/deduplication";
import { generateCrossPlatformQueries } from "@/lib/query-diversifier";

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

  let score = 30; // base score for appearing in search results

  // Title/role keyword match (+5 per keyword, max +30)
  let keywordHits = 0;
  for (const word of queryWords) {
    if (searchText.includes(word)) keywordHits++;
  }
  score += Math.min(30, keywordHits * (30 / Math.max(queryWords.length, 1)));

  // Tech stack match (+15 if any query tech found in profile skills)
  const techStack = profile.tech_stack || [];
  if (techStack.length > 0) {
    const techHits = queryWords.filter((w) =>
      techStack.some((t) => t.toLowerCase().includes(w))
    );
    if (techHits.length > 0) score += 15;
  }

  // Experience depth (+10 if has parsed experience)
  if ((profile.experience?.length || 0) > 0) score += 10;

  // YOE bonus (+5 if has meaningful experience)
  if ((profile.total_yoe || 0) > 2) score += 5;

  // Seniority alignment (+10)
  const seniorityTerms = ["senior", "staff", "principal", "lead", "director"];
  const querySeniority = seniorityTerms.find((s) => query.toLowerCase().includes(s));
  if (querySeniority && searchText.includes(querySeniority)) score += 10;

  return Math.min(100, Math.round(score));
}

// ─── Rule-based dork generation (instant, no LLM) ───

function generateDorksFromQuery(query: string): string[] {
  // Detect if user already provided a boolean/dork query (contains AND/OR operators or site: prefix)
  const isPreformatted = /\b(AND|OR)\b/.test(query) || query.includes("site:");
  if (isPreformatted) {
    const hasLinkedin = query.toLowerCase().includes("site:linkedin.com");
    const dork = hasLinkedin ? query : `site:linkedin.com/in ${query}`;
    return [dork];
  }

  const q = query.toLowerCase();

  // Extract components from the natural language query
  const seniorityWords = ["senior", "staff", "principal", "lead", "director", "vp", "head", "junior", "mid", "intern"];
  const seniority = seniorityWords.find((s) => q.includes(s));

  const locationMatch = query.match(/\b(?:in|at|from|near)\s+([A-Z][a-zA-Z\s,]+)/i);
  const location = locationMatch?.[1]?.trim();

  let roleText = query;
  if (seniority) roleText = roleText.replace(new RegExp(seniority, "i"), "");
  if (location) roleText = roleText.replace(new RegExp(`(?:in|at|from|near)\\s+${location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "");
  const roleWords = roleText.trim().split(/\s+/).filter((w) => w.length > 2);

  const seniorityStr = seniority ? `"${seniority.charAt(0).toUpperCase() + seniority.slice(1)}"` : "";
  const locationStr = location ? `"${location}"` : "";
  const roleStr = roleWords.map((w) => `"${w}"`).join(" ");

  const EXCLUDE = `-"recruiter" -"talent" -"hiring" -intitle:jobs -intitle:intern`;

  // Synonym map for broader matching
  const techSynonyms: Record<string, string> = {
    react: '("React" OR "React.js" OR "ReactJS")',
    python: '("Python" OR "Django" OR "FastAPI" OR "Flask")',
    javascript: '("JavaScript" OR "TypeScript" OR "Node.js")',
    typescript: '("TypeScript" OR "JavaScript" OR "Node.js")',
    ml: '("Machine Learning" OR "ML" OR "Deep Learning" OR "AI")',
    "machine learning": '("Machine Learning" OR "ML" OR "AI" OR "NLP")',
    ai: '("AI" OR "Machine Learning" OR "ML" OR "LLM")',
    frontend: '("Frontend" OR "Front-end" OR "Front End" OR "UI")',
    backend: '("Backend" OR "Back-end" OR "Back End" OR "Server")',
    fullstack: '("Full Stack" OR "Full-Stack" OR "Fullstack")',
    "full stack": '("Full Stack" OR "Full-Stack" OR "Fullstack")',
    devops: '("DevOps" OR "SRE" OR "Infrastructure" OR "Platform")',
    data: '("Data Engineer" OR "Data Scientist" OR "Analytics" OR "Data")',
    ios: '("iOS" OR "Swift" OR "SwiftUI" OR "Mobile")',
    android: '("Android" OR "Kotlin" OR "Mobile")',
    mobile: '("Mobile" OR "iOS" OR "Android" OR "React Native")',
    go: '("Golang" OR "Go Developer" OR "Go Engineer")',
    golang: '("Golang" OR "Go Developer" OR "Go Engineer")',
    rust: '("Rust" OR "Systems Programming" OR "Rust Engineer")',
    java: '("Java" OR "Spring" OR "JVM" OR "Spring Boot")',
    cloud: '("AWS" OR "GCP" OR "Azure" OR "Cloud")',
    aws: '("AWS" OR "Amazon Web Services" OR "Cloud")',
    docker: '("Docker" OR "Kubernetes" OR "Containers")',
    kubernetes: '("Kubernetes" OR "K8s" OR "Docker" OR "Container")',
    security: '("Security" OR "Cybersecurity" OR "InfoSec" OR "AppSec")',
    "c++": '("C++" OR "Systems" OR "Embedded")',
    ruby: '("Ruby" OR "Rails" OR "Ruby on Rails")',
    php: '("PHP" OR "Laravel" OR "Symfony")',
    scala: '("Scala" OR "JVM" OR "Spark")',
  };

  // Seniority synonyms for query variation
  const seniorSynonyms: Record<string, string[]> = {
    senior: ["Senior", "Sr.", "Lead"],
    staff: ["Staff", "Principal", "Distinguished"],
    principal: ["Principal", "Staff", "Distinguished"],
    lead: ["Lead", "Senior", "Tech Lead"],
    director: ["Director", "VP", "Head of"],
    junior: ["Junior", "Associate", "Entry"],
  };

  const dorks: string[] = [];

  // Dork 1: Exact match — title + skills + location
  dorks.push(
    `site:linkedin.com/in ${seniorityStr} ${roleStr} ${locationStr} ${EXCLUDE}`.replace(/\s+/g, " ").trim()
  );

  // Dork 2: Skill-focused with synonyms
  let skillVariant = `site:linkedin.com/in`;
  for (const word of roleWords) {
    const synonym = techSynonyms[word.toLowerCase()];
    skillVariant += synonym ? ` ${synonym}` : ` "${word}"`;
  }
  if (seniorityStr) skillVariant += ` ${seniorityStr}`;
  if (locationStr) skillVariant += ` ${locationStr}`;
  skillVariant += ` ${EXCLUDE}`;
  dorks.push(skillVariant.replace(/\s+/g, " ").trim());

  // Dork 3: Title-focused with role synonyms
  const titleRoles = '("engineer" OR "developer" OR "architect" OR "specialist")';
  dorks.push(
    `site:linkedin.com/in ${seniorityStr} ${titleRoles} ${roleStr} ${locationStr} ${EXCLUDE}`.replace(/\s+/g, " ").trim()
  );

  // Dork 4: Seniority-expanded (try alternate seniority labels)
  if (seniority && seniorSynonyms[seniority]) {
    const altSeniority = seniorSynonyms[seniority]
      .map((s) => `"${s}"`)
      .join(" OR ");
    dorks.push(
      `site:linkedin.com/in (${altSeniority}) ${roleStr} ${locationStr} ${EXCLUDE}`.replace(/\s+/g, " ").trim()
    );
  }

  // Dork 5: Broad — drop seniority, keep skills + location (catches more profiles)
  if (seniorityStr) {
    dorks.push(
      `site:linkedin.com/in ${roleStr} ${locationStr} ${EXCLUDE}`.replace(/\s+/g, " ").trim()
    );
  }

  // Dork 6: Company-focused variant — target top companies
  if (roleWords.length > 0) {
    const topCompanies = '("Google" OR "Meta" OR "Amazon" OR "Apple" OR "Microsoft" OR "Netflix" OR "Stripe" OR "Airbnb")';
    dorks.push(
      `site:linkedin.com/in ${roleStr} ${topCompanies} ${EXCLUDE}`.replace(/\s+/g, " ").trim()
    );
  }

  // Deduplicate and return up to 6 unique dorks
  return [...new Set(dorks)].slice(0, 6);
}

// Generate a relaxed (broader) version of the query for auto-retry on 0 results
function generateRelaxedDorks(query: string): string[] {
  // Strip seniority
  const seniorityWords = ["senior", "staff", "principal", "lead", "director", "vp", "head", "junior", "mid", "intern"];
  let relaxed = query;
  for (const s of seniorityWords) {
    relaxed = relaxed.replace(new RegExp(`\\b${s}\\b`, "gi"), "");
  }
  // Strip location
  relaxed = relaxed.replace(/\b(?:in|at|from|near)\s+[A-Z][a-zA-Z\s,]+/i, "");
  const words = relaxed.trim().split(/\s+/).filter((w) => w.length > 2);

  if (words.length === 0) {
    // Extreme fallback — just use original query unquoted
    return [`site:linkedin.com/in ${query} -"recruiter"`];
  }

  const broad = words.map((w) => `"${w}"`).join(" ");
  return [
    `site:linkedin.com/in ${broad} -"recruiter" -"talent"`,
    `site:linkedin.com/in ${words.join(" ")} -"recruiter"`,
  ];
}

// ─── Snippet-first: create candidate from Serper data (instant, no scraping) ───

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

  // Extract headline — take only the first part after name that looks like a job title
  // Ignore parts that look like company names, tech lists, or locations
  const ROLE_KEYWORDS = /engineer|developer|architect|manager|designer|analyst|scientist|director|lead|head|vp|cto|ceo|founder|consultant|specialist|coordinator/i;
  let headline: string | null = null;
  let company: string | null = null;

  for (const part of parts.slice(1)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!headline && ROLE_KEYWORDS.test(trimmed)) {
      headline = trimmed;
    } else if (!company && !ROLE_KEYWORDS.test(trimmed) && /^[A-Z]/.test(trimmed) && trimmed.length > 2 && trimmed.length < 40) {
      // Looks like a company name — exclude short tech keywords
      const lower = trimmed.toLowerCase().replace(/[.,]/g, "");
      const SKIP = new Set(["react", "reactjs", "nextjs", "next", "python", "django", "node", "nodejs", "typescript", "javascript", "java", "go", "rust", "php", "ruby", "swift", "kotlin", "scala", "sql", "aws", "gcp", "azure", "docker", "kubernetes", "linux", "full", "stack", "frontend", "backend", "remote", "freelance", "contract"]);
      if (!SKIP.has(lower)) company = trimmed;
    }
  }
  // Fallback: use first non-name part as headline
  if (!headline && parts.length > 1) {
    headline = parts[1].trim() || null;
  }

  // Extract location from snippet — look for "City, State" or "City, Country" patterns
  // Must have at least one word that's NOT a tech term on each side of the comma
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

  // Extract company from snippet — "at CompanyName" or "@ CompanyName"
  if (!company) {
    const companyMatch = result.snippet.match(
      /(?:\bat\b|@)\s+([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+){0,3})/
    );
    company = companyMatch?.[1]?.trim() || null;
  }

  // Extract tech skills
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

  // Build a basic structured profile from snippet for scoring
  const snippetProfile: Partial<StructuredProfile> = {
    full_name: name,
    current_role: headline || undefined,
    location: location || undefined,
    tech_stack: skills,
  };

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
    total_yoe: 0,
    avg_tenure: 0,
    stability_score: 0,
    growth_velocity: 0,
    is_open_to_work: /open to work|#opentowork|seeking/i.test(result.snippet),
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

// ─── Main search endpoint ───

export async function POST(request: NextRequest) {
  const body = await request.json();
  const query: string = body.query;
  const wideNet: boolean = body.wideNet ?? false;
  const maxPages: number = body.maxPages ?? 5;
  const offset: number = body.offset ?? 0;

  if (!query || typeof query !== "string") {
    return new Response("Query is required", { status: 400 });
  }

  const searchConfig = getLLMConfig();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSSE(event, data)));
      };

      try {
        // Emit provider info
        send("activity", `Using ${searchConfig.provider === "local" ? `local LLM (${searchConfig.localModel})` : "Anthropic Cloud"} — batch size: ${searchConfig.enrichBatchSize}`);

        // ── Phase 1: Generate queries ──
        send("progress", {
          phase: "generating",
          detail: "Generating search queries...",
          progress: 5,
          counts: {},
        });

        // Rule-based dork generation — instant, no LLM call needed
        const dorks = generateDorksFromQuery(query);

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

        // ── Phase 2: Parallel search ──
        send("progress", {
          phase: "searching",
          detail: "Searching across all queries...",
          progress: 20,
          counts: { queries: allQueries.length },
        });

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

        // ── Phase 3: Deduplicate + cache ──
        send("activity", `Deduplicating ${allResults.length} results...`);
        const deduplicated = deduplicateResults(allResults);
        let profileResults = deduplicated.filter(
          (r) =>
            r.link.includes("linkedin.com/in/") ||
            r.source === "github" ||
            r.source === "stackoverflow"
        );

        // ── Auto-relax: retry with broader query if 0 results ──
        if (profileResults.length === 0) {
          send("activity", "No results found — auto-relaxing search terms...");
          send("progress", {
            phase: "searching",
            detail: "Retrying with broader query...",
            progress: 38,
            counts: { queries: allQueries.length, rawResults: 0 },
          });

          const relaxedDorks = generateRelaxedDorks(query);
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
            (r) => r.link.includes("linkedin.com/in/") || r.source === "github" || r.source === "stackoverflow"
          );

          if (relaxedProfiles.length === 0) {
            send("status", "No profiles found even after broadening search. Try different keywords.");
            send("done", { count: 0, hasMore: false, nextOffset: 0 });
            try { controller.close(); } catch { /* ok */ }
            return;
          }

          // Replace empty results with relaxed results
          profileResults.push(...relaxedProfiles);
          allResults.push(...relaxedResults);
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

        for (const r of profileResults) {
          send("preview", {
            id: `preview-${Buffer.from(r.link).toString("base64url")}`,
            name: extractNameFromSerper(r.title),
            snippet: r.snippet,
            url: r.link,
            source: r.source,
          });
        }

        const profileUrls = profileResults.map((r) => r.link);
        const { cached: cachedUrls, toProcess } =
          await filterExistingCandidates(supabase as never, profileUrls);

        let processedCount = 0;
        if (cachedUrls.length > 0) {
          send("activity", `Loading ${cachedUrls.length} cached candidates (zero-latency)...`);
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

        // Non-blocking history save (only use columns that exist in schema)
        supabase
          .from("search_history")
          .insert({
            natural_language_query: query,
            generated_dork: dorks[0],
            result_count: profileResults.length,
          })
          .then(({ error }) => {
            if (error) console.error("Failed to save search history:", error);
          });

        // ── Phase 4: Create candidates from snippets (instant, no scraping) ──
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

          // Process all snippets in parallel (no scraping = instant)
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
        try { controller.close(); } catch { /* already closed */ }
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
