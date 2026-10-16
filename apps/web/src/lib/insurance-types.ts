/** Framework 4C's insurance types, as the backend stores them. */
export const INSURANCE_TYPES = [
  { value: "workers_compensation", label: "Workers' Compensation" },
  { value: "public_liability", label: "Public Liability" },
  { value: "motor_vehicle", label: "Motor Vehicle" },
  { value: "professional_indemnity", label: "Professional Indemnity" },
] as const;

export type InsuranceType = (typeof INSURANCE_TYPES)[number]["value"];
