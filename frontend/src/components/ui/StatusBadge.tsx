import { STATUS_LABEL } from "@/lib/types";

const colorMap: Record<string, string> = {
  pending: "bg-secondary",
  processing: "bg-primary",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  reprocessing: "bg-secondary",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface">
      <span className={`w-1.5 h-1.5 rounded-full ${colorMap[status] ?? "bg-slate-300"}`} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
