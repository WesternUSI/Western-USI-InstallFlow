import type { Doc } from "@usi-installer/backend/convex/_generated/dataModel";

/** The admin's document types (Figma F2) and how each is stored: SWMS and SDS are kinds, the rest are "document" with a category. */
export const DOCUMENT_TYPES: { value: string; label: string; kind: Doc<"whs_documents">["kind"] }[] = [
  { value: "SWMS", label: "SWMS", kind: "swms" },
  { value: "SDS", label: "SDS", kind: "sds" },
  { value: "WHS Policy", label: "WHS Policy", kind: "document" },
  { value: "WHS Management System", label: "WHS Management System", kind: "document" },
  { value: "Client document", label: "Client document", kind: "document" },
  { value: "Emergency procedure", label: "Emergency procedure", kind: "document" },
];

export function documentTypeLabel(kind: string, category?: string): string {
  if (kind === "swms") return "SWMS";
  if (kind === "sds") return "SDS";
  return category ?? "Safety document";
}

/** Review reminders by kind (framework 7): SWMS and policies 30, 14, 7; SDS 60, 30. */
export function reviewReminderDays(kind: string): number[] {
  return kind === "sds" ? [60, 30] : [30, 14, 7];
}

/** The Type list's last choice: a kind of document that isn't listed, typed in (decision AD40). It is saved as a safety document with that name. */
export const OTHER_DOCUMENT_TYPE = "other";
/** The Type list with the types typed under "Other" on earlier documents added before "Other" (decision AD48). */
export function documentTypeChoices(typed: string[] = []) {
  return [
    ...DOCUMENT_TYPES,
    ...typed.map((name) => ({ value: name, label: name, kind: "document" as const })),
    { value: OTHER_DOCUMENT_TYPE, label: "Other (type the name)", kind: "document" as const },
  ];
}
