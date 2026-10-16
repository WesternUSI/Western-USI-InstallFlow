/** The eight checks of framework 4F, by the ids the app and backend use. */
export const KIT_CHECKS: Record<string, string> = {
  present: "Kit present and accessible",
  case: "Case and seals undamaged",
  contents: "Contents match required inventory",
  expired: "No expired items",
  replenished: "Used items replenished",
  sterile: "Sterile items sealed",
  emergency: "Emergency information current",
  clean: "Kit clean and serviceable",
};

export const MONTH_CHOICES = [1, 3, 6, 12].map((months) => ({ value: String(months), label: `${months} ${months === 1 ? "month" : "months"}` }));

export const KIT_TYPES = [
  { value: "Vehicle kit", label: "Vehicle kit" },
  { value: "Warehouse kit", label: "Warehouse kit" },
];
