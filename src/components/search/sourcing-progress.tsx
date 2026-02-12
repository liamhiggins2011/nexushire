"use client";

import { SearchProgressEvent } from "@/types";
import { Sparkles, Search, GitMerge, Cpu, CheckCircle2 } from "lucide-react";

interface SourcingProgressProps {
  progress: SearchProgressEvent;
}

const PHASES = [
  { key: "generating", label: "Generating Queries", icon: Sparkles },
  { key: "searching", label: "Searching", icon: Search },
  { key: "deduplicating", label: "Deduplicating", icon: GitMerge },
  { key: "enriching", label: "Enriching", icon: Cpu },
  { key: "complete", label: "Complete", icon: CheckCircle2 },
] as const;

function getPhaseIndex(phase: string): number {
  return PHASES.findIndex((p) => p.key === phase);
}

export function SourcingProgress({ progress }: SourcingProgressProps) {
  const currentIndex = getPhaseIndex(progress.phase);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-3">
      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      {/* Phase indicators */}
      <div className="flex items-center justify-between">
        {PHASES.map((phase, i) => {
          const Icon = phase.icon;
          const isActive = i === currentIndex;
          const isDone = i < currentIndex;

          return (
            <div
              key={phase.key}
              className={`flex items-center gap-1 text-[11px] transition-colors ${
                isActive
                  ? "text-primary font-medium"
                  : isDone
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${isActive ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{phase.label}</span>
            </div>
          );
        })}
      </div>

      {/* Counts */}
      {progress.counts && (
        <div className="flex gap-4 text-[11px] text-muted-foreground">
          {progress.counts.queries != null && (
            <span>{progress.counts.queries} queries</span>
          )}
          {progress.counts.rawResults != null && (
            <span>{progress.counts.rawResults} raw results</span>
          )}
          {progress.counts.uniqueResults != null && (
            <span>{progress.counts.uniqueResults} unique</span>
          )}
          {progress.counts.cached != null && progress.counts.cached > 0 && (
            <span>{progress.counts.cached} cached</span>
          )}
          {progress.counts.enriched != null && (
            <span>{progress.counts.enriched} enriched</span>
          )}
        </div>
      )}
    </div>
  );
}
