import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";

/** The equipment checks assigned to the signed-in person and not done yet. `items` is undefined while loading. */
export function useEquipmentChecks() {
  const items = useQuery(api.equipment.mine);
  return { items, isLoading: items === undefined };
}
