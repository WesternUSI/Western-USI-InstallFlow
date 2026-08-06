import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserData {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

interface ClerkWebhookPayload {
  type: string;
  data: ClerkUserData;
}

function extractEmail(data: ClerkUserData): string {
  const addresses = data.email_addresses ?? [];
  const primary = addresses.find((address) => address.id === data.primary_email_address_id);
  return (primary ?? addresses[0])?.email_address ?? "";
}

function extractName(data: ClerkUserData): string | undefined {
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return name === "" ? undefined : name;
}

const http = httpRouter();

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payload = (await request.json()) as ClerkWebhookPayload;

    switch (payload.type) {
      case "user.created":
      case "user.updated": {
        await ctx.runMutation(internal.users.upsertUser, {
          clerk_id: payload.data.id,
          email: extractEmail(payload.data),
          name: extractName(payload.data),
          image_url: payload.data.image_url ?? undefined,
        });
        break;
      }
      case "user.deleted": {
        await ctx.runMutation(internal.users.deleteUser, {
          clerk_id: payload.data.id,
        });
        break;
      }
      default:
        break;
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
