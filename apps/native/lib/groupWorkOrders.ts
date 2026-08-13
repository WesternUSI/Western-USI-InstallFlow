interface WorkOrderRow {
  _id: string;
  contracted_panel_id: string;
  advertiser_campaign: string;
  panel_split: string;
  site: string;
  panel_name: string;
  area_progress?: string;
  priority: boolean;
}

export interface WorkOrderCard {
  key: string;
  panelNameLabel: string;
  site: string;
  panelIdsLabel: string;
  advertisersLabel: string;
  priority: boolean;
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
 * Groups work orders by `area_progress` — areas are left in whatever order
 * they're first encountered, no sort applied at that level — then merges
 * rows sharing the same `contracted_panel_id` into one card. Panel Name is
 * the unique set across the merged rows joined with " & "; Panel Split ids
 * are the unique set sorted alphabetically then joined the same way, so the
 * displayed label and the sort order below agree. The card is priority if
 * any merged row is. Cards within each area are sorted alphabetically by
 * Location (site) then Panel Split — matching the original spec's "Location
 * then Panel ID" ordering, using the ids actually shown on the card rather
 * than the invisible `contracted_panel_id` merge key. Priority cards land
 * wherever that sort puts them, not pinned to the top.
 */
export function groupWorkOrders(rows: WorkOrderRow[]): WorkOrderAreaGroup[] {
  const byArea = new Map<string, Map<string, WorkOrderRow[]>>();

  for (const row of rows) {
    const area = row.area_progress?.trim() || UNASSIGNED_AREA;
    const cardKey = row.contracted_panel_id;

    if (!byArea.has(area)) {
      byArea.set(area, new Map());
    }
    const cardRows = byArea.get(area)!;
    if (!cardRows.has(cardKey)) {
      cardRows.set(cardKey, []);
    }
    cardRows.get(cardKey)!.push(row);
  }

  const groups: WorkOrderAreaGroup[] = [];

  for (const [area, cardRows] of byArea) {
    const built = [...cardRows.entries()].map(([key, mergedRows]) => {
      const panelIds = uniqueSorted(mergedRows.map((r) => r.panel_split));

      return {
        card: {
          key,
          panelNameLabel: uniqueInOrder(mergedRows.map((r) => r.panel_name)).join(" & "),
          site: mergedRows[0].site,
          panelIdsLabel: panelIds.join(" & "),
          advertisersLabel: uniqueInOrder(mergedRows.map((r) => r.advertiser_campaign)).join(" & "),
          priority: mergedRows.some((r) => r.priority),
        },
        panelSortKey: panelIds[0] ?? "",
      };
    });

    built.sort((a, b) => {
      const siteCompare = a.card.site.localeCompare(b.card.site);
      return siteCompare !== 0 ? siteCompare : a.panelSortKey.localeCompare(b.panelSortKey);
    });

    groups.push({ area, cards: built.map((b) => b.card) });
  }

  return groups;
}
