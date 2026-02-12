import { Candidate, Experience, Education } from "@/types";
import { extractContactInfo } from "@/lib/prompts/contact-extractor";

export function parseProfileMarkdown(
  markdown: string,
  profileUrl: string
): Partial<Candidate> {
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
  const contact = extractContactInfo(markdown);

  const fullName = extractName(lines);
  const headline = extractHeadline(lines);
  const location = extractLocation(lines);
  const experience = extractExperience(markdown);
  const education = extractEducation(markdown);
  const skills = extractSkills(markdown);

  const currentExp = experience[0];

  return {
    full_name: fullName || "Unknown",
    headline: headline,
    location: location,
    current_title: currentExp?.title || null,
    current_company: currentExp?.company || null,
    profile_url: profileUrl,
    experience: experience.length > 0 ? experience : null,
    education: education.length > 0 ? education : null,
    skills: skills.length > 0 ? skills : null,
    email: contact.email,
    github_url: contact.github_url,
    twitter_url: contact.twitter_url,
    raw_scraped_markdown: markdown,
  };
}

function extractName(lines: string[]): string | null {
  for (const line of lines.slice(0, 10)) {
    const cleaned = line.replace(/^#+\s*/, "").trim();
    if (
      cleaned.length > 2 &&
      cleaned.length < 60 &&
      !cleaned.includes("LinkedIn") &&
      !cleaned.includes("Sign in") &&
      !cleaned.includes("http") &&
      /^[A-Z]/.test(cleaned)
    ) {
      const namePart = cleaned.split(/[|·\-–—]/)[0].trim();
      if (namePart.split(/\s+/).length <= 5 && namePart.length > 2) {
        return namePart;
      }
    }
  }
  return null;
}

function extractHeadline(lines: string[]): string | null {
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (
      line.length > 10 &&
      line.length < 200 &&
      !line.startsWith("#") &&
      !line.includes("LinkedIn") &&
      !line.includes("Sign in") &&
      (line.includes("at ") ||
        line.includes("@") ||
        line.includes("|") ||
        line.includes("Engineer") ||
        line.includes("Manager") ||
        line.includes("Developer") ||
        line.includes("Director") ||
        line.includes("Lead") ||
        line.includes("Founder"))
    ) {
      return line.replace(/^[-*•]\s*/, "").trim();
    }
  }
  return null;
}

function extractLocation(lines: string[]): string | null {
  for (const line of lines.slice(0, 20)) {
    const locationMatch = line.match(
      /(?:📍|Location:?\s*|Based in\s+)(.+)/i
    );
    if (locationMatch) return locationMatch[1].trim();

    if (
      /^[A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*(?:,\s*[A-Z]{2})?(?:\s+Area)?$/.test(
        line
      ) &&
      line.length < 50
    ) {
      return line;
    }
  }
  return null;
}

function extractExperience(markdown: string): Experience[] {
  const experiences: Experience[] = [];
  const expSection = markdown.match(
    /(?:Experience|Work Experience|Professional Experience)([\s\S]*?)(?=Education|Skills|Certifications|Languages|$)/i
  );
  if (!expSection) return experiences;

  const entries = expSection[1].split(/\n(?=#+\s|\*\*|•)/);
  for (const entry of entries.slice(0, 5)) {
    const titleMatch = entry.match(
      /(?:#+\s*|\*\*)?([^*\n#]+?)(?:\*\*)?(?:\s*(?:at|@|-|·|,)\s*)([^*\n]+)/
    );
    if (titleMatch) {
      const durationMatch = entry.match(
        /(\w+\s+\d{4}\s*[-–]\s*(?:\w+\s+\d{4}|Present|Current))/i
      );
      experiences.push({
        title: titleMatch[1].trim(),
        company: titleMatch[2].trim().replace(/\*\*/g, ""),
        duration: durationMatch?.[1] || undefined,
        description: undefined,
      });
    }
  }
  return experiences;
}

function extractEducation(markdown: string): Education[] {
  const educations: Education[] = [];
  const eduSection = markdown.match(
    /(?:Education)([\s\S]*?)(?=Experience|Skills|Certifications|Languages|Interests|$)/i
  );
  if (!eduSection) return educations;

  const entries = eduSection[1].split(/\n(?=#+\s|\*\*|•)/);
  for (const entry of entries.slice(0, 3)) {
    const schoolMatch = entry.match(/(?:#+\s*|\*\*)?([A-Z][^*\n]+)/);
    if (schoolMatch && schoolMatch[1].length > 3) {
      const degreeMatch = entry.match(
        /(Bachelor|Master|PhD|MBA|B\.S\.|M\.S\.|B\.A\.|M\.A\.|Doctor)[^,\n]*/i
      );
      educations.push({
        school: schoolMatch[1].trim().replace(/\*\*/g, ""),
        degree: degreeMatch?.[0]?.trim() || undefined,
      });
    }
  }
  return educations;
}

function extractSkills(markdown: string): string[] {
  const skillSection = markdown.match(
    /(?:Skills|Top Skills|Core Competencies)([\s\S]*?)(?=Education|Experience|Certifications|Languages|Interests|Recommendations|$)/i
  );
  if (!skillSection) return [];

  const skills: string[] = [];
  const lines = skillSection[1].split("\n");
  for (const line of lines) {
    const cleaned = line.replace(/^[-*•·]\s*/, "").trim();
    if (cleaned.length > 1 && cleaned.length < 50 && !cleaned.startsWith("#")) {
      skills.push(cleaned);
    }
  }
  return skills.slice(0, 20);
}
