"use client";

import Link from "next/link";
import { useSearchStore } from "@/stores/search-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, FolderOpen, Mail, ListChecks } from "lucide-react";

export function Header() {
  const { shortlist, toggleShortlist } = useSearchStore();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-xl">
            NexusHire
          </Link>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <Users className="mr-2 h-4 w-4" />
                Search
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects">
                <FolderOpen className="mr-2 h-4 w-4" />
                Projects
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/outreach">
                <Mail className="mr-2 h-4 w-4" />
                Outreach
              </Link>
            </Button>
          </nav>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleShortlist}
          className="relative"
        >
          <ListChecks className="mr-2 h-4 w-4" />
          Shortlist
          {shortlist.length > 0 && (
            <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {shortlist.length}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  );
}
