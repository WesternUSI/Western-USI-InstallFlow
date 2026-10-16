import { api } from "@usi-installer/backend/convex/_generated/api";
import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { toUserMessage } from "@/lib/errors";

const EMPTY_FORM = {
  name: "",
  abn: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
};

/** Adds a subcontractor business (WHS framework 4D). Its people are invited from the form above. */
export function AddSubcontractorForm() {
  const addSubcontractor = useMutation(api.subcontractors.add);

  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  async function handleAdd() {
    const businessName = form.name.trim();
    const contactEmail = form.contactEmail.trim();

    if (businessName === "") {
      toast.error("Enter the subcontractor's business name");
      return;
    }
    if (contactEmail !== "" && !/^\S+@\S+\.\S+$/.test(contactEmail)) {
      toast.error("Enter a valid contact email address");
      return;
    }

    setIsSaving(true);
    try {
      await addSubcontractor({
        name: businessName,
        abn: form.abn,
        contact_name: form.contactName,
        contact_email: contactEmail,
        contact_phone: form.contactPhone,
      });
      toast.success(`${businessName} was added`);
      setForm(EMPTY_FORM);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not add that subcontractor"));
    } finally {
      setIsSaving(false);
    }
  }

  function field(label: string, key: keyof typeof EMPTY_FORM, placeholder: string, className: string) {
    return (
      <div className={className}>
        <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>
        <Input
          value={form[key]}
          onChange={(event) => setForm({ ...form, [key]: event.target.value })}
          placeholder={placeholder}
          className="h-[38px] rounded-lg text-sm"
        />
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <h2 className="text-base font-bold text-slate-900">Add Subcontractor</h2>
        <p className="text-sm text-slate-500">
          Add a subcontractor business, then invite its logins and workers from the invite form
          above and attach them to it.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 px-6 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          void handleAdd();
        }}
      >
        {field("Business Name", "name", "e.g., Smith Industries Pty Ltd", "min-w-56 flex-1")}
        {field("ABN", "abn", "e.g., 12 345 678 901", "w-44")}
        {field("Primary Contact", "contactName", "e.g., John Smith", "min-w-44 flex-1")}
        {field("Contact Email", "contactEmail", "e.g., john@smithindustries.com", "min-w-56 flex-1")}
        {field("Contact Phone", "contactPhone", "e.g., 0400 000 000", "w-44")}

        <Button type="submit" className="h-[38px] gap-1.5 rounded-lg" disabled={isSaving}>
          {isSaving ? "Adding…" : "Add Subcontractor"}
          <Plus className="size-4" />
        </Button>
      </form>
    </section>
  );
}
