import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { Input } from "@usi-installer/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@usi-installer/ui/components/tabs";
import { Textarea } from "@usi-installer/ui/components/textarea";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EquipmentField } from "@/components/equipment-field";
import { SiteImageField } from "@/components/site-image-field";

interface EditSiteDialogProps {
  siteId: Id<"sites"> | null;
  onClose: () => void;
}

interface FormState {
  location: string;
  install_notes: string;
  equipment_needed: string[];
  quantity: string;
  size: string;
  additional_notes: string;
}

const EMPTY_FORM: FormState = {
  location: "",
  install_notes: "",
  equipment_needed: [],
  quantity: "",
  size: "",
  additional_notes: "",
};

function FieldLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mt-0.5 mb-2 text-xs text-gray-500">{hint}</p>
    </>
  );
}

export function EditSiteDialog({ siteId, onClose }: EditSiteDialogProps) {
  const site = useQuery(api.sites.getSite, siteId === null ? "skip" : { id: siteId });

  const updateSite = useMutation(api.sites.update);
  const generateUploadUrl = useMutation(api.sites.generateUploadUrl);
  const setSiteImage = useMutation(api.sites.setSiteImage);
  const removeSiteImage = useMutation(api.sites.removeSiteImage);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Reload the form whenever a different site is opened.
  useEffect(() => {
    if (site == null) return;
    setForm({
      location: site.location ?? "",
      install_notes: site.install_notes ?? "",
      equipment_needed: site.equipment_needed,
      quantity: site.quantity === undefined ? "" : String(site.quantity),
      size: site.size ?? "",
      additional_notes: site.additional_notes ?? "",
    });
  }, [site]);

  async function handleImage(file: File) {
    if (siteId === null) return;

    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await setSiteImage({ id: siteId, storage_id: storageId });
      toast.success("Site image updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that image");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    if (siteId === null) return;

    const quantity = form.quantity.trim() === "" ? undefined : Number(form.quantity);
    if (quantity !== undefined && Number.isNaN(quantity)) {
      toast.error("Panel quantity must be a number");
      return;
    }

    setIsSaving(true);
    try {
      await updateSite({
        id: siteId,
        location: form.location.trim() || undefined,
        install_notes: form.install_notes.trim() || undefined,
        equipment_needed: form.equipment_needed,
        quantity,
        size: form.size.trim() || undefined,
        additional_notes: form.additional_notes.trim() || undefined,
      });
      toast.success("Site details saved");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save those changes");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={siteId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">Edit Site Details</DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Update site information, image and installation details.
          </DialogDescription>
        </DialogHeader>

        {site == null ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <div className="border-b border-slate-200 pb-3">
              <p className="text-base font-bold text-gray-900">{site.site}</p>
              <p className="text-sm text-gray-600">{site.area}</p>
              <p className="text-xs text-gray-400">{site.panel_id}</p>
            </div>

            <Tabs defaultValue="image" className="min-h-0 flex-1 gap-0">
              <TabsList variant="line" className="h-auto gap-6 border-b border-slate-200 pb-0">
                <TabsTrigger
                  value="image"
                  className="px-0 pb-2.5 text-sm data-active:text-blue-600 data-active:after:bg-blue-600"
                >
                  Site Image
                </TabsTrigger>
                <TabsTrigger
                  value="details"
                  className="px-0 pb-2.5 text-sm data-active:text-blue-600 data-active:after:bg-blue-600"
                >
                  Details
                </TabsTrigger>
              </TabsList>

              <TabsContent value="image" className="overflow-y-auto py-5">
                <SiteImageField
                  imageUrl={site.imageUrls[0]}
                  isUploading={isUploading}
                  onFileSelected={(file) => void handleImage(file)}
                  onRemove={() => {
                    if (siteId !== null) void removeSiteImage({ id: siteId });
                  }}
                />
              </TabsContent>

              <TabsContent value="details" className="flex flex-col gap-6 overflow-y-auto py-5">
                <div>
                  <FieldLabel
                    title="GPS Coordinates"
                    hint="Add coordinates to the site for easy navigation"
                  />
                  <Input
                    value={form.location}
                    onChange={(event) => setForm({ ...form, location: event.target.value })}
                    placeholder={`31°36'57.1"S 115°41'33.3"E`}
                    className="h-9 text-sm"
                  />
                </div>

                <div>
                  <FieldLabel
                    title="Installation Notes"
                    hint="Add any important installation notes for this site"
                  />
                  <Textarea
                    value={form.install_notes}
                    onChange={(event) => setForm({ ...form, install_notes: event.target.value })}
                    rows={3}
                    className="text-sm"
                  />
                </div>

                <EquipmentField
                  items={form.equipment_needed}
                  onChange={(equipment_needed) => setForm({ ...form, equipment_needed })}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel title="Panel Quantity" hint="Number of panels for this site" />
                    <Input
                      value={form.quantity}
                      inputMode="numeric"
                      onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div>
                    <FieldLabel title="Size" hint="Panel size" />
                    <Input
                      value={form.size}
                      onChange={(event) => setForm({ ...form, size: event.target.value })}
                      placeholder="10000 x 800"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel
                    title="Additional Notes (Optional)"
                    hint="Any additional information about this site"
                  />
                  <Textarea
                    value={form.additional_notes}
                    onChange={(event) => setForm({ ...form, additional_notes: event.target.value })}
                    rows={3}
                    placeholder="Enter any additional notes..."
                    className="text-sm"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={isSaving} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={isSaving || site == null} onClick={() => void handleSave()}>
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
