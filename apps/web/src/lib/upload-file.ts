import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";

/** Sends a file to a Convex upload URL and returns its storage id (the same way Edit Site uploads photos). */
export async function uploadFile(uploadUrl: string, file: File): Promise<Id<"_storage">> {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
  const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

/** "2026-10-15" -> "15 Oct 2026". */
export function formatIsoDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

/** A timestamp as "15 Oct 2026". */
export function formatTime(time: number | undefined): string {
  if (time === undefined) return "—";
  return new Date(time).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}
