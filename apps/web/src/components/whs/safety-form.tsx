import { cn } from "@usi-installer/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { DetailGrid, Notice, Panel, SafetyButton } from "@/components/whs/safety-ui";

/**
 * Form controls for the Safety screens: 44px fields with a 12px label above
 * (Figma "USI / Safety"). Every field can show an error in red underneath, and
 * the control gets a red border (global form rule).
 */

const controlClass =
  "h-11 w-full rounded-[6px] border bg-white px-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:outline-none";

export function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-[7px]", className)}>
      <span className="text-xs font-medium text-[#111827]">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
      {hint && !error ? <span className="text-[11px] text-[#64748b]">{hint}</span> : null}
      {error ? <span className="text-xs font-medium text-[#dc2626]">{error}</span> : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  invalid,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  type?: "text" | "date" | "email" | "number";
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-invalid={invalid}
      className={cn(controlClass, invalid ? "border-[#ef4444]" : "border-[#e5e7eb]")}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  invalid,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-invalid={invalid}
      className={cn(
        "w-full rounded-[6px] border bg-white px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:outline-none",
        invalid ? "border-[#ef4444]" : "border-[#e5e7eb]",
      )}
    />
  );
}

/** A select that always shows the option's label. "" is the unchosen state. */
export function SelectInput({
  value,
  onChange,
  options,
  placeholder = "Select…",
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={cn(
          controlClass,
          "appearance-none pr-9",
          value === "" && "text-[#9ca3af]",
          invalid ? "border-[#ef4444]" : "border-[#e5e7eb]",
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#64748b]" />
    </div>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-[#111827]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#2563eb]"
      />
      {children}
    </label>
  );
}

/** The grey upload box: picked file name, the accepted types, and "Choose File". */
export function FilePicker({
  file,
  onChange,
  error,
  accept = ".pdf,.jpg,.jpeg,.png",
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  accept?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex flex-col items-start gap-2 rounded-[8px] border bg-[#fafafa] p-6",
          error ? "border-[#ef4444]" : "border-[#e5e7eb]",
        )}
      >
        <p className={cn("text-sm font-semibold", file ? "text-[#2563eb]" : "text-[#111827]")}>
          {file ? `${file.name} · ready to upload` : "No file chosen"}
        </p>
        <p className="text-xs text-[#64748b]">PDF, JPG or PNG · Maximum 20 MB</p>
        <label className="inline-flex h-[42px] cursor-pointer items-center rounded-[6px] border border-[#e5e7eb] bg-white px-4 text-[13px] font-semibold text-[#2563eb] hover:bg-[#f8fafc]">
          Choose File
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {error ? <span className="text-xs font-medium text-[#dc2626]">{error}</span> : null}
    </div>
  );
}

/** A form card with a heading, as on "Issue a new document version". */
export function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="flex flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold text-[#111827]">{title}</h2>
      {children}
    </Panel>
  );
}

/** Two fields side by side on wide screens. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
}

/** The confirmation card after an action ("Document Version Published"), or a question before one. */
export function ResultCard({
  title,
  badge,
  message,
  items,
  actions,
}: {
  title: string;
  badge?: ReactNode;
  message: ReactNode;
  items?: { label: string; value: ReactNode }[];
  actions: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[22px] font-semibold text-[#111827]">{title}</h2>
        {badge}
      </div>
      <p className="text-sm text-[#64748b]">{message}</p>
      {items && items.length > 0 ? <DetailGrid items={items} columns={2} /> : null}
      <div className="flex flex-wrap gap-3 pt-1">{actions}</div>
    </Panel>
  );
}

export function PublishedBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-[6px] bg-[#dcfce7] px-2.5 text-[13px] font-medium text-[#166534]">
      {children}
    </span>
  );
}

export interface FieldSpec {
  key: string;
  label: string;
  kind: "text" | "date" | "select" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Spans both columns. */
  wide?: boolean;
  hint?: string;
  /** A message when the value is filled in but wrong; undefined when fine. */
  check?: (value: string, values: Record<string, string>) => string | undefined;
  /** Shown read-only, worked out from the other values. */
  computed?: (values: Record<string, string>) => string;
}

/**
 * A record form built from field specs: two columns, required fields marked,
 * and each missing or invalid field named in its own message (global form rule).
 */
export function SpecForm({
  title,
  fields,
  initial = {},
  fileLabel,
  fileRequired,
  notice,
  checkbox,
  submitLabel,
  cancel,
  onSubmit,
}: {
  title: string;
  fields: FieldSpec[];
  initial?: Record<string, string>;
  fileLabel: string;
  fileRequired?: boolean;
  notice?: ReactNode;
  checkbox?: string;
  submitLabel: string;
  cancel: ReactNode;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = () => {
    const found: Record<string, string> = {};
    for (const field of fields) {
      if (field.computed) continue;
      const value = (values[field.key] ?? "").trim();
      if (field.required && value === "") {
        found[field.key] = field.kind === "select" || field.kind === "date"
          ? `Select the ${field.label.toLowerCase()}.`
          : `Enter the ${field.label.toLowerCase()}.`;
      } else if (value !== "" && field.check) {
        const problem = field.check(value, values);
        if (problem) found[field.key] = problem;
      }
    }
    if (fileRequired && file === null) found.file = `Choose the ${fileLabel.toLowerCase()} to upload.`;
    setErrors(found);
    const first = Object.values(found).find(Boolean);
    if (first) {
      toast.error(first);
      return;
    }
    onSubmit(values);
  };

  return (
    <FormCard title={title}>
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {fields.map((field) => {
          const error = errors[field.key] || undefined;
          const value = field.computed ? field.computed(values) : (values[field.key] ?? "");
          return (
            <Field
              key={field.key}
              label={field.label}
              required={field.required}
              error={error}
              hint={field.hint}
              className={field.wide ? "sm:col-span-2" : undefined}
            >
              {field.computed ? (
                <div className="flex h-11 items-center rounded-[6px] border border-[#e5e7eb] bg-[#f8fafc] px-3 text-sm text-[#475569]">
                  {value || "Worked out once the dates are in"}
                </div>
              ) : field.kind === "select" ? (
                <SelectInput
                  value={value}
                  onChange={(next) => set(field.key, next)}
                  options={field.options ?? []}
                  placeholder={field.placeholder}
                  invalid={!!error}
                />
              ) : (
                <TextInput
                  type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
                  value={value}
                  onChange={(next) => set(field.key, next)}
                  placeholder={field.placeholder}
                  invalid={!!error}
                />
              )}
            </Field>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[#111827]">
          {fileLabel}
          {fileRequired ? " *" : " (optional)"}
        </span>
        <FilePicker
          file={file}
          onChange={(next) => {
            setFile(next);
            setErrors((current) => ({ ...current, file: "" }));
          }}
          error={errors.file || undefined}
        />
      </div>
      {notice ? <Notice tone="info">{notice}</Notice> : null}
      {checkbox ? (
        <CheckboxRow checked={checked} onChange={setChecked}>
          {checkbox}
        </CheckboxRow>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {cancel}
        <SafetyButton onClick={submit}>{submitLabel}</SafetyButton>
      </div>
    </FormCard>
  );
}
