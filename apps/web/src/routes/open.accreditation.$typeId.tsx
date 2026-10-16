import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/open/accreditation/$typeId")({
  component: OpenAccreditation,
});

/**
 * The page behind the link in accreditation emails. Mail apps often won't open
 * a custom app link directly, so the email links here and this page hands over
 * to the Western USI InstallFlow app (the screen path matches the app's route).
 */
function OpenAccreditation() {
  const { typeId } = Route.useParams();
  const appLink = `usi-installer://safety/accreditations/${typeId}`;

  useEffect(() => {
    window.location.href = appLink;
  }, [appLink]);

  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center text-[#1a1c1e]">
      <h1 className="text-xl font-extrabold">Opening Western USI InstallFlow…</h1>
      <p className="mt-4 text-sm leading-6">
        If the app doesn't open, open it on your phone, sign in, and go to Safety, then My
        Accreditations.
      </p>
      <a
        className="mt-6 inline-block rounded-lg bg-[#2563eb] px-5 py-3 text-sm font-semibold text-white"
        href={appLink}
      >
        Open the app
      </a>
    </div>
  );
}
