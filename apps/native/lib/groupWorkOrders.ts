interface WorkOrderRow {
  _id: string;
  contracted_panel_id: string;
  advertiser_campaign: string;
  panel_split: string;
  site: string;
  panel_name: string;
  area_progress?: string;
  priority: boolean;
  size?: string;
  assigned_team?: string[];
}

export interface WorkOrderCard {
  key: string;
  workOrderIds: string[];
  panelNameLabel: string;
  site: string;
  panelIdsLabel: string;
  advertisersLabel: string;
  priority: boolean;
  size?: string;
  assignedTeam: string[];
}

export interface WorkOrderAreaGroup {
  area: string;
  cards: WorkOrderCard[];
}

const UNASSIGNED_AREA = "Unassigned";

/** Preserves first-seen order while dropping repeats. */
function uniqueInOrder(values: string[]): string[] {
  return [...new Set(values)];
}

/** Alphabetical, de-duplicated. Used for Panel Split so both the displayed
 * label and the sort tiebreaker it feeds agree on an order. */
function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Merges rows sharing the same `contracted_panel_id` into one card. Panel
 * Name is the unique set across the merged rows joined with " & "; Panel
 * Split ids are the unique set sorted alphabetically then joined the same
 * way, so the displayed label and the sort order below agree. The card is
 * priority if any merged row is, and carries the union of every merged row's
 * `assigned_team`. Cards are sorted alphabetically by Location (site) then
 * Panel Split — matching the original spec's "Location then Panel ID"
 * ordering, using the ids actually shown on the card rather than the
 * invisible `contracted_panel_id` merge key. Priority cards land wherever
 * that sort puts them, not pinned to the top.
 */
function mergeAndSortCards(rows: WorkOrderRow[]): WorkOrderCard[] {
  const cardRows = new Map<string, WorkOrderRow[]>();
  for (const row of rows) {
    const cardKey = row.contracted_panel_id;
    if (!cardRows.has(cardKey)) {
      cardRows.set(cardKey, []);
    }
    cardRows.get(cardKey)!.push(row);
  }

  const built = [...cardRows.entries()].map(([key, mergedRows]) => {
    const panelIds = uniqueSorted(mergedRows.map((r) => r.panel_split));
    const sizes = uniqueInOrder(
      mergedRows.map((r) => r.size).filter((s): s is string => !!s),
    );

    return {
      card: {
        key,
        workOrderIds: mergedRows.map((r) => r._id),
        panelNameLabel: uniqueInOrder(mergedRows.map((r) => r.panel_name)).join(" & "),
        site: mergedRows[0].site,
        panelIdsLabel: panelIds.join(" & "),
        advertisersLabel: uniqueInOrder(mergedRows.map((r) => r.advertiser_campaign)).join(" & "),
        priority: mergedRows.some((r) => r.priority),
        size: sizes[0],
        assignedTeam: [...new Set(mergedRows.flatMap((r) => r.assigned_team ?? []))],
      },
      panelSortKey: panelIds[0] ?? "",
    };
  });

  built.sort((a, b) => {
    const siteCompare = a.card.site.localeCompare(b.card.site);
    return siteCompare !== 0 ? siteCompare : a.panelSortKey.localeCompare(b.panelSortKey);
  });

  return built.map((b) => b.card);
}

/**
 * Groups work orders by `area_progress` — areas are left in whatever order
 * they're first encountered, no sort applied at that level — then merges
 * and sorts cards within each area. See `mergeAndSortCards` for the merge
 * and sort rules.
 */
export function groupWorkOrders(rows: WorkOrderRow[]): WorkOrderAreaGroup[] {
  const byArea = new Map<string, WorkOrderRow[]>();

  for (const row of rows) {
    const area = row.area_progress?.trim() || UNASSIGNED_AREA;
    if (!byArea.has(area)) {
      byArea.set(area, []);
    }
    byArea.get(area)!.push(row);
  }

  return [...byArea.entries()].map(([area, areaRows]) => ({
    area,
    cards: mergeAndSortCards(areaRows),
  }));
}

/**
 * All work orders as cards, merged and sorted the same way as
 * `groupWorkOrders` but flattened across every area — for screens like
 * Allocate Installs that list every site without per-area sections.
 */
export function listWorkOrderCards(rows: WorkOrderRow[]): WorkOrderCard[] {
  return mergeAndSortCards(rows);
}
