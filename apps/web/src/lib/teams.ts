/**
 * Teams are rows in the `teams` table, created by office staff — not the fixed
 * set of five this app started with. A team is referenced by its name, so
 * `Team` is just a string; the live list comes from `useTeams`.
 */
export type Team = string;

/** "Team 1" -> "team-1", so the detail route reads as /teams/team-1. */
export function teamSlug(team: Team): string {
  return team.toLowerCase().replace(/\s+/g, "-");
}

/** Resolves a route slug against the teams that currently exist. */
export function teamFromSlug(slug: string, teams: readonly Team[]): Team | undefined {
  return teams.find((team) => teamSlug(team) === slug.toLowerCase());
}

/**
 * The name the next team should get: one past the highest "Team N" that
 * already exists, so Team 5 is followed by Team 6. Teams named anything else
 * are ignored rather than blocking the sequence.
 */
export function nextTeamName(existing: readonly Team[]): string {
  const numbers = existing
    .map((name) => /^team\s+(\d+)$/i.exec(name.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));

  return `Team ${numbers.length === 0 ? 1 : Math.max(...numbers) + 1}`;
}
