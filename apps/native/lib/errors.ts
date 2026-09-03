import { ConvexError } from "convex/values";

/**
 * A message safe to put in front of an installer.
 *
 * Convex redacts any plain `throw new Error(...)` to the transport string
 * "[CONVEX M(...)] [Request ID: ...] Server Error" in production, so we never
 * surface `error.message` for an unknown error. Only a `ConvexError` — thrown
 * deliberately by the backend for an expected condition — carries a message
 * meant for the user; anything else falls back to a generic line.
 */
export function toUserMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string" && data.trim() !== "") return data;
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      return (data as { message: string }).message;
    }
  }
  return fallback;
}
