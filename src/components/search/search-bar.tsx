"use client";

import { useState, useCallback, useRef, KeyboardEvent } from "react";
import { Search, X, Globe, MapPin, Briefcase, Sparkles, History, FileText, Loader2, Github, MessageSquare, Zap } from "lucide-react";
import { SearchSource } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { BooleanBuilder } from "@/components/search/boolean-builder";
import { SearchHistory } from "@/types";

interface SearchBarProps {
  onSearch: (query: string, options?: {
    wideNet?: boolean;
    location?: string;
    jobTitle?: string;
    booleanQuery?: string;
    sources?: SearchSource[];
  }) => void;
  onCancel: () => void;
  isSearching: boolean;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SearchBar({ onSearch, onCancel, isSearching }: SearchBarProps) {
  const [location, setLocation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [booleanQuery, setBooleanQuery] = useState("");
  const [wideNet, setWideNet] = useState(false);
  const [sources, setSources] = useState<SearchSource[]>(["linkedin"]);

  // Search history state
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyFetched = useRef(false);

  // JD parser state
  const [jdOpen, setJdOpen] = useState(false);
  const [jdText, setJdText] = useState("");
  const [jdParsing, setJdParsing] = useState(false);

  const handleSearch = useCallback(() => {
    const locTrimmed = location.trim();
    const titleTrimmed = jobTitle.trim();
    const boolTrimmed = booleanQuery.trim();

    if (!locTrimmed && !titleTrimmed && !boolTrimmed) return;

    // Build display query from structured fields
    const parts: string[] = [];
    if (titleTrimmed) parts.push(titleTrimmed);
    if (boolTrimmed) parts.push(boolTrimmed);
    if (locTrimmed) parts.push(`in ${locTrimmed}`);
    const displayQuery = parts.join(" ");

    onSearch(displayQuery, {
      wideNet,
      location: locTrimmed || undefined,
      jobTitle: titleTrimmed || undefined,
      booleanQuery: boolTrimmed || undefined,
      sources,
    });
  }, [location, jobTitle, booleanQuery, wideNet, sources, onSearch]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  const fetchHistory = useCallback(async () => {
    if (historyFetched.current) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/search/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
        historyFetched.current = true;
      }
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleHistoryClick = useCallback((item: SearchHistory) => {
    const query = item.natural_language_query;

    // Extract location from "... in Location" at the end
    const inMatch = query.match(/\s+in\s+([A-Z][A-Za-z\s,]+)$/);
    const loc = inMatch ? inMatch[1].trim() : "";
    const withoutLocation = inMatch ? query.slice(0, inMatch.index).trim() : query;

    // Strip any lingering quotes from the saved query
    const cleanText = withoutLocation.replace(/"/g, "").trim();

    // Try to separate job title from boolean query (boolean has parentheses)
    const boolMatch = cleanText.match(/\(.*\)/);
    let titleVal: string;
    let boolVal: string;

    if (boolMatch) {
      titleVal = cleanText.slice(0, boolMatch.index).trim();
      boolVal = boolMatch[0];
    } else {
      titleVal = cleanText;
      boolVal = "";
    }

    setJobTitle(titleVal);
    setBooleanQuery(boolVal);
    setLocation(loc);

    // Build display query and trigger search with structured fields
    const parts: string[] = [];
    if (titleVal) parts.push(titleVal);
    if (boolVal) parts.push(boolVal);
    if (loc) parts.push(`in ${loc}`);

    onSearch(parts.join(" "), {
      wideNet: false,
      location: loc || undefined,
      jobTitle: titleVal || undefined,
      booleanQuery: boolVal || undefined,
    });
  }, [onSearch]);

  const handleParseJD = useCallback(async () => {
    if (!jdText.trim()) return;
    setJdParsing(true);
    try {
      const res = await fetch("/api/search/parse-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jdText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jobTitle) setJobTitle(data.jobTitle);
        if (data.location) setLocation(data.location);
        if (data.booleanQuery) setBooleanQuery(data.booleanQuery);
        setJdOpen(false);
        setJdText("");
      }
    } catch {
      // silently fail
    } finally {
      setJdParsing(false);
    }
  }, [jdText]);

  const hasInput = location || jobTitle || booleanQuery;

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {/* Top row: Job Title + Location side by side */}
        <div className="grid grid-cols-2 divide-x divide-border/40">
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Job title, e.g. Software Engineer"
              className="pl-10 h-12 text-sm border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent"
              disabled={isSearching}
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Location, e.g. San Francisco"
              className="pl-10 h-12 text-sm border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent"
              disabled={isSearching}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Boolean query row */}
        <div className="relative">
          <BooleanBuilder
            value={booleanQuery}
            onChange={setBooleanQuery}
            onKeyDown={handleKeyDown}
            disabled={isSearching}
          />
          <div className="absolute right-2 top-3">
            {isSearching ? (
              <Button onClick={onCancel} variant="destructive" size="sm">
                <X className="mr-1.5 h-3.5 w-3.5" />
                Stop
              </Button>
            ) : (
              <Button onClick={handleSearch} size="sm" disabled={!hasInput}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                Search
              </Button>
            )}
          </div>
        </div>

        {/* Bottom bar: options */}
        <div className="border-t border-border/40 px-3 py-2 flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="wide-net"
                checked={wideNet}
                onCheckedChange={(checked) => setWideNet(checked === true)}
                disabled={isSearching}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor="wide-net"
                className="text-[11px] text-muted-foreground cursor-pointer flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                Wide Net
              </label>
            </div>

            <div className="h-4 w-px bg-border/60" />

            <div className="flex items-center gap-1.5">
              <Checkbox
                id="src-github"
                checked={sources.includes("github")}
                onCheckedChange={(checked) =>
                  setSources((prev) =>
                    checked
                      ? [...prev, "github"]
                      : prev.filter((s) => s !== "github")
                  )
                }
                disabled={isSearching}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor="src-github"
                className="text-[11px] text-muted-foreground cursor-pointer flex items-center gap-1"
              >
                <Github className="h-3 w-3" />
                GitHub
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              <Checkbox
                id="src-stackoverflow"
                checked={sources.includes("stackoverflow")}
                onCheckedChange={(checked) =>
                  setSources((prev) =>
                    checked
                      ? [...prev, "stackoverflow"]
                      : prev.filter((s) => s !== "stackoverflow")
                  )
                }
                disabled={isSearching}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor="src-stackoverflow"
                className="text-[11px] text-muted-foreground cursor-pointer flex items-center gap-1"
              >
                <MessageSquare className="h-3 w-3" />
                Stack Overflow
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              <Checkbox
                id="src-apollo"
                checked={sources.includes("apollo")}
                onCheckedChange={(checked) =>
                  setSources((prev) =>
                    checked
                      ? [...prev, "apollo"]
                      : prev.filter((s) => s !== "apollo")
                  )
                }
                disabled={isSearching}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor="src-apollo"
                className="text-[11px] text-muted-foreground cursor-pointer flex items-center gap-1"
              >
                <Zap className="h-3 w-3" />
                Apollo
              </label>
            </div>

            <div className="h-4 w-px bg-border/60" />

            <button
              onClick={() => setJdOpen(true)}
              disabled={isSearching}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <FileText className="h-3 w-3" />
              Paste JD
            </button>

            <DropdownMenu onOpenChange={(open) => { if (open) fetchHistory(); }}>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={isSearching}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <History className="h-3 w-3" />
                  Recent
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <DropdownMenuLabel className="text-xs">Recent Searches</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {historyLoading ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    Loading...
                  </div>
                ) : history.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    No recent searches
                  </div>
                ) : (
                  history.slice(0, 10).map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() => handleHistoryClick(item)}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="text-xs truncate flex-1">
                        {item.natural_language_query}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {item.result_count}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(item.created_at)}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {hasInput && !isSearching && (
            <button
              onClick={() => {
                setLocation("");
                setJobTitle("");
                setBooleanQuery("");
              }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
          {isSearching && (
            <div className="flex items-center gap-1.5 text-[11px] text-primary">
              <Sparkles className="h-3 w-3 animate-pulse" />
              Searching...
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
        Press <kbd className="px-1 py-0.5 text-[9px] border rounded bg-muted/50">Enter</kbd> in any field to search
        &middot; <kbd className="px-1 py-0.5 text-[9px] border rounded bg-muted/50">Cmd+K</kbd> to focus
      </p>

      {/* JD Parser Dialog */}
      <Dialog open={jdOpen} onOpenChange={setJdOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Paste Job Description
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste a job description here and we'll extract the title, location, and required skills..."
            className="min-h-[200px] text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setJdOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleParseJD} disabled={!jdText.trim() || jdParsing}>
              {jdParsing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {jdParsing ? "Extracting..." : "Extract & Fill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
