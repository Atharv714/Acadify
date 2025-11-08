import React, { useMemo } from "react";
import type { Project } from "@/lib/types";
import WidgetShell from "./WidgetShell";

type Props = { projects: Project[] };

const STATUS_ORDER: Project["status"][] = ["todo", "in_progress", "completed"];

const STATUS_COLORS: Record<Project["status"], string> = {
  todo: "bg-zinc-500/40",
  in_progress: "bg-sky-500/40",
  completed: "bg-emerald-500/40",
};

export function StatusDistribution({ projects }: Props) {
  const counts = useMemo(() => {
    const c: Record<Project["status"], number> = {
      todo: 0,
      in_progress: 0,
      completed: 0,
    };
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1;
    const total = projects.length || 1;
    const parts = STATUS_ORDER.map((s) => ({
      status: s,
      count: c[s],
      pct: Math.round((c[s] / total) * 100),
    }));
    return { c, parts, total };
  }, [projects]);

  return (
    <WidgetShell title="Status distribution">
      <div className="w-full h-2 rounded-md overflow-hidden flex">
        {counts.parts.map(({ status, pct, count }) => (
          <div
            key={status}
            className={`${STATUS_COLORS[status]} ${count ? "" : "opacity-20"}`}
            style={{ width: `${pct}%` }}
            title={`${status}: ${count}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
        {counts.parts.map(({ status, count }) => (
          <div key={status} className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded ${STATUS_COLORS[status]}`} />
            <span className="capitalize">{status}</span>
            <span className="ml-auto tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}

export default StatusDistribution;
