import React from "react";

import { useCurrentUser } from "@/hooks/use-current-user";

export const TEAMS = ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5"] as const;
export type Team = (typeof TEAMS)[number];

type TeamContextValue = {
  isLoaded: boolean;
  primaryTeam: string | undefined;
  checkedTeams: Set<string>;
  toggleTeam: (team: string) => void;
  savedAdditionalTeams: string[];
};

const TeamContext = React.createContext<TeamContextValue | null>(null);

/**
 * The team(s) the signed-in installer is currently acting as — their primary
 * team plus any merged in via Allocate Installs' "Save" action. Shared here
 * so Allocate Installs, Equipment Needed, and Complete Installs all read the
 * same live selection instead of each screen re-deriving (or re-picking) its
 * own copy.
 */
export function TeamProvider({ children }: React.PropsWithChildren) {
  const { convexUser, isLoaded } = useCurrentUser();
  const primaryTeam = convexUser?.team;
  const savedAdditionalTeams = React.useMemo(
    () => convexUser?.additional_teams ?? [],
    [convexUser?.additional_teams],
  );

  const [checkedTeams, setCheckedTeams] = React.useState<Set<string>>(new Set());

  // Convex hands back a fresh `additional_teams` array on every reactive
  // re-run of getCurrentUser, even when its contents haven't changed — so
  // keying this effect on the array itself re-seeds (and silently discards
  // any unsaved checkbox toggles) far more often than the saved value
  // actually changes. A primitive string signature only changes on a real
  // value change, not on reference churn.
  const savedSignature =
    primaryTeam === undefined ? undefined : [primaryTeam, ...savedAdditionalTeams].sort().join(",");

  React.useEffect(() => {
    if (savedSignature === undefined) return;
    setCheckedTeams(new Set(savedSignature.split(",")));
  }, [savedSignature]);

  const toggleTeam = React.useCallback(
    (team: string) => {
      if (team === primaryTeam) return;
      setCheckedTeams((current) => {
        const next = new Set(current);
        if (next.has(team)) {
          next.delete(team);
        } else {
          next.add(team);
        }
        return next;
      });
    },
    [primaryTeam],
  );

  const value = React.useMemo(
    () => ({ isLoaded, primaryTeam, checkedTeams, toggleTeam, savedAdditionalTeams }),
    [isLoaded, primaryTeam, checkedTeams, toggleTeam, savedAdditionalTeams],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeamContext() {
  const context = React.useContext(TeamContext);
  if (!context) {
    throw new Error("useTeamContext must be used inside a TeamProvider");
  }
  return context;
}
