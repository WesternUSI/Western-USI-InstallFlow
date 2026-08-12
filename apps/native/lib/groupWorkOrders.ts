interface WorkOrderRow {
  _id: string;
  _creationTime: number;
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
  latestCreationTime: number;
}

export interface WorkOrderAreaGroup {
  area: string;
  cards: WorkOrderCard[];
  latestCreationTime: number;
}

const UNASSIGNED_AREA = "Unassigned";

/** Preserves first-seen order while dropping repeats. */
function uniqueInOrder(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Groups work orders by `area_progress`, then merges rows that share the same
 * `contracted_panel_id` into one card — the source sheet carries one row per
 * physical panel, so a single contracted install spanning multiple panels
 * arrives as multiple rows to merge back together for display. Panel Name and
 * Panel Split are both shown as the unique set across the merged rows,
 * joined with " & "; the card is priority if any merged row is. Areas and
 * cards are both ordered newest-first by the most recent `_creationTime`
 * among their rows.
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
    const cards: WorkOrderCard[] = [];

    for (const [key, mergedRows] of cardRows) {
      const latestCreationTime = Math.max(...mergedRows.map((r) => r._creationTime));

      cards.push({
        key,
        panelNameLabel: uniqueInOrder(mergedRows.map((r) => r.panel_name)).join(" & "),
        site: mergedRows[0].site,
        panelIdsLabel: uniqueInOrder(mergedRows.map((r) => r.panel_split)).join(" & "),
        advertisersLabel: uniqueInOrder(mergedRows.map((r) => r.advertiser_campaign)).join(" & "),
        priority: mergedRows.some((r) => r.priority),
        latestCreationTime,
      });
    }

    cards.sort((a, b) => b.latestCreationTime - a.latestCreationTime);

    groups.push({
      area,
      cards,
      latestCreationTime: Math.max(...cards.map((c) => c.latestCreationTime)),
    });
  }

  groups.sort((a, b) => b.latestCreationTime - a.latestCreationTime);

  return groups;
}
