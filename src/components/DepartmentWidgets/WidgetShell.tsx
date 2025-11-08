"use client";

import React from "react";
import BaseWidget from "@/components/dashboard/widgets/BaseWidget-v2";
import type { Widget } from "@/components/dashboard/widgets/types";
import { WidgetType } from "@/components/dashboard/widgets/types";

type WidgetShellProps = {
  title: string;
  description?: string;
  className?: string;
  headerClassName?: string;
  metric?: {
    value: string | number;
    change?: number;
    changeType?: "increase" | "decrease" | "neutral";
    period?: string;
  };
  children: React.ReactNode;
};

/**
 * Lightweight wrapper around BaseWidget-v2 to make department widgets
 * visually consistent with the project dashboard widgets.
 */
export default function WidgetShell({
  title,
  description,
  className,
  headerClassName,
  metric,
  children,
}: WidgetShellProps) {
  const widget: Widget = {
    id: `dept-${title.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`,
    type: WidgetType.ProjectStats, // neutral type for generic widgets
    title,
    size: "medium",
  };

  return (
    <BaseWidget
      widget={widget}
      onRemove={() => {}}
      title={title}
      description={description}
      className={className}
      headerClassName={headerClassName}
      metric={metric}
    >
      {children}
    </BaseWidget>
  );
}
