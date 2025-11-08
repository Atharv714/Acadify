"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import type { Project, Task } from "@/lib/types";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export type Props = {
  projects: Project[];
  tasks?: Pick<Task, "id" | "name" | "status" | "projectId">[];
  className?: string;
};

type StatusKey = "todo" | "in_progress" | "in_review" | "blocked" | "completed";

function toStatusSlug(s: string | undefined | null): StatusKey | "other" {
  const raw = (s || "").toString().trim().toLowerCase();
  if (raw === "completed") return "completed";
  if (raw === "blocked") return "blocked";
  if (raw === "in review" || raw === "in_review") return "in_review";
  if (raw === "in progress" || raw === "in_progress") return "in_progress";
  if (raw === "to do" || raw === "todo") return "todo";
  return "other";
}

const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  todo: { label: "To Do", color: "#94a3b8" },
  in_progress: { label: "In Progress", color: "#60a5fa" },
  in_review: { label: "In Review", color: "#a78bfa" },
  blocked: { label: "Blocked", color: "#f87171" },
  completed: { label: "Completed", color: "#34d399" },
};

const PROJECT_PALETTE = [
  "#10b981",
  "#22c55e",
  "#06b6d4",
  "#60a5fa",
  "#6366f1",
  "#a78bfa",
  "#f472b6",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
];

export default function StatusDonut({ projects, tasks = [], className }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme || "dark") === "dark";
  const [drill, setDrill] = useState<StatusKey | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // mounted controls the load animation
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // animate on next frame for reliable CSS transition
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const projectNameById = useMemo(() => new Map(projects.map(p => [p.id, p.name] as const)), [projects]);

  const { statusCounts, byProjectPerStatus, totalCount } = useMemo(() => {
    const counts: Record<StatusKey, number> = { todo: 0, in_progress: 0, in_review: 0, blocked: 0, completed: 0 };
    const per: Record<StatusKey, Map<string, number>> = {
      todo: new Map(),
      in_progress: new Map(),
      in_review: new Map(),
      blocked: new Map(),
      completed: new Map(),
    };

    for (const t of tasks) {
      const key = toStatusSlug((t as any).status);
      if (key === "other") continue;
      counts[key]++;
      const pid = (t as any).projectId || "unknown";
      per[key].set(pid, (per[key].get(pid) || 0) + 1);
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { statusCounts: counts, byProjectPerStatus: per, totalCount: total };
  }, [tasks]);

  const mainData = useMemo(() => {
    return (Object.keys(STATUS_META) as StatusKey[])
      .map((k) => ({ key: k, name: STATUS_META[k].label, value: statusCounts[k], color: STATUS_META[k].color }))
      .filter((d) => d.value > 0);
  }, [statusCounts]);

  const drillData = useMemo(() => {
    if (!drill) return [] as { key: string; name: string; value: number; color: string }[];
    return Array.from(byProjectPerStatus[drill].entries())
      .filter(([_, v]) => v > 0)
      .map(([pid, v], idx) => ({
        key: pid,
        name: projectNameById.get(pid) || "Unknown",
        value: v,
        color: PROJECT_PALETTE[idx % PROJECT_PALETTE.length],
      }));
  }, [drill, byProjectPerStatus, projectNameById]);

  const centerTitle = drill ? STATUS_META[drill].label : "All Tasks";
  const centerValue = drill ? drillData.reduce((a, b) => a + b.value, 0) : totalCount;

  const onSliceClick = (payload: any) => {
    if (!payload) return;
    const k: StatusKey | undefined = payload?.payload?.key;
    if (!k) return;
    setDrill((prev) => (prev === k ? null : k));
  };

  const onPieEnter = (_: any, index: number) => setActiveIndex(index);
  const onPieLeave = () => setActiveIndex(-1);

  const currentData = drill ? drillData : mainData;
  const activeKey = activeIndex >= 0 && activeIndex < currentData.length ? currentData[activeIndex]?.key : null;

  // configuration: tweak these to change timing/strength
  const loadRotationDeg = -90; // start rotation (deg) and rotate to 0
  const loadRotationDuration = 850; // ms
  const loadScaleDuration = 850; // ms; matches rotation for consistent feel
  const hoverScale = 1.06;
  const shrinkScale = 0.96;

  return (
    <div className={`px-5 pt-4 pb-2 ${className || ""}`}>
      <div className="flex items-end justify-between mb-2">
        <div className="font-medium spacegrot">Task Status Overview</div>
        {drill && (
          <button className="text-xs text-muted-foreground hover:underline" onClick={() => setDrill(null)}>
            Back
          </button>
        )}
      </div>

      <div className="relative" onMouseLeave={() => setActiveIndex(-1)}>
        <div className="h-[220px]">
          {/* wrapper to animate rotation on mount */}
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              transform: `rotate(${mounted ? 0 : loadRotationDeg}deg)`,
              transition: `transform ${loadRotationDuration}ms cubic-bezier(.2,.9,.2,1)`,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={currentData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={68}
                  outerRadius={94}
                  paddingAngle={4}
                  cornerRadius={8}
                  onClick={drill ? undefined : onSliceClick}
                  // keep recharts animation off to avoid replacing nodes on hover
                  isAnimationActive={false}
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                >
                  {currentData.map((entry, idx) => {
                    const isHovered = activeIndex === idx;
                    const noHover = activeIndex === -1;

                    // If not mounted yet, start near-zero so CSS transition animates to the target scale
                    const mountScale = mounted ? 1 : 0.001;

                    // hovered/non-hovered final target scales
                    const finalScale = noHover ? 1 : isHovered ? hoverScale : shrinkScale;

                    // combine mount state and final hover state:
                    const scale = mountScale * finalScale;

                    const opacity = noHover ? 1 : isHovered ? 1 : 0.45;

                    return (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.color}
                        stroke="transparent"
                        strokeWidth={2}
                        className="recharts-custom-cell"
                        style={{
                          transformBox: "fill-box",
                          transformOrigin: "center center",
                          WebkitTransformOrigin: "center center",
                          // long transition for initial mount (loadScaleDuration) + smooth hover (short)
                          transition: `transform ${Math.max(loadScaleDuration, 10)}ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease`,
                          willChange: "transform, opacity",
                          transform: `scale(${scale})`,
                          opacity,
                          cursor: drill ? "default" : "pointer",
                        }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseLeave={() => setActiveIndex(-1)}
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none spacemono">
          <div className="text-center">
            <div className="text-xl font-semibold" style={{ color: isDark ? undefined : "#111827" }}>{centerValue}</div>
            <div className="text-xs text-muted-foreground" style={{ color: isDark ? undefined : "#374151" }}>{centerTitle}</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs pb-4 spacemono">
        {currentData.map((d, idx) => (
          <button
            key={d.key}
            onMouseEnter={() => setActiveIndex(idx)}
            onMouseLeave={() => setActiveIndex(-1)}
            onClick={() => (!drill ? setDrill(d.key as StatusKey) : undefined)}
            className={`flex items-center gap-2 transition-opacity duration-10 ${!drill ? "hover:opacity-80" : "cursor-default"} ${activeKey && d.key !== activeKey ? "opacity-40" : "opacity-100"}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color, boxShadow: isDark ? undefined : "inset 0 0 0 0.5px rgba(0,0,0,0.05)", borderColor: "transparent" }} />
            <span className="truncate">{d.name}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{d.value}</span>
          </button>
        ))}
      </div>

      {!drill && mainData.length === 0 && (
        <div className="text-xs text-muted-foreground py-3">No tasks to display.</div>
      )}
    </div>
  );
}
