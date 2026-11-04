import { useState } from "react";

import { Field, SelectInput, TextInput } from "@/components/whs/safety-form";
import { MONTH_CHOICES } from "@/lib/kit-checks";

const CUSTOM = "custom";

/** What's wrong with a number of months, for the form's own check (decision AD57: 1 to 24). */
export function monthsError(value: string): string | undefined {
  const months = Number(value);
  return /^\d+$/.test(value.trim()) && months >= 1 && months <= 24 ? undefined : "Enter a number of months from 1 to 24.";
}

/** "Check every": the usual choices, or Custom with any number of months (decision AD57). `value` is the number of months as text. */
export function MonthsField({
  label = "Check every",
  value,
  onChange,
  error,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  // A saved value that isn't one of the usual choices opens as Custom.
  const [custom, setCustom] = useState(value !== "" && !MONTH_CHOICES.some((choice) => choice.value === value));
  return (
    <Field label={label} required error={error}>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
        <SelectInput
          value={custom ? CUSTOM : value}
          onChange={(next) => {
            if (next === CUSTOM) {
              setCustom(true);
              onChange("");
            } else {
              setCustom(false);
              onChange(next);
            }
          }}
          options={[...MONTH_CHOICES, { value: CUSTOM, label: "Custom (type the number)" }]}
          invalid={!!error && !custom}
        />
        </div>
        {custom ? (
          <div className="w-32 shrink-0">
            <TextInput type="number" value={value} onChange={onChange} placeholder="Months" invalid={!!error} />
          </div>
        ) : null}
      </div>
    </Field>
  );
}
