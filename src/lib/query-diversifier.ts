export function generateCrossPlatformQueries(query: string): string[] {
  const queries: string[] = [];

  // Extract key terms from the natural language query
  const lower = query.toLowerCase();
  const terms = query.replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);

  // Identify skills/technologies
  const techKeywords = terms.filter((t) =>
    /^(react|angular|vue|python|java|rust|go|typescript|node|aws|gcp|azure|kubernetes|docker|terraform|swift|kotlin|flutter|rails|django|graphql|sql|mongodb|redis|kafka|spark|ml|ai|llm)$/i.test(t)
  );

  // Identify role keywords
  const roleKeywords = terms.filter((t) =>
    /^(engineer|developer|architect|manager|designer|scientist|analyst|devops|sre|lead|director|vp)$/i.test(t)
  );

  // GitHub query: look for developers by their repos/bio
  if (techKeywords.length > 0) {
    const techPart = techKeywords.join(" OR ");
    const rolePart = roleKeywords.length > 0 ? ` "${roleKeywords[0]}"` : "";
    queries.push(`site:github.com ${techPart}${rolePart} followers`);
  } else {
    // Generic GitHub query
    const mainTerms = terms.slice(0, 3).join(" ");
    queries.push(`site:github.com ${mainTerms}`);
  }

  // StackOverflow query: find top contributors
  if (techKeywords.length > 0) {
    queries.push(
      `site:stackoverflow.com/users ${techKeywords.slice(0, 3).join(" ")}${
        lower.includes("senior") || lower.includes("staff") ? " top" : ""
      }`
    );
  } else {
    const mainTerms = terms.slice(0, 3).join(" ");
    queries.push(`site:stackoverflow.com/users ${mainTerms}`);
  }

  return queries;
}
