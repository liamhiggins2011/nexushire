"use client";

import { Candidate } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Mail,
  Plus,
  X,
  CheckSquare,
} from "lucide-react";

interface BulkActionsProps {
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkShortlist: () => void;
  onBulkExport: () => void;
  totalCount: number;
  allSelected: boolean;
}

export function BulkActions({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBulkShortlist,
  onBulkExport,
  totalCount,
  allSelected,
}: BulkActionsProps) {
  if (selectedCount === 0) {
    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 text-sm">
        <span className="text-muted-foreground">
          {totalCount} candidates
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAll}>
          <CheckSquare className="h-3.5 w-3.5 mr-1" />
          Select all
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
      <Badge variant="secondary" className="text-xs">
        {selectedCount} selected
      </Badge>

      <div className="flex items-center gap-1.5 flex-1">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBulkShortlist}>
          <Plus className="h-3 w-3 mr-1" />
          Add to Shortlist
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBulkExport}>
          <Download className="h-3 w-3 mr-1" />
          Export CSV
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        {!allSelected && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAll}>
            Select all ({totalCount})
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDeselectAll}>
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
