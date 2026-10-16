import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type RegisterData = FunctionReturnType<typeof api.whsAdmin.register>;
export type RegisterRow = RegisterData["rows"][number];

/** The admin register (accreditations, documents and kits) from the backend. Undefined while loading. */
export function useRegister() {
  return useQuery(api.whsAdmin.register);
}

/** Days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export const isOverdue = (row: RegisterRow) => row.status === "overdue" || row.status === "expired";
export const toVerify = (row: RegisterRow) => row.status === "awaiting-verification" || row.status === "renewal-in-progress";
/** Due between today and `days` from today (framework 9 "Due within 30/60 days"). */
export const dueWithin = (row: RegisterRow, today: string, days: number) =>
  row.due !== undefined && row.due >= today && daysBetween(today, row.due) <= days;
