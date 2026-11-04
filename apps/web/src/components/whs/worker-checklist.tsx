import { CheckboxRow, Field } from "@/components/whs/safety-form";
import { useInspectors } from "@/lib/use-people";

/**
 * "Who does the checks": every app user, grouped by company (Western USI
 * first), ticked one by one. Each ticked worker gets their own check (decision AD57).
 */
export function WorkerChecklist({ value, onChange, error }: { value: string[]; onChange: (next: string[]) => void; error?: string }) {
  const workers = useInspectors();
  const companies = [...new Set(workers.map((entry) => entry.company))].sort((a, b) =>
    a === "Western USI" ? -1 : b === "Western USI" ? 1 : a.localeCompare(b),
  );
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((entry) => entry !== id));

  return (
    <Field label="Who does the checks" required error={error} hint="Each ticked worker gets their own check and reminders.">
      <div className={`flex max-h-64 flex-col gap-3 overflow-y-auto rounded-[6px] border p-3 ${error ? "border-[#dc2626]" : "border-[#e5e7eb]"}`}>
        {workers.length === 0 ? <p className="text-xs text-[#64748b]">No one uses the installer app yet.</p> : null}
        {companies.map((company) => (
          <div key={company} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-[#475569]">{company}</p>
            {workers
              .filter((entry) => entry.company === company)
              .map((entry) => (
                <CheckboxRow key={entry.value} checked={value.includes(entry.value)} onChange={(on) => toggle(entry.value, on)}>
                  {entry.name}
                </CheckboxRow>
              ))}
          </div>
        ))}
      </div>
      {value.length > 0 ? <p className="mt-1.5 text-xs text-[#64748b]">{value.length} ticked</p> : null}
    </Field>
  );
}
