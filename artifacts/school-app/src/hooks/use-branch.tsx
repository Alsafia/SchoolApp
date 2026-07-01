import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface Branch { id: string; name: string; code: string | null; }

interface BranchCtx {
  branches: Branch[];
  selectedBranch: string | null;
  setSelectedBranch: (id: string | null) => void;
  loading: boolean;
}

const Ctx = createContext<BranchCtx>({
  branches: [],
  selectedBranch: null,
  setSelectedBranch: () => {},
  loading: false,
});

export function BranchProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [selectedBranch, setSelectedBranchState] = useState<string | null>(() => {
    try { return localStorage.getItem("school_selected_branch") ?? null; } catch { return null; }
  });

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["branches-selector"],
    enabled: !!profile,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as Branch[];
    },
  });

  function setSelectedBranch(id: string | null) {
    setSelectedBranchState(id);
    try {
      if (id) localStorage.setItem("school_selected_branch", id);
      else localStorage.removeItem("school_selected_branch");
    } catch {}
  }

  return (
    <Ctx.Provider value={{ branches, selectedBranch, setSelectedBranch, loading: isLoading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBranch() {
  return useContext(Ctx);
}
