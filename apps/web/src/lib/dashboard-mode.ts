/**
 * Which web dashboard a person can open (decision AD43): admin, management,
 * or both. Someone with both switches with the toggle in the sidebar, and
 * lands on the one they used last when they sign in.
 */

type Access = { role?: string; has_admin_access?: boolean; has_management_access?: boolean } | null | undefined;

export const hasAdminDashboard = (user: Access) => user?.role === "admin" || user?.has_admin_access === true;
export const hasManagementDashboard = (user: Access) => user?.role === "management" || user?.has_management_access === true;
export const hasBothDashboards = (user: Access) => hasAdminDashboard(user) && hasManagementDashboard(user);

export type Dashboard = "admin" | "management";

const LAST_KEY = "usi.dashboard";
const LANDING_KEY = "usi.landing";

/** Storage can be blocked (private windows); the toggle still works, it just isn't remembered. */
function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

export function rememberDashboard(dashboard: Dashboard) {
  safely(() => localStorage.setItem(LAST_KEY, dashboard), undefined);
}

export function lastDashboard(): Dashboard {
  return safely(() => (localStorage.getItem(LAST_KEY) === "management" ? "management" : "admin"), "admin");
}

/** Set when the login page sends someone in, so the panel can open the dashboard they used last. */
export function markLanding() {
  safely(() => sessionStorage.setItem(LANDING_KEY, "1"), undefined);
}

/** True right after signing in, until `clearLanding`. Read-only, so a double render reads the same answer. */
export function isLanding(): boolean {
  return safely(() => sessionStorage.getItem(LANDING_KEY) === "1", false);
}

export function clearLanding() {
  safely(() => sessionStorage.removeItem(LANDING_KEY), undefined);
}

const PENDING_KEY = "usi.pendingPage";

/**
 * A management page someone opened while signed out, e.g. from an escalation
 * email (decision AD45). Kept for the browser tab, so it survives the sign-in
 * flow even if the login's address loses it; opened once they are signed in.
 */
export function setPendingPage(path: string) {
  if (!path.startsWith("/management")) return;
  safely(() => sessionStorage.setItem(PENDING_KEY, path), undefined);
}

/** The page to open after signing in, if one is waiting. Read-only (safe on double renders). */
export function pendingPage(): string | undefined {
  return safely(() => {
    const path = sessionStorage.getItem(PENDING_KEY) ?? undefined;
    return path?.startsWith("/management") ? path : undefined;
  }, undefined);
}

export function clearPendingPage() {
  safely(() => sessionStorage.removeItem(PENDING_KEY), undefined);
}
