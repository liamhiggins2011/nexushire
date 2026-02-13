"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Building2,
  ExternalLink,
  GripVertical,
  X,
} from "lucide-react";
import { ProjectCandidate, CandidateStatus } from "@/types";

const COLUMNS: { status: CandidateStatus; label: string; color: string }[] = [
  { status: "new", label: "New", color: "border-t-gray-400" },
  { status: "contacted", label: "Contacted", color: "border-t-blue-400" },
  { status: "replied", label: "Replied", color: "border-t-green-400" },
  { status: "interview", label: "Interview", color: "border-t-purple-400" },
  { status: "hired", label: "Hired", color: "border-t-emerald-400" },
];

const STATUS_BADGE_COLORS: Record<CandidateStatus, string> = {
  new: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  contacted: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  replied: "bg-green-500/10 text-green-600 dark:text-green-400",
  interview: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  hired: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

interface KanbanBoardProps {
  candidates: ProjectCandidate[];
  onStatusChange: (candidateId: string, newStatus: CandidateStatus) => void;
}

export function KanbanBoard({ candidates, onStatusChange }: KanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<CandidateStatus | null>(null);

  const handleDragStart = useCallback((candidateId: string) => {
    setDraggedId(candidateId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: CandidateStatus) => {
    e.preventDefault();
    setDragOverColumn(status);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, newStatus: CandidateStatus) => {
      e.preventDefault();
      if (draggedId) {
        onStatusChange(draggedId, newStatus);
      }
      setDraggedId(null);
      setDragOverColumn(null);
    },
    [draggedId, onStatusChange]
  );

  // Rejected candidates shown separately
  const rejectedCandidates = candidates.filter((c) => c.status === "rejected");

  return (
    <div className="space-y-4">
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const columnCandidates = candidates.filter((c) => c.status === col.status);
          const isOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              className={`flex-1 min-w-[220px] rounded-xl border-t-2 ${col.color} ${
                isOver
                  ? "bg-primary/5 border-primary/30 border"
                  : "bg-card/50 backdrop-blur-sm border border-border/30"
              } transition-colors duration-150`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <div className="p-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {columnCandidates.length}
                  </Badge>
                </div>
              </div>

              <div className="p-2 pt-0 space-y-2 min-h-[100px]">
                <AnimatePresence mode="popLayout">
                  {columnCandidates.map((pc) => {
                    const c = pc.candidate;
                    if (!c) return null;
                    const isDragging = draggedId === pc.candidate_id;

                    return (
                      <motion.div
                        key={pc.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{
                          opacity: isDragging ? 0.5 : 1,
                          scale: isDragging ? 0.95 : 1,
                        }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        draggable
                        onDragStart={() => handleDragStart(pc.candidate_id)}
                        onDragEnd={handleDragEnd}
                        className="rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm p-3 cursor-grab active:cursor-grabbing hover:border-border/60 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {c.full_name}
                            </p>
                            {c.current_title && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                <Building2 className="h-3 w-3 shrink-0" />
                                {c.current_title}
                                {c.current_company && ` at ${c.current_company}`}
                              </p>
                            )}
                            {c.location && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {c.location}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 mt-2">
                              {c.fit_score != null && c.fit_score > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-5 px-1.5 font-bold"
                                >
                                  {c.fit_score}
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                asChild
                              >
                                <a
                                  href={c.profile_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {columnCandidates.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50 border border-dashed border-border/30 rounded-lg">
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rejected candidates */}
      {rejectedCandidates.length > 0 && (
        <div className="rounded-lg border border-border/30 bg-card/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <X className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-muted-foreground">
              Rejected ({rejectedCandidates.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {rejectedCandidates.map((pc) => {
              const c = pc.candidate;
              if (!c) return null;
              return (
                <Badge
                  key={pc.id}
                  variant="secondary"
                  className={`${STATUS_BADGE_COLORS.rejected} text-xs cursor-pointer`}
                  onClick={() => onStatusChange(pc.candidate_id, "new")}
                >
                  {c.full_name}
                  <span className="ml-1 opacity-50">(click to restore)</span>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
