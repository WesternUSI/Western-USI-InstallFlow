import { api } from "@usi-installer/backend/convex/_generated/api";
import { Button } from "@usi-installer/ui/components/button";
import { useMutation } from "convex/react";
import { useState } from "react";

import { ExcelUploadModal } from "@/components/excel-upload-modal";
import { todayIsoDate } from "@/lib/excelParsing";
import { parseWorkOrder } from "@/lib/parseWorkOrder";

export function UploadWorkOrderButton() {
  const [open, setOpen] = useState(false);
  const insertWorkOrders = useMutation(api.workorders.insertWorkOrders);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload Work Order</Button>
      {open && (
        <ExcelUploadModal
          open={open}
          onOpenChange={setOpen}
          title="Upload Work Order"
          description="Select the Installation Schedule Excel file. Each row is read as one panel using the Panel Split column, and every upload is stored against today's date — earlier uploads are kept as history."
          parse={parseWorkOrder}
          onConfirm={async (rows) => {
            const upload_date = todayIsoDate();
            const { inserted, unlinked } = await insertWorkOrders({ rows, upload_date });
            const linkNote =
              unlinked > 0 ? `, ${unlinked} with no matching site in the Site Database` : "";
            return `Uploaded ${inserted} rows for ${upload_date}${linkNote}`;
          }}
        />
      )}
    </>
  );
}
