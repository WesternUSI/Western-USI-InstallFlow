import React from "react";

import { getPersistentItem, setPersistentItem } from "@/lib/persistent-storage";

const LAST_SYNCED_KEY = "usi.last-synced-at";

type SyncContextValue = {
  lastSyncedAt: Date | null;
  isSyncing: boolean;
  sync: () => Promise<void>;
};

const SyncContext = React.createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: React.PropsWithChildren) {
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

  React.useEffect(() => {
    let isActive = true;

    getPersistentItem(LAST_SYNCED_KEY)
      .then((stored) => {
        if (isActive && stored) {
          setLastSyncedAt(new Date(stored));
        }
      })
      .catch((error) => {
        console.error("Unable to read the last sync time:", error);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const sync = React.useCallback(async () => {
    setIsSyncing(true);

    try {
      // Convex subscriptions already stream changes live, so there is nothing
      // to re-fetch yet. Once work orders land this is where the pull goes.
      const syncedAt = new Date();
      await setPersistentItem(LAST_SYNCED_KEY, syncedAt.toISOString());
      setLastSyncedAt(syncedAt);
    } catch (error) {
      console.error("Unable to record the sync time:", error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const value = React.useMemo(
    () => ({ lastSyncedAt, isSyncing, sync }),
    [lastSyncedAt, isSyncing, sync],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = React.useContext(SyncContext);

  if (!context) {
    throw new Error("useSync must be used inside a SyncProvider");
  }

  return context;
}

/** "Today, 8:45 AM" / "Yesterday, 4:02 PM" / "12 Mar, 9:10 AM" */
export function formatSyncTime(date: Date | null) {
  if (!date) {
    return "Never";
  }

  const time = date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/ /g, " ");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfTarget = new Date(date);
  startOfTarget.setHours(0, 0, 0, 0);

  const dayDelta = Math.round(
    (startOfToday.getTime() - startOfTarget.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (dayDelta === 0) {
    return `Today, ${time}`;
  }

  if (dayDelta === 1) {
    return `Yesterday, ${time}`;
  }

  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}
