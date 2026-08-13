import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Strips a trailing bracketed sub-panel marker: "TJDP-ES (1L)" -> "TJDP-ES".
 * Ids without one, such as "PPCF26-27", are returned unchanged.
 */
export function basePanelId(panelSplit: string): string {
  return panelSplit.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Resolves a work order's `panel_split` to a site in two passes: first on the
 * full id, then — for sub-panel ids like "TJDP-ES (1L)" — on the id with its
 * bracketed suffix removed.
 */
export async function findSiteForPanelSplit(
  ctx: QueryCtx,
  panelSplit: string,
): Promise<Doc<"sites"> | null> {
  const byPanelId = (panelId: string) =>
    ctx.db
      .query("sites")
      .withIndex("by_panel_id", (q) => q.eq("panel_id", panelId))
      .first();

  const exact = await byPanelId(panelSplit);
  if (exact) return exact;

  const base = basePanelId(panelSplit);
  return base === panelSplit ? null : await byPanelId(base);
}
