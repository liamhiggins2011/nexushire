"use client";

import { useEffect, useState, use } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MapPin, Building2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Project, ProjectCandidate, CandidateStatus } from "@/types";
import { toast } from "sonner";

const STATUS_COLORS: Record<CandidateStatus, string> = {
  new: "bg-gray-100 text-gray-800",
  contacted: "bg-blue-100 text-blue-800",
  replied: "bg-green-100 text-green-800",
  interview: "bg-purple-100 text-purple-800",
  rejected: "bg-red-100 text-red-800",
  hired: "bg-emerald-100 text-emerald-800",
};

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [projRes, candRes] = await Promise.all([
          fetch(`/api/projects/${id}`),
          fetch(`/api/projects/${id}/candidates`),
        ]);
        if (projRes.ok) setProject(await projRes.json());
        if (candRes.ok) {
          const data = await candRes.json();
          setCandidates(data.candidates);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleStatusChange(
    candidateId: string,
    newStatus: CandidateStatus
  ) {
    try {
      const res = await fetch(`/api/projects/${id}/candidates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          status: newStatus,
        }),
      });
      if (res.ok) {
        setCandidates(
          candidates.map((pc) =>
            pc.candidate_id === candidateId
              ? { ...pc, status: newStatus }
              : pc
          )
        );
        toast.success("Status updated");
      }
    } catch {
      toast.error("Failed to update status");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 max-w-5xl">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-96 mb-8" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 max-w-5xl text-center">
          <p>Project not found.</p>
          <Button asChild className="mt-4">
            <Link href="/projects">Back to Projects</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">No candidates yet</p>
            <p>Search for candidates and add them to this project.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map((pc) => {
              const c = pc.candidate;
              if (!c) return null;

              return (
                <Card key={pc.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">
                          {c.full_name}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted-foreground">
                          {c.current_title && c.current_company && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {c.current_title} at {c.current_company}
                            </span>
                          )}
                          {c.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {c.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.fit_score && (
                          <Badge variant="outline" className="font-bold">
                            {c.fit_score}
                          </Badge>
                        )}
                        <Select
                          value={pc.status}
                          onValueChange={(val) =>
                            handleStatusChange(
                              pc.candidate_id,
                              val as CandidateStatus
                            )
                          }
                        >
                          <SelectTrigger className="w-[130px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              Object.keys(STATUS_COLORS) as CandidateStatus[]
                            ).map((status) => (
                              <SelectItem key={status} value={status}>
                                <Badge
                                  variant="secondary"
                                  className={`${STATUS_COLORS[status]} text-xs`}
                                >
                                  {status}
                                </Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a
                          href={c.profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          LinkedIn
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
