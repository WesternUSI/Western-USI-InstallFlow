import { api } from "@usi-installer/backend/convex/_generated/api";
import { Button } from "@usi-installer/ui/components/button";
import { useMutation } from "convex/react";
import { useState } from "react";

import { ExcelUploadModal } from "@/components/excel-upload-modal";
import { parseWorkOrder } from "@/lib/parseWorkOrder";

export function UploadWorkOrderButton() {
  const [open, setOpen] = useState(false);
  const upsertWorkOrders = useMutation(api.workorders.upsertWorkOrders);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload Work Order</Button>
      {open && (
        <ExcelUploadModal
          open={open}
          onOpenChange={setOpen}
          title="Upload Work Order"
          description="Select the Work Order Table Excel file. Existing work orders are matched and updated by Advertiser/Campaign + Contracted Panel ID + Panel Split; new ones are added. Completion status is never overwritten by a re-upload."
          parse={parseWorkOrder}
          onConfirm={(rows) => upsertWorkOrders({ rows })}
        />
      )}
    </>
  );
}
