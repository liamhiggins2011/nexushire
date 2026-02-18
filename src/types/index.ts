export interface Candidate {
  id: string;
  full_name: string;
  headline: string | null;
  location: string | null;
  current_title: string | null;
  current_company: string | null;
  profile_url: string;
  experience: Experience[] | null;
  education: Education[] | null;
  skills: string[] | null;
  email: string | null;
  github_url: string | null;
  twitter_url: string | null;
  fit_score: number | null;
  fit_reasoning: string | null;
  raw_scraped_markdown: string | null;
  // Talent Intelligence fields
  total_yoe: number | null;
  avg_tenure: number | null;
  stability_score: number | null;
  growth_velocity: number | null;
  is_open_to_work: boolean | null;
  company_pedigree: string[] | null;
  tech_stack: string[] | null;
  career_highlights: string[] | null;
  career_narrative: string | null;
  inferred_intent: string | null;
  intent_confidence: "high" | "medium" | "low" | null;
  profile_photo_url: string | null;
  deep_dive_data: DeepDiveData | null;
  is_job_hopper: boolean | null;
  job_hopper_reason: string | null;
  enrichment_source: "apollo" | "apollo_search" | "firecrawl" | "snippet" | null;
  apollo_id: string | null;
  hydration_layer: number;
  matched_terms?: string[] | null;
  about_section: string | null;
  certifications: string[] | null;
  languages: string[] | null;
  volunteer_work: VolunteerEntry[] | null;
  created_at: string;
  updated_at: string;
}

export interface Experience {
  title: string;
  company: string;
  duration?: string;
  start_date?: string;
  end_date?: string;
  months?: number;
  description?: string;
}

export interface Education {
  school: string;
  degree?: string;
  field?: string;
  years?: string;
}

export interface DeepDiveData {
  github_summary: string | null;
  github_repos: number | null;
  github_contributions: string | null;
  twitter_summary: string | null;
  twitter_interests: string[] | null;
  career_narrative: string;
  enriched_at: string;
}

export interface VolunteerEntry {
  role: string;
  organization: string;
  description?: string;
}

export interface StructuredProfile {
  full_name: string;
  current_role: string;
  total_yoe: number;
  avg_tenure: number;
  is_open_to_work: boolean;
  tech_stack: string[];
  career_highlights: string[];
  location: string | null;
  company_pedigree: string[];
  experience: {
    title: string;
    company: string;
    start_date: string | null;
    end_date: string | null;
    months: number;
    description?: string;
  }[];
  about_section: string | null;
  certifications: string[];
  languages: string[];
  volunteer_work: VolunteerEntry[];
  stability_score: number;
  growth_velocity: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  search_query: string | null;
  created_at: string;
  updated_at: string;
}

export type CandidateStatus =
  | "new"
  | "contacted"
  | "replied"
  | "interview"
  | "rejected"
  | "hired";

export interface ProjectCandidate {
  id: string;
  project_id: string;
  candidate_id: string;
  status: CandidateStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  candidate?: Candidate;
}

export interface OutreachDraft {
  id: string;
  candidate_id: string;
  project_id: string | null;
  subject: string;
  body: string;
  tone: string;
  status: "draft" | "sent";
  created_at: string;
  updated_at: string;
  candidate?: Candidate;
}

export interface SearchHistory {
  id: string;
  natural_language_query: string;
  generated_dork: string;
  result_count: number;
  created_at: string;
}

export interface SearchStreamEvent {
  type: "status" | "dork" | "candidate" | "error" | "done" | "parsed_query" | "reranked";
  data: string | Candidate | { message: string };
}

export interface ParsedQueryInfo {
  original: string;
  meilisearchQuery: string;
  dorkCount: number;
}

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  thumbnailUrl?: string;
}

export interface SearchProgressEvent {
  phase: "generating" | "searching" | "deduplicating" | "enriching" | "complete";
  detail: string;
  progress: number;
  counts?: {
    queries?: number;
    rawResults?: number;
    uniqueResults?: number;
    enriched?: number;
    cached?: number;
  };
}

export interface PreviewCandidate {
  id: string;
  name: string;
  snippet: string;
  url: string;
  source: "linkedin" | "github" | "stackoverflow" | "apollo";
}

export interface EnterpriseSearchRequest {
  query: string;
  location?: string;
  jobTitle?: string;
  booleanQuery?: string;
  wideNet?: boolean;
  maxPages?: number;
  offset?: number;
}

export type CompanyPedigreeFilter = "faang" | "unicorn" | "yc" | "all";

export type SearchSource = "linkedin" | "github" | "stackoverflow" | "apollo";

export interface ApolloSearchParams {
  person_titles?: string[];
  person_locations?: string[];
  q_keywords?: string;
  person_seniorities?: string[];
  page?: number;
  per_page?: number;
}

export interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string | null;
  headline: string | null;
  photo_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization: {
    name: string | null;
    website_url: string | null;
  } | null;
  seniority: string | null;
}

export interface BooleanBlock {
  id: string;
  type: "term" | "phrase" | "operator" | "not" | "group_start" | "group_end";
  value: string;
}

export type SecurityClearance = "any" | "ts_sci" | "ts" | "secret" | "public_trust";

export interface SearchFilters {
  minYoe: number;
  maxYoe: number;
  minTenure: number;
  maxTenure: number;
  minStability: number;
  openToWork: boolean | null;
  companyPedigree: CompanyPedigreeFilter;
  location: string;
  companies: string[];
  seniority?: string;
  title?: string;
  minFitScore: number;
  securityClearance: SecurityClearance;
  likelyToMove: boolean | null;
  diversitySignals: boolean | null;
  minCurrentCompanyYears: number;
  maxCurrentCompanyYears: number;
}
