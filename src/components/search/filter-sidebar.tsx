"use client";

import { useMemo } from "react";
import { Candidate, SearchFilters } from "@/types";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Clock,
  Building2,
  Shield,
  TrendingUp,
  RotateCcw,
  Filter,
  BarChart3,
  Briefcase,
  Star,
  X,
} from "lucide-react";

interface FilterSidebarProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  candidateCount: number;
  filteredCount: number;
  candidates: Candidate[];
}

const DEFAULT_FILTERS: SearchFilters = {
  minYoe: 0,
  maxYoe: 30,
  minTenure: 0,
  maxTenure: 15,
  minStability: 0,
  openToWork: null,
  companyPedigree: "all",
  location: "",
  companies: [],
  seniority: "all",
  title: "",
  minFitScore: 0,
};

export { DEFAULT_FILTERS };

export function FilterSidebar({
  filters,
  onFiltersChange,
  candidateCount,
  filteredCount,
  candidates,
}: FilterSidebarProps) {
  const update = (partial: Partial<SearchFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  // Extract unique locations from candidates
  const locations = useMemo(() => {
    const locs = new Map<string, number>();
    for (const c of candidates) {
      if (c.location) {
        const loc = c.location.trim();
        locs.set(loc, (locs.get(loc) || 0) + 1);
      }
    }
    return Array.from(locs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [candidates]);

  // Extract unique titles from candidates
  const titles = useMemo(() => {
    const t = new Map<string, number>();
    for (const c of candidates) {
      const title = c.current_title || c.headline;
      if (title) {
        // Normalize: take the main part before pipes/dashes
        const clean = title.split(/\s*[|·]\s*/)[0].trim();
        if (clean) t.set(clean, (t.get(clean) || 0) + 1);
      }
    }
    return Array.from(t.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [candidates]);

  // Extract unique companies from candidates
  const companies = useMemo(() => {
    const c = new Map<string, number>();
    for (const cand of candidates) {
      if (cand.current_company) {
        const co = cand.current_company.trim();
        c.set(co, (c.get(co) || 0) + 1);
      }
      if (cand.experience) {
        for (const exp of cand.experience) {
          if (exp.company) {
            const co = exp.company.trim();
            c.set(co, (c.get(co) || 0) + 1);
          }
        }
      }
    }
    return Array.from(c.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [candidates]);

  return (
    <div className="w-60 shrink-0 space-y-4 p-4 border rounded-lg bg-card h-fit sticky top-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Filter className="h-4 w-4" />
          Filters
        </h3>
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {candidateCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {filteredCount} of {candidateCount}
        </p>
      )}

      <Separator />

      {/* Location */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Location
        </label>
        <Input
          value={filters.location}
          onChange={(e) => update({ location: e.target.value })}
          placeholder="Filter by city..."
          className="h-8 text-xs"
        />
        {locations.length > 0 && !filters.location && (
          <div className="flex flex-wrap gap-1 pt-1">
            {locations.map(([loc, count]) => (
              <button
                key={loc}
                onClick={() => update({ location: loc })}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
              >
                {loc.length > 20 ? loc.slice(0, 20) + "..." : loc}
                <span className="text-[9px] opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}
        {filters.location && (
          <button
            onClick={() => update({ location: "" })}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <X className="h-3 w-3" /> Clear location
          </button>
        )}
      </div>

      {/* Title / Role */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" />
          Title / Role
        </label>
        <Input
          value={filters.title || ""}
          onChange={(e) => update({ title: e.target.value } as Partial<SearchFilters>)}
          placeholder="Filter by title..."
          className="h-8 text-xs"
        />
        {titles.length > 0 && !filters.title && (
          <div className="flex flex-wrap gap-1 pt-1">
            {titles.map(([title, count]) => (
              <button
                key={title}
                onClick={() => update({ title } as Partial<SearchFilters>)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
              >
                {title.length > 22 ? title.slice(0, 22) + "..." : title}
                <span className="text-[9px] opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}
        {filters.title && (
          <button
            onClick={() => update({ title: "" } as Partial<SearchFilters>)}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <X className="h-3 w-3" /> Clear title
          </button>
        )}
      </div>

      {/* Company */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Company
        </label>
        {companies.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {companies.map(([co, count]) => {
              const isActive = filters.companies.includes(co);
              return (
                <button
                  key={co}
                  onClick={() => {
                    if (isActive) {
                      update({ companies: filters.companies.filter((c) => c !== co) });
                    } else {
                      update({ companies: [...filters.companies, co] });
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  }`}
                >
                  {co.length > 18 ? co.slice(0, 18) + "..." : co}
                  <span className={`text-[9px] ${isActive ? "opacity-80" : "opacity-60"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {filters.companies.length > 0 && (
          <button
            onClick={() => update({ companies: [] })}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <X className="h-3 w-3" /> Clear companies
          </button>
        )}
      </div>

      <Separator />

      {/* YOE */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Years of Experience
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={30}
            value={filters.minYoe}
            onChange={(e) => update({ minYoe: Number(e.target.value) || 0 })}
            className="h-8 text-xs w-16"
            placeholder="Min"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="number"
            min={0}
            max={30}
            value={filters.maxYoe}
            onChange={(e) => update({ maxYoe: Number(e.target.value) || 30 })}
            className="h-8 text-xs w-16"
            placeholder="Max"
          />
        </div>
      </div>

      {/* Avg Tenure */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Avg Tenure (yrs)
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={15}
            step={0.5}
            value={filters.minTenure}
            onChange={(e) => update({ minTenure: Number(e.target.value) || 0 })}
            className="h-8 text-xs w-16"
            placeholder="Min"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="number"
            min={0}
            max={15}
            step={0.5}
            value={filters.maxTenure}
            onChange={(e) => update({ maxTenure: Number(e.target.value) || 15 })}
            className="h-8 text-xs w-16"
            placeholder="Max"
          />
        </div>
      </div>

      {/* Min Stability */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          Min Stability
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            step={5}
            value={filters.minStability}
            onChange={(e) => update({ minStability: Number(e.target.value) || 0 })}
            className="h-8 text-xs w-16"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>

      <Separator />

      {/* Open to Work */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="open-to-work"
          checked={filters.openToWork === true}
          onCheckedChange={(checked) =>
            update({ openToWork: checked ? true : null })
          }
        />
        <label htmlFor="open-to-work" className="text-xs font-medium cursor-pointer">
          Open to Work only
        </label>
      </div>

      {/* Company Pedigree */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          Company Background
        </label>
        <Select
          value={filters.companyPedigree}
          onValueChange={(val) => update({ companyPedigree: val as SearchFilters["companyPedigree"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any company</SelectItem>
            <SelectItem value="faang">FAANG / Big Tech</SelectItem>
            <SelectItem value="unicorn">Unicorn</SelectItem>
            <SelectItem value="yc">YC-backed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Min Relevance Score */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5" />
          Min Relevance Score
        </label>
        <div className="flex items-center gap-3">
          <Slider
            value={[filters.minFitScore]}
            onValueChange={([val]) => update({ minFitScore: val })}
            min={0}
            max={100}
            step={5}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8 text-right">
            {filters.minFitScore}
          </span>
        </div>
      </div>

      {/* Seniority Level */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          Seniority Level
        </label>
        <Select
          value={filters.seniority || "all"}
          onValueChange={(val) => update({ seniority: val } as Partial<SearchFilters>)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="junior">Junior</SelectItem>
            <SelectItem value="mid">Mid-level</SelectItem>
            <SelectItem value="senior">Senior</SelectItem>
            <SelectItem value="staff">Staff+</SelectItem>
            <SelectItem value="director">Director+</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
