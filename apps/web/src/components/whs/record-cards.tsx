import { cn } from "@usi-installer/ui/lib/utils";
import type { ReactNode } from "react";

import pdfIcon from "@/assets/whs/pdf-icon.svg";
import { Panel } from "@/components/whs/safety-ui";

/** The right-hand cards shared by record, evidence and kit details screens. */

export function SideCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Panel className={cn("flex flex-col gap-4 rounded-[12px] border-[#e2e8f0] p-[25px]", className)}>
      <h3 className="text-base font-bold text-[#0f172a]">{title}</h3>
      {children}
    </Panel>
  );
}

/** The evidence preview: a PDF icon and the file name. */
export function EvidencePreview({ fileName }: { fileName: string }) {
  return (
    <div className="flex min-h-[170px] flex-col items-center justify-center gap-2 rounded-[8px] border border-[#d8d8d8] bg-[#f8fafc] p-6">
      <img src={pdfIcon} alt="" width={48} height={48} />
      <p className="text-center text-xs font-semibold text-[#334155]">{fileName}</p>
    </div>
  );
}

/** Full-width outlined (or filled) button used inside the side cards. */
export function SideButton({
  children,
  onClick,
  filled,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  filled?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-[8px] border px-4 py-[11px] text-xs font-semibold transition-colors",
        disabled
          ? "border-transparent bg-[#d1d5db] text-white"
          : filled
            ? "border-[#2563eb] bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            : "border-[#3b82f6] bg-white text-[#2563eb] hover:bg-[#eff6ff]",
      )}
    >
      {children}
    </button>
  );
}

export function ActivityCard({ lines, title = "Recent activity" }: { lines: string[]; title?: string }) {
  return (
    <Panel className="flex flex-col gap-4 p-6">
      <h3 className="text-base font-semibold text-[#111827]">{title}</h3>
      {lines.length === 0 ? <p className="text-xs text-[#64748b]">Nothing recorded yet.</p> : null}
      {lines.map((line) => (
        <p key={line} className="text-xs text-[#64748b]">
          {line}
        </p>
      ))}
    </Panel>
  );
}

/** Two-column details layout: main cards on the left, side cards on the right. */
export function DetailsLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_324px]">
      <div className="flex flex-col gap-5">{main}</div>
      <div className="flex flex-col gap-6">{side}</div>
    </div>
  );
}
