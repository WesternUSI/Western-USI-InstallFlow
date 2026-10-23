import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";

/** Admin and office accounts, for "Responsible person" choices (real users). */
export function useResponsiblePeople() {
  const users = useQuery(api.users.list);
  return (users ?? [])
    .filter((user) => user.role === "admin")
    .map((user) => ({ value: user._id as string, label: user.name }));
}

/** People who use the installer app and can inspect a kit (installers and subcontractor logins). */
export function useInspectors() {
  const users = useQuery(api.users.list);
  return (users ?? [])
    .filter((user) => user.role === "installer" || user.role === "subcontractor")
    .map((user) => ({
      value: user._id as string,
      label: user.subcontractor ? `${user.name} · ${user.subcontractor}` : `${user.name} · Western USI`,
      name: user.name,
      company: user.subcontractor ?? "Western USI",
    }));
}
