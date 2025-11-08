"use client";

import React, { useMemo } from "react";
import type { Project, Task } from "@/lib/types";
import { ProjectProgressOverview } from "./ProjectProgressOverview";
import { UpcomingDeadlines } from "./UpcomingDeadlines";
import BurndownChart from "./BurndownChart";

type Props = {
  projects: Project[];
  tasksByProject?: Record<string, { status: Task["status"]; isLeaf?: boolean }[]>;
  tasks?: Pick<Task, "id" | "name" | "dueDate" | "priority" | "status" | "projectId">[];
  daysWindow?: number;
  maxItems?: number;
  className?: string;
};

export default function ProjectProgressAndDeadlines({
  projects,
  tasksByProject,
  tasks,
  daysWindow = 30,
  maxItems = 10,
  className,
}: Props) {
  // Build a simple burndown series from provided tasks over the last N days
  const burndownData = useMemo(() => {
    // Remaining at the end of each day within the window, using historical gates.
    // Also compute a dynamic "ideal" that sums linear contributions from each task
    // between its createdAt (start at 1) and its dueDate (reach 0).
    const list = tasks || [];
    const days = Math.max(7, Math.min(30, Math.floor(daysWindow || 7)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const toDate = (x: any): Date | null => {
      if (!x) return null;
      if (x instanceof Date) return x;
      if (typeof x?.toDate === "function") return x.toDate();
      const d = new Date(x);
      return isNaN(d.getTime()) ? null : d;
    };

    const isActiveOn = (t: any, day: Date) => {
      // createdAt gate
      const created = toDate(t.createdAt);
      if (created) {
        const cd = new Date(created);
        cd.setHours(0, 0, 0, 0);
        if (cd.getTime() > day.getTime()) return false; // not yet created
      }
      // completedAt gate (actuals only; ideal ignores completion)
      const completed = toDate(t.completedAt);
      if (completed) {
        const comp = new Date(completed);
        comp.setHours(0, 0, 0, 0);
        if (comp.getTime() <= day.getTime()) return false; // already completed by end of day
      } else if ((t.status || "").toString().toLowerCase() === "completed") {
        // If marked completed but missing completedAt, treat as not remaining for all days
        return false;
      }
      // dueDate filter (preserve previous semantics): if dueDate exists and is before the day, exclude
      const due = toDate(t.dueDate);
      if (due) {
        const dd = new Date(due);
        dd.setHours(0, 0, 0, 0);
        if (dd.getTime() < day.getTime()) return false;
      }
      return true;
    };

    // Precompute the date buckets for the window
    const daysArr: Date[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);
      daysArr.push(d);
    }
    const windowStart = daysArr[0];
    const windowEnd = daysArr[daysArr.length - 1];

    const idealContribution = (t: any, day: Date) => {
      // Ideal ignores actual completion; it’s the target trajectory.
      const c0 = toDate(t.createdAt) || windowStart;
      const d0 = toDate(t.dueDate) || windowEnd;
      const start = new Date(Math.max(windowStart.getTime(), c0.getTime()));
      const end = new Date(Math.max(start.getTime(), d0.getTime()));
      // If end == start, treat as immediate deadline; contribution drops to ~0 on that day
      const denom = Math.max(1, end.getTime() - start.getTime());
      if (day.getTime() < start.getTime()) return 0; // not in scope yet
      if (day.getTime() >= end.getTime()) return 0; // should be done by deadline
      const frac = 1 - (day.getTime() - start.getTime()) / denom;
      return Math.max(0, Math.min(1, frac));
    };

    const points: { date: Date; label: string; remaining: number; ideal?: number }[] = [];
    for (const d of daysArr) {
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const remaining = list.filter((t) => isActiveOn(t, d)).length;
      // Sum task-level linear decays from createdAt to dueDate
      const ideal = list.reduce((acc, t) => acc + idealContribution(t, d), 0);
      points.push({ date: d, label, remaining, ideal });
    }
    return points;
  }, [tasks, daysWindow]);

  // Detailed mode series: one line per project
  const burndownSeries = useMemo(() => {
    const list = tasks || [];
    const days = Math.max(7, Math.min(30, Math.floor(daysWindow || 7)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const toDate = (x: any): Date | null => {
      if (!x) return null;
      if (x instanceof Date) return x;
      if (typeof x?.toDate === "function") return x.toDate();
      const d = new Date(x);
      return isNaN(d.getTime()) ? null : d;
    };
    const isActiveOn = (t: any, day: Date) => {
      const created = toDate(t.createdAt);
      if (created) {
        const cd = new Date(created);
        cd.setHours(0, 0, 0, 0);
        if (cd.getTime() > day.getTime()) return false;
      }
      const completed = toDate(t.completedAt);
      if (completed) {
        const comp = new Date(completed);
        comp.setHours(0, 0, 0, 0);
        if (comp.getTime() <= day.getTime()) return false;
      } else if ((t.status || "").toString().toLowerCase() === "completed") {
        return false;
      }
      const due = toDate(t.dueDate);
      if (due) {
        const dd = new Date(due);
        dd.setHours(0, 0, 0, 0);
        if (dd.getTime() < day.getTime()) return false;
      }
      return true;
    };

    // Pre-compute the date buckets for the window
    const daysArr: Date[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      daysArr.push(d);
    }

    // Group tasks by projectId
    const byProject = new Map<string, typeof list>();
    for (const t of list) {
      const pid = (t as any).projectId as string | undefined;
      if (!pid) continue;
      const arr = byProject.get(pid) || [];
      arr.push(t as any);
      byProject.set(pid, arr);
    }

    // Build series for each known project (preserves names/colors externally)
    return Array.from(byProject.entries()).map(([pid, arr]) => {
      const proj = projects.find((p) => p.id === pid);
      const data = daysArr.map((d) => {
        const remaining = arr.filter((t) => isActiveOn(t, d)).length;
        return { date: d, remaining };
      });
      return { id: pid, name: proj?.name || pid, data };
    });
  }, [tasks, daysWindow, projects]);

  return (
    <div className={`w-full relative ${className || ""}`}>
      {/* Full-bleed bottom border only (pure) */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 w-screen border-b-1" />

      {/* Full-height vertical divider positioned at column boundary on large screens (pure) */}
      <div className="pointer-events-none hidden lg:block absolute top-0 bottom-0 left-[calc(50%-0.75rem)] border-r-1" />

      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        {/* Left: Project Progress Overview */}
        <div>
          <ProjectProgressOverview projects={projects} tasksByProject={tasksByProject} />
        </div>

        {/* Right: Burndown Chart replacing Upcoming Deadlines */}
        <div className="px-1">
          <BurndownChart
            title="Sprint Burndown"
            data={burndownData}
            showIdeal
            startRemaining={burndownData[0]?.remaining ?? 0}
            height={220}
            series={burndownSeries}
          />
        </div>
      </div>
    </div>
  );
}
