import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { toast } from 'sonner';

export interface Alert {
  type: 'deadline' | 'missed' | 'new_assignment' | 'email';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  courseName?: string;
  dueDate?: string;
  link?: string;
  timestamp: Date;
  read: boolean;
}

export interface DashboardStats {
  assignments: {
    total: number;
    due: number;
    missed: number;
    completed: number;
  };
  emails: {
    total: number;
    unread: number;
  };
  alerts: Alert[];
}

/**
 * Hook for real-time dashboard updates via MCP server
 * Listens to Firestore changes and provides live stats
 */
export function useMCPDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    assignments: { total: 0, due: 0, missed: 0, completed: 0 },
    emails: { total: 0, unread: 0 },
    alerts: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for assignments
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Listen to all courseWorkMeta across courses
      const assignmentsQuery = query(
        collection(db, 'users', user.uid, 'classroomCourses')
      );

      const unsubscribe = onSnapshot(assignmentsQuery, async (coursesSnapshot) => {
        let allAssignments: any[] = [];

        // For each course, listen to courseWorkMeta
        for (const courseDoc of coursesSnapshot.docs) {
          const courseWorkQuery = query(
            collection(db, 'users', user.uid, 'classroomCourses', courseDoc.id, 'courseWorkMeta'),
            orderBy('updatedAt', 'desc')
          );

          const cwSnapshot = await new Promise<any>((resolve) => {
            onSnapshot(courseWorkQuery, resolve);
          });

          allAssignments = [...allAssignments, ...cwSnapshot.docs.map((d: any) => d.data())];
        }

        // Calculate stats
        const due = allAssignments.filter(a => a.state === 'Due').length;
        const missed = allAssignments.filter(a => a.state === 'Missed').length;
        const completed = allAssignments.filter(a => a.state === 'Completed').length;

        setStats(prev => ({
          ...prev,
          assignments: {
            total: allAssignments.length,
            due,
            missed,
            completed,
          },
        }));

        // Generate alerts for upcoming deadlines
        const alerts: Alert[] = [];
        const now = new Date();
        
        allAssignments.forEach(assignment => {
          if (assignment.dueDate && assignment.state === 'Due') {
            const dueDate = new Date(assignment.dueDate);
            const hoursDiff = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

            if (hoursDiff > 0 && hoursDiff <= 24) {
              alerts.push({
                type: 'deadline',
                severity: hoursDiff <= 6 ? 'critical' : 'high',
                title: `${assignment.title} due soon`,
                message: `Due in ${Math.round(hoursDiff)} hours`,
                courseName: assignment.courseName,
                dueDate: assignment.dueDate,
                link: assignment.alternateLink,
                timestamp: new Date(),
                read: false,
              });
            }
          }

          if (assignment.state === 'Missed') {
            alerts.push({
              type: 'missed',
              severity: 'critical',
              title: `Missed: ${assignment.title}`,
              message: `This assignment was due on ${new Date(assignment.dueDate).toLocaleDateString()}`,
              courseName: assignment.courseName,
              link: assignment.alternateLink,
              timestamp: new Date(),
              read: false,
            });
          }
        });

        setStats(prev => ({ ...prev, alerts }));
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  // Real-time listener for emails
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const emailsQuery = query(
        collection(db, 'users', user.uid, 'gmail', 'messages', 'list'),
        orderBy('updatedAt', 'desc'),
        limit(50)
      );

      const unsubscribe = onSnapshot(emailsQuery, (snapshot) => {
        const emails = snapshot.docs.map(d => d.data());
        const unread = emails.filter(e => e.labelIds?.includes('UNREAD')).length;

        setStats(prev => ({
          ...prev,
          emails: {
            total: emails.length,
            unread,
          },
        }));

        // Check for new academic emails
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const email = change.doc.data();
            if (email.isAcademic && email.labelIds?.includes('UNREAD')) {
              toast.info(`New academic email: ${email.subject}`, {
                action: {
                  label: 'View',
                  onClick: () => window.location.href = `/dashboard/inbox/${email.id}`,
                },
              });
            }
          }
        });
      });

      return () => unsubscribe();
    } catch (err: any) {
      console.error('Email listener error:', err);
    }
  }, []);

  // Show toast notifications for alerts
  useEffect(() => {
    stats.alerts.forEach(alert => {
      if (!alert.read && alert.severity === 'critical') {
        toast.error(alert.title, {
          description: alert.message,
          action: alert.link ? {
            label: 'Open',
            onClick: () => window.open(alert.link, '_blank'),
          } : undefined,
        });
      }
    });
  }, [stats.alerts]);

  const refreshData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);
    try {
      // Trigger a manual refresh by calling your API
      // This would call the MCP server tools via an API route
      const response = await fetch('/api/mcp/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (!response.ok) throw new Error('Refresh failed');
      
      toast.success('Dashboard refreshed');
    } catch (err: any) {
      toast.error('Failed to refresh: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    stats,
    loading,
    error,
    refreshData,
  };
}
