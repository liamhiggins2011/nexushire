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
  deep_dive_data: DeepDiveData | null;
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
  }[];
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
  type: "status" | "dork" | "candidate" | "error" | "done";
  data: string | Candidate | { message: string };
}

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
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
  source: "linkedin" | "github" | "stackoverflow";
}

export interface EnterpriseSearchRequest {
  query: string;
  wideNet?: boolean;
  maxPages?: number;
  offset?: number;
}

export type CompanyPedigreeFilter = "faang" | "unicorn" | "yc" | "all";

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
}
