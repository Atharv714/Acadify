"use client";

import React, { useMemo } from "react";
import type { Project, Task } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

type TaskSummary = { status: Task["status"]; isLeaf?: boolean };
type Props = {
  projects: Project[];
  tasksByProject?: Record<string, TaskSummary[]>;
  className?: string;
};

function toDate(d: unknown): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (d instanceof Timestamp) return d.toDate();
  return null;
}

// Apple Keynote-style progress overview: minimal, fluid, and elegant
export function ProjectProgressOverview({ projects, tasksByProject, className }: Props) {
  const items = useMemo(() => {
    const list = (projects || []).map((p) => {
      const tasks = tasksByProject?.[p.id] || [];
      let percent = 0;
      if (tasks.length > 0) {
        // Align with ProjectProgressWidget-v2: use ALL tasks, only count status === "Completed"
        const total = tasks.length;
        const done = tasks.filter((t) => t.status === "Completed").length;
        percent = total > 0 ? Math.round((done / total) * 100) : 0;
      } else {
        // Assumption: no tasks -> fall back to project.status
        percent = p.status === "completed" ? 100 : 0;
      }
      const due = toDate((p as any).dueDate);
      return {
        id: p.id,
        name: p.name,
        percent,
        dueDate: due,
        color: p.color || undefined,
      };
    });

    // Sort by percent ascending to create a pleasing ramp-up animation ordering
    return list.sort((a, b) => a.percent - b.percent);
  }, [projects, tasksByProject]);

  return (
    <div className={` ${className || ""}`}>
      {/* Header */}
      <div className="flex items-end justify-between px-5 pt-4 pb-2">
        <div>
          <h3 className="text-sm font-medium outfit">Project Progress Overview</h3>
          <p className="text-xs text-muted-foreground spacemono">Completion rates across department projects</p>
        </div>
      </div>

      {/* List (scrollable, max 4 visible) */}
      <div className="px-5 pt-2 pb-4">
        {(() => {
          const ROW_H = 54; // approximate per-row height including labels and bar
          const maxVisible = 4;
          const maxHeight = ROW_H * maxVisible;
          return (
            <div className="space-y-3 overflow-y-auto tag-selector-scroll pr-1" style={{ maxHeight }}>
          {items.map((item, idx) => {
            const tone =
              item.percent >= 80
                ? "from-emerald-500 to-emerald-400"
                : item.percent >= 50
                ? "from-amber-500 to-amber-400"
                : "from-rose-500 to-rose-400";

            const width = `${Math.max(0, Math.min(100, item.percent))}%`;

            return (
              <div key={item.id} className="group mt-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Optional color dot from project color for identity */}
                    {item.color && (
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color, borderColor: "transparent" }}
                      />
                    )}
                    <span className="text-sm truncate">{item.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {item.percent}%
                  </div>
                </div>

                {/* Progress Track */}
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden mt-3">
                  <div
                    className={
                      `h-1.5 rounded-full bg-gradient-to-r ${tone} shadow-sm transition-all duration-700 ease-out` +
                      " group-hover:shadow-md"
                    }
                    style={{ width }}
                  />
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="text-xs text-muted-foreground py-4">No projects to display.</div>
          )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default ProjectProgressOverview;
