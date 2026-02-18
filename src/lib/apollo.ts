import { Candidate, Experience, Education, ApolloSearchParams, ApolloPersonResult } from "@/types";

export interface ApolloEnrichmentResult {
  found: boolean;
  sparse: boolean;
  data: Partial<Candidate> & {
    _email?: string;
    _github_url?: string;
    _twitter_url?: string;
  };
}

// Failure tracking — skip Apollo after consecutive failures
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;

function isLinkedInUrl(url: string | null): boolean {
  return !!url && url.includes("linkedin.com/in/");
}

function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  try {
    const dt = new Date(isoDate);
    if (isNaN(dt.getTime())) return isoDate;
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

function monthsBetween(start: string | null | undefined, end: string | null | undefined): number {
  if (!start) return 0;
  try {
    const startDt = new Date(start);
    const endDt = end ? new Date(end) : new Date();
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) return 0;
    return Math.max(0, (endDt.getFullYear() - startDt.getFullYear()) * 12 + (endDt.getMonth() - startDt.getMonth()));
  } catch {
    return 0;
  }
}

function transformExperience(apolloHistory: Record<string, unknown>[]): Experience[] {
  return (apolloHistory || []).map((entry) => {
    const startDate = entry.start_date as string | undefined;
    const endDate = entry.end_date as string | undefined;
    return {
      title: (entry.title as string) || "",
      company: (entry.organization_name as string) || "",
      start_date: formatDate(startDate),
      end_date: endDate ? formatDate(endDate) : "Present",
      months: monthsBetween(startDate, endDate),
      description: (entry.description as string) || undefined,
    };
  });
}

function transformEducation(apolloEdu: Record<string, unknown>[]): Education[] {
  return (apolloEdu || []).map((entry) => ({
    school: (entry.school_name as string) || (entry.organization_name as string) || "",
    degree: (entry.degree as string) || undefined,
    field: (entry.field_of_study as string) || (entry.major as string) || undefined,
    years: [formatDate(entry.start_date as string), formatDate(entry.end_date as string)]
      .filter(Boolean)
      .join(" - ") || undefined,
  }));
}

// ─── Apollo People Search ───

const SENIORITY_MAP: Record<string, string> = {
  junior: "entry",
  mid: "senior",      // Apollo uses "senior" for mid-level
  senior: "senior",
  staff: "manager",
  director: "director",
  vp: "vp",
  executive: "c_suite",
  lead: "manager",
  principal: "director",
  intern: "entry",
};

export function buildApolloSearchParams(
  jobTitle?: string,
  location?: string,
  booleanQuery?: string,
  seniority?: string,
): ApolloSearchParams {
  const params: ApolloSearchParams = {};

  if (jobTitle) {
    params.person_titles = [jobTitle];
  }

  if (location) {
    params.person_locations = [location];
  }

  if (booleanQuery) {
    // Strip boolean operators (AND, OR, NOT) and quotes, keep actual keywords
    const keywords = booleanQuery
      .replace(/\b(AND|OR|NOT)\b/gi, "")
      .replace(/[()""]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (keywords) {
      params.q_keywords = keywords;
    }
  }

  if (seniority) {
    const mapped = SENIORITY_MAP[seniority.toLowerCase()];
    if (mapped) {
      params.person_seniorities = [mapped];
    }
  }

  return params;
}

export async function searchApollo(
  params: ApolloSearchParams,
  page = 1,
  perPage = 25,
): Promise<{ people: ApolloPersonResult[]; totalEntries: number }> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { people: [], totalEntries: 0 };

  try {
    const resp = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...params,
        page,
        per_page: perPage,
      }),
    });

    if (!resp.ok) {
      console.error(`Apollo Search API error: ${resp.status}`);
      return { people: [], totalEntries: 0 };
    }

    const data = await resp.json();
    return {
      people: (data.people || []) as ApolloPersonResult[],
      totalEntries: data.pagination?.total_entries ?? 0,
    };
  } catch (err) {
    console.error("Apollo Search API request failed:", err);
    return { people: [], totalEntries: 0 };
  }
}

export async function enrichWithApollo(candidate: Candidate, apolloId?: string): Promise<ApolloEnrichmentResult | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    console.warn(`Apollo: ${FAILURE_THRESHOLD} consecutive failures, skipping`);
    return null;
  }

  // Build match payload — apolloId first, then linkedin_url, fallback to name+company
  const payload: Record<string, string> = {};
  if (apolloId) {
    payload.id = apolloId;
  } else if (isLinkedInUrl(candidate.profile_url)) {
    payload.linkedin_url = candidate.profile_url;
  } else {
    const parts = candidate.full_name.trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    if (!firstName || !lastName) return null;
    payload.first_name = firstName;
    payload.last_name = lastName;
    if (candidate.current_company) {
      payload.organization_name = candidate.current_company;
    }
  }

  try {
    const resp = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      consecutiveFailures++;
      console.error(`Apollo API error: ${resp.status}`);
      return { found: false, sparse: true, data: {} };
    }

    const data = await resp.json();
    const person = data.person;

    if (!person) {
      consecutiveFailures = 0; // API worked, just no match
      return { found: false, sparse: true, data: {} };
    }

    consecutiveFailures = 0;

    // Extract fields
    const first = person.first_name || "";
    const last = person.last_name || "";
    const fullName = person.name || `${first} ${last}`.trim();
    const email = person.email || "";

    const employment = person.employment_history || [];
    const educationRaw = person.education || [];

    const experience = transformExperience(employment);
    const education = transformEducation(educationRaw);

    // Current job
    const jobTitle = person.title || "";
    const orgName = person.organization?.name || person.organization_name || "";

    // Location
    const locationParts = [person.city, person.state, person.country].filter(Boolean);
    const location = locationParts.join(", ");

    // Profile photo
    const photoUrl = person.photo_url || "";

    // Headline
    const headline = person.headline || "";

    // Social URLs
    const githubUrl = person.github_url || "";
    const twitterUrl = person.twitter_url || "";
    const linkedinUrl = person.linkedin_url || candidate.profile_url;

    // Sparsity check: < 2 experience AND no email
    const sparse = experience.length < 2 && !email;

    return {
      found: true,
      sparse,
      data: {
        full_name: fullName || candidate.full_name,
        current_title: jobTitle || (experience[0]?.title ?? null),
        current_company: orgName || (experience[0]?.company ?? null),
        location: location || null,
        headline: headline || null,
        experience: experience.length > 0 ? experience : null,
        education: education.length > 0 ? education : null,
        profile_url: linkedinUrl,
        profile_photo_url: photoUrl || null,
        enrichment_source: "apollo" as const,
        _email: email,
        _github_url: githubUrl,
        _twitter_url: twitterUrl,
      },
    };
  } catch (err) {
    consecutiveFailures++;
    console.error("Apollo API request failed:", err);
    return { found: false, sparse: true, data: {} };
  }
}

export function resetApolloFailures() {
  consecutiveFailures = 0;
}
