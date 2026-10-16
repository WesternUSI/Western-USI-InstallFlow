import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type DocumentItem = FunctionReturnType<typeof api.documents.mine>[number];
export type DocumentKind = DocumentItem["kind"];

/** Every SWMS, SDS and safety document the signed-in worker sees. `items` is undefined while loading. */
export function useDocuments() {
  const items = useQuery(api.documents.mine);
  return { items, isLoading: items === undefined };
}
