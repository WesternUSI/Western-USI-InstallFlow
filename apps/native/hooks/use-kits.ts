import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type KitItem = FunctionReturnType<typeof api.kits.mine>[number];

/** The first-aid kits assigned to the signed-in person. `items` is undefined while loading. */
export function useKits() {
  const items = useQuery(api.kits.mine);
  return { items, isLoading: items === undefined };
}
