import React from "react";
import WidgetShell from "./WidgetShell";

type MetricCardProps = {
  title: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

const toneStyles: Record<NonNullable<MetricCardProps["tone"]>, { value: string; ring: string }> = {
  default: { value: "text-foreground", ring: "" },
  success: { value: "text-emerald-400", ring: "" },
  warning: { value: "text-amber-400", ring: "" },
  danger: { value: "text-red-400", ring: "" },
};

export function MetricCard({ title, value, hint, tone = "default" }: MetricCardProps) {
  const toneStyle = toneStyles[tone];
  return (
    <WidgetShell title={title} description={hint}>
      <div className={`text-3xl font-semibold tabular-nums ${toneStyle.value}`}>{value}</div>
    </WidgetShell>
  );
}

export default MetricCard;
