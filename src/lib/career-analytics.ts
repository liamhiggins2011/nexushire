import { Experience } from "@/types";

const FAANG_COMPANIES = [
  "google", "alphabet", "meta", "facebook", "amazon", "apple", "netflix",
  "microsoft", "deepmind", "instagram", "whatsapp", "youtube", "aws",
  "azure", "github", "linkedin", "openai", "anthropic",
];

const UNICORN_COMPANIES = [
  "stripe", "spacex", "databricks", "canva", "revolut", "checkout.com",
  "klarna", "instacart", "discord", "figma", "notion", "vercel",
  "datadog", "snowflake", "cloudflare", "plaid", "ramp", "brex",
  "scale ai", "anduril", "rippling", "deel", "gusto",
];

const YC_COMPANIES = [
  "airbnb", "stripe", "dropbox", "coinbase", "doordash", "instacart",
  "reddit", "twitch", "cruise", "gitlab", "zapier", "algolia",
  "segment", "retool", "supabase", "vercel", "posthog", "cal.com",
  "resend", "railway", "render", "fly.io", "linear",
];

export function parseMonthsFromDuration(duration: string): number {
  if (!duration) return 0;

  let months = 0;
  const yearMatch = duration.match(/(\d+)\s*(?:yr|year)/i);
  const monthMatch = duration.match(/(\d+)\s*(?:mo|month)/i);

  if (yearMatch) months += parseInt(yearMatch[1]) * 12;
  if (monthMatch) months += parseInt(monthMatch[1]);

  // Try "Jan 2020 - Present" format
  if (months === 0) {
    const dateRange = duration.match(
      /(\w+\s+\d{4})\s*[-–]\s*(\w+\s+\d{4}|Present|Current)/i
    );
    if (dateRange) {
      const start = new Date(dateRange[1]);
      const end = dateRange[2].match(/present|current/i)
        ? new Date()
        : new Date(dateRange[2]);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        months = Math.max(
          1,
          Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))
        );
      }
    }
  }

  return months;
}

export function calculateTotalYOE(experience: Experience[]): number {
  let totalMonths = 0;
  for (const exp of experience) {
    if (exp.months) {
      totalMonths += exp.months;
    } else if (exp.duration) {
      totalMonths += parseMonthsFromDuration(exp.duration);
    }
  }
  return Math.round((totalMonths / 12) * 10) / 10;
}

export function calculateAvgTenure(experience: Experience[]): number {
  if (experience.length === 0) return 0;

  // Group by company to handle promotions within same company
  const companyTenures = new Map<string, number>();
  for (const exp of experience) {
    if (!exp.company) continue;
    const company = exp.company.toLowerCase().trim();
    const months = exp.months || parseMonthsFromDuration(exp.duration || "");
    companyTenures.set(company, (companyTenures.get(company) || 0) + months);
  }

  if (companyTenures.size === 0) return 0;

  const totalMonths = Array.from(companyTenures.values()).reduce((a, b) => a + b, 0);
  return Math.round((totalMonths / companyTenures.size / 12) * 10) / 10;
}

export function calculateStabilityScore(experience: Experience[]): number {
  if (experience.length === 0) return 0;

  // Group by company
  const companyTenures = new Map<string, number>();
  for (const exp of experience) {
    if (!exp.company) continue;
    const company = exp.company.toLowerCase().trim();
    const months = exp.months || parseMonthsFromDuration(exp.duration || "");
    companyTenures.set(company, (companyTenures.get(company) || 0) + months);
  }

  const tenures = Array.from(companyTenures.values());
  if (tenures.length === 0) return 0;

  // Score: % of roles with 2+ year tenure (24 months)
  const stableCount = tenures.filter((m) => m >= 24).length;
  return Math.round((stableCount / tenures.length) * 100);
}

export function calculateGrowthVelocity(experience: Experience[]): number {
  if (experience.length < 2) return 0;

  // Group roles by company, detect promotions (title changes at same company)
  const companyRoles = new Map<string, { title: string; months: number }[]>();
  for (const exp of experience) {
    if (!exp.company) continue;
    const company = exp.company.toLowerCase().trim();
    const roles = companyRoles.get(company) || [];
    roles.push({
      title: exp.title,
      months: exp.months || parseMonthsFromDuration(exp.duration || ""),
    });
    companyRoles.set(company, roles);
  }

  let promotions = 0;
  let totalMonths = 0;

  for (const roles of companyRoles.values()) {
    if (roles.length > 1) {
      // Multiple roles at same company = promotions
      promotions += roles.length - 1;
      totalMonths += roles.reduce((sum, r) => sum + r.months, 0);
    }
  }

  if (totalMonths === 0) return 0;

  // Promotions per 4 years (48 months)
  const velocity = (promotions / totalMonths) * 48;
  return Math.round(velocity * 10) / 10;
}

export function detectCompanyPedigree(experience: Experience[]): string[] {
  const pedigree: Set<string> = new Set();

  for (const exp of experience) {
    if (!exp.company) continue;
    const company = exp.company.toLowerCase().trim();
    if (FAANG_COMPANIES.some((f) => company.includes(f))) pedigree.add("faang");
    if (UNICORN_COMPANIES.some((u) => company.includes(u))) pedigree.add("unicorn");
    if (YC_COMPANIES.some((y) => company.includes(y))) pedigree.add("yc");
  }

  return Array.from(pedigree);
}

export function detectOpenToWork(
  headline: string | null,
  rawMarkdown: string | null
): boolean {
  const text = `${headline || ""} ${rawMarkdown || ""}`.toLowerCase();
  const signals = [
    "open to work",
    "actively seeking",
    "looking for",
    "new opportunities",
    "available for",
    "seeking new",
    "open to new",
    "in transition",
    "between roles",
    "exploring opportunities",
    "#opentowork",
    "ready for my next",
  ];
  return signals.some((s) => text.includes(s));
}

export function getAllCompanies(experience: Experience[]): string[] {
  const companies = new Set<string>();
  for (const exp of experience) {
    if (exp.company) companies.add(exp.company.trim());
  }
  return Array.from(companies);
}
