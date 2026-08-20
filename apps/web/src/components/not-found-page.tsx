import { Link } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { ArrowLeft } from "lucide-react";

import logo from "@/assets/western-usi-logo.png";

/** Shown for any route that doesn't match — `/` resolves to the dashboard
 * or the login page depending on whether the visitor is signed in. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-[#FAFAFA] px-6 text-center">
      <img src={logo} alt="Western USI" className="h-6 w-auto" />

      <div className="flex flex-col gap-2">
        <p className="text-6xl font-extrabold tracking-tight text-[#0F172A]">404</p>
        <h1 className="text-lg font-bold text-slate-900">Page not found</h1>
        <p className="max-w-sm text-sm text-slate-500">
          The page you're looking for doesn't exist or may have been moved.
        </p>
      </div>

      <Button className="h-[38px] gap-1.5 rounded-lg" render={<Link to="/" />}>
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Button>
    </div>
  );
}
