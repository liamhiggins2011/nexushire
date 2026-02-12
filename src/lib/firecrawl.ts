interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
    };
  };
  error?: string;
}

// Track consecutive failures to skip Firecrawl entirely if LinkedIn is blocking
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;

export async function scrapeUrl(url: string): Promise<string | null> {
  // If we've hit too many consecutive failures, skip Firecrawl entirely
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    return null;
  }

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      excludeTags: [
        "img", "svg", "picture", "video", "iframe",
        "style", "link[rel=stylesheet]",
        "nav", "footer", "header",
        "script", "noscript",
      ],
      waitFor: 0,
      timeout: 15000,
    }),
  });

  if (!response.ok) {
    consecutiveFailures++;
    if (consecutiveFailures === FAILURE_THRESHOLD) {
      console.warn(
        `Firecrawl: ${FAILURE_THRESHOLD} consecutive failures, skipping remaining URLs`
      );
    } else {
      console.error(`Firecrawl error for ${url}: ${response.status}`);
    }
    return null;
  }

  const data: FirecrawlResponse = await response.json();
  if (!data.success || !data.data?.markdown) {
    console.error(`Firecrawl failed for ${url}: ${data.error}`);
    consecutiveFailures++;
    return null;
  }

  consecutiveFailures = 0;
  return data.data.markdown;
}

export function resetFirecrawlFailures() {
  consecutiveFailures = 0;
}
