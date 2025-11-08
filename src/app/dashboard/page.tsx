"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MCPAlertsWidget, MCPStatsCards } from "@/components/MCPAlertsWidget";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [collegeName, setCollegeName] = useState<string | null>(null);

  useEffect(() => {
    if (!user && !loading) {
      router.push("/login");
      return;
    }
    const run = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.data();
        if (data?.collegeName) {
          setCollegeName(data.collegeName as string);
        } else {
          router.push("/onboarding");
          return;
        }
      } catch (e) {
        console.error("Dashboard load error", e);
      } finally {
        setIsLoading(false);
      }
    };
    run();
  }, [user, loading, router]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="montserrat text-3xl font-bold tracking-tight">
          {collegeName ? `Welcome to ${collegeName}` : "Dashboard"}
        </h1>
        <p className="spacemono text-muted-foreground mt-2">
          Real-time updates powered by MCP
        </p>
      </header>

      {/* MCP Live Stats */}
      <div className="mb-6">
        <MCPStatsCards />
      </div>

      {/* MCP Alerts Widget */}
      <div className="mb-6">
        <MCPAlertsWidget />
      </div>

      {/* Original Static Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="montserrat">Total Projects</CardTitle>
            <CardDescription className="outfit">Projects</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="spacemono text-3xl font-bold">0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="montserrat">Total Tasks</CardTitle>
            <CardDescription className="outfit">Tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="spacemono text-3xl font-bold">0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="montserrat">Members</CardTitle>
            <CardDescription className="outfit">People</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="spacemono text-3xl font-bold">1</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
