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

    // FR-CE-4: attach the high-resolution completion photo.
    const attachments: { filename: string; content: string }[] = [];
    if (data.photoUrl) {
      const photoResponse = await fetch(data.photoUrl);
      if (photoResponse.ok) {
        const photoBuffer = await photoResponse.arrayBuffer();
        attachments.push({
          filename: `completion-${data.panel_split}.jpg`,
          content: Buffer.from(photoBuffer).toString("base64"),
        });
      } else {
        console.error(`Couldn't fetch completion photo (${photoResponse.status}) for email attachment.`);
      }
    }

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
