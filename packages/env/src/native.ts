import { z } from "zod";

const convexUrlSchema = (exampleHost: string) =>
  z.url().refine((url) => new URL(url).hostname !== exampleHost, {
    message: `Replace the ${exampleHost} placeholder before running the app`,
  });

const schema = z.object({
  EXPO_PUBLIC_CONVEX_URL: convexUrlSchema("example.convex.cloud"),
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
});

// Metro inlines `process.env.EXPO_PUBLIC_*` at build time, so each variable has
// to be referenced literally here — a dynamic lookup (or a Proxy over
// `process.env`, which is what @t3-oss/env-core does) resolves to undefined and
// throws "Property is not configurable" at runtime.
const parsed = schema.safeParse({
  EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid environment variables in apps/native/.env:\n${issues}`);
}

export const env = parsed.data;
