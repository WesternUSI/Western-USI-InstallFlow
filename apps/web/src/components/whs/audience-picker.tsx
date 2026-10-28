import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";

import { CheckboxRow, Field } from "@/components/whs/safety-form";

const WESTERN_USI = "western-usi";

export interface Audience {
  /** "office": kept off the installer app, signed by no one (decision AD52). */
  mode: "everyone" | "some" | "office";
  /** Companies whose workers all sign: "western-usi" or subcontractor ids. */
  entities: string[];
  /** People picked one by one (user ids), under companies set to "Only some". */
  workers: string[];
  /** Companies set to "Only some" that have no one ticked yet. */
  partial: string[];
}

export const EVERYONE: Audience = { mode: "everyone", entities: [], workers: [], partial: [] };
export const OFFICE_ONLY: Audience = { mode: "office", entities: [], workers: [], partial: [] };

/** The picker's starting point from a saved document: nothing chosen means everyone. */
export function savedAudience(entities: string[], workers: string[], officeOnly = false): Audience {
  if (officeOnly) return OFFICE_ONLY;
  return entities.length === 0 && workers.length === 0 ? EVERYONE : { mode: "some", entities, workers, partial: [] };
}

/** What's wrong with the choice, for the form's own check before saving. */
export function audienceError(audience: Audience, companyName: (id: string) => string): string | undefined {
  if (audience.mode !== "some") return undefined;
  if (audience.partial.length > 0) {
    return `Tick at least one person at ${companyName(audience.partial[0])}, or choose All workers`;
  }
  if (audience.entities.length === 0 && audience.workers.length === 0) return "Tick at least one company, or choose Everyone";
  return undefined;
}

/** The companies and installers the picker offers (installers are the ones who sign, decision D9). */
export function useAudienceOptions() {
  const subcontractors = useQuery(api.subcontractors.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const companies = [
    { id: WESTERN_USI, name: "Western USI" },
    ...subcontractors.map((sub) => ({ id: sub._id as string, name: sub.name })),
  ];
  const installers = users
    .filter((user) => user.role === "installer")
    .map((user) => {
      const company = user.subcontractor === undefined ? undefined : subcontractors.find((sub) => sub.name === user.subcontractor);
      return { id: user._id as string, name: user.name, company: company === undefined ? WESTERN_USI : (company._id as string) };
    });
  return { companies, installers, companyName: (id: string) => companies.find((company) => company.id === id)?.name ?? "that company" };
}

/**
 * "Who must read and sign this?" (framework 4A "applicable workers",
 * decision AD33). Everyone, or ticked companies; for each company, all its
 * workers or only some of them, chosen from that company's people only.
 * Or office only: admins and management see it, the app never does (AD52).
 */
export function AudiencePicker({ value, onChange, error }: { value: Audience; onChange: (next: Audience) => void; error?: string }) {
  const { companies, installers } = useAudienceOptions();
  const peopleOf = (companyId: string) => installers.filter((person) => person.company === companyId);
  const isSome = (companyId: string) =>
    value.partial.includes(companyId) || peopleOf(companyId).some((person) => value.workers.includes(person.id));
  const isTicked = (companyId: string) => value.entities.includes(companyId) || isSome(companyId);

  const without = (companyId: string): Audience => {
    const theirs = new Set(peopleOf(companyId).map((person) => person.id));
    return {
      ...value,
      entities: value.entities.filter((id) => id !== companyId),
      workers: value.workers.filter((id) => !theirs.has(id)),
      partial: value.partial.filter((id) => id !== companyId),
    };
  };
  const tickCompany = (companyId: string, on: boolean) => {
    const rest = without(companyId);
    onChange(on ? { ...rest, entities: [...rest.entities, companyId] } : rest);
  };
  const setAllWorkers = (companyId: string, all: boolean) => {
    const rest = without(companyId);
    onChange(all ? { ...rest, entities: [...rest.entities, companyId] } : { ...rest, partial: [...rest.partial, companyId] });
  };
  const tickPerson = (companyId: string, personId: string, on: boolean) => {
    const workers = on ? [...value.workers, personId] : value.workers.filter((id) => id !== personId);
    const anyLeft = peopleOf(companyId).some((person) => workers.includes(person.id));
    const partial = value.partial.filter((id) => id !== companyId);
    onChange({ ...value, workers, partial: anyLeft ? partial : [...partial, companyId] });
  };

  const asked =
    value.mode === "everyone"
      ? installers.length
      : new Set([
          ...installers.filter((person) => value.entities.includes(person.company)).map((person) => person.id),
          ...value.workers,
        ]).size;

  const radio = (checked: boolean, label: string, onSelect: () => void) => (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-[#111827]">
      <input type="radio" checked={checked} onChange={onSelect} className="size-4 accent-[#2563eb]" />
      {label}
    </label>
  );

  return (
    <Field label="Who must read and sign this?" required error={error}>
      <div className="flex flex-col gap-2">
        {radio(value.mode === "everyone", "Everyone", () => onChange(EVERYONE))}
        {radio(value.mode === "office", "Office only – don't show in the app", () => onChange(OFFICE_ONLY))}
        {radio(value.mode === "some", "Only some companies or people", () =>
          value.mode === "some" ? undefined : onChange({ mode: "some", entities: [], workers: [], partial: [] }),
        )}
        {value.mode === "some" ? (
          <div className="flex flex-col divide-y divide-[#f1f5f9] rounded-[6px] border border-[#e5e7eb]">
            {companies.map((company) => {
              const people = peopleOf(company.id);
              const ticked = isTicked(company.id);
              const some = isSome(company.id);
              return (
                <div key={company.id} className="flex flex-col gap-2 px-3 py-2.5">
                  <CheckboxRow checked={ticked} onChange={(on) => tickCompany(company.id, on)}>
                    <span className="font-medium">{company.name}</span>
                  </CheckboxRow>
                  {ticked ? (
                    <div className="flex flex-col gap-2 pl-7">
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {radio(!some, `All ${people.length} ${people.length === 1 ? "worker" : "workers"}`, () => setAllWorkers(company.id, true))}
                        {radio(some, "Only some", () => (some ? undefined : setAllWorkers(company.id, false)))}
                      </div>
                      {some ? (
                        <div className="flex flex-col gap-2 pl-6">
                          {people.length === 0 ? <p className="text-xs text-[#64748b]">No installers at {company.name} yet.</p> : null}
                          {people.map((person) => (
                            <CheckboxRow
                              key={person.id}
                              checked={value.workers.includes(person.id)}
                              onChange={(on) => tickPerson(company.id, person.id, on)}
                            >
                              {person.name}
                            </CheckboxRow>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <p className="text-xs text-[#64748b]">
          {value.mode === "office"
            ? "Only admins and management can open it. No one is asked to sign it."
            : `${asked} ${asked === 1 ? "person" : "people"} will be asked to read and sign it.`}
        </p>
      </div>
    </Field>
  );
}
