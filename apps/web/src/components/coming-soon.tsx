import { Construction } from "lucide-react";

/** Placeholder for admin screens that are not built yet, so the sidebar nav works. */
export function ComingSoon({ screen }: { screen: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <Construction className="size-8 text-slate-300" />
      <p className="text-base font-bold text-gray-900">{screen} is not built yet</p>
      <p className="max-w-md text-sm text-gray-500">
        This screen is part of the admin panel design but has not been implemented in this pass.
      </p>
    </div>
  );
}
