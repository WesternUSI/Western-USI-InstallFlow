import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Safety net for scheduled work order imports.
 *
 * Each batch arms its own `scheduler.runAt` job, so this is not the normal
 * path — it exists because a scheduled Convex function that throws is not
 * retried, and a release that died part-way would otherwise leave its
 * remaining rows staged with no one coming back for them.
 */
crons.hourly(
  "resume due scheduled imports",
  { minuteUTC: 20 },
  internal.scheduledImports.resumeDueReleases,
  {},
);

export default crons;
