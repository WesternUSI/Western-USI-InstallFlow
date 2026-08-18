import React from "react";

import { useCurrentUser } from "@/hooks/use-current-user";

export const TEAMS = ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5"] as const;
export type Team = (typeof TEAMS)[number];

type TeamContextValue = {
  isLoaded: boolean;
  primaryTeam: string | undefined;
};

const TeamContext = React.createContext<TeamContextValue | null>(null);

/**
 * The signed-in installer's admin-assigned primary team — shared here so
 * Equipment Needed, Complete Installs, and the home screen's Area Progress
 * widget all read the same value without re-deriving it from `useCurrentUser`
 * themselves. There is no merged/"additional teams" concept anymore: those
 * three screens are always scoped to `primaryTeam` only. Allocate Installs is
 * the one screen that can act on a *different* team — it keeps its own local,
 * unsaved single-team selection instead of reading from this context.
 */
export function TeamProvider({ children }: React.PropsWithChildren) {
  const { convexUser, isLoaded } = useCurrentUser();
  const primaryTeam = convexUser?.team;

  const value = React.useMemo(() => ({ isLoaded, primaryTeam }), [isLoaded, primaryTeam]);

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeamContext() {
  const context = React.useContext(TeamContext);
  if (!context) {
    throw new Error("useTeamContext must be used inside a TeamProvider");
  }
  return context;
}
