"use client";

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
} from "lucide-react";

interface CandidateCardProps {
  candidate: Candidate;
  onAddToShortlist?: (candidate: Candidate) => void;
  onViewDetail?: (candidate: Candidate) => void;
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
  isShortlisted,
  selectable,
  selected,
  onSelect,
}: CandidateCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
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
                  <Badge className="bg-green-500/15 text-green-700 border-green-300 text-[10px] shrink-0">
                    <Sparkles className="h-3 w-3 mr-0.5" />
                    Open to Work
                  </Badge>
                )}
              </div>
              {candidate.headline && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {candidate.headline}
                </p>
              )}
            </div>
          </div>
          {candidate.fit_score && (
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

        {/* Talent Intelligence Metrics */}
        {(candidate.total_yoe || candidate.stability_score || candidate.growth_velocity) && (
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

        {/* Company Pedigree + Tech Stack */}
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

        {candidate.fit_reasoning && (
          <p className="text-sm text-muted-foreground italic border-l-2 pl-3">
            {candidate.fit_reasoning}
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
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
