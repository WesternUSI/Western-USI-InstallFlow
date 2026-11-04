/** Framework 4C's insurance types, as the backend stores them. */
export const INSURANCE_TYPES = [
  { value: "workers_compensation", label: "Workers' Compensation" },
  { value: "public_liability", label: "Public Liability" },
  { value: "motor_vehicle", label: "Motor Vehicle" },
  { value: "professional_indemnity", label: "Professional Indemnity" },
] as const;

export type InsuranceType = (typeof INSURANCE_TYPES)[number]["value"] | "other";

/** The Type list's last choice: a type that isn't listed, typed in (decision AD55). */
export const OTHER_INSURANCE_TYPE = "other";
/** How a name typed under "Other" on an earlier policy is told apart in the Type list. */
const TYPED_PREFIX = "typed:";

/** The Type list: the listed types, then names typed under "Other" before, then "Other" itself (decision AD55). */
export function insuranceTypeChoices(typed: string[] = []) {
  return [
    ...INSURANCE_TYPES,
    ...typed.map((name) => ({ value: `${TYPED_PREFIX}${name}`, label: name })),
    { value: OTHER_INSURANCE_TYPE, label: "Other (type the name)" },
  ];
}

/** The name of an earlier typed type picked from the list, if it is one. */
export function typedInsuranceName(value: string): string | undefined {
  return value.startsWith(TYPED_PREFIX) ? value.slice(TYPED_PREFIX.length) : undefined;
}
