"use client";

import { useState } from "react";
import { useSearchStore } from "@/stores/search-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { OutreachComposer } from "@/components/outreach/outreach-composer";
import {
  MapPin,
  Building2,
  ExternalLink,
  Mail,
  Github,
  Twitter,
  Brain,
  RefreshCw,
  Loader2,
  TrendingUp,
  Clock,
  Shield,
  Sparkles,
  Search,
} from "lucide-react";
import { DeepDiveData } from "@/types";

export function CandidateDetail() {
  const { selectedCandidate, detailOpen, setDetailOpen, setSelectedCandidate } = useSearchStore();
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [deepDiving, setDeepDiving] = useState(false);
  const [deepDive, setDeepDive] = useState<DeepDiveData | null>(null);

  if (!selectedCandidate) return null;

  const c = selectedCandidate;

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/candidates/${c.id}/reason`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setReasoning(data.fit_reasoning);
      }
    } finally {
      setReanalyzing(false);
    }
  };

  const handleDeepDive = async () => {
    setDeepDiving(true);
    try {
      const res = await fetch(`/api/candidates/${c.id}/deep-dive`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setDeepDive(data);
        // Update the candidate in store with deep dive data
        setSelectedCandidate({
          ...c,
          deep_dive_data: data,
          career_narrative: data.career_narrative,
          github_url: c.github_url || undefined,
          twitter_url: c.twitter_url || undefined,
        } as typeof c);
      }
    } finally {
      setDeepDiving(false);
    }
  };

  const dd = deepDive || c.deep_dive_data;

  return (
    <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl">{c.full_name}</DialogTitle>
            {c.is_open_to_work && (
              <Badge className="bg-green-500/15 text-green-700 border-green-300 text-[10px]">
                <Sparkles className="h-3 w-3 mr-0.5" />
                Open to Work
              </Badge>
            )}
          </div>
          {c.headline && (
            <p className="text-sm text-muted-foreground">{c.headline}</p>
          )}
        </DialogHeader>

        <Tabs defaultValue="profile" className="mt-2">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="intelligence">Intel</TabsTrigger>
            <TabsTrigger value="ai">AI Analysis</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="outreach">Outreach</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[50vh] mt-4">
            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-4 m-0">
              <div className="flex flex-wrap gap-3 text-sm">
                {c.current_title && c.current_company && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {c.current_title} at {c.current_company}
                  </span>
                )}
                {c.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {c.location}
                  </span>
                )}
              </div>

              {(c.tech_stack || c.skills) && (c.tech_stack || c.skills)!.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Tech Stack</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.tech_stack || c.skills)!.map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {c.career_highlights && c.career_highlights.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Career Highlights</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {c.career_highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">-</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.experience && c.experience.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Experience</h4>
                  <div className="space-y-3">
                    {c.experience.map((exp, i) => (
                      <div key={i} className="text-sm">
                        <p className="font-medium">
                          {exp.title} at {exp.company}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {exp.start_date && exp.end_date
                            ? `${exp.start_date} - ${exp.end_date}`
                            : exp.duration || ""}
                          {exp.months ? ` (${exp.months} months)` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {c.education && c.education.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Education</h4>
                  <div className="space-y-2">
                    {c.education.map((edu, i) => (
                      <div key={i} className="text-sm">
                        <p className="font-medium">{edu.school}</p>
                        {edu.degree && (
                          <p className="text-muted-foreground text-xs">
                            {edu.degree}{edu.field ? ` - ${edu.field}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Talent Intelligence Tab */}
            <TabsContent value="intelligence" className="space-y-5 m-0">
              {/* Career Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Clock className="h-4 w-4 text-blue-500" />
                    Years of Experience
                  </div>
                  <p className="text-2xl font-bold">{c.total_yoe || 0}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-indigo-500" />
                    Avg Tenure
                  </div>
                  <p className="text-2xl font-bold">{c.avg_tenure || 0} <span className="text-sm font-normal text-muted-foreground">years</span></p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Shield className="h-4 w-4 text-green-500" />
                      Stability Score
                    </span>
                    <span className="text-sm font-bold">{c.stability_score || 0}%</span>
                  </div>
                  <Progress value={c.stability_score || 0} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Percentage of roles with 2+ year tenure
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <TrendingUp className="h-4 w-4 text-orange-500" />
                      Growth Velocity
                    </span>
                    <span className="text-sm font-bold">{c.growth_velocity || 0}x</span>
                  </div>
                  <Progress value={Math.min((c.growth_velocity || 0) * 25, 100)} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Promotions per 4 years at the same company
                  </p>
                </div>
              </div>

              {c.company_pedigree && c.company_pedigree.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium text-sm mb-2">Company Pedigree</h4>
                    <div className="flex flex-wrap gap-2">
                      {c.company_pedigree.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className={`uppercase font-semibold ${
                            tag === "faang" ? "bg-purple-500/10 text-purple-700 border-purple-200"
                            : tag === "unicorn" ? "bg-pink-500/10 text-pink-700 border-pink-200"
                            : "bg-orange-500/10 text-orange-700 border-orange-200"
                          }`}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Deep Dive Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-sm">Deep Profile Enrichment</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeepDive}
                    disabled={deepDiving}
                  >
                    {deepDiving ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-3.5 w-3.5" />
                    )}
                    {dd ? "Re-enrich" : "Run Deep Dive"}
                  </Button>
                </div>

                {dd ? (
                  <div className="space-y-3">
                    {dd.career_narrative && (
                      <div className="p-3 rounded-lg bg-muted/50 text-sm">
                        <p className="font-medium mb-1">Career Narrative</p>
                        <p className="text-muted-foreground leading-relaxed">{dd.career_narrative}</p>
                      </div>
                    )}
                    {dd.github_summary && (
                      <div className="p-3 rounded-lg bg-muted/50 text-sm">
                        <p className="font-medium mb-1 flex items-center gap-1.5">
                          <Github className="h-3.5 w-3.5" /> GitHub
                        </p>
                        <p className="text-muted-foreground">{dd.github_summary}</p>
                        {dd.github_repos && (
                          <p className="text-xs text-muted-foreground mt-1">{dd.github_repos} public repos</p>
                        )}
                      </div>
                    )}
                    {dd.twitter_summary && (
                      <div className="p-3 rounded-lg bg-muted/50 text-sm">
                        <p className="font-medium mb-1 flex items-center gap-1.5">
                          <Twitter className="h-3.5 w-3.5" /> Twitter/X
                        </p>
                        <p className="text-muted-foreground">{dd.twitter_summary}</p>
                        {dd.twitter_interests && dd.twitter_interests.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {dd.twitter_interests.map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Enriched at {new Date(dd.enriched_at).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Run a deep dive to discover GitHub, Twitter/X profiles and generate a career narrative.
                  </p>
                )}
              </div>
            </TabsContent>

            {/* AI Analysis Tab */}
            <TabsContent value="ai" className="space-y-4 m-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <span className="font-medium">Fit Score</span>
                </div>
                {c.fit_score && (
                  <Badge variant="outline" className="text-lg font-bold">
                    {c.fit_score}/100
                  </Badge>
                )}
              </div>

              <div>
                <h4 className="font-medium text-sm mb-2">AI Reasoning</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {reasoning || c.fit_reasoning || "No reasoning available."}
                </p>
              </div>

              {(c.career_narrative || dd?.career_narrative) && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Career Narrative</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {c.career_narrative || dd?.career_narrative}
                  </p>
                </div>
              )}

              <Separator />

              <Button
                variant="outline"
                size="sm"
                onClick={handleReanalyze}
                disabled={reanalyzing}
              >
                {reanalyzing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Re-analyze Fit
              </Button>
            </TabsContent>

            {/* Contact Tab */}
            <TabsContent value="contact" className="space-y-4 m-0">
              <div className="space-y-3">
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">{c.email}</p>
                    </div>
                  </a>
                )}

                {c.github_url && (
                  <a
                    href={c.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <Github className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">GitHub</p>
                      <p className="text-sm text-muted-foreground">
                        {c.github_url}
                      </p>
                    </div>
                  </a>
                )}

                {c.twitter_url && (
                  <a
                    href={c.twitter_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <Twitter className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Twitter/X</p>
                      <p className="text-sm text-muted-foreground">
                        {c.twitter_url}
                      </p>
                    </div>
                  </a>
                )}

                <a
                  href={c.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">LinkedIn</p>
                    <p className="text-sm text-muted-foreground">
                      {c.profile_url}
                    </p>
                  </div>
                </a>

                {!c.email && !c.github_url && !c.twitter_url && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No contact information found beyond LinkedIn profile.
                  </p>
                )}
              </div>
            </TabsContent>

            {/* Outreach Tab */}
            <TabsContent value="outreach" className="m-0">
              <OutreachComposer candidate={c} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
