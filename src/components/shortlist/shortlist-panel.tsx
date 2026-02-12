"use client";

import { useSearchStore } from "@/stores/search-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X, Trash2, Download, FolderPlus } from "lucide-react";
import { Candidate } from "@/types";
import { toast } from "sonner";

export function ShortlistPanel() {
  const {
    shortlist,
    shortlistOpen,
    setShortlistOpen,
    removeFromShortlist,
    clearShortlist,
    activeProject,
  } = useSearchStore();

  const handleSaveToProject = async () => {
    if (!activeProject) {
      toast.error("No active project selected. Create or select a project first.");
      return;
    }

    try {
      const response = await fetch(
        `/api/projects/${activeProject.id}/candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_ids: shortlist.map((c) => c.id),
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to save");
      toast.success(
        `Added ${shortlist.length} candidates to ${activeProject.name}`
      );
    } catch {
      toast.error("Failed to save candidates to project");
    }
  };

  const handleExportCSV = () => {
    if (shortlist.length === 0) return;

    const headers = [
      "Name",
      "Title",
      "Company",
      "Location",
      "Fit Score",
      "Email",
      "Profile URL",
    ];
    const rows = shortlist.map((c) => [
      c.full_name,
      c.current_title || "",
      c.current_company || "",
      c.location || "",
      c.fit_score?.toString() || "",
      c.email || "",
      c.profile_url,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shortlist.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={shortlistOpen} onOpenChange={setShortlistOpen}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Shortlist
            <Badge variant="secondary">{shortlist.length}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveToProject}
            disabled={shortlist.length === 0}
          >
            <FolderPlus className="mr-1 h-3.5 w-3.5" />
            Save to Project
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={shortlist.length === 0}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={clearShortlist}
            disabled={shortlist.length === 0}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>

        <Separator className="my-4" />

        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-3 pr-4">
            {shortlist.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No candidates shortlisted yet. Click &quot;Shortlist&quot; on a
                candidate card to add them.
              </p>
            ) : (
              shortlist.map((candidate) => (
                <ShortlistItem
                  key={candidate.id}
                  candidate={candidate}
                  onRemove={() => removeFromShortlist(candidate.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ShortlistItem({
  candidate,
  onRemove,
}: {
  candidate: Candidate;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{candidate.full_name}</p>
        {candidate.current_title && (
          <p className="text-xs text-muted-foreground truncate">
            {candidate.current_title}
            {candidate.current_company && ` at ${candidate.current_company}`}
          </p>
        )}
        {candidate.fit_score && (
          <Badge variant="outline" className="mt-1 text-xs">
            Score: {candidate.fit_score}
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
