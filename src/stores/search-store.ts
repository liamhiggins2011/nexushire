import { create } from "zustand";
import { Candidate, Project } from "@/types";

interface SearchStore {
  shortlist: Candidate[];
  shortlistOpen: boolean;
  activeProject: Project | null;
  selectedCandidate: Candidate | null;
  detailOpen: boolean;

  addToShortlist: (candidate: Candidate) => void;
  removeFromShortlist: (candidateId: string) => void;
  clearShortlist: () => void;
  toggleShortlist: () => void;
  setShortlistOpen: (open: boolean) => void;

  setActiveProject: (project: Project | null) => void;

  setSelectedCandidate: (candidate: Candidate | null) => void;
  setDetailOpen: (open: boolean) => void;
}

export const useSearchStore = create<SearchStore>((set) => ({
  shortlist: [],
  shortlistOpen: false,
  activeProject: null,
  selectedCandidate: null,
  detailOpen: false,

  addToShortlist: (candidate) =>
    set((state) => {
      if (state.shortlist.some((c) => c.id === candidate.id)) return state;
      return { shortlist: [...state.shortlist, candidate] };
    }),

  removeFromShortlist: (candidateId) =>
    set((state) => ({
      shortlist: state.shortlist.filter((c) => c.id !== candidateId),
    })),

  clearShortlist: () => set({ shortlist: [] }),

  toggleShortlist: () =>
    set((state) => ({ shortlistOpen: !state.shortlistOpen })),

  setShortlistOpen: (open) => set({ shortlistOpen: open }),

  setActiveProject: (project) => set({ activeProject: project }),

  setSelectedCandidate: (candidate) =>
    set({ selectedCandidate: candidate, detailOpen: !!candidate }),

  setDetailOpen: (open) =>
    set((state) => ({
      detailOpen: open,
      selectedCandidate: open ? state.selectedCandidate : null,
    })),
}));
