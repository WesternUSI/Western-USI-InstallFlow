import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/support")({
  component: RouteComponent,
});
function RouteComponent() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-[#1a1c1e]">
      <h1 className="text-2xl font-extrabold">Support</h1>

      <p className="mt-6 text-sm leading-6">
        Western USI Installer is used internally by Western USI staff and contractors to manage
        advertising panel installation work orders.
      </p>
      <p className="mt-4 text-sm leading-6">
        If you're having trouble signing in, syncing, or using the app, or have any other
        question, contact us at{" "}
        <a className="text-[#2f5fe0] underline" href="mailto:dev@westernusi.com.au">
          dev@westernusi.com.au
        </a>
        .
      </p>
    </div>
  );
}
