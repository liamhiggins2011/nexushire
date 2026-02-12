"use client";

import { useState, useCallback, useRef } from "react";
import { Candidate, PreviewCandidate, SearchProgressEvent } from "@/types";

interface SearchState {
  isSearching: boolean;
  status: string;
  dork: string | null;
  candidates: Candidate[];
  previews: PreviewCandidate[];
  progress: SearchProgressEvent | null;
  queries: string[];
  error: string | null;
  hasMore: boolean;
  nextOffset: number;
}

interface SearchOptions {
  wideNet?: boolean;
  maxPages?: number;
}

export function useSearch() {
  const [state, setState] = useState<SearchState>({
    isSearching: false,
    status: "",
    dork: null,
    candidates: [],
    previews: [],
    progress: null,
    queries: [],
    error: null,
    hasMore: false,
    nextOffset: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  const executeSearch = useCallback(
    async (query: string, options?: SearchOptions & { offset?: number; append?: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options?.append) {
        setState({
          isSearching: true,
          status: "Starting search...",
          dork: null,
          candidates: [],
          previews: [],
          progress: null,
          queries: [],
          error: null,
          hasMore: false,
          nextOffset: 0,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isSearching: true,
          status: "Loading more...",
          error: null,
        }));
      }

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            wideNet: options?.wideNet ?? false,
            maxPages: options?.maxPages ?? 3,
            offset: options?.offset ?? 0,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete SSE blocks from buffer
          const blocks = buffer.split("\n\n");
          // Keep the last incomplete block in the buffer
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            if (!block.trim()) continue;

            const lines = block.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }

            if (!eventType || !eventData) continue;

            try {
              const data = JSON.parse(eventData);

              switch (eventType) {
                case "status":
                  setState((prev) => ({ ...prev, status: data as string }));
                  break;

                case "dork":
                  setState((prev) => ({ ...prev, dork: data as string }));
                  break;

                case "queries":
                  setState((prev) => ({
                    ...prev,
                    queries: data as string[],
                  }));
                  break;

                case "progress":
                  setState((prev) => ({
                    ...prev,
                    progress: data as SearchProgressEvent,
                    status: (data as SearchProgressEvent).detail,
                  }));
                  break;

                case "preview":
                  setState((prev) => ({
                    ...prev,
                    previews: [...prev.previews, data as PreviewCandidate],
                  }));
                  break;

                case "candidate": {
                  const candidate = data as Candidate;
                  setState((prev) => {
                    // Remove matching preview
                    const newPreviews = prev.previews.filter(
                      (p) => p.url !== candidate.profile_url
                    );
                    // Avoid duplicates in candidates list
                    const exists = prev.candidates.some(
                      (c) => c.profile_url === candidate.profile_url
                    );
                    return {
                      ...prev,
                      candidates: exists
                        ? prev.candidates
                        : [...prev.candidates, candidate],
                      previews: newPreviews,
                    };
                  });
                  break;
                }

                case "error":
                  setState((prev) => ({
                    ...prev,
                    error: (data as { message: string }).message,
                  }));
                  break;

                case "done": {
                  const doneData = data as {
                    count: number;
                    hasMore?: boolean;
                    nextOffset?: number;
                  };
                  setState((prev) => ({
                    ...prev,
                    isSearching: false,
                    status: `Found ${prev.candidates.length} candidates`,
                    hasMore: doneData.hasMore ?? false,
                    nextOffset: doneData.nextOffset ?? 0,
                    previews: [], // clear remaining previews
                  }));
                  break;
                }
              }
            } catch {
              // skip unparseable events
            }
          }
        }

        // Handle any remaining data in buffer
        setState((prev) => {
          if (prev.isSearching) {
            return { ...prev, isSearching: false, status: prev.status || "Search complete" };
          }
          return prev;
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setState((prev) => ({
            ...prev,
            isSearching: false,
            error: error instanceof Error ? error.message : "Search failed",
          }));
        }
      }
    },
    []
  );

  const search = useCallback(
    (query: string, options?: SearchOptions) => {
      executeSearch(query, options);
    },
    [executeSearch]
  );

  const loadMore = useCallback(
    (query: string, options?: SearchOptions) => {
      executeSearch(query, {
        ...options,
        offset: state.nextOffset,
        append: true,
      });
    },
    [executeSearch, state.nextOffset]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({
      ...prev,
      isSearching: false,
      status: "Cancelled",
      previews: [],
    }));
  }, []);

  return { ...state, search, loadMore, cancel };
}
