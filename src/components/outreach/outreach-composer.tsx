"use client";

import { useState } from "react";
import { Candidate } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface OutreachComposerProps {
  candidate: Candidate;
  projectId?: string;
}

export function OutreachComposer({
  candidate,
  projectId,
}: OutreachComposerProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState("professional");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, project_id: projectId }),
      });

      if (!res.ok) throw new Error("Failed to generate");

      const data = await res.json();
      setSubject(data.subject);
      setBody(data.body);
      toast.success("Outreach email generated");
    } catch {
      toast.error("Failed to generate outreach email");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const handleSaveDraft = async () => {
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/outreach`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          tone,
          project_id: projectId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Draft saved");
    } catch {
      toast.error("Failed to save draft");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate with AI
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject line..."
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Body</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your outreach message..."
            rows={8}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!subject && !body}
        >
          {copied ? (
            <Check className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-1 h-3.5 w-3.5" />
          )}
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveDraft}
          disabled={!subject && !body}
        >
          Save Draft
        </Button>
      </div>
    </div>
  );
}
