"use client";

import { Candidate, PreviewCandidate } from "@/types";
import { CandidateCard } from "@/components/candidate/candidate-card";
import { CandidateSkeleton } from "@/components/candidate/candidate-skeleton";
import { BulkActions } from "@/components/search/bulk-actions";
import { Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SearchResultsProps {
  candidates: Candidate[];
  previews?: PreviewCandidate[];
  isSearching: boolean;
  status: string;
  error: string | null;
  shortlistedIds: Set<string>;
  onAddToShortlist: (candidate: Candidate) => void;
  onViewDetail: (candidate: Candidate) => void;
  onEnriched?: (candidate: Candidate) => void;
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
  onEnriched,
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
        <AnimatePresence mode="popLayout">
          {previews.map((preview) => (
            <motion.div
              key={preview.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              layout
              className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-4"
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
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Enriched candidate cards with staggered animation */}
        <AnimatePresence mode="popLayout">
          {sorted.map((candidate, index) => (
            <motion.div
              key={candidate.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
              transition={{
                duration: 0.35,
                delay: Math.min(index * 0.05, 0.5),
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              layout
            >
              <CandidateCard
                candidate={candidate}
                onAddToShortlist={onAddToShortlist}
                onViewDetail={onViewDetail}
                onEnriched={onEnriched}
                isShortlisted={shortlistedIds.has(candidate.id)}
                selectable={candidates.length > 0}
                selected={selectedIds.has(candidate.id)}
                onSelect={onSelectCandidate}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {isSearching && previews.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={`skeleton-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <CandidateSkeleton />
            </motion.div>
          ))}
      </div>

      {!isSearching && candidates.length === 0 && !error && !status && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 text-muted-foreground"
        >
          <p className="text-lg font-medium">Find your next hire</p>
          <p className="mt-1">
            Enter a natural language query to search LinkedIn profiles
          </p>
        </motion.div>
      )}
    </div>
  );
}
