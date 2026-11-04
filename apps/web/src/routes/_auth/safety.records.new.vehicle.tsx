import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FilePicker, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { MONTH_CHOICES } from "@/lib/kit-checks";
import { formatIsoDate, uploadFile } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";
import { addMonthsIso } from "@/lib/whs-sample";

export const Route = createFileRoute("/_auth/safety/records/new/vehicle")({
  component: AddVehicle,
});

type Errors = Partial<Record<"rego" | "model" | "year" | "regoExpiry" | "insuranceExpiry" | "lastService" | "interval", string>>;

/** F5 Add Vehicle, real (framework 4E; Western USI only, VH4). The next service is worked out. */
function AddVehicle() {
  const navigate = useNavigate();
  const create = useMutation(api.vehicles.adminCreate);
  const generateUploadUrl = useMutation(api.vehicles.generateUploadUrl);
  const people = useResponsiblePeople();
  const [rego, setRego] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [regoExpiry, setRegoExpiry] = useState("");
  const [insuranceExpiry, setInsuranceExpiry] = useState("");
  const [lastService, setLastService] = useState("");
  const [interval, setInterval] = useState("6");
  const [provider, setProvider] = useState("");
  const [responsible, setResponsible] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  // Optional documents saved with the vehicle, e.g. its registration papers (decision AD56).
  const [documents, setDocuments] = useState<{ name: string; file: File | null }[]>([]);
  const [documentErrors, setDocumentErrors] = useState<{ name?: string; file?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const setDocument = (index: number, change: Partial<{ name: string; file: File | null }>) => {
    setDocuments((current) => current.map((entry, at) => (at === index ? { ...entry, ...change } : entry)));
    setDocumentErrors((current) => current.map((entry, at) => (at === index ? {} : entry)));
  };
  const next = lastService && interval ? addMonthsIso(lastService, Number(interval)) : "";

  const save = async () => {
    const found: Errors = {};
    if (rego.trim() === "") found.rego = "Enter the registration number.";
    if (model.trim() === "") found.model = "Enter the make and model.";
    if (year !== "" && !/^(19|20)\d\d$/.test(year)) found.year = "Enter a four-digit year, e.g. 2021.";
    if (regoExpiry === "") found.regoExpiry = "Select the registration expiry date.";
    if (insuranceExpiry === "") found.insuranceExpiry = "Select the insurance expiry date.";
    if (lastService === "") found.lastService = "Select the last service date.";
    else if (lastService > new Date().toISOString().slice(0, 10)) found.lastService = "The last service date can't be in the future.";
    if (interval === "") found.interval = "Select the service interval.";
    setErrors(found);
    // A document row needs both a name and a file; a row left completely empty is ignored.
    const filled = documents.filter((entry) => entry.name.trim() !== "" || entry.file !== null);
    const rowErrors = documents.map((entry) => {
      if (entry.name.trim() === "" && entry.file === null) return {};
      return {
        name: entry.name.trim() === "" ? "Enter the document name, e.g. Registration papers 2026." : undefined,
        file: entry.file === null ? "Choose the file for this document." : undefined,
      };
    });
    setDocumentErrors(rowErrors);
    const first = Object.values(found)[0] ?? rowErrors.flatMap((entry) => [entry.name, entry.file]).find(Boolean);
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      const uploaded = [];
      for (const entry of filled) {
        if (entry.file === null) continue;
        const fileId = await uploadFile(await generateUploadUrl(), entry.file);
        uploaded.push({ name: entry.name.trim(), file_id: fileId, file_name: entry.file.name, content_type: entry.file.type || undefined });
      }
      const vehicleId = await create({
        registration: rego.trim(),
        make_model: model.trim(),
        year: year === "" ? undefined : Number(year),
        vin: vin.trim() || undefined,
        registration_expiry: regoExpiry,
        insurance_expiry: insuranceExpiry,
        last_service: lastService,
        service_interval_months: Number(interval),
        service_provider: provider.trim() || undefined,
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
        documents: uploaded.length > 0 ? uploaded : undefined,
      });
      toast.success(`${rego.trim().toUpperCase()} saved`);
      void navigate({ replace: true, to: "/safety/vehicles/$vehicleId", params: { vehicleId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that vehicle."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Add Vehicle" description="Record registration, insurance and the recurring service schedule." back={{ to: "/safety/vehicles", label: "Vehicle Register" }}>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Registration" required error={errors.rego}>
            <TextInput value={rego} onChange={setRego} placeholder="e.g. 1HXR552" invalid={!!errors.rego} />
          </Field>
          <Field label="Make / model" required error={errors.model}>
            <TextInput value={model} onChange={setModel} placeholder="e.g. Toyota HiAce" invalid={!!errors.model} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Year" error={errors.year}>
            <TextInput value={year} onChange={setYear} placeholder="e.g. 2021" invalid={!!errors.year} />
          </Field>
          <Field label="VIN">
            <TextInput value={vin} onChange={setVin} placeholder="Enter VIN" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Registration expiry" required error={errors.regoExpiry}>
            <TextInput type="date" value={regoExpiry} onChange={setRegoExpiry} invalid={!!errors.regoExpiry} />
          </Field>
          <Field label="Insurance expiry" required error={errors.insuranceExpiry}>
            <TextInput type="date" value={insuranceExpiry} onChange={setInsuranceExpiry} invalid={!!errors.insuranceExpiry} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Last service date" required error={errors.lastService}>
            <TextInput type="date" value={lastService} onChange={setLastService} invalid={!!errors.lastService} />
          </Field>
          <Field label="Service interval" required error={errors.interval}>
            <SelectInput value={interval} onChange={setInterval} options={MONTH_CHOICES} invalid={!!errors.interval} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Next service (calculated)">
            <div className="flex h-11 items-center rounded-[6px] border border-[#e5e7eb] bg-[#f8fafc] px-3 text-sm text-[#475569]">{next ? formatIsoDate(next) : "Worked out from the last service"}</div>
          </Field>
          <Field label="Service provider">
            <TextInput value={provider} onChange={setProvider} placeholder="Enter provider" />
          </Field>
        </FieldRow>
        <Field label="Responsible person" className="sm:max-w-[calc(50%-10px)]">
          <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="The admin list" />
        </Field>
        <div className="flex flex-col gap-3 border-t border-[#f1f5f9] pt-4">
          <div>
            <p className="text-sm font-semibold text-[#111827]">Documents (optional)</p>
            <p className="text-xs text-[#64748b]">Papers kept with the vehicle, like its registration. You can add more later on the vehicle's page.</p>
          </div>
          {documents.map((entry, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-[8px] border border-[#e5e7eb] p-4">
              <div className="flex items-start gap-3">
                <Field label="Document name" required error={documentErrors[index]?.name} className="flex-1">
                  <TextInput
                    value={entry.name}
                    onChange={(value) => setDocument(index, { name: value })}
                    placeholder="e.g. Registration papers 2026"
                    invalid={!!documentErrors[index]?.name}
                  />
                </Field>
                <button
                  type="button"
                  className="mt-7 text-xs font-medium text-[#dc2626] hover:underline"
                  onClick={() => {
                    setDocuments((current) => current.filter((_, at) => at !== index));
                    setDocumentErrors((current) => current.filter((_, at) => at !== index));
                  }}
                >
                  Remove
                </button>
              </div>
              <FilePicker file={entry.file} onChange={(file) => setDocument(index, { file })} error={documentErrors[index]?.file} />
            </div>
          ))}
          <button
            type="button"
            className="w-fit text-[13px] font-medium text-[#2563eb] hover:underline"
            onClick={() => {
              setDocuments((current) => [...current, { name: "", file: null }]);
              setDocumentErrors((current) => [...current, {}]);
            }}
          >
            {documents.length === 0 ? "+ Add a document" : "+ Add another document"}
          </button>
        </div>
        <Notice tone="info">Reminders: registration and insurance 60, 30, 14 and 7 days before expiry; service 30, 14 and 7 days before it's due.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/records/new">
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Vehicle"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
