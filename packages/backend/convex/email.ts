"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * SRS §3.13 Completion Email, sent via Resend instead of the SRS's original
 * Bubble/Cloudflare pipeline. Scheduled by `workorders.completeWorkOrder`
 * (one call per completed work order) rather than called inline, since a
 * mutation can't make outbound HTTP requests.
 */
export const sendCompletionEmail = internalAction({
  args: { workOrderId: v.id("workorders") },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.workorders.getCompletionEmailData, {
      workOrderId: args.workOrderId,
    });
    if (data === null) return;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY is not set — skipping completion email.");
      return;
    }
    if (data.recipients.length === 0) {
      console.error("No admin users found — skipping completion email.");
      return;
    }

    // FR-CE-2: Contract Number — Advertiser — Panel ID — Location — Completed
    const subject = `${data.contract_id} — ${data.advertiser_campaign} — ${data.panel_split} — ${data.site} — Completed`;

    // FR-CE-3: Location, Advertiser, Panel ID, Contract Number, Notes.
    const bodyLines = [
      `Location: ${data.site}`,
      `Advertiser: ${data.advertiser_campaign}`,
      `Panel ID: ${data.panel_split}`,
      `Contract Number: ${data.contract_id}`,
      `Notes: ${data.completion_notes ?? "—"}`,
    ];

    // FR-CE-4: attach the high-resolution completion photos.
    const attachments: { filename: string; content: string }[] = [];
    for (const [i, photoUrl] of data.photoUrls.entries()) {
      const photoResponse = await fetch(photoUrl);
      if (photoResponse.ok) {
        const photoBuffer = await photoResponse.arrayBuffer();
        const suffix = data.photoUrls.length > 1 ? `-${i + 1}` : "";
        attachments.push({
          filename: `completion-${data.panel_split}${suffix}.jpg`,
          content: Buffer.from(photoBuffer).toString("base64"),
        });
      } else {
        console.error(`Couldn't fetch completion photo (${photoResponse.status}) for email attachment.`);
      }
    }

    const html = brandedEmail(`
      <p style="margin:0 0 20px;">A work order has been marked complete.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;margin:0 0 20px;">
        <tr>
          <td style="padding:14px 16px 0;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">Location</div>
            <div style="font-size:14px;color:#111827;margin-top:2px;">${escapeHtml(data.site)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px 0;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">Advertiser</div>
            <div style="font-size:14px;color:#111827;margin-top:2px;">${escapeHtml(data.advertiser_campaign)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px 0;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">Panel ID</div>
            <div style="font-size:14px;color:#111827;margin-top:2px;">${escapeHtml(data.panel_split)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px 0;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">Contract Number</div>
            <div style="font-size:14px;color:#111827;margin-top:2px;">${escapeHtml(data.contract_id)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px 14px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">Notes</div>
            <div style="font-size:14px;color:#111827;margin-top:2px;">${escapeHtml(data.completion_notes ?? "—")}</div>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#6B7280;">${
        attachments.length === 0
          ? "No completion photo was attached."
          : attachments.length === 1
            ? "The completion photo is attached."
            : `${attachments.length} completion photos are attached.`
      }</p>
    `);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: data.recipients,
        subject,
        text: bodyLines.join("\n"),
        html,
        attachments,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Resend completion email failed (${response.status}): ${body}`);
    }
  },
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Branded HTML shell — navy header with the wordmark, matching the admin
 * panel's sidebar (#0F172A / #2563EB), white card body underneath. */
function brandedEmail(bodyHtml: string): string {
  return `
<div style="background-color:#F1F5F9;padding:40px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background-color:#0F172A;padding:28px 24px;text-align:center;">
      <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:1px;">WESTERN USI</span>
    </div>
    <div style="padding:32px 28px;color:#111827;font-size:14px;line-height:1.6;">
      ${bodyHtml}
    </div>
  </div>
  <p style="max-width:480px;margin:16px auto 0;text-align:center;color:#9CA3AF;font-size:12px;">
    This is an automated message from Western USI InstallFlow.
  </p>
</div>`;
}

/**
 * Sends a newly invited installer their login credentials directly, so the
 * admin doesn't have to relay them by hand. Scheduled by
 * `users.inviteInstaller` after the Clerk account is created.
 */
export const sendInviteEmail = internalAction({
  args: {
    to: v.string(),
    name: v.string(),
    password: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY is not set — skipping invite email.");
      return;
    }

    const bodyLines = [
      `Hi ${args.name},`,
      "",
      "An account has been created for you on Western USI InstallFlow.",
      "",
      `Login email: ${args.to}`,
      `Password: ${args.password}`,
      "",
      "Please sign in and change your password once you log in.",
    ];

    const html = brandedEmail(`
      <p style="margin:0 0 16px;">Hi ${escapeHtml(args.name)},</p>
      <p style="margin:0 0 20px;">An account has been created for you on Western USI InstallFlow.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;margin:0 0 20px;">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">Login Email</div>
            <div style="font-size:14px;color:#111827;margin-top:2px;">${escapeHtml(args.to)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 16px 14px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#6B7280;text-transform:uppercase;">Password</div>
            <div style="font-size:14px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#111827;margin-top:2px;">${escapeHtml(args.password)}</div>
          </td>
        </tr>
      </table>
      <p style="margin:0;color:#6B7280;">Please sign in and change your password once you log in.</p>
    `);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: [args.to],
        subject: "Your Western USI InstallFlow account",
        text: bodyLines.join("\n"),
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Resend invite email failed (${response.status}): ${body}`);
    }
  },
});

/** Tells an existing account it has also been made an admin. No password: it keeps its own. */
export const sendAdminAccessEmail = internalAction({
  args: {
    to: v.string(),
    name: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY is not set — skipping admin access email.");
      return;
    }

    const html = brandedEmail(`
      <p style="margin:0 0 16px;">Hi ${escapeHtml(args.name)},</p>
      <p style="margin:0 0 20px;">You now have administrator access on Western USI InstallFlow.</p>
      <p style="margin:0;color:#6B7280;">Sign in to the admin panel with your existing email and password. Your installer app login is unchanged.</p>
    `);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: [args.to],
        subject: "You now have admin access on Western USI InstallFlow",
        text: `Hi ${args.name},\n\nYou now have administrator access on Western USI InstallFlow. Sign in to the admin panel with your existing email and password.`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Resend admin access email failed (${response.status}): ${body}`);
    }
  },
});

export const sendManagementAccessEmail = internalAction({
  args: {
    to: v.string(),
    name: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY is not set — skipping management access email.");
      return;
    }

    const html = brandedEmail(`
      <p style="margin:0 0 16px;">Hi ${escapeHtml(args.name)},</p>
      <p style="margin:0 0 20px;">You now have management access on Western USI InstallFlow.</p>
      <p style="margin:0;color:#6B7280;">Sign in to the web panel with your existing email and password. Use the switch in the menu to move between the admin and management dashboards.</p>
    `);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: [args.to],
        subject: "You now have management access on Western USI InstallFlow",
        text: `Hi ${args.name},\n\nYou now have management access on Western USI InstallFlow. Sign in to the web panel with your existing email and password and use the switch in the menu to open the management dashboard.`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Resend management access email failed (${response.status}): ${body}`);
    }
  },
});

const WHS_EMAIL_MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A plain branded notice for the WHS register (reminders, escalations,
 * approvals). Unlike the emails above it throws when Resend refuses, because
 * the caller logs a reminder as sent only once this has succeeded. A rate
 * limit (429), a Resend outage (5xx) or a network blip is retried a few times
 * with a growing pause first, since a scheduled function is not retried by
 * Convex itself.
 */
export const sendWhsEmail = internalAction({
  args: {
    to: v.array(v.string()),
    subject: v.string(),
    lines: v.array(v.string()),
    /** A button under the text, e.g. to the accreditation in the app. */
    link: v.optional(v.object({ label: v.string(), url: v.string() })),
  },
  /** Who was actually emailed: the addresses left after WHS_EMAIL_SKIP (none when every one was skipped). */
  handler: async (_ctx, args): Promise<string[]> => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }

    // Addresses a deployment must never email (decision AD46), e.g. the client on the dev
    // deployment, whose test data would otherwise reach him. Comma-separated, any case.
    const skip = new Set(
      (process.env.WHS_EMAIL_SKIP ?? "")
        .split(",")
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean),
    );
    const to = args.to.filter((address) => !skip.has(address.trim().toLowerCase()));
    if (to.length === 0) {
      console.log(`WHS email skipped (every recipient is on WHS_EMAIL_SKIP): ${args.subject}`);
      return [];
    }

    const button =
      args.link === undefined
        ? ""
        : `<p style="margin:8px 0 16px;"><a href="${escapeHtml(args.link.url)}" style="display:inline-block;background-color:#2563EB;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;">${escapeHtml(args.link.label)}</a></p>`;
    const html = brandedEmail(
      args.lines.map((line) => `<p style="margin:0 0 16px;">${escapeHtml(line)}</p>`).join("") + button,
    );
    const text =
      args.link === undefined
        ? args.lines.join("\n\n")
        : `${args.lines.join("\n\n")}\n\n${args.link.label}: ${args.link.url}`;

    const body = JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
      to,
      subject: args.subject,
      text,
      html,
    });

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body,
        });
      } catch (error) {
        if (attempt >= WHS_EMAIL_MAX_ATTEMPTS) throw error;
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      if (response.ok) return to;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= WHS_EMAIL_MAX_ATTEMPTS) {
        throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
      }

      // Honour the pause Resend asks for, within reason.
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : 1000 * 2 ** (attempt - 1),
      );
    }
  },
});
