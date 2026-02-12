"use client";

import { useRef, useEffect } from "react";
import { Activity } from "lucide-react";

interface LiveFeedProps {
  activities: string[];
}

export function LiveFeed({ activities }: LiveFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities]);

  if (activities.length === 0) return null;

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">
          Live Feed
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-24 overflow-y-auto rounded-md border bg-muted/50 px-3 py-2 space-y-0.5"
      >
        {activities.map((msg, i) => (
          <p
            key={i}
            className={`text-[11px] font-mono transition-opacity duration-300 ${
              i === activities.length - 1
                ? "text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
}
