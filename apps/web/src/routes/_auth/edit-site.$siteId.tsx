import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
import { Textarea } from "@usi-installer/ui/components/textarea";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EquipmentField } from "@/components/equipment-field";
import { PageHeader } from "@/components/page-header";
import { SiteImageField } from "@/components/site-image-field";

export const Route = createFileRoute("/_auth/edit-site/$siteId")({
  component: EditSitePage,
});

interface FormState {
  install_notes: string;
  equipment_needed: string[];
  quantity: string;
  size: string;
}

const EMPTY_FORM: FormState = {
  install_notes: "",
  equipment_needed: [],
  quantity: "",
  size: "",
};

function Field({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-base font-bold text-slate-900">{title}</p>
      <p className="mt-0.5 mb-4 text-sm text-slate-500">{hint}</p>
      {children}
    </div>
  );
}

function EditSitePage() {
  const { siteId } = Route.useParams();
  const navigate = useNavigate();

  const site = useQuery(api.sites.getSite, { id: siteId as Id<"sites"> });

  const updateSite = useMutation(api.sites.update);
  const generateUploadUrl = useMutation(api.sites.generateUploadUrl);
  const addSiteImage = useMutation(api.sites.addSiteImage);
  const removeSiteImage = useMutation(api.sites.removeSiteImage);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (site == null) return;
    setForm({
      install_notes: site.install_notes ?? "",
      equipment_needed: site.equipment_needed,
      quantity: site.quantity === undefined ? "" : String(site.quantity),
      size: site.size ?? "",
    });
  }, [site]);

  function goBack() {
    void navigate({ to: "/manage-site-data" });
  }

  async function handleImages(files: File[]) {
    setIsUploading(true);
    try {
      // Each file gets its own upload URL, then is attached to the site.
      for (const file of files) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) {
          throw new Error(`Could not upload ${file.name}`);
        }
        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
        await addSiteImage({ id: siteId as Id<"sites">, storage_id: storageId });
      }
      toast.success(files.length === 1 ? "Image added" : `${files.length} images added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload those images");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    const quantity = form.quantity.trim() === "" ? undefined : Number(form.quantity);
    if (quantity !== undefined && Number.isNaN(quantity)) {
      toast.error("Panel quantity must be a number");
      return;
    }

    setIsSaving(true);
    try {
      await updateSite({
        id: siteId as Id<"sites">,
        // Kept as they are — this screen does not edit them.
        location: site?.location,
        additional_notes: site?.additional_notes,
        install_notes: form.install_notes.trim() || undefined,
        equipment_needed: form.equipment_needed,
        quantity,
        size: form.size.trim() || undefined,
      });
      toast.success("Site details saved");
      goBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save those changes");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Edit Site Details"
        description="Update site information, image and installation details."
      />

      {site === undefined ? (
        <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
      ) : site === null ? (
        <p className="py-16 text-center text-sm text-slate-400">That site no longer exists.</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 px-4 py-6">
            <section className="rounded-xl border border-slate-200 bg-white px-6 py-5">
              <p className="text-lg font-bold text-slate-900">{site.site}</p>
              <p className="mt-0.5 text-sm text-slate-600">{site.area}</p>
              <p className="mt-0.5 text-sm text-slate-400">{site.panel_id}</p>
            </section>

            {/* One card, sections separated by rules — as in the design. */}
            <section className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              <div className="px-6 py-5">
                <SiteImageField
                  images={site.images}
                  isUploading={isUploading}
                  onFilesSelected={(files) => void handleImages(files)}
                  onRemove={(storageId) =>
                    void removeSiteImage({ id: siteId as Id<"sites">, storage_id: storageId })
                  }
                />
              </div>

              <div className="px-6 py-5">
                <Field
                  title="Installation Notes"
                  hint="Add any important installation notes for this site."
                >
                  <Textarea
                    value={form.install_notes}
                    onChange={(event) => setForm({ ...form, install_notes: event.target.value })}
                    rows={3}
                    placeholder={`Use 6 45° Washers to install junction boxes.`}
                    className="rounded-lg text-sm"
                  />
                </Field>
              </div>

              <div className="px-6 py-5">
                <EquipmentField
                  items={form.equipment_needed}
                  onChange={(equipment_needed) => setForm({ ...form, equipment_needed })}
                />
              </div>

              <div className="grid gap-6 px-6 py-5 sm:grid-cols-2">
                <Field title="Panel Quantity" hint="Number of panels for this site.">
                  <Input
                    value={form.quantity}
                    inputMode="numeric"
                    onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                    className="h-[38px] rounded-lg text-sm"
                  />
                </Field>
                <Field title="Size" hint="Panel size">
                  <Input
                    value={form.size}
                    onChange={(event) => setForm({ ...form, size: event.target.value })}
                    placeholder="10500 × 655"
                    className="h-[38px] rounded-lg text-sm"
                  />
                </Field>
              </div>
            </section>
          </div>

          <div className="sticky bottom-0 mt-auto flex justify-end gap-3 border-t border-slate-200 bg-white px-8 py-4">
            <Button
              variant="outline"
              className="h-[38px] rounded-lg"
              disabled={isSaving}
              onClick={goBack}
            >
              Cancel
            </Button>
            <Button
              className="h-[38px] rounded-lg"
              disabled={isSaving}
              onClick={() => void handleSave()}
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
