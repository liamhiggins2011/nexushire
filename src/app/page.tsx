"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearch } from "@/hooks/use-search";
import { useSearchStore } from "@/stores/search-store";
import { SearchBar } from "@/components/search/search-bar";
import { SearchResults } from "@/components/search/search-results";
import { FilterSidebar, DEFAULT_FILTERS } from "@/components/search/filter-sidebar";
import { TalentMap } from "@/components/search/talent-map";
import { DorkPreview } from "@/components/search/dork-preview";
import { SourcingProgress } from "@/components/search/sourcing-progress";
import { LiveFeed } from "@/components/search/live-feed";
import { ShortlistPanel } from "@/components/shortlist/shortlist-panel";
import { CandidateDetail } from "@/components/candidate/candidate-detail";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Candidate, SearchFilters } from "@/types";
import { LayoutList, Map, ChevronDown } from "lucide-react";

const SENIORITY_KEYWORDS: Record<string, string[]> = {
  junior: ["junior", "associate", "entry", "intern", "graduate"],
  mid: ["mid", "intermediate"],
  senior: ["senior", "sr.", "sr "],
  staff: ["staff", "principal", "distinguished", "fellow"],
  director: ["director", "vp", "vice president", "head of", "chief", "cto", "ceo"],
};

export default function HomePage() {
  const {
    isSearching,
    status,
    dork,
    candidates,
    previews,
    progress,
    queries,
    activities,
    error,
    hasMore,
    search,
    loadMore,
    cancel,
  } = useSearch();
  const { shortlist, addToShortlist, setSelectedCandidate } = useSearchStore();

  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const lastQueryRef = useRef<{ query: string; wideNet?: boolean }>({ query: "" });

  const shortlistedIds = new Set(shortlist.map((c) => c.id));

  // Cmd+K to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Senior React"]'
        );
        input?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Clear selections when candidates change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // Location
      if (filters.location) {
        const loc = (c.location || "").toLowerCase();
        if (!loc.includes(filters.location.toLowerCase())) return false;
      }
      // YOE range
      if (filters.minYoe > 0 || filters.maxYoe < 30) {
        const yoe = c.total_yoe ?? 0;
        if (yoe < filters.minYoe || yoe > filters.maxYoe) return false;
      }
      // Tenure range
      if (filters.minTenure > 0 || filters.maxTenure < 15) {
        const tenure = c.avg_tenure ?? 0;
        if (tenure < filters.minTenure || tenure > filters.maxTenure) return false;
      }
      // Stability
      if (filters.minStability > 0) {
        if ((c.stability_score ?? 0) < filters.minStability) return false;
      }
      // Min fit score
      if (filters.minFitScore > 0) {
        if ((c.fit_score ?? 0) < filters.minFitScore) return false;
      }
      // Open to work
      if (filters.openToWork === true && !c.is_open_to_work) return false;
      // Company pedigree
      if (filters.companyPedigree !== "all") {
        if (!c.company_pedigree?.includes(filters.companyPedigree)) return false;
      }
      // Title
      if (filters.title) {
        const title = (c.current_title || c.headline || "").toLowerCase();
        if (!title.includes(filters.title.toLowerCase())) return false;
      }
      // Companies
      if (filters.companies.length > 0) {
        const candidateCompanies = new Set<string>();
        if (c.current_company) candidateCompanies.add(c.current_company.trim());
        if (c.experience) {
          for (const exp of c.experience) {
            if (exp.company) candidateCompanies.add(exp.company.trim());
          }
        }
        if (!filters.companies.some((co) => candidateCompanies.has(co))) return false;
      }
      // Seniority
      if (filters.seniority && filters.seniority !== "all") {
        const keywords = SENIORITY_KEYWORDS[filters.seniority] || [];
        const title = (c.current_title || c.headline || "").toLowerCase();
        if (!keywords.some((kw) => title.includes(kw))) return false;
      }
      return true;
    });
  }, [candidates, filters]);

  const handleSearch = useCallback(
    (query: string, options?: { wideNet?: boolean }) => {
      lastQueryRef.current = { query, wideNet: options?.wideNet };
      search(query, options);
    },
    [search]
  );

  const handleLoadMore = useCallback(() => {
    if (lastQueryRef.current.query) {
      loadMore(lastQueryRef.current.query, {
        wideNet: lastQueryRef.current.wideNet,
      });
    }
  }, [loadMore]);

  const handleAddToShortlist = (candidate: Candidate) => {
    addToShortlist(candidate);
  };

  const handleViewDetail = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
  };

  const handleSelectCandidate = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredCandidates.map((c) => c.id)));
  }, [filteredCandidates]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkShortlist = useCallback(() => {
    for (const c of filteredCandidates) {
      if (selectedIds.has(c.id)) addToShortlist(c);
    }
    setSelectedIds(new Set());
  }, [filteredCandidates, selectedIds, addToShortlist]);

  const handleBulkExport = useCallback(async () => {
    const selected = filteredCandidates.filter((c) => selectedIds.has(c.id));
    const ids = selected.map((c) => c.id).join(",");
    const res = await fetch(`/api/candidates/export?ids=${ids}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "candidates.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [filteredCandidates, selectedIds]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex">
        {/* Always-visible filter sidebar */}
        <aside className="border-r bg-card">
          <FilterSidebar
            filters={filters}
            onFiltersChange={setFilters}
            candidateCount={candidates.length}
            filteredCount={filteredCandidates.length}
            candidates={candidates}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="space-y-2 text-center mb-6">
              <h1 className="text-3xl font-bold tracking-tight">NexusHire</h1>
              <p className="text-muted-foreground">
                AI-powered talent intelligence using Google X-Ray
              </p>
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 text-xs border rounded bg-muted">Cmd+K</kbd> to focus search
              </p>
            </div>

            <div className="max-w-2xl mx-auto mb-6">
              <SearchBar
                onSearch={handleSearch}
                onCancel={cancel}
                isSearching={isSearching}
              />
            </div>

            {dork && (
              <div className="max-w-2xl mx-auto mb-4">
                <DorkPreview dork={dork} queries={queries} />
              </div>
            )}

            {/* Sourcing progress */}
            {progress && isSearching && (
              <div className="mb-4">
                <SourcingProgress progress={progress} />
              </div>
            )}

            {/* Live Feed */}
            {isSearching && activities.length > 0 && (
              <div className="mb-4">
                <LiveFeed activities={activities} />
              </div>
            )}

            {/* View mode toggle */}
            {candidates.length > 0 && (
              <div className="flex items-center justify-end gap-2 mb-4">
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <LayoutList className="h-4 w-4 mr-1.5" />
                  List
                </Button>
                <Button
                  variant={viewMode === "map" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("map")}
                >
                  <Map className="h-4 w-4 mr-1.5" />
                  Talent Map
                </Button>
              </div>
            )}

            {viewMode === "list" ? (
              <SearchResults
                candidates={filteredCandidates}
                previews={previews}
                isSearching={isSearching}
                status={status}
                error={error}
                shortlistedIds={shortlistedIds}
                onAddToShortlist={handleAddToShortlist}
                onViewDetail={handleViewDetail}
                selectedIds={selectedIds}
                onSelectCandidate={handleSelectCandidate}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onBulkShortlist={handleBulkShortlist}
                onBulkExport={handleBulkExport}
              />
            ) : (
              <TalentMap
                candidates={filteredCandidates}
                onViewDetail={handleViewDetail}
              />
            )}

            {/* Load More button */}
            {hasMore && !isSearching && (
              <div className="flex justify-center mt-6">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  className="gap-2"
                >
                  <ChevronDown className="h-4 w-4" />
                  Load More Candidates
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      <ShortlistPanel />
      <CandidateDetail />
    </div>
  );
}
