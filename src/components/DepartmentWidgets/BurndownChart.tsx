"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
} from "recharts";

export type BurndownPoint = {
  date?: Date | string;
  label?: string;
  remaining: number;
  ideal?: number;
  scope?: number;
};

export type BurndownChartProps = {
  title?: string;
  height?: number;
  data: BurndownPoint[];
  showIdeal?: boolean;
  startRemaining?: number; // if provided, compute ideal from this value when not present in points
  className?: string;
  // Optional multi-series for Detailed view
  series?: Array<{
    id: string;
    name?: string;
    color?: string;
    data: BurndownPoint[];
  }>;
};

const COLORS = {
  actual: "#ff0059", // hot neon pink
  actualDot: "#ff7aa5",
  ideal: "#00f5ff", // neon cyan
  scope: "#b800ff", // neon purple
};

function toLabel(x?: string | Date, idx?: number) {
  // prefer a stable 3-letter month abbreviation to save horizontal space (e.g. 'Sep' not 'Sept')
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  if (!x && typeof idx === "number") return `D${idx + 1}`;
  const makeLabel = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

  if (x instanceof Date) return makeLabel(x);
  if (!x) return "";
  // try parse date-like input
  const d = new Date(x);
  if (!isNaN(d.getTime())) return makeLabel(d);
  return String(x);
}

const NeonTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const remaining = payload.find((p: any) => p.dataKey === "remaining");
  const ideal = payload.find((p: any) => p.dataKey === "ideal");
  const scope = payload.find((p: any) => p.dataKey === "scope");
  return (
    <div
      className="spacemono"
      style={{
        background: "rgba(15,15,20,0.95)",
        color: "#E5E7EB",
        padding: "8px 10px",
        fontSize: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {remaining && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ height: 8, width: 8, borderRadius: 9999, background: COLORS.actual }} />
          <span>Remaining</span>
          <span style={{ marginLeft: "auto" }}><strong>{remaining.value}</strong></span>
        </div>
      )}
      {ideal && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.85 }}>
          <span style={{ height: 8, width: 8, borderRadius: 9999, background: COLORS.ideal }} />
          <span>Ideal</span>
          <span style={{ marginLeft: "auto" }}><strong>{ideal.value}</strong></span>
        </div>
      )}
      {scope && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.85 }}>
          <span style={{ height: 8, width: 8, borderRadius: 9999, background: COLORS.scope }} />
          <span>Scope</span>
          <span style={{ marginLeft: "auto" }}><strong>{scope.value}</strong></span>
        </div>
      )}
    </div>
  );
};

export default function BurndownChart({
  title = "Burndown",
  height = 240,
  data,
  showIdeal = true,
  startRemaining,
  className,
  series = [],
}: BurndownChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme || "dark") === "dark";
  const axisColor = isDark ? "#9CA3AF" : "#6B7280"; // gray-400/600
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const tooltipBg = isDark ? "rgba(15,15,20,0.95)" : "rgba(255,255,255,0.97)";
  const tooltipText = isDark ? "#1F2937" : "#111827"; // not used heavily; using light text below
  const tooltipColor = isDark ? "#E5E7EB" : "#111827";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const [mode, setMode] = useState<"overview" | "detailed">("overview");
  const processed = useMemo(() => {
    if (!data || data.length === 0) return [] as Array<Record<string, any>>;
    // Find the first day in the window when scope actually appears (> 0)
    const startIdxAuto = data.findIndex((p) => (p?.remaining ?? 0) > 0);
    const startIdx = startIdxAuto >= 0 ? startIdxAuto : 0;
    // Use provided startRemaining if given, else use remaining at the first activity day
    const firstRemaining =
      typeof startRemaining === "number"
        ? startRemaining
        : data[startIdx]?.remaining ?? 0;
    // Compute slope only from startIdx to the end of the window
    const n = Math.max(1, data.length - 1 - startIdx);

    return data.map((d, idx) => {
      // Prefer computing from the date for consistent 3-letter months (e.g., 'Sep'),
      // fall back to provided label only if date is missing.
      const label = d.date ? toLabel(d.date, idx) : toLabel(d.label, idx);
      let ideal: number | undefined;
      if (typeof d.ideal === "number") {
        ideal = d.ideal;
      } else if (showIdeal) {
        // Before scope starts, don't render an ideal; from startIdx onward, linearly descend to 0 by window end
        ideal = idx < startIdx ? undefined : Math.max(0, firstRemaining * (1 - (idx - startIdx) / n));
      }
      return {
        label,
        remaining: d.remaining,
        ideal,
        scope: typeof d.scope === "number" ? d.scope : undefined,
      };
    });
  }, [data, showIdeal, startRemaining]);

  const yMax = useMemo(() => {
    const singleVals = processed.flatMap((p) => [p.remaining ?? 0, p.ideal ?? 0, p.scope ?? 0]);
    const detailedVals = series.flatMap((s) => s.data.map((d) => d.remaining ?? 0));
    const vals = [...singleVals, ...detailedVals];
    return Math.max(1, ...vals);
  }, [processed, series]);

  // Fixed Y axis: 0..top in steps of 4 (so 12 appears when max=14 -> top=16)
  const { yTop, yTicks } = useMemo(() => {
    const top = Math.max(4, Math.ceil(yMax / 4) * 4);
    const ticks = Array.from({ length: top / 4 + 1 }, (_, i) => i * 4);
    return { yTop: top, yTicks: ticks };
  }, [yMax]);

  const tooltipContent = useCallback((props: any) => {
    const { active, payload, label } = props || {};
    if (!active || !payload?.length) return null;
    const remaining = payload.find((p: any) => p.dataKey === "remaining");
    const ideal = payload.find((p: any) => p.dataKey === "ideal");
    // In detailed mode payload keys will be series ids; show first two lines
    const lines = payload.slice(0, 6);
    return (
      <div
        className="spacemono dark:bg-black/20 backdrop-blur-xl"
        style={{
          background: tooltipBg,
          color: tooltipColor,
          
          padding: "8px 10px",
          fontSize: 12,
          border: `1px solid ${tooltipBorder}`,
          borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {remaining && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ height: 8, width: 8, borderRadius: 9999, background: COLORS.actual }} />
            <span>Remaining</span>
            <span style={{ marginLeft: "auto" }}><strong>{remaining.value}</strong></span>
          </div>
        )}
        {ideal && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.85 }}>
            <span style={{ height: 8, width: 8, borderRadius: 9999, background: COLORS.ideal }} />
            <span>Ideal</span>
            <span style={{ marginLeft: "auto" }}><strong>{ideal.value}</strong></span>
          </div>
        )}
        {!remaining && !ideal && lines?.length > 0 && (
          <div style={{ display: "grid", gap: 4 }}>
            {lines.map((l: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ height: 8, width: 8, borderRadius: 9999, background: l.color }} />
                <span>{l.name || l.dataKey}</span>
                <span style={{ marginLeft: "auto" }}><strong>{l.value}</strong></span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [tooltipBg, tooltipColor, tooltipBorder]);

  return (
    <div className={`w-full mt-2 px-2 pb-4 ${className || ""}`}>
      <div className="mb-2 px-0 flex items-end justify-between">
        <h3 className="text-lg font-medium tracking-tight spacemono">{title}</h3>
        {/* Tabs on extreme right */}
        <div className="ml-auto flex items-center gap-4 text-xs spacemono">
          <button
            className={`opacity-80 hover:opacity-100 transition ${mode === "overview" ? "text-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("overview")}
          >
            Overview
          </button>
          <span className="opacity-40">|</span>
          <button
            className={`opacity-80 hover:opacity-100 transition ${mode === "detailed" ? "text-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("detailed")}
          >
            Detailed
          </button>
        </div>
      </div>
      <div style={{ height }} className="rounded-md overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={
              mode === "overview"
                ? processed
                : // Build combined frame for multi-series: assume equal length arrays; use first series labels as base
                  (() => {
                    const maxLen = Math.max(0, ...series.map((s) => s.data.length));
                    const buildLabel = (sIdx: number, pIdx: number) => {
                      const d = series[sIdx]?.data[pIdx];
                      return toLabel(d?.date ?? d?.label, pIdx);
                    };
                    const baseLabels = Array.from({ length: maxLen }).map((_, i) => buildLabel(0, i));
                    return baseLabels.map((label, i) => {
                      const obj: Record<string, any> = { label };
                      series.forEach((s, si) => {
                        const key = s.id || `s${si}`;
                        const dp = s.data[i];
                        obj[key] = dp ? dp.remaining ?? 0 : undefined;
                      });
                      return obj;
                    });
                  })()
            }
            margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
          >
            {/* Gradient for subtle area fill (no glow filters) */}
            <defs>
              <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.actual} stopOpacity={0.18} />
                <stop offset="100%" stopColor={COLORS.actual} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="label"
              tick={{ fill: axisColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={1} // show every other day (alternate days)
              scale="point"
              padding={{ left: 12, right: 12 }}
              tickMargin={14}
            />
            <YAxis
              tick={{ fill: axisColor, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
              allowDecimals={false}
              domain={[0, yTop]}
              ticks={yTicks}
            />

            {/* Ideal line (cyan) - only in Overview */}
            {mode === "overview" && showIdeal && (
              <Line
                type="monotone"
                dataKey="ideal"
                stroke={COLORS.ideal}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                strokeOpacity={0.9}
              />
            )}

            {/* Area under actual remaining – only in Overview */}
            {mode === "overview" && (
              <Area
                type="monotone"
                dataKey="remaining"
                stroke="none"
                fill="url(#actualFill)"
                fillOpacity={0.9}
                isAnimationActive={false}
              />
            )}

            {/* Lines */}
            {mode === "overview" ? (
              <Line
                type="monotone"
                dataKey="remaining"
                stroke={COLORS.actual}
                strokeWidth={3}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : (
              // Detailed: multiple project lines
              series.map((s, idx) => (
                <Line
                  key={s.id || idx}
                  type="monotone"
                  dataKey={s.id || `s${idx}`}
                  name={s.name || s.id || `Series ${idx + 1}`}
                  stroke={s.color || ["#ff0059", "#00f5ff", "#b800ff", "#60a5fa", "#a78bfa", "#f59e0b"][idx % 6]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))
            )}

            <Tooltip content={tooltipContent} wrapperStyle={{ outline: "none" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      {mode === "overview" ? (
        <div className="flex items-center gap-3 mt-4 text-[10px] text-muted-foreground select-none spacemono">
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 rounded-sm" style={{ background: COLORS.actual }} /> Remaining
          </span>
          {showIdeal && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded-sm" style={{ background: COLORS.ideal }} /> Ideal
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-[10px] text-muted-foreground select-none spacemono">
          {series.map((s, idx) => (
            <span key={s.id || idx} className="flex items-center gap-1">
              <span
                className="h-2 w-4 rounded-sm"
                style={{ background: s.color || ["#ff0059", "#00f5ff", "#b800ff", "#60a5fa", "#a78bfa", "#f59e0b"][idx % 6] }}
              />
              {s.name || s.id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
