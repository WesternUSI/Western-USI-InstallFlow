import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";

/**
 * The active teams. `undefined` while loading — callers that need to tell
 * "still loading" from "no such team" should use this one.
 */
export function useTeams() {
  return useQuery(api.teams.list);
}

/**
 * Just the names, for pickers and filters. Empty while loading, which reads
 * the same as "no teams yet" and is what a dropdown wants either way.
 */
export function useTeamNames(): string[] {
  return useTeams()?.map((team) => team.name) ?? [];
}
