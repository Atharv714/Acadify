"use client";

import React, { useMemo } from "react";
import type { Project, Task } from "@/lib/types";
import { Timestamp } from "firebase/firestore";
import { CheckCircle2, AlertTriangle, Flame, FolderKanban } from "lucide-react";

type Props = {
  projects: Project[];
  className?: string;
  // Optional: pass tasks grouped by project to use precise completion logic
  tasksByProject?: Record<string, Pick<Task, "status">[]>;
};

function toDate(d: unknown): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (d instanceof Timestamp) return d.toDate();
  return null;
}

export function ProjectsSummary({ projects, className, tasksByProject }: Props) {
  const { total, completed, overdue, atRisk } = useMemo(() => {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    let total = 0,
      completed = 0,
      overdue = 0,
      atRisk = 0;
    for (const p of projects || []) {
      total += 1;
      const dd = toDate((p as any).dueDate);
      // Completed logic:
      // If tasks are provided for this project: it's completed when ALL tasks are either Completed or Blocked
      // (i.e., there are NO tasks in To Do / In Progress / In Review)
      // Otherwise, fall back to project.status === "completed"
      let isCompleted = false;
      const tasks = tasksByProject?.[p.id];
      if (tasks && tasks.length) {
        isCompleted = tasks.every((t) => t.status === "Completed" || t.status === "Blocked");
      } else {
        isCompleted = p.status === "completed";
      }
      if (isCompleted) completed += 1;
      const isOverdue = !!dd && dd < now && !isCompleted;
      if (isOverdue) overdue += 1;
      const dueSoon = !!dd && dd <= in7 && !isCompleted;
      const highNoOwner = p.priority === "high" && (!p.assignedUserIds || p.assignedUserIds.length === 0);
      if (isOverdue || dueSoon || highNoOwner) atRisk += 1;
    }
    return { total, completed, overdue, atRisk };
  }, [projects, tasksByProject]);

  return (
    <div className={`-mx-10 border-b-1 ${className || ""}`}>
      {/* Header */}
      <div className="flex flex-row items-center justify-between px-10 pt-3 pb-3">
        <div className="space-y-1">
          <h3 className="text-lg font-medium spacegrot">Projects Overview</h3>
          <p className="text-xs text-muted-foreground spacemono">
            Key health metrics across this department&apos;s projects
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="">
        <div className="grid grid-cols-2 lg:grid-cols-4 spacegrot">
        <MetricTile
          label="Projects"
          value={total}
          icon={<FolderKanban className="h-4 w-4 text-muted-foreground" />}
          className="border-r border-t pl-12"
        />
        <MetricTile
          label="Completed"
          value={completed}
          accent="success"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          className="border-r border-t px-10"
        />
        <MetricTile
          label="Overdue"
          value={overdue}
          accent={overdue ? "danger" : "default"}
          icon={<AlertTriangle className={`h-4 w-4 ${overdue ? "text-red-400" : "text-muted-foreground"}`} />}
          className="border-r border-t px-10"
        />
        <MetricTile
          label="At Risk"
          value={atRisk}
          accent={atRisk ? "warning" : "default"}
          icon={<Flame className={`h-4 w-4 ${atRisk ? "text-amber-400" : "text-muted-foreground"}`} />}
          className="border-r border-t pr-12"
        />
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
  accent = "default",
  className = "",
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  accent?: "default" | "success" | "warning" | "danger";
  className?: string;
}) {
  const ring =
    accent === "success"
      ? "ring-emerald-500/20"
      : accent === "warning"
        ? "ring-amber-500/20"
        : accent === "danger"
          ? "ring-red-500/25"
          : "ring-white/10";
  const bg =
    accent === "success"
      ? "bg-emerald-500/10"
      : accent === "warning"
        ? "bg-amber-500/10"
        : accent === "danger"
          ? "bg-red-500/10"
          : "bg-muted/50";

  return (
    <div className={`${ring} p-3.5 flex items-center justify-between ${className}`}> 
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-0.5">{value}</div>
      </div>
      <div className={`h-9 w-9 ${bg} rounded-md flex items-center justify-center`}>{icon}</div>
    </div>
  );
}

export default ProjectsSummary;
