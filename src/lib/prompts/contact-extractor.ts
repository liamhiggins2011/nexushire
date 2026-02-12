const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const GITHUB_REGEX = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9-]+)/g;
const TWITTER_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/g;

export function extractContactInfo(markdown: string): {
  email: string | null;
  github_url: string | null;
  twitter_url: string | null;
} {
  const emails = markdown.match(EMAIL_REGEX);
  const githubMatches = markdown.match(GITHUB_REGEX);
  const twitterMatches = markdown.match(TWITTER_REGEX);

  return {
    email: emails?.[0] || null,
    github_url: githubMatches?.[0] || null,
    twitter_url: twitterMatches?.[0] || null,
  };
}
