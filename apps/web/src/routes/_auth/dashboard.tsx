import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { useQuery } from "convex/react";
import { ArrowRight, ClipboardList, Database, TrendingUp, UploadCloud } from "lucide-react";

import { ExcelIcon } from "@/components/excel-icon";
import { ImportSummaryCard } from "@/components/import-summary-card";
import { PageHeader } from "@/components/page-header";
import { WorkOrderStats } from "@/components/work-order-stats";
import { formatTrainLine } from "@/lib/workOrderStatus";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

const QUICK_ACTIONS = [
  {
    to: "/import-work-orders",
    icon: UploadCloud,
    tone: "bg-blue-50 text-blue-600",
    title: "Import Work Orders",
    description: "Upload work orders Excel file and create work orders.",
    action: "Import Now",
  },
  {
    to: "/manage-orders",
    icon: ClipboardList,
    tone: "bg-violet-50 text-violet-600",
    title: "Manage Work Orders",
    description: "Browse, filter and review all imported work orders.",
    action: "View Work Orders",
  },
  {
    to: "/import-site-data",
    icon: Database,
    tone: "bg-emerald-50 text-emerald-600",
    title: "Import Site Data",
    description: "Upload the Site Data file to import site details.",
    action: "Open Site Database",
  },
  {
    to: "/manage-orders",
    icon: TrendingUp,
    tone: "bg-amber-50 text-amber-600",
    title: "View Order Progress",
    description: "Monitor order progress across locations.",
    action: "View Order Progress",
  },
] as const;

function QuickActions() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {QUICK_ACTIONS.map((action) => (
        <div
          key={action.title}
          className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <span className={`flex size-10 items-center justify-center rounded ${action.tone}`}>
            <action.icon className="size-5" />
          </span>
          <p className="mt-4 text-base font-bold text-gray-900">{action.title}</p>
          <p className="mt-1 flex-1 text-sm leading-relaxed text-gray-500">{action.description}</p>
          <Link
            to={action.to}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {action.action}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}

function WorkOrdersByArea() {
  const areas = useQuery(api.workorders.byArea);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-base font-bold text-gray-900">Work Orders by Area</h2>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
            {["Train Line", "Imported", "Allocated", "Completed", "Progress"].map((heading) => (
              <TableHead
                key={heading}
                className="px-6 py-5 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase"
              >
                {heading}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {areas === undefined && (
            <TableRow>
              <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {areas?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">
                No work orders imported yet.
              </TableCell>
            </TableRow>
          )}
          {areas?.map((area) => (
            <TableRow key={area.train_line} className="border-slate-100">
              <TableCell className="px-6 py-4 text-sm font-medium text-slate-700">
                {formatTrainLine(area.train_line)}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-600">{area.imported}</TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-600">{area.allocated}</TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-600">{area.completed}</TableCell>
              <TableCell
                className={
                  area.progress === 100
                    ? "px-6 py-4 text-sm font-medium text-green-600"
                    : "px-6 py-4 text-sm font-medium text-blue-600"
                }
              >
                {area.progress}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="border-t border-slate-200 px-6 py-4 text-center">
        <Link
          to="/manage-orders"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View Full Progress Report
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function LatestImport() {
  const latest = useQuery(api.imports.latest);

  if (latest === undefined) return null;

  if (latest === null) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-6">
        <ExcelIcon className="size-8 opacity-60" />
        <div className="flex-1">
          <p className="text-base font-bold text-gray-900">No imports yet</p>
          <p className="text-sm text-gray-500">
            Import an Installation Schedule to see its summary here.
          </p>
        </div>
        <Link
          to="/import-work-orders"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Import Now
          <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  const importedAt = new Date(latest.imported_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <ImportSummaryCard
      name={`${latest.name} Import`}
      badgeText={`${latest.total_rows.toLocaleString()} Orders`}
      lines={[
        `File: ${latest.file_name}`,
        `Imported at ${importedAt} by ${latest.imported_by_name}`,
      ]}
      stats={{ totalRows: latest.total_rows, missingSites: latest.missing_sites }}
    />
  );
}

function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Manage imports, sites, work orders and monitor installation progress."
      />
      <div className="flex flex-col gap-4 px-4 py-6">
        <QuickActions />
        <WorkOrderStats title="Work Orders by Status" />
        <WorkOrdersByArea />
        <LatestImport />
      </div>
    </>
  );
}
