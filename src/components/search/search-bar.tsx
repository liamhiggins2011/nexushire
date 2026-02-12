"use client";

import { useState, useCallback, KeyboardEvent } from "react";
import { Search, X, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface SearchBarProps {
  onSearch: (query: string, options?: { wideNet?: boolean }) => void;
  onCancel: () => void;
  isSearching: boolean;
}

export function SearchBar({ onSearch, onCancel, isSearching }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [wideNet, setWideNet] = useState(false);

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed) {
      onSearch(trimmed, { wideNet });
    }
  }, [query, wideNet, onSearch]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <div className="w-full max-w-3xl mx-auto space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Try "Senior React developer in San Francisco" or "ML engineer at FAANG"'
            className="pl-10 pr-10 h-12 text-base"
            disabled={isSearching}
          />
          {query && !isSearching && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {isSearching ? (
          <Button onClick={onCancel} variant="destructive" size="lg">
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        ) : (
          <Button onClick={handleSearch} size="lg" disabled={!query.trim()}>
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 pl-1">
        <Checkbox
          id="wide-net"
          checked={wideNet}
          onCheckedChange={(checked) => setWideNet(checked === true)}
          disabled={isSearching}
        />
        <label
          htmlFor="wide-net"
          className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1"
        >
          <Globe className="h-3 w-3" />
          Wide Net (search GitHub + Stack Overflow too)
        </label>
      </div>
    </div>
  );
}
