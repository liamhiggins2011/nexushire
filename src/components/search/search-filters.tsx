"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, BarChart3 } from "lucide-react";

interface SearchFiltersProps {
  location: string;
  seniority: string;
  onLocationChange: (value: string) => void;
  onSeniorityChange: (value: string) => void;
}

export function SearchFilters({
  location,
  seniority,
  onLocationChange,
  onSeniorityChange,
}: SearchFiltersProps) {
  return (
    <div className="flex items-center gap-3 w-full max-w-3xl mx-auto">
      <div className="relative flex-1">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder="Filter by location..."
          className="pl-9 h-9 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={seniority} onValueChange={onSeniorityChange}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="Seniority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="junior">Junior</SelectItem>
            <SelectItem value="mid">Mid-level</SelectItem>
            <SelectItem value="senior">Senior</SelectItem>
            <SelectItem value="staff">Staff+</SelectItem>
            <SelectItem value="director">Director+</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
