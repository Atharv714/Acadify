"use client";

import React, { useMemo } from "react";
import { useTheme } from "next-themes";
import type { AppUser, Task } from "@/lib/types";
import { ResponsiveHeatMap } from "@nivo/heatmap";

type HeatTask = Pick<Task, "assignedUserIds" | "dueDate" | "status">;

type Props = {
  members: AppUser[];
  tasks: HeatTask[];
  days?: number; // number of days to show from startDate (default 7)
  startDate?: Date; // default: start of current week (Monday)
  title?: string;
};

function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday=0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function coerceDate(x: any): Date | null {
  if (!x) return null;
  if (x instanceof Date) return x;
  if (typeof x?.toDate === "function") return x.toDate();
  return null;
}

export default function FluoroWorkloadHeatmap({
  members,
  tasks,
  days = 7,
  startDate,
  title = "Team workload heatmap",
}: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme || "dark") === "dark";
  const axisColor = isDark ? "#9CA3AF" : "#6B7280"; // gray-400/600
  const emptyCell = isDark ? "#0a0007" : "#f8fafc"; // slate-50 backdrop for light
  const zeroCell = isDark ? "#0d0b12" : "#f1f5f9"; // very light for zero in light
  const legendStops = isDark
    ? ["#0d0b12", "#1a0013", "#b8004b", "#ff0059", "#ff7aa5"]
    : ["#f1f5f9", "#ffe4ea", "#ff8ab1", "#ff4d83", "#d40064"]; // tuned for light
  const start = useMemo(() => startDate ? startOfWeek(startDate) : startOfWeek(), [startDate]);
  const columns = useMemo(() => {
    return Array.from({ length: days }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        key: toDayKey(d),
        date: d,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
      } as const;
    });
  }, [start, days]);

  const { rows, max } = useMemo(() => {
    // map: memberId -> dayKey -> count of active tasks due that day
    const map = new Map<string, Map<string, number>>();

    const active = tasks.filter((t) => t.status !== ("Completed" as Task["status"]));
    for (const t of active) {
      const due = coerceDate((t as any).dueDate);
      if (!due) continue; // skip tasks without due date
      const dayKey = toDayKey(new Date(due.getFullYear(), due.getMonth(), due.getDate()));
      if (!columns.some((c) => c.key === dayKey)) continue; // only count within window
      const assignees = (t.assignedUserIds || []) as string[];
      if (!assignees.length) continue;
      for (const uid of assignees) {
        if (!map.has(uid)) map.set(uid, new Map());
        const row = map.get(uid)!;
        row.set(dayKey, (row.get(dayKey) || 0) + 1);
      }
    }

    // build rows for members only
    const data = members.map((m) => {
      const row = map.get(m.uid) || new Map();
      const cells = columns.map((c) => ({
        key: c.key,
        value: row.get(c.key) || 0,
      }));
      const total = cells.reduce((a, b) => a + b.value, 0);
      return { uid: m.uid, name: m.displayName || m.email || "Unknown", cells, total };
    });

    const maxVal = Math.max(1, ...data.flatMap((r) => r.cells.map((c) => c.value)));
    return { rows: data, max: maxVal };
  }, [members, tasks, columns]);

  // Transform to Nivo format: [{ id, data: [{ x, y }] }]
  const nivoData = useMemo(() => {
    return rows.map((r) => ({
      id: r.name,
      data: columns.map((c) => {
        const v = r.cells.find((x) => x.key === c.key)?.value || 0;
        return { x: c.label, y: v };
      }),
    }));
  }, [rows, columns]);

  // Dynamic height so rows fit comfortably.
  const chartHeight = useMemo(() => {
    const rowsCount = Math.max(1, rows.length);
    const perRow = 40; // target pixel height per row (including inner padding)
    const padding = 48; // top+bottom + axis area
    const height = rowsCount * perRow + padding;
    return Math.min(Math.max(height, 120), 900);
  }, [rows.length]);
  const leftMargin = useMemo(() => {
    const maxLen = rows.reduce((m, r) => Math.max(m, (r.name || "").length), 0);
    return Math.min(260, Math.max(120, Math.round(maxLen * 7 + 24)));
  }, [rows]);

  return (
    <div className="w-full">
      <div className="mb-1 px-0">
        <h3 className="text-lg font-medium tracking-tight">{title}</h3>
      </div>
      {/* Tiny legend top-right */}
      <div className="flex justify-end items-center gap-2 text-[10px] text-muted-foreground mb-1 pr-1 select-none">
        <span>0</span>
        {legendStops.map((c, i) => (
          <span key={i} className="h-3 w-5 rounded" style={{ backgroundColor: c }} />
        ))}
        <span>{max}</span>
      </div>
      {/* IMPORTANT: keep the `spacemono` class on the wrapper. We set theme.fontFamily = 'inherit' so
          the SVG text inside Nivo will inherit the font-family from this wrapper. Make sure your
          .spacemono CSS actually sets the desired font-family (e.g. `font-family: "Space Mono", monospace;`). */}
      <div style={{ height: chartHeight }} className="spacemono">
  <ResponsiveHeatMap
          // Custom cell using documented props: https://nivo.rocks/heatmap/ (Custom Cell Component)
          cellComponent={(p: any) => {
            const rx = 6;
            const cell = p.cell;
            const value = cell?.value ?? 0;
            const width = cell?.width ?? 0;
            const height = cell?.height ?? 0;
            const x = (cell?.x ?? 0) - width / 2;
            const y = (cell?.y ?? 0) - height / 2;
            const fill = value === 0 ? zeroCell : cell?.color;
            return (
              <g
                transform={`translate(${x}, ${y})`}
                onMouseEnter={p.onMouseEnter}
                onMouseMove={p.onMouseMove}
                onMouseLeave={p.onMouseLeave}
                onClick={p.onClick}
              >
                <rect
                  width={width}
                  height={height}
                  rx={rx}
                  ry={rx}
                  fill={fill}
                  opacity={p.cell?.opacity ?? 1}
                  pointerEvents="all"
                  style={{ cursor: "default" }}
                  stroke="transparent"
                  strokeWidth={0}
                />
              </g>
            );
          }}
          data={nivoData}
          margin={{ top: 8, right: 12, bottom: 22, left: leftMargin }}
          valueFormat=">-.0f"
          colors={{ type: "sequential", colors: isDark ? ["#1a0013", "#ff0059"] : ["#ffe4ea", "#d40064"] }}
          emptyColor={emptyCell}
          borderRadius={6}
          borderColor="transparent"
          xInnerPadding={0.05}
          yInnerPadding={0.1}
          axisTop={null}
          axisRight={null}
          axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: 0 }}
          axisLeft={{ tickSize: 0, tickPadding: 8, tickRotation: 0 }}
          legends={[]}
          enableLabels={false}
          animate={true}
          motionConfig="gentle"
          isInteractive={true}
          hoverTarget="cell"
          activeOpacity={1}
          inactiveOpacity={0.35}
          tooltip={({ cell }: any) => (
            <div
              style={{
                background: isDark ? "rgba(15,15,20,0.95)" : "rgba(255,255,255,0.97)",
                color: isDark ? "#E5E7EB" : "#111827",
                padding: "6px 8px",
                fontSize: 12,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                borderRadius: 6,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                pointerEvents: "none",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{cell.serieId}</div>
              <div>
                {cell.x}: <strong>{cell.value}</strong> task{cell.value === 1 ? "" : "s"}
              </div>
            </div>
          )}
          // theme colors adapt to light/dark
          theme={{
            background: "transparent",
            text: { fontSize: 12, fill: axisColor, fontFamily: "inherit" },
            axis: {
              domain: { line: { stroke: "transparent" } },
              ticks: { line: { stroke: "transparent" }, text: { fill: axisColor, fontFamily: "inherit" } },
              legend: { text: { fill: axisColor, fontFamily: "inherit" } },
            },
            grid: { line: { stroke: "transparent" } },
            tooltip: { container: { background: "transparent", fontFamily: "inherit" } },
          }}

        />
      </div>
    </div>
  );
}
