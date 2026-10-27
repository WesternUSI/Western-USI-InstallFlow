import { type AccreditationItem, useAccreditations } from "@/hooks/use-accreditations";
import { type DocumentItem, useDocuments } from "@/hooks/use-documents";
import { type KitItem, useKits } from "@/hooks/use-kits";

/** An on-site change to a SWMS the worker still has to sign (decision D12). */
export type ChangeToSign = DocumentItem["changes_to_sign"][number] & { document_title: string };

/**
 * Everything on the Needs Attention list: accreditations to act on, documents
 * to acknowledge, on-site changes to sign, and assigned kits that are due,
 * overdue or have an open issue.
 */
export function useWhsAttention() {
  const { items, isLoading } = useAccreditations();
  const { items: documentItems, isLoading: documentsLoading } = useDocuments();
  const { items: kitItems, isLoading: kitsLoading } = useKits();

  const accreditations: AccreditationItem[] = (items ?? []).filter((item) => item.needs_attention);
  const documents: DocumentItem[] = (documentItems ?? []).filter((item) => item.needs_acknowledgement);
  const changes: ChangeToSign[] = (documentItems ?? []).flatMap((item) =>
    item.changes_to_sign.map((change) => ({ ...change, document_title: item.title })),
  );
  const kits: KitItem[] = (kitItems ?? []).filter((item) => item.needs_attention);

  return {
    isLoading: isLoading || documentsLoading || kitsLoading,
    accreditations,
    documents,
    changes,
    kits,
    count: accreditations.length + documents.length + changes.length + kits.length,
  };
}
