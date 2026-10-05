import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Incremental sync for every connected marketplace. Each sync re-reads a
// window overlapping the last successful one, so a missed tick is harmless.
crons.hourly(
    "sync marketplaces",
    { minuteUTC: 17 },
    internal.scheduledSync.startScheduledSyncs
);

export default crons;
