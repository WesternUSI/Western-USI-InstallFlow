import { Button } from "@usi-installer/ui/components/button";
import { useState } from "react";

import { UploadSiteDatabaseModal } from "./upload-site-database-modal";

export function UploadSiteDatabaseButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload Site Database</Button>
      {open && <UploadSiteDatabaseModal open={open} onOpenChange={setOpen} />}
    </>
  );
}
