import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type AccreditationList = FunctionReturnType<typeof api.accreditations.mine>;
export type AccreditationItem = AccreditationList["items"][number];

/** The signed-in worker's accreditations, most urgent first. `data` is undefined while loading. */
export function useAccreditations() {
  const data = useQuery(api.accreditations.mine);
  return { data, items: data?.items, isLoading: data === undefined };
}
