import { api } from "@usi-installer/backend/convex/_generated/api";
import { Button } from "@usi-installer/ui/components/button";
import { useMutation } from "convex/react";
import { useState } from "react";

import { ExcelUploadModal } from "@/components/excel-upload-modal";
import { parseSiteDatabase } from "@/lib/parseSiteDatabase";

export function UploadSiteDatabaseButton() {
  const [open, setOpen] = useState(false);
  const upsertSites = useMutation(api.sites.upsertSites);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload Site Database</Button>
      {open && (
        <ExcelUploadModal
          open={open}
          onOpenChange={setOpen}
          title="Upload Site Database"
          description="Select the Go Site Database Excel file. Existing sites are matched and updated by Panel ID; new Panel IDs are added. Photos already attached to a site are kept."
          parse={parseSiteDatabase}
          onConfirm={async (rows) => {
            const { inserted, updated } = await upsertSites({ rows });
            return `Upload complete: ${inserted} added, ${updated} updated`;
          }}
        />
      )}
    </>
  );
}
