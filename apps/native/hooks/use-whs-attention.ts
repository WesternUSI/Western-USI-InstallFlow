import { type AccreditationItem, useAccreditations } from "@/hooks/use-accreditations";
import { type DocumentItem, useDocuments } from "@/hooks/use-documents";
import { type KitItem, useKits } from "@/hooks/use-kits";

/**
 * Everything on the Needs Attention list: accreditations to act on, documents
 * to acknowledge, and assigned kits that are due, overdue or have an open issue.
 */
export function useWhsAttention() {
  const { items, isLoading } = useAccreditations();
  const { items: documentItems, isLoading: documentsLoading } = useDocuments();
  const { items: kitItems, isLoading: kitsLoading } = useKits();

  const accreditations: AccreditationItem[] = (items ?? []).filter((item) => item.needs_attention);
  const documents: DocumentItem[] = (documentItems ?? []).filter((item) => item.needs_acknowledgement);
  const kits: KitItem[] = (kitItems ?? []).filter((item) => item.needs_attention);

  return {
    isLoading: isLoading || documentsLoading || kitsLoading,
    accreditations,
    documents,
    kits,
    count: accreditations.length + documents.length + kits.length,
  };
}
