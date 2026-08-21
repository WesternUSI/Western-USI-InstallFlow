/**
 * Teams are a fixed set of five, mirroring the literals `users.team` and the
 * native allocation flow validate against. There is no teams table.
 */
export const TEAMS = ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5"] as const;

export type Team = (typeof TEAMS)[number];

/** "Team 1" -> "team-1", so the detail route reads as /teams/team-1. */
export function teamSlug(team: Team): string {
  return team.toLowerCase().replace(/\s+/g, "-");
}

export function teamFromSlug(slug: string): Team | undefined {
  return TEAMS.find((team) => teamSlug(team) === slug.toLowerCase());
}
