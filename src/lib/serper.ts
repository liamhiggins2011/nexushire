import { SerperResult } from "@/types";

interface SerperResponse {
  organic: {
    title: string;
    link: string;
    snippet: string;
    position: number;
  }[];
}

export async function searchGoogle(
  query: string,
  numResults = 10
): Promise<SerperResult[]> {
  return searchGooglePaginated({ query, num: numResults });
}

export async function searchGooglePaginated({
  query,
  num = 10,
  page = 1,
}: {
  query: string;
  num?: number;
  page?: number;
}): Promise<SerperResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num,
      page,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
  }

  const data: SerperResponse = await response.json();
  return (data.organic || []).map((r) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    position: r.position,
  }));
}

export async function searchGoogleMultiPage(
  query: string,
  pages = 3,
  resultsPerPage = 10
): Promise<SerperResult[]> {
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const results = await Promise.all(
    pageNumbers.map((page) =>
      searchGooglePaginated({ query, num: resultsPerPage, page })
    )
  );
  return results.flat();
}
