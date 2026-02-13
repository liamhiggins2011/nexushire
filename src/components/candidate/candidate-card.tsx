"use client";

import { useState } from "react";
import { Candidate } from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MapPin,
  Building2,
  ExternalLink,
  Plus,
  Mail,
  Github,
  TrendingUp,
  Clock,
  Shield,
  Sparkles,
  Zap,
  Cpu,
  Brain,
  ChevronDown,
  Loader2,
} from "lucide-react";

interface CandidateCardProps {
  candidate: Candidate;
  onAddToShortlist?: (candidate: Candidate) => void;
  onViewDetail?: (candidate: Candidate) => void;
  onEnriched?: (candidate: Candidate) => void;
  isShortlisted?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (candidateId: string, checked: boolean) => void;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-green-500/10 text-green-700 border-green-200";
  if (score >= 60) return "bg-blue-500/10 text-blue-700 border-blue-200";
  if (score >= 40) return "bg-yellow-500/10 text-yellow-700 border-yellow-200";
  return "bg-red-500/10 text-red-700 border-red-200";
}

function getPedigreeColor(tag: string): string {
  switch (tag) {
    case "faang": return "bg-purple-500/10 text-purple-700 border-purple-200";
    case "unicorn": return "bg-pink-500/10 text-pink-700 border-pink-200";
    case "yc": return "bg-orange-500/10 text-orange-700 border-orange-200";
    default: return "";
  }
}

export function CandidateCard({
  candidate,
  onAddToShortlist,
  onViewDetail,
  onEnriched,
  isShortlisted,
  selectable,
  selected,
  onSelect,
}: CandidateCardProps) {
  const [enriching, setEnriching] = useState(false);
  const isSnippetOnly = !candidate.raw_scraped_markdown && !candidate.fit_reasoning;

  async function handleEnrich() {
    setEnriching(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/enrich`, {
        method: "POST",
      });
      if (res.ok) {
        const enriched = await res.json();
        onEnriched?.(enriched);
      }
    } catch {
      // silently fail
    } finally {
      setEnriching(false);
    }
  }

  return (
    <Card className={`hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 hover:border-border/80 dark:hover:border-border/50 ${isSnippetOnly ? "border-dashed border-muted-foreground/20" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {selectable && (
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => onSelect?.(candidate.id, !!checked)}
                className="mt-1"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg truncate">
                  {candidate.full_name}
                </CardTitle>
                {candidate.is_open_to_work && (
                  <Badge className="bg-green-500/15 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 text-[10px] shrink-0">
                    <Sparkles className="h-3 w-3 mr-0.5" />
                    Open to Work
                  </Badge>
                )}
                {candidate.inferred_intent && (
                  <Badge className={`text-[10px] shrink-0 ${
                    candidate.intent_confidence === "high"
                      ? "bg-orange-500/15 text-orange-700 border-orange-300 dark:text-orange-400 dark:border-orange-700"
                      : candidate.intent_confidence === "medium"
                      ? "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700"
                      : "bg-sky-500/15 text-sky-700 border-sky-300 dark:text-sky-400 dark:border-sky-700"
                  }`}>
                    <Zap className="h-3 w-3 mr-0.5" />
                    {candidate.inferred_intent}
                  </Badge>
                )}
              </div>
              {candidate.headline && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {candidate.headline}
                </p>
              )}
              {isSnippetOnly && !enriching && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                  Snippet only — click Expand for full profile
                </div>
              )}
            </div>
          </div>
          {candidate.fit_score != null && candidate.fit_score > 0 && (
            <Badge
              variant="outline"
              className={`ml-3 text-sm font-bold shrink-0 ${getScoreColor(candidate.fit_score)}`}
            >
              {candidate.fit_score}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {candidate.current_title && candidate.current_company && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {candidate.current_title} at {candidate.current_company}
            </span>
          )}
          {candidate.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {candidate.location}
            </span>
          )}
        </div>

        {/* ── Calculated Facts (Left Brain — instant, from code) ── */}
        {((candidate.total_yoe ?? 0) > 0 || (candidate.stability_score ?? 0) > 0 || (candidate.growth_velocity ?? 0) > 0 || (candidate.company_pedigree?.length ?? 0) > 0 || ((candidate.tech_stack || candidate.skills)?.length ?? 0) > 0) && (
          <div className="space-y-2 rounded-md bg-muted/30 dark:bg-muted/10 p-2.5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <Cpu className="h-3 w-3" />
              Calculated Facts
            </div>
            {((candidate.total_yoe ?? 0) > 0 || (candidate.stability_score ?? 0) > 0 || (candidate.growth_velocity ?? 0) > 0) && (
              <div className="flex flex-wrap gap-3 text-xs">
                {candidate.total_yoe != null && candidate.total_yoe > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {candidate.total_yoe} YOE
                  </span>
                )}
                {candidate.stability_score != null && candidate.stability_score > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    {candidate.stability_score}% stability
                  </span>
                )}
                {candidate.growth_velocity != null && candidate.growth_velocity > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    {candidate.growth_velocity}x growth
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {candidate.company_pedigree?.map((tag) => (
                <Badge key={tag} variant="outline" className={`text-[10px] uppercase font-semibold ${getPedigreeColor(tag)}`}>
                  {tag}
                </Badge>
              ))}
              {(candidate.tech_stack || candidate.skills)?.slice(0, 5).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {((candidate.tech_stack || candidate.skills)?.length || 0) > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{((candidate.tech_stack || candidate.skills)?.length || 0) - 5}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* ── AI Insights (Right Brain — from LLM) ── */}
        {candidate.fit_reasoning && (
          <div className="space-y-1.5 rounded-md bg-primary/5 dark:bg-primary/10 p-2.5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <Brain className="h-3 w-3" />
              AI Insight
            </div>
            <p className="text-sm text-muted-foreground italic">
              {candidate.fit_reasoning}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          {isSnippetOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnrich}
              disabled={enriching}
              className="text-primary border-primary/30 hover:bg-primary/5"
            >
              {enriching ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronDown className="mr-1 h-3.5 w-3.5" />
              )}
              {enriching ? "Enriching..." : "Expand"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetail?.(candidate)}
          >
            View Profile
          </Button>
          {onAddToShortlist && (
            <Button
              variant={isShortlisted ? "secondary" : "default"}
              size="sm"
              onClick={() => onAddToShortlist(candidate)}
              disabled={isShortlisted}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {isShortlisted ? "Shortlisted" : "Shortlist"}
            </Button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {candidate.email && (
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a href={`mailto:${candidate.email}`}>
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {candidate.github_url && (
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a
                  href={candidate.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a
                href={candidate.profile_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
