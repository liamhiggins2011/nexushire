"use client";

import { useMemo } from "react";
import { Candidate } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Users, ChevronRight } from "lucide-react";

interface TalentMapProps {
  candidates: Candidate[];
  onViewDetail: (candidate: Candidate) => void;
}

interface CompanyGroup {
  company: string;
  candidates: Candidate[];
  avgScore: number;
}

export function TalentMap({ candidates, onViewDetail }: TalentMapProps) {
  const companyGroups = useMemo(() => {
    const map = new Map<string, Candidate[]>();

    for (const c of candidates) {
      // Group by all past companies from experience
      const companies = new Set<string>();
      if (c.current_company) companies.add(c.current_company);
      if (c.experience) {
        for (const exp of c.experience) {
          if (exp.company) companies.add(exp.company);
        }
      }

      for (const company of companies) {
        const normalized = company.trim();
        if (!normalized) continue;
        const existing = map.get(normalized) || [];
        if (!existing.some((e) => e.id === c.id)) {
          existing.push(c);
        }
        map.set(normalized, existing);
      }
    }

    // Convert to sorted array, filter to companies with 2+ candidates
    const groups: CompanyGroup[] = [];
    for (const [company, members] of map) {
      if (members.length >= 2) {
        const avgScore = Math.round(
          members.reduce((sum, m) => sum + (m.fit_score || 0), 0) / members.length
        );
        groups.push({ company, candidates: members, avgScore });
      }
    }

    // Sort by number of candidates, then by avg score
    groups.sort((a, b) => b.candidates.length - a.candidates.length || b.avgScore - a.avgScore);

    return groups;
  }, [candidates]);

  // Also include companies with only 1 candidate, grouped as "Other"
  const soloCompanies = useMemo(() => {
    const groupedIds = new Set<string>();
    for (const g of companyGroups) {
      for (const c of g.candidates) groupedIds.add(c.id);
    }
    return candidates.filter((c) => !groupedIds.has(c.id));
  }, [candidates, companyGroups]);

  if (candidates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No candidates to map. Run a search first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>
          {companyGroups.length} alumni networks found across {candidates.length} candidates
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {companyGroups.map((group) => (
          <Card key={group.company} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {group.company}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {group.candidates.length} people
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {group.candidates.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onViewDetail(c)}
                    className="flex items-center justify-between w-full text-left p-2 rounded hover:bg-muted transition-colors text-sm group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.current_title || c.headline}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.fit_score && (
                        <Badge variant="outline" className="text-xs">
                          {c.fit_score}
                        </Badge>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
                {group.candidates.length > 4 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{group.candidates.length - 4} more
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {soloCompanies.length > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          {soloCompanies.length} candidate{soloCompanies.length !== 1 ? "s" : ""} not in any alumni network
        </div>
      )}
    </div>
  );
}
