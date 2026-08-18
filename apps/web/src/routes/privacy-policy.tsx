import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy-policy")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-[#1a1c1e]">
      <h1 className="text-2xl font-extrabold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-[#6c7278]">Last updated: 18 August 2026</p>

      <p className="mt-6 text-sm leading-6">
        This Privacy Policy describes how Western USI ("we", "us") collects and uses information
        through the usi-installer app and its companion admin panel. The app is used internally by
        Western USI staff and contractors to manage advertising panel installation work orders.
      </p>

      <h2 className="mt-8 text-lg font-bold">Information We Collect</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
        <li>
          <strong>Account information:</strong> name and email address, used to sign in and
          identify who completed a work order.
        </li>
        <li>
          <strong>Work order data:</strong> site, panel, and advertiser details, completion notes,
          and timestamps entered while using the app.
        </li>
        <li>
          <strong>Photos:</strong> completion photos taken with your device's camera to document
          finished installs.
        </li>
        <li>
          <strong>Microphone:</strong> the app may request microphone access for media capture
          features; audio is not recorded unless you explicitly use such a feature.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-bold">How We Use Information</h2>
      <p className="mt-2 text-sm leading-6">
        Information is used solely to operate the installer workflow: assigning and tracking work
        orders, recording proof of completion, and emailing completion notifications to Western
        USI staff. We do not sell or share this information with third parties for advertising or
        marketing purposes.
      </p>

      <h2 className="mt-8 text-lg font-bold">Data Storage</h2>
      <p className="mt-2 text-sm leading-6">
        Data is stored using Convex and transmitted using standard encrypted connections (HTTPS).
        Completion emails are sent via Resend to Western USI administrators.
      </p>

      <h2 className="mt-8 text-lg font-bold">Data Retention</h2>
      <p className="mt-2 text-sm leading-6">
        Work order and account data is retained for as long as needed to operate the service and
        meet business record-keeping requirements. You can request deletion of your account data
        by contacting us below.
      </p>

      <h2 className="mt-8 text-lg font-bold">Contact Us</h2>
      <p className="mt-2 text-sm leading-6">
        If you have questions about this Privacy Policy or your data, contact us at{" "}
        <a className="text-[#2f5fe0] underline" href="mailto:dev@westernusi.com.au">
          dev@westernusi.com.au
        </a>
        .
      </p>
    </div>
  );
}
