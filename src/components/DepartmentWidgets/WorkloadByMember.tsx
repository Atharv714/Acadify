import React, { useMemo } from "react";
import type { Project, AppUser } from "@/lib/types";
import WidgetShell from "./WidgetShell";

type Props = { projects: Project[]; members: AppUser[]; limit?: number };

export function WorkloadByMember({ projects, members, limit = 6 }: Props) {
  const { rows, max } = useMemo(() => {
    const map = new Map<string, number>();
    const active = projects.filter((p) => p.status !== "completed");
    for (const p of active) {
      for (const uid of p.assignedUserIds || []) {
        map.set(uid, (map.get(uid) || 0) + 1);
      }
    }
    const data = Array.from(map.entries())
      .map(([uid, count]) => ({
        uid,
        count,
        name:
          members.find((m) => (m as any).uid === uid)?.displayName ||
          members.find((m) => (m as any).uid === uid)?.email ||
          "Unknown",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    return { rows: data, max: Math.max(1, ...data.map((d) => d.count)) };
  }, [projects, members, limit]);

  return (
    <WidgetShell title="Workload by member">
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No active assignments.</div>
        ) : (
          rows.map((r) => (
            <div key={r.uid} className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="truncate">{r.name}</span>
                <span className="tabular-nums text-muted-foreground">{r.count}</span>
              </div>
              <div className="h-2 bg-white/5 rounded">
                <div
                  className="h-2 rounded bg-white/30"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetShell>
  );
}

export default WorkloadByMember;
