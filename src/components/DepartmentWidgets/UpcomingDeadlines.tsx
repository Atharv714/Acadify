import React, { useMemo, useState } from "react";
import type { Project, Task } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

type Props = {
  projects: Project[];
  tasks?: Pick<Task, "id" | "name" | "dueDate" | "priority" | "status" | "projectId">[];
  daysWindow?: number; // how far out to look for upcoming deadlines
  maxItems?: number; // max rows to show
  className?: string;
};

function toDate(d: any | null): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (d instanceof Timestamp) return d.toDate();
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t;
}

function monthShort(d: Date) {
  return d.toLocaleString(undefined, { month: "short" });
}

// Normalize task/project status to a slug: "To Do" -> "todo", "In Progress" -> "in_progress"
function toStatusSlug(s: string | undefined | null): "todo" | "in_progress" | "in_review" | "blocked" | "completed" | "other" {
  const raw = (s || "").toString().trim().toLowerCase();
  if (raw === "completed") return "completed";
  if (raw === "blocked") return "blocked";
  if (raw === "in review" || raw === "in_review") return "in_review";
  if (raw === "in progress" || raw === "in_progress") return "in_progress";
  if (raw === "to do" || raw === "todo") return "todo";
  return "other";
}

// Dynamic Calendar Icon with day number and month label
function CalendarDateIcon({ date, tone }: { date: Date; tone: "danger" | "warn" | "soon" | "ok" }) {
  const day = date.getDate();
  const mon = monthShort(date).toUpperCase();
  const toneMap: Record<typeof tone, { bar: string; ring: string; text: string; bg: string }> = {
    danger: { bar: "bg-red-500", ring: "ring-red-500/25", text: "text-red-600 dark:text-red-300", bg: "bg-red-50/70 dark:bg-red-950/30" },
    warn: { bar: "bg-amber-500", ring: "ring-amber-500/25", text: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50/70 dark:bg-amber-950/30" },
    soon: { bar: "bg-blue-500", ring: "ring-blue-500/25", text: "text-blue-600 dark:text-blue-300", bg: "bg-blue-50/70 dark:bg-blue-950/30" },
    ok: { bar: "bg-emerald-500", ring: "ring-emerald-500/25", text: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-50/70 dark:bg-emerald-950/30" },
  } as const;

  const c = toneMap[tone];
  return (
    <div className={`relative w-11 h-11 rounded-md overflow-hidden ring-1 ${c.ring} shadow-sm flex-shrink-0`}>
      <div className={`absolute inset-x-0 top-0 h-[8px] ${c.bar}`} />
      <div className={"flex flex-col items-center justify-center h-full bg-transparent pt-[2px]"}>
        <div className={`text-[9px] leading-3 mt-[6px] text-black dark:text-white`}>{mon}</div>
        <div className="text-[15px] font-semibold mt-0">{day}</div>
      </div>
    </div>
  );
}

export function UpcomingDeadlines({ projects, tasks = [], daysWindow = 30, maxItems = 3, className }: Props) {
  // Filters and active tab
  const [activeTab, setActiveTab] = useState<"overdue" | "today" | "week" | "upcoming">("overdue");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const allItems = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + daysWindow * 86400000);
    // Build from tasks if provided, else fall back to project due dates
    const projectNameById = new Map(projects.map((p) => [p.id, p.name] as const));
    const projectPriorityById = new Map(projects.map((p) => [p.id, (p.priority || "medium") as "high" | "medium" | "low"] as const));

    const taskRows: Array<{
      id: string;
      name: string;
      dueDate: Date | null;
      priority: "high" | "medium" | "low";
      status: string;
      statusSlug: ReturnType<typeof toStatusSlug>;
      projectId: string;
      projectName: string;
    }> = (tasks || []).map((t) => {
      const dd = toDate(t.dueDate ?? null);
      const pName = projectNameById.get(t.projectId) || "Unknown Project";
      // Normalize task priority to lowercase
      const p = (t.priority || "Medium").toString().toLowerCase() as "high" | "medium" | "low";
      const statusStr = (t.status || "To Do").toString();
      return {
        id: t.id,
        name: t.name,
        dueDate: dd,
        priority: p,
        status: statusStr,
        statusSlug: toStatusSlug(statusStr),
        projectId: t.projectId,
        projectName: pName,
      };
    });

    // If no tasks provided, mirror old behavior using project due dates as pseudo-tasks
    const projectRows = (tasks && tasks.length ? [] : (projects || [])
      .map((p) => {
        const dd = toDate((p as any).dueDate ?? null);
        return dd ? {
          id: p.id,
          name: p.name,
          dueDate: dd,
          priority: (p.priority || "medium") as "high" | "medium" | "low",
          status: p.status,
          statusSlug: toStatusSlug(p.status),
          projectId: p.id,
          projectName: p.name,
        } : null;
      })
      .filter(Boolean)) as typeof taskRows;

    const rows = [...taskRows, ...projectRows];

    const mapped = rows
      .filter((row) => row.dueDate)
      .map((row) => {
        const dd = row.dueDate as Date;
        const ms = dd.getTime() - now.getTime();
        const diffDays = Math.ceil(ms / 86400000);
        const overdue = diffDays < 0 && row.statusSlug !== "completed";
        const dueToday = diffDays === 0;
        const dueTomorrow = diffDays === 1;
        let tone: "danger" | "warn" | "soon" | "ok" = "ok";
        if (overdue) tone = "danger";
        else if (dueToday || dueTomorrow) tone = "warn";
        else if (diffDays <= 7) tone = "soon";

        // Section bucketing
        let section: "overdue" | "today" | "week" | "upcoming" = "upcoming";
        if (overdue) section = "overdue";
        else if (dueToday) section = "today";
        else if (diffDays <= 7) section = "week";
        else section = "upcoming";

        const pr = row.priority;
        const priorityRank = pr === "high" ? 3 : pr === "medium" ? 2 : 1;

        return {
          id: row.id,
          name: row.name,
          status: row.status,
          color: undefined,
          priority: row.priority,
          dd: dd,
          diffDays,
          overdue,
          dueToday,
          dueTomorrow,
          tone,
          section,
          priorityRank,
          projectId: row.projectId,
          projectName: row.projectName,
          statusSlug: row.statusSlug,
        };
      })
      .filter((it) => it.overdue || it.dd <= cutoff);

    return mapped;
  }, [projects, tasks, daysWindow]);

  // Unique lists for filters
  const projectOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const p of projects || []) {
      if (p.id && p.name) set.set(p.id, p.name);
    }
    return Array.from(set.entries());
  }, [projects]);

  const filteredItems = useMemo(() => {
    return allItems.filter((it) => {
      // Project filter
      if (projectFilter !== "all" && it.projectId !== projectFilter) return false;
      // Priority filter
      if (priorityFilter !== "all" && it.priority !== priorityFilter) return false;
      // Status filter: by default (all) exclude completed
      if (statusFilter === "completed") {
        if (it.statusSlug !== "completed") return false;
      } else if (statusFilter !== "all") {
        if (it.statusSlug !== statusFilter) return false;
      } else {
        // all -> exclude completed unless explicitly selected
        if (it.statusSlug === "completed") return false;
      }
      return true;
    });
  }, [allItems, projectFilter, priorityFilter, statusFilter]);

  // Sectioned and sorted results
  const sectioned = useMemo(() => {
    const by: Record<"overdue" | "today" | "week" | "upcoming", typeof filteredItems> = {
      overdue: [],
      today: [],
      week: [],
      upcoming: [],
    };
    for (const it of filteredItems) by[it.section].push(it);

    // Sort within each section: priority desc, then date asc
    const sortFn = (a: typeof filteredItems[number], b: typeof filteredItems[number]) => {
      if (b.priorityRank !== a.priorityRank) return b.priorityRank - a.priorityRank;
      return a.dd.getTime() - b.dd.getTime();
    };
    (by.overdue as any).sort(sortFn);
    (by.today as any).sort(sortFn);
    (by.week as any).sort(sortFn);
    (by.upcoming as any).sort(sortFn);

    // Flatten with order
    const flat = [
      { key: "overdue" as const, label: "Overdue", toneClass: "text-red-500", items: by.overdue },
      { key: "today" as const, label: "Due Today", toneClass: "text-amber-500", items: by.today },
      { key: "week" as const, label: "Due This Week", toneClass: "text-amber-500", items: by.week },
      { key: "upcoming" as const, label: `Upcoming (Next ${daysWindow} Days)`, toneClass: "text-emerald-500", items: by.upcoming },
    ];

    // Do not trim here; show all and let the scroll container control visible rows
    return flat;
  }, [filteredItems, maxItems, daysWindow]);

  // Removed critical summary per request

  return (
    <div className={`${className || ""}`}>
      {/* Header with right-aligned tabs */}
  <div className="flex items-center justify-between px-5 pt-2.5 pb-1.5 gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium outfit">Upcoming Deadlines</h3>
          <p className="text-xs text-muted-foreground spacemono">Overdue, Today, This Week and Next {daysWindow} days</p>
        </div>
        <div className="flex-shrink-0">
          <div className="inline-flex rounded-md border overflow-hidden text-xs">
            {(["overdue","today","week","upcoming"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`px-2.5 py-1 capitalize ${activeTab === k ? "bg-muted" : ""}`}
              >
                {k === "week" ? "This Week" : k}
              </button>
            ))}
          </div>
        </div>
      </div>

  {/* Filters */}
      <div className="pt-4 px-5 pb-2 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Project</span>
          <select
            className="border rounded px-1.5 py-1 bg-background"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">All</option>
            {projectOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Priority</span>
          <select
            className="border rounded px-1.5 py-1 bg-background"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Status</span>
          <select
            className="border rounded px-1.5 py-1 bg-background"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="todo">todo</option>
            <option value="in_progress">in_progress</option>
            <option value="in_review">in_review</option>
            <option value="blocked">blocked</option>
            <option value="completed">completed</option>
          </select>
        </div>
      </div>
      {/* List (Tab filtered) - scrollable, show up to maxItems rows */}
      <div className="px-5 pt-2 pb-4">
        {(() => {
          const ROW_H = 58; // approximate per-row height including padding and icon
          const maxVisible = Math.max(1, maxItems || 3);
          const maxHeight = ROW_H * maxVisible;
          return (
            <div className="space-y-4 overflow-y-auto tag-selector-scroll pr-1" style={{ maxHeight }}>
          {sectioned.every((s) => s.items.length === 0) ? (
            <div className="text-xs text-muted-foreground py-2">No upcoming deadlines.</div>
          ) : (
            sectioned
              .filter((s) => s.key === activeTab)
              .map((section) => (
                section.items.length === 0 ? null : (
                  <div key={section.key}>
                    {section.items.map((item) => {
              const rightLabel = item.overdue
                ? `${Math.abs(item.diffDays)}d overdue`
                : item.dueToday
                  ? "Due today"
                  : item.dueTomorrow
                    ? "Due tomorrow"
                    : `In ${item.diffDays}d`;
              const rightClass = item.overdue
                ? "text-red-500 dark:text-red-300"
                : item.dueToday || item.dueTomorrow
                  ? "text-amber-500 dark:text-amber-300"
                  : "text-muted-foreground";

              return (
                        <div key={item.id} className="group">
                  <div className="flex items-center justify-between w-full max-w-full py-1.5">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CalendarDateIcon date={item.dd} tone={item.tone} />
                      <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate flex items-center gap-2">
                                  <span className="truncate">{item.name}</span>
                                  <span className={`text-[10px] px-1.5 py-[2px] rounded-full border ${item.priority === "high" ? "border-red-500 text-red-500" : item.priority === "medium" ? "border-amber-500 text-amber-500" : "border-emerald-500 text-emerald-500"}`}>
                                    {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Project: {item.projectName} • Priority: {item.priority} • Status: {item.status.replace("_", " ")}
                                </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className={`text-xs tabular-nums ${rightClass}`}>{rightLabel}</div>
                      <div className="text-[10px] text-muted-foreground">{item.dd.toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
                        );
                      })}
                  </div>
                )
              ))
          )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default UpcomingDeadlines;
