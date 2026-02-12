"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Mail, Copy, Check } from "lucide-react";
import { OutreachDraft } from "@/types";
import { toast } from "sonner";

export default function OutreachPage() {
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDrafts() {
      try {
        const res = await fetch("/api/outreach");
        if (res.ok) {
          const data = await res.json();
          setDrafts(data.drafts);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchDrafts();
  }, []);

  async function handleCopy(draft: OutreachDraft) {
    await navigator.clipboard.writeText(
      `Subject: ${draft.subject}\n\n${draft.body}`
    );
    setCopiedId(draft.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Outreach Drafts</h1>
          <p className="text-muted-foreground">
            AI-generated outreach emails for your candidates
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-60" />
                  <Skeleton className="h-4 w-40" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No outreach drafts yet</p>
            <p>
              Generate outreach emails from candidate profiles to see them here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {drafts.map((draft) => (
              <Card key={draft.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {draft.subject}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {draft.tone}
                        </Badge>
                        <Badge
                          variant={
                            draft.status === "sent" ? "default" : "outline"
                          }
                          className="text-xs"
                        >
                          {draft.status}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleCopy(draft)}
                    >
                      {copiedId === draft.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {draft.body}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    {new Date(draft.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
