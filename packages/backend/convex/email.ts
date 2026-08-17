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
