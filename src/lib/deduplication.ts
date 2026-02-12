import { SerperResult } from "@/types";

interface DeduplicatedResult extends SerperResult {
  source: "linkedin" | "github" | "stackoverflow";
  linkedProfiles?: { platform: string; url: string }[];
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, "").toLowerCase();
    // Strip trailing slash and query params
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url.toLowerCase().replace(/\/+$/, "");
  }
}

export function extractNameFromTitle(title: string): string {
  return title
    .replace(/\s*[-–|·]\s*(LinkedIn|GitHub|Stack Overflow).*$/i, "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim()
    .toLowerCase();
}

function detectSource(url: string): "linkedin" | "github" | "stackoverflow" {
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("github.com")) return "github";
  if (url.includes("stackoverflow.com")) return "stackoverflow";
  return "linkedin";
}

function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const aParts = a.split(/\s+/).filter(Boolean);
  const bParts = b.split(/\s+/).filter(Boolean);
  if (aParts.length === 0 || bParts.length === 0) return 0;
  let matches = 0;
  for (const part of aParts) {
    if (bParts.some((bp) => bp === part || bp.startsWith(part) || part.startsWith(bp))) {
      matches++;
    }
  }
  return matches / Math.max(aParts.length, bParts.length);
}

export function deduplicateResults(results: SerperResult[]): DeduplicatedResult[] {
  const seen = new Map<string, DeduplicatedResult>();
  const nameIndex = new Map<string, string>(); // normalized name -> normalized URL key

  for (const r of results) {
    const normalizedUrl = normalizeUrl(r.link);
    const source = detectSource(r.link);
    const name = extractNameFromTitle(r.title);

    // Primary dedup: exact URL match
    if (seen.has(normalizedUrl)) continue;

    // Cross-platform merge: check if name matches an existing entry
    let merged = false;
    if (name && source !== "linkedin") {
      for (const [existingName, existingKey] of nameIndex) {
        if (nameSimilarity(name, existingName) > 0.7) {
          const existing = seen.get(existingKey);
          if (existing && existing.source !== source) {
            existing.linkedProfiles = existing.linkedProfiles || [];
            existing.linkedProfiles.push({ platform: source, url: r.link });
            merged = true;
            break;
          }
        }
      }
    }

    if (!merged) {
      const entry: DeduplicatedResult = { ...r, source };
      seen.set(normalizedUrl, entry);
      if (name) nameIndex.set(name, normalizedUrl);
    }
  }

  return Array.from(seen.values());
}

export async function filterExistingCandidates(
  supabase: { from: (table: string) => { select: (columns: string) => { in: (column: string, values: string[]) => { gte: (column: string, value: string) => Promise<{ data: { profile_url: string }[] | null; error: unknown }> } } } },
  urls: string[],
  maxAgeHours = 24
): Promise<{ cached: string[]; toProcess: string[] }> {
  if (urls.length === 0) return { cached: [], toProcess: [] };

  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("candidates")
    .select("profile_url")
    .in("profile_url", urls)
    .gte("updated_at", cutoff);

  if (error || !data) {
    return { cached: [], toProcess: urls };
  }

  const cachedUrls = new Set(data.map((d: { profile_url: string }) => d.profile_url));
  return {
    cached: urls.filter((u) => cachedUrls.has(u)),
    toProcess: urls.filter((u) => !cachedUrls.has(u)),
  };
}
