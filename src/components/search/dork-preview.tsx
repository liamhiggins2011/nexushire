"use client";

import { Code2, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

interface DorkPreviewProps {
  dork: string;
  queries?: string[];
}

export function DorkPreview({ dork, queries }: DorkPreviewProps) {
  const [open, setOpen] = useState(false);
  const allQueries = queries && queries.length > 0 ? queries : [dork];
  const label =
    allQueries.length > 1
      ? `${allQueries.length} Generated Search Queries`
      : "Generated Google Dork";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full max-w-3xl mx-auto">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <Code2 className="h-3.5 w-3.5" />
        <span>{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {allQueries.map((q, i) => (
            <div
              key={i}
              className="p-3 bg-muted rounded-md font-mono text-sm break-all"
            >
              {allQueries.length > 1 && (
                <span className="text-muted-foreground text-xs mr-2">
                  #{i + 1}
                </span>
              )}
              {q}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
