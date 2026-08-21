/** Mirrors the derived status returned by `api.users.list` / `api.users.get`. */
export type UserStatus = "active" | "invitation_sent" | "idle";

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  invitation_sent: "Invitation Sent",
  idle: "Idle",
};

/** Pill colours, matching the status chips in the design. */
export const USER_STATUS_CLASSES: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  invitation_sent: "bg-blue-50 text-blue-700 ring-blue-200",
  idle: "bg-red-50 text-red-700 ring-red-200",
};
