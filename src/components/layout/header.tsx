"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useSearchStore } from "@/stores/search-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, FolderOpen, Mail, ListChecks, Moon, Sun } from "lucide-react";

export function Header() {
  const { shortlist, toggleShortlist } = useSearchStore();
  const { theme, setTheme } = useTheme();

  return (
    <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-xl tracking-tight">
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
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
      </div>
    </header>
  );
}
