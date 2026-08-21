import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import React from "react";

import { useCurrentUser } from "@/hooks/use-current-user";

export type Team = string;

type TeamContextValue = {
  isLoaded: boolean;
  primaryTeam: string | undefined;
  // Active team names, sorted — backs the Allocate screen's team picker.
  // Undefined while `api.teams.list` is still loading.
  teams: Team[];
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
 *
 * The list of teams themselves is fetched here too, since office staff can
 * now create new ones (teams used to be the fixed "Team 1".."Team 5").
 */
export function TeamProvider({ children }: React.PropsWithChildren) {
  const { convexUser, isLoaded, isSignedIn } = useCurrentUser();
  const primaryTeam = convexUser?.team;

  // `TeamProvider` wraps the whole app, including the signed-out (auth)
  // screens — `api.teams.list` requires auth, so it must be skipped there or
  // it throws on the login screen before anyone has signed in.
  const teamRows = useQuery(api.teams.list, isSignedIn ? {} : "skip");
  const teams = React.useMemo(() => (teamRows ?? []).map((team) => team.name), [teamRows]);

  const value = React.useMemo(
    () => ({ isLoaded, primaryTeam, teams }),
    [isLoaded, primaryTeam, teams],
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
