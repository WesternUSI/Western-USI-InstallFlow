import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/open/document/$documentId")({
  component: OpenDocument,
});

/**
 * The page behind the link in safety document emails (SWMS, SDS, policies).
 * Like the accreditation page, it hands over to the Western USI InstallFlow
 * app, whose document screen opens any kind of document by id.
 */
function OpenDocument() {
  const { documentId } = Route.useParams();
  const appLink = `usi-installer://safety/documents/${documentId}`;

  useEffect(() => {
    window.location.href = appLink;
  }, [appLink]);

  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center text-[#1a1c1e]">
      <h1 className="text-xl font-extrabold">Opening Western USI InstallFlow…</h1>
      <p className="mt-4 text-sm leading-6">
        If the app doesn't open, open it on your phone, sign in, and go to Safety, then Needs
        Attention.
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
