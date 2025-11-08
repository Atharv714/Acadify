"use client";

import { useMCPDashboard } from "@/hooks/useMCPDashboard";
import { Bell, AlertTriangle, Clock, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function MCPAlertsWidget() {
  const { stats, loading, refreshData } = useMCPDashboard();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Live Alerts
          </CardTitle>
          <CardDescription>Loading real-time updates...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const criticalAlerts = stats.alerts.filter(a => a.severity === 'critical');
  const highAlerts = stats.alerts.filter(a => a.severity === 'high');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Live Alerts
            {stats.alerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {stats.alerts.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Real-time notifications via MCP</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={refreshData}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {stats.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts. You're all caught up! 🎉</p>
        ) : (
          <div className="space-y-3">
            {stats.alerts.slice(0, 5).map((alert, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  alert.severity === 'critical'
                    ? 'border-red-500/50 bg-red-500/5'
                    : alert.severity === 'high'
                    ? 'border-orange-500/50 bg-orange-500/5'
                    : 'border-zinc-200 dark:border-white/10'
                }`}
              >
                <div className="mt-0.5">
                  {alert.type === 'deadline' && <Clock className="h-4 w-4 text-orange-500" />}
                  {alert.type === 'missed' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                  {alert.type === 'email' && <Mail className="h-4 w-4 text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{alert.title}</p>
                    <Badge
                      variant={
                        alert.severity === 'critical'
                          ? 'destructive'
                          : alert.severity === 'high'
                          ? 'default'
                          : 'secondary'
                      }
                      className="text-xs"
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{alert.message}</p>
                  {alert.courseName && (
                    <p className="text-xs opacity-70 mb-2">{alert.courseName}</p>
                  )}
                  {alert.link && (
                    <Link href={alert.link} target="_blank">
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                        Open assignment →
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-6 pt-4 border-t grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.assignments.due}</p>
            <p className="text-xs text-muted-foreground">Due Soon</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500">{stats.assignments.missed}</p>
            <p className="text-xs text-muted-foreground">Missed</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MCPStatsCards() {
  const { stats, loading } = useMCPDashboard();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 w-20 bg-zinc-200 dark:bg-white/10 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-12 bg-zinc-200 dark:bg-white/10 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignments</CardTitle>
          <CardDescription>Live from Classroom</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{stats.assignments.total}</p>
            <div className="flex gap-2 text-xs">
              <span className="text-orange-500">{stats.assignments.due} due</span>
              <span className="text-red-500">{stats.assignments.missed} missed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inbox</CardTitle>
          <CardDescription>Live from Gmail</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{stats.emails.total}</p>
            <span className="text-xs text-blue-500">{stats.emails.unread} unread</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts</CardTitle>
          <CardDescription>MCP Notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{stats.alerts.length}</p>
            <span className="text-xs text-red-500">
              {stats.alerts.filter(a => a.severity === 'critical').length} critical
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
