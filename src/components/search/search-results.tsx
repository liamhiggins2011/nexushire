"use client";

import { Candidate, PreviewCandidate } from "@/types";
import { CandidateCard } from "@/components/candidate/candidate-card";
import { CandidateSkeleton } from "@/components/candidate/candidate-skeleton";
import { BulkActions } from "@/components/search/bulk-actions";
import { Loader2, AlertCircle } from "lucide-react";

interface SearchResultsProps {
  candidates: Candidate[];
  previews?: PreviewCandidate[];
  isSearching: boolean;
  status: string;
  error: string | null;
  shortlistedIds: Set<string>;
  onAddToShortlist: (candidate: Candidate) => void;
  onViewDetail: (candidate: Candidate) => void;
  selectedIds: Set<string>;
  onSelectCandidate: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkShortlist: () => void;
  onBulkExport: () => void;
}

export function SearchResults({
  candidates,
  previews = [],
  isSearching,
  status,
  error,
  shortlistedIds,
  onAddToShortlist,
  onViewDetail,
  selectedIds,
  onSelectCandidate,
  onSelectAll,
  onDeselectAll,
  onBulkShortlist,
  onBulkExport,
}: SearchResultsProps) {
  const sorted = [...candidates].sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));

  return (
    <div className="space-y-4 flex-1 min-w-0">
      {(isSearching || status) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isSearching && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{status}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {candidates.length > 0 && (
        <BulkActions
          selectedCount={selectedIds.size}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onBulkShortlist={onBulkShortlist}
          onBulkExport={onBulkExport}
          totalCount={candidates.length}
          allSelected={selectedIds.size === candidates.length}
        />
      )}

      <div className="grid gap-4">
        {/* Preview cards (pre-enrichment) */}
        {previews.map((preview) => (
          <div
            key={preview.id}
            className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-4 animate-in fade-in duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm truncate">{preview.name}</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Enriching...
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {preview.snippet}
                </p>
              </div>
              {preview.source !== "linkedin" && (
                <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground shrink-0 ml-2">
                  {preview.source}
                </span>
              )}
            </div>
          </div>
        ))}

        {sorted.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            onAddToShortlist={onAddToShortlist}
            onViewDetail={onViewDetail}
            isShortlisted={shortlistedIds.has(candidate.id)}
            selectable={candidates.length > 0}
            selected={selectedIds.has(candidate.id)}
            onSelect={onSelectCandidate}
          />
        ))}

        {isSearching && previews.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <CandidateSkeleton key={`skeleton-${i}`} />
          ))}
      </div>

      {!isSearching && candidates.length === 0 && !error && !status && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Find your next hire</p>
          <p className="mt-1">
            Enter a natural language query to search LinkedIn profiles
          </p>
        </div>
      )}
    </div>
  );
}
