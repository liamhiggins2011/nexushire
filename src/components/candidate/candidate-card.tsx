"use client";

import { useState, useMemo } from "react";
import { Candidate } from "@/types";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  MapPin,
  Building2,
  ExternalLink,
  Plus,
  Mail,
  Github,
  TrendingUp,
  Clock,
  Sparkles,
  Zap,
  Brain,
  ChevronDown,
  Loader2,
  AlertTriangle,
  GraduationCap,
  Crosshair,
  Award,
  Shield,
  Check,
  X,
  Briefcase,
} from "lucide-react";
import { computeTenure } from "@/lib/tenure-engine";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HighlightText } from "@/components/candidate/highlight-text";
import { useMatchedBuzzwords } from "@/components/candidate/match-rationale";
import { StabilityStars } from "@/components/candidate/stability-stars";
import { CareerTimeline } from "@/components/candidate/career-timeline";

/**
 * For each matched buzzword, find WHERE it appears in the candidate's profile
 * and generate a contextual rationale line like "Found [React] in [Palantir] experience".
 */
function buildMatchContext(
  matched: string[],
  candidate: Candidate,
): string[] {
  if (matched.length === 0) return [];
  const lines: string[] = [];
  const lower = (s: string) => s.toLowerCase();

  for (const term of matched.slice(0, 3)) {
    const t = lower(term);

    // Check experience titles/companies
    const expMatch = candidate.experience?.find(
      (e) =>
        lower(e.title).includes(t) ||
        lower(e.company).includes(t) ||
        (e.description && lower(e.description).includes(t))
    );
    if (expMatch) {
      if (lower(expMatch.company).includes(t)) {
        lines.push(`Worked at ${expMatch.company} as ${expMatch.title}`);
      } else {
        lines.push(`Found "${term}" in ${expMatch.company} experience`);
      }
      continue;
    }

    // Check skills/tech_stack
    const inSkills = (candidate.tech_stack || candidate.skills || []).some((s) =>
      lower(s).includes(t)
    );
    if (inSkills) {
      lines.push(`"${term}" listed in skills`);
      continue;
    }

    // Check headline
    if (candidate.headline && lower(candidate.headline).includes(t)) {
      lines.push(`"${term}" found in headline`);
      continue;
    }

    // Generic fallback
    lines.push(`Matches "${term}" in profile`);
  }
  return lines;
}

interface CandidateCardProps {
  candidate: Candidate;
  onAddToShortlist?: (candidate: Candidate) => void;
  onViewDetail?: (candidate: Candidate) => void;
  onEnriched?: (candidate: Candidate) => void;
  isShortlisted?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (candidateId: string, checked: boolean) => void;
  booleanQuery?: string;
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

function getLayerBorderClass(layer: number): string {
  switch (layer) {
    case 1:
      return "border-dashed border-muted-foreground/20";
    case 2:
      return "border-solid border-border";
    case 3:
      return "border-solid border-amber-400/50 dark:border-amber-500/30 shadow-[0_0_15px_-3px_rgba(251,191,36,0.1)]";
    default:
      return "border-dashed border-muted-foreground/20";
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
  booleanQuery,
}: CandidateCardProps) {
  const [enriching, setEnriching] = useState(false);
  const [findingContact, setFindingContact] = useState(false);
  const [foundEmail, setFoundEmail] = useState<string | null>(null);
  const layer = candidate.hydration_layer ?? (candidate.raw_scraped_markdown ? 3 : candidate.fit_reasoning ? 2 : 1);
  const isLayer1 = layer === 1;
  const isLayer3 = layer === 3;

  const { matched: matchedBuzzwords, unmatched: unmatchedBuzzwords, total: totalBuzzwords, highlightKeywords } =
    useMatchedBuzzwords(booleanQuery, candidate);

  const bulletInsights = layer >= 2
    ? (candidate.career_highlights && candidate.career_highlights.length > 0
        ? candidate.career_highlights.slice(0, 3)
        : candidate.fit_reasoning
          ? candidate.fit_reasoning.split(/[.!]\s+/).filter((s) => s.trim().length > 10).slice(0, 3)
          : null)
    : null;

  const hasTimeline = candidate.experience && candidate.experience.length > 0;
  const hasRationale = (booleanQuery && totalBuzzwords > 0) || bulletInsights || candidate.fit_reasoning;
  const showGrid = layer >= 2 && (hasTimeline || hasRationale);

  // Client-side deterministic tenure — always available when experience exists
  const tenure = useMemo(() => {
    if (!candidate.experience || candidate.experience.length === 0) return null;
    return computeTenure(candidate.experience);
  }, [candidate.experience]);

  // Contextual rationale: "Found [keyword] in [company] experience"
  const matchContext = useMemo(
    () => buildMatchContext(highlightKeywords, candidate),
    [highlightKeywords, candidate]
  );

  // Use server-computed total_yoe if available, otherwise client-side
  const displayYoe = candidate.total_yoe && candidate.total_yoe > 0
    ? candidate.total_yoe
    : tenure?.total_yoe ?? 0;
  const displayAvgTenure = candidate.avg_tenure && candidate.avg_tenure > 0
    ? candidate.avg_tenure
    : tenure?.avg_tenure_years ?? 0;

  async function handleFindContact() {
    setFindingContact(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/find-contact`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.email && data.confidence >= 70) setFoundEmail(data.email);
      }
    } catch { /* silently fail */ }
    finally { setFindingContact(false); }
  }

  async function handleEnrich() {
    setEnriching(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/enrich`, { method: "POST" });
      if (res.ok) { onEnriched?.(await res.json()); }
    } catch { /* silently fail */ }
    finally { setEnriching(false); }
  }

  return (
    <Card className={`hover:shadow-md transition-all duration-200 ${getLayerBorderClass(layer)}`}>
      <CardContent className="p-3 space-y-2">
        {/* ── Header: Name + Badges + Score ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {selectable && (
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => onSelect?.(candidate.id, !!checked)}
                className="mt-0.5"
              />
            )}
            <Avatar size="default" className="mt-0.5 shrink-0">
              {candidate.profile_photo_url ? (
                <AvatarImage src={candidate.profile_photo_url} alt={candidate.full_name} />
              ) : null}
              <AvatarFallback className="text-[10px] font-medium">
                {candidate.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold truncate">{candidate.full_name}</span>
                {candidate.full_name.includes("***") && (
                  <Badge className="bg-slate-500/15 text-slate-600 border-slate-300 dark:text-slate-400 dark:border-slate-600 text-[9px] px-1.5 py-0 shrink-0">
                    Partial
                  </Badge>
                )}
                {candidate.enrichment_source === "apollo_search" && (
                  <Badge className="bg-violet-500/15 text-violet-700 border-violet-300 dark:text-violet-400 dark:border-violet-700 text-[9px] px-1.5 py-0 shrink-0">
                    <Zap className="h-2.5 w-2.5 mr-0.5" />
                    Apollo
                  </Badge>
                )}
                {candidate.is_open_to_work && (
                  <Badge className="bg-green-500/15 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 text-[9px] px-1.5 py-0 shrink-0">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                    Open
                  </Badge>
                )}
                {candidate.inferred_intent && (
                  <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${
                    candidate.intent_confidence === "high"
                      ? "bg-orange-500/15 text-orange-700 border-orange-300"
                      : "bg-amber-500/15 text-amber-700 border-amber-300"
                  }`}>
                    <Zap className="h-2.5 w-2.5 mr-0.5" />
                    {candidate.inferred_intent}
                  </Badge>
                )}
                {candidate.is_job_hopper && (
                  <Badge className="bg-red-500/15 text-red-700 border-red-300 text-[9px] px-1.5 py-0 shrink-0">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    Hopper
                  </Badge>
                )}
                {(candidate.avg_tenure ?? 0) >= 2 && layer >= 2 && (
                  <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700 text-[9px] px-1.5 py-0 shrink-0">
                    <Shield className="h-2.5 w-2.5 mr-0.5" />
                    Stable
                  </Badge>
                )}
              </div>
              {/* Headline + Meta on one line */}
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {candidate.headline && (
                  highlightKeywords.length > 0 ? (
                    <HighlightText
                      text={candidate.headline}
                      buzzwords={highlightKeywords}
                      className="truncate"
                      as="span"
                    />
                  ) : (
                    <span className="truncate">{candidate.headline}</span>
                  )
                )}
                {candidate.location && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <MapPin className="h-3 w-3" />
                    {candidate.location}
                  </span>
                )}
              </div>
              {/* ── Total Experience & Avg Tenure — ALWAYS visible ── */}
              {(displayYoe > 0 || displayAvgTenure > 0) && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  {displayYoe > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold bg-primary/5 border-primary/20 text-primary">
                      <Briefcase className="h-2.5 w-2.5 mr-0.5" />
                      {displayYoe} YOE
                    </Badge>
                  )}
                  {displayAvgTenure > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold bg-blue-500/5 border-blue-200 text-blue-700 dark:text-blue-400 dark:border-blue-700">
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      {displayAvgTenure} yr avg
                    </Badge>
                  )}
                  {tenure && tenure.current_role_months > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold bg-emerald-500/5 border-emerald-200 text-emerald-700 dark:text-emerald-400 dark:border-emerald-700">
                      <Building2 className="h-2.5 w-2.5 mr-0.5" />
                      {tenure.current_role_months < 12
                        ? `${tenure.current_role_months}mo current`
                        : `${(Math.round(tenure.current_role_months / 12 * 10) / 10)} yr${tenure.current_role_months >= 24 ? "s" : ""} current`}
                    </Badge>
                  )}
                </div>
              )}
              {isLayer1 && !enriching && (
                <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[9px] bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse">
                  <span className="h-1 w-1 rounded-full bg-amber-500 animate-ping" />
                  Enriching...
                </div>
              )}
            </div>
          </div>
          {candidate.fit_score != null && candidate.fit_score > 0 && (
            <Badge
              variant="outline"
              className={`text-sm font-bold shrink-0 ${getScoreColor(candidate.fit_score)}`}
            >
              {candidate.fit_score}
            </Badge>
          )}
        </div>

        {/* ── 3-Column Grid: Identity | Timeline | Rationale ── */}
        {showGrid && (
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-xs">
            {/* ─ Col 1: Identity & Facts ─ */}
            <div className="space-y-1.5 min-w-0">
              {/* Growth velocity + Stability */}
              {candidate.growth_velocity != null && candidate.growth_velocity > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  {candidate.growth_velocity}x growth
                </span>
              )}
              {candidate.stability_score != null && candidate.stability_score > 0 && (
                <StabilityStars score={candidate.stability_score} />
              )}
              {/* Pedigree */}
              {(candidate.company_pedigree?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-700 font-semibold">
                    <Award className="h-2.5 w-2.5 mr-0.5" />
                    Tier 1
                  </Badge>
                  {candidate.company_pedigree?.map((tag) => (
                    <Badge key={tag} variant="outline" className={`text-[9px] px-1 py-0 uppercase font-semibold ${getPedigreeColor(tag)}`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {/* Tech Stack */}
              <div className="flex flex-wrap gap-1">
                {(candidate.tech_stack || candidate.skills)?.slice(0, 6).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {skill}
                  </Badge>
                ))}
                {((candidate.tech_stack || candidate.skills)?.length || 0) > 6 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{((candidate.tech_stack || candidate.skills)?.length || 0) - 6}
                  </Badge>
                )}
              </div>
              {/* Job Hopper warning */}
              {candidate.is_job_hopper && candidate.job_hopper_reason && (
                <div className="flex items-start gap-1 text-[10px] text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{candidate.job_hopper_reason}</span>
                </div>
              )}
            </div>

            {/* ─ Col 2: Career Timeline ─ */}
            <div className="min-w-0">
              {hasTimeline ? (
                <CareerTimeline
                  experience={candidate.experience!}
                  growthVelocity={candidate.growth_velocity ?? undefined}
                  buzzwords={highlightKeywords}
                />
              ) : (
                candidate.current_title && candidate.current_company && (
                  <div className="text-[11px] text-muted-foreground">
                    <Building2 className="h-3 w-3 inline mr-1" />
                    {candidate.current_title} at {candidate.current_company}
                  </div>
                )
              )}
            </div>

            {/* ─ Col 3: Rationale & Insights ─ */}
            <div className="space-y-1.5 min-w-0">
              {/* Boolean match rationale */}
              {booleanQuery && totalBuzzwords > 0 && (
                <div className="space-y-1">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      matchedBuzzwords.length / totalBuzzwords >= 0.8
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-300"
                        : matchedBuzzwords.length / totalBuzzwords >= 0.5
                        ? "bg-amber-500/10 text-amber-700 border-amber-300"
                        : "bg-red-500/10 text-red-700 border-red-300"
                    }`}
                  >
                    <Crosshair className="h-2.5 w-2.5 mr-0.5" />
                    {matchedBuzzwords.length}/{totalBuzzwords}
                  </Badge>
                  <div className="flex flex-wrap gap-0.5">
                    {matchedBuzzwords.map((term) => (
                      <Badge
                        key={term}
                        variant="outline"
                        className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400"
                      >
                        <Check className="h-2 w-2 mr-0.5" />
                        {term}
                      </Badge>
                    ))}
                    {unmatchedBuzzwords.map((term) => (
                      <Badge
                        key={term}
                        variant="outline"
                        className="text-[9px] px-1 py-0 bg-muted text-muted-foreground/50 border-muted-foreground/20 line-through"
                      >
                        <X className="h-2 w-2 mr-0.5" />
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {/* Contextual match rationale */}
              {matchContext.length > 0 && (
                <div className="space-y-0.5">
                  {matchContext.map((line, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground leading-tight">
                      <HighlightText text={line} buzzwords={highlightKeywords} as="span" />
                    </div>
                  ))}
                </div>
              )}
              {/* Bullet insights */}
              {bulletInsights && bulletInsights.length > 0 && (
                <div className="space-y-0.5">
                  {bulletInsights.map((h, i) => (
                    <div key={i} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                      <span className="text-primary shrink-0 mt-px">-</span>
                      {highlightKeywords.length > 0 ? (
                        <HighlightText text={h} buzzwords={highlightKeywords} className="line-clamp-2" as="span" />
                      ) : (
                        <span className="line-clamp-2">{h}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* AI insight (condensed) */}
              {layer >= 2 && candidate.fit_reasoning && (
                <div className="rounded bg-primary/5 dark:bg-primary/10 p-1.5">
                  <div className="flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                    <Brain className="h-2.5 w-2.5" />
                    AI Insight
                  </div>
                  {highlightKeywords.length > 0 ? (
                    <HighlightText
                      text={candidate.fit_reasoning}
                      buzzwords={highlightKeywords}
                      className="text-[11px] text-muted-foreground italic line-clamp-3"
                      as="p"
                    />
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic line-clamp-3">
                      {candidate.fit_reasoning}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Non-grid fallback: timeline + tech badges ── */}
        {!showGrid && (
          <div className="space-y-1.5">
            {/* Show career timeline even outside the grid */}
            {hasTimeline && (
              <CareerTimeline
                experience={candidate.experience!}
                growthVelocity={candidate.growth_velocity ?? undefined}
                buzzwords={highlightKeywords}
              />
            )}
            {/* Fallback: title @ company when no experience data */}
            {!hasTimeline && candidate.current_title && candidate.current_company && (
              <div className="text-[11px] text-muted-foreground">
                <Building2 className="h-3 w-3 inline mr-1" />
                {candidate.current_title} at {candidate.current_company}
              </div>
            )}
            {/* Tech badges */}
            {((candidate.tech_stack || candidate.skills)?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {(candidate.tech_stack || candidate.skills)?.slice(0, 5).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {skill}
                  </Badge>
                ))}
                {((candidate.tech_stack || candidate.skills)?.length || 0) > 5 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{((candidate.tech_stack || candidate.skills)?.length || 0) - 5}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Layer 3: Education + Narrative ── */}
        {isLayer3 && (
          <>
            {candidate.education && candidate.education.length > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <GraduationCap className="h-3 w-3 shrink-0" />
                {candidate.education.map((edu, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    <span className="font-medium">{edu.school}</span>
                    {edu.degree && ` (${edu.degree})`}
                  </span>
                ))}
              </div>
            )}
            {candidate.career_narrative && (
              <div className="rounded bg-amber-50/50 dark:bg-amber-950/10 p-1.5">
                <div className="flex items-center gap-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-0.5">
                  <Sparkles className="h-2.5 w-2.5" />
                  Narrative
                </div>
                {highlightKeywords.length > 0 ? (
                  <HighlightText
                    text={candidate.career_narrative}
                    buzzwords={highlightKeywords}
                    className="text-[11px] text-muted-foreground line-clamp-2"
                    as="p"
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {candidate.career_narrative}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
          {isLayer1 && (
            <Button variant="outline" size="sm" onClick={handleEnrich} disabled={enriching} className="h-7 text-xs text-primary border-primary/30 hover:bg-primary/5">
              {enriching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ChevronDown className="mr-1 h-3 w-3" />}
              {enriching ? "Enriching..." : "Expand"}
            </Button>
          )}
          {layer === 2 && (
            <Button variant="outline" size="sm" onClick={handleEnrich} disabled={enriching} className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700">
              {enriching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              {enriching ? "Enriching..." : "Deep Dive"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onViewDetail?.(candidate)} className="h-7 text-xs">
            View
          </Button>
          {onAddToShortlist && (
            <Button
              variant={isShortlisted ? "secondary" : "default"}
              size="sm"
              onClick={() => onAddToShortlist(candidate)}
              disabled={isShortlisted}
              className="h-7 text-xs"
            >
              <Plus className="mr-0.5 h-3 w-3" />
              {isShortlisted ? "Listed" : "Shortlist"}
            </Button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-0.5">
            {(candidate.email || foundEmail) ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <a href={`mailto:${candidate.email || foundEmail}`} target="_blank" rel="noopener noreferrer">
                  <Mail className="h-3 w-3" />
                </a>
              </Button>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFindContact} disabled={findingContact}>
                      {findingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Find email</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {candidate.github_url && (
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <a href={candidate.github_url} target="_blank" rel="noopener noreferrer">
                  <Github className="h-3 w-3" />
                </a>
              </Button>
            )}
            {!candidate.profile_url.startsWith("apollo://") && (
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <a href={candidate.profile_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
