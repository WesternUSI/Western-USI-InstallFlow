import { useClerk } from "@clerk/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Authenticated } from "convex/react";

import { ModeToggle } from "./mode-toggle";

function LogoutButton() {
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <button
      type="button"
      className="text-sm font-medium text-muted-foreground hover:text-foreground"
      onClick={handleSignOut}
    >
      Logout
    </button>
  );
}

export default function Header() {
  const location = useLocation();
  const links = [
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  if (location.pathname === "/login") {
    return null;
  }

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          <Authenticated>
            <LogoutButton />
          </Authenticated>
          <ModeToggle />
        </div>
      </div>
      <hr />
    </div>
  );
}
