"use client";

import React, { useState, useMemo } from "react"; // Added useMemo back
import DashboardGrid from "./widgets/DashboardGrid-v2"; // Updated to use v2 component
import {
  Widget,
  WidgetType,
  ProjectProgressData, // Ensure this is imported
  ProjectTaskStatusDistributionItem, // Import this type
  TaskStatusData,
  SprintBurndownData,
  PriorityHeatmapData,
  ProjectStatsData,
  DailyTaskCompletionData, // Corrected: Was DailyTaskCompletionDataPoint
  AssigneeWorkloadData,
  OverdueTaskItem,
  UpcomingDeadlineItem,
  TimeToDeadlineData,
  WidgetSize,
} from "./widgets/types";
import { Project, Task } from "@/lib/types"; // Import Project and Task types
import { v4 as uuidv4 } from "uuid"; // Ensure uuidv4 import is present

//taskstatusdistribution v2
type WidgetTaskStatusName =
  | "To Do"
  | "In Progress"
  | "Review"
  | "Completed"
  | "Blocked";

interface TaskStatusDistributionItem {
  status: WidgetTaskStatusName;
  count: number;
}

interface ProjectDashboardProps {
  taskStatusDistribution?: TaskStatusDistributionItem[];
  projects?: Project[]; // Added for ProjectProgressWidget-v2
  tasks?: Task[]; // Added for ProjectProgressWidget-v2
}

// Sample Data
const initialWidgets: Widget[] = [
  {
    id: uuidv4(),
    type: WidgetType.ProjectProgress,
    title: "Project Progress",
    size: "medium",
  },
  {
    id: uuidv4(),
    type: WidgetType.TaskStatus,
    title: "Task Status Distribution",
    size: "medium",
  },
  {
    id: uuidv4(),
    type: WidgetType.TimeToDeadline,
    title: "Time to Deadline",
    size: "medium",
  },
  {
    id: uuidv4(),
    type: WidgetType.SprintBurndown,
    title: "Sprint Burndown",
    size: "large",
  },
  {
    id: uuidv4(),
    type: WidgetType.PriorityHeatmap,
    title: "Priority Heatmap",
    size: "large",
  },
  {
    id: uuidv4(),
    type: WidgetType.DailyTaskCompletion,
    title: "Daily Task Completion Trend",
    size: "large",
  },
  {
    id: uuidv4(),
    type: WidgetType.AssigneeWorkload,
    title: "Assignee Workload",
    size: "large",
  },
  {
    id: uuidv4(),
    type: WidgetType.TagDistribution,
    title: "Tag Distribution",
    size: "medium",
  },
  {
    id: uuidv4(),
    type: WidgetType.UpcomingDeadlines,
    title: "Upcoming Deadlines",
    size: "medium",
  },
  {
    id: uuidv4(),
    type: WidgetType.ProjectStats,
    title: "Key Project Stats",
    size: "extra-large",
  },
];

// Placeholder data for widgets - this should eventually come from API/props
const sampleWidgetData: Record<WidgetType, any> = {
  [WidgetType.ProjectProgress]: {
    progress: 75,
    completedTasks: 75,
    totalTasks: 100,
  } as ProjectProgressData,
  [WidgetType.TaskStatus]: {
    // This will be overridden by taskStatusDistribution if provided
    statuses: [
      { status: "To Do", count: 10 }, // Removed color
      { status: "In Progress", count: 20 }, // Renamed "Progress" to "In Progress" & removed color
      { status: "Review", count: 5 }, // Renamed "In Review" to "Review" & removed color
      { status: "Completed", count: 50 }, // Removed color
      { status: "Blocked", count: 3 }, // Removed color
    ],
  } as { statuses: TaskStatusData[] }, // TaskStatusData might need adjustment if it implies color
  [WidgetType.SprintBurndown]: {
    // title: "Sprint 1 Burndown", // Title is part of Widget, not data
    // idealLineLabel: "Ideal",
    // actualLineLabel: "Actual",
    points: [
      { day: "Day 1", remaining: 50, planned: 50 },
      { day: "Day 2", remaining: 48, planned: 45 },
      { day: "Day 3", remaining: 42, planned: 40 },
      { day: "Day 4", remaining: 38, planned: 35 },
      { day: "Day 5", remaining: 30, planned: 30 },
      { day: "Day 6", remaining: 28, planned: 25 },
      { day: "Day 7", remaining: 22, planned: 20 },
      { day: "Day 8", remaining: 18, planned: 15 },
      { day: "Day 9", remaining: 10, planned: 10 },
      { day: "Day 10", remaining: 7, planned: 5 },
      { day: "Day 11", remaining: 0, planned: 0 }, // Ensure last planned point is 0
    ],
    // sprintGoal: "Complete feature X", // Not directly used by chart, can be metadata
    // totalStoryPoints: 50, // Not directly used by chart
  } as SprintBurndownData,
  [WidgetType.PriorityHeatmap]: {
    // title: "Task Heatmap", // Title is part of Widget
    priorities: ["Low", "Medium", "High", "Urgent"],
    statuses: ["To Do", "In Progress", "Blocked", "Completed"],
    items: [
      {
        priority: "High",
        status: "In Progress",
        count: 5,
        tasks: [{ id: "1", name: "Fix critical bug" }],
      },
      {
        priority: "Urgent",
        status: "To Do",
        count: 3,
        tasks: [{ id: "2", name: "Deploy hotfix" }],
      },
      { priority: "Medium", status: "Completed", count: 10 },
      { priority: "Low", status: "In Progress", count: 2 },
      { priority: "High", status: "Blocked", count: 1 },
      { priority: "Medium", status: "To Do", count: 8 },
      { priority: "Low", status: "To Do", count: 12 },
      { priority: "Urgent", status: "Blocked", count: 1 },
      { priority: "Medium", status: "Blocked", count: 2 },
      { priority: "High", status: "Completed", count: 15 },
    ],
  } as PriorityHeatmapData,
  [WidgetType.ProjectStats]: {
    stats: [
      {
        id: "stat-1",
        label: "Total Tasks",
        value: "125",
        iconName: "ListChecks",
        trend: "up",
        color: "text-blue-500",
      },
      {
        id: "stat-2",
        label: "Open Issues",
        value: "12",
        iconName: "Bug",
        trend: "down",
        color: "text-red-500",
      },
      {
        id: "stat-3",
        label: "Team Velocity",
        value: "8.5 pts",
        iconName: "Zap",
        trend: "neutral",
        color: "text-purple-500",
      },
      {
        id: "stat-4",
        label: "Budget Spent",
        value: "$15,750",
        iconName: "DollarSign",
        trend: "up",
        color: "text-green-500",
      },
      {
        id: "stat-5",
        label: "Project Health",
        value: "Good",
        iconName: "HeartPulse",
        color: "text-green-500",
      },
      {
        id: "stat-6",
        label: "Active Risks",
        value: "3",
        iconName: "ShieldAlert",
        color: "text-yellow-500",
      },
    ],
  } as ProjectStatsData,
  [WidgetType.DailyTaskCompletion]: {
    // series name was 'points' in types.ts, but widget expects 'data'
    data: [
      // Changed from 'points' to 'data' to match DailyTaskCompletionWidget
      { date: "2024-07-01", completed: 5 },
      { date: "2024-07-02", completed: 7 },
      { date: "2024-07-03", completed: 3 },
      { date: "2024-07-04", completed: 8 },
      { date: "2024-07-05", completed: 6 },
      { date: "2024-07-06", completed: 9 },
      { date: "2024-07-07", completed: 4 },
      { date: "2024-07-08", completed: 10 },
      { date: "2024-07-09", completed: 5 },
      { date: "2024-07-10", completed: 7 },
    ],
    // averageCompletion: 6, // Not directly used by chart
    // targetCompletion: 7, // Not directly used by chart
  } as DailyTaskCompletionData,
  [WidgetType.AssigneeWorkload]: [
    // This is an array of AssigneeWorkloadData
    {
      assigneeName: "Alice W.",
      taskCount: 8,
      avatarUrl: "https://i.pravatar.cc/150?u=alice",
    },
    {
      assigneeName: "Bob B.",
      taskCount: 5,
      avatarUrl: "https://i.pravatar.cc/150?u=bob",
    },
    {
      assigneeName: "Charlie B.",
      taskCount: 12,
      avatarUrl: "https://i.pravatar.cc/150?u=charlie",
    },
    {
      assigneeName: "Diana P.",
      taskCount: 7,
      avatarUrl: "https://i.pravatar.cc/150?u=diana",
    },
    {
      assigneeName: "Edward S.",
      taskCount: 9,
      avatarUrl: "https://i.pravatar.cc/150?u=edward",
    },
    {
      assigneeName: "Fiona G.",
      taskCount: 6,
      avatarUrl: "https://i.pravatar.cc/150?u=fiona",
    },
  ] as AssigneeWorkloadData[],
  [WidgetType.TagDistribution]: [
    // Sample tasks with tags for TagDistribution widget
    {
      id: "task-1",
      name: "Implement user authentication",
      description: "Add OAuth and JWT authentication",
      status: "In Progress",
      priority: "High",
      assignedUserIds: ["user-1"],
      projectId: "project-1",
      departmentId: "dept-1",
      orgId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ["backend", "security", "authentication"],
      subtaskIds: [],
    },
    {
      id: "task-2",
      name: "Design landing page",
      description: "Create responsive landing page",
      status: "To Do",
      priority: "Medium",
      assignedUserIds: ["user-2"],
      projectId: "project-1",
      departmentId: "dept-1",
      orgId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ["frontend", "design", "ui"],
      subtaskIds: [],
    },
    {
      id: "task-3",
      name: "Setup CI/CD pipeline",
      description: "Configure automated deployment",
      status: "Completed",
      priority: "High",
      assignedUserIds: ["user-3"],
      projectId: "project-1",
      departmentId: "dept-1",
      orgId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ["devops", "automation", "deployment"],
      subtaskIds: [],
    },
    {
      id: "task-4",
      name: "Write API documentation",
      description: "Document all REST endpoints",
      status: "In Review",
      priority: "Medium",
      assignedUserIds: ["user-1"],
      projectId: "project-1",
      departmentId: "dept-1",
      orgId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ["documentation", "api", "backend"],
      subtaskIds: [],
    },
    {
      id: "task-5",
      name: "Fix mobile responsive issues",
      description: "Resolve layout problems on mobile",
      status: "In Progress",
      priority: "High",
      assignedUserIds: ["user-2"],
      projectId: "project-1",
      departmentId: "dept-1",
      orgId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ["frontend", "mobile", "bug-fix"],
      subtaskIds: [],
    },
    {
      id: "task-6",
      name: "Database optimization",
      description: "Optimize query performance",
      status: "To Do",
      priority: "Medium",
      assignedUserIds: ["user-3"],
      projectId: "project-1",
      departmentId: "dept-1",
      orgId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ["backend", "database", "performance"],
      subtaskIds: [],
    },
  ] as Task[],
  [WidgetType.OverdueTasks]: [
    // Keep OverdueTasks data for compatibility
    {
      id: "task-overdue-1",
      name: "Finalize Q3 budget report and submit to finance",
      dueDate: new Date(new Date().setDate(new Date().getDate() - 5)),
      priority: "Urgent",
      assignee: {
        id: "user-1",
        name: "John Doe",
        avatarUrl: "https://i.pravatar.cc/150?u=john",
      },
    },
  ] as OverdueTaskItem[],
  [WidgetType.UpcomingDeadlines]: [
    // This is an array of UpcomingDeadlineItem
    {
      id: "deadline-1",
      name: "Submit feature proposal for Alpha Module",
      deadline: new Date(new Date().setDate(new Date().getDate() + 1)),
      daysLeft: 1,
      taskType: "Proposal",
    },
    {
      id: "deadline-2",
      name: "Team review meeting for Sprint 5 deliverables",
      deadline: new Date(new Date().setDate(new Date().getDate() + 3)),
      daysLeft: 3,
      taskType: "Meeting",
    },
    {
      id: "deadline-3",
      name: "Deploy to staging environment (Version 2.1)",
      deadline: new Date(new Date().setDate(new Date().getDate() + 5)),
      daysLeft: 5,
      taskType: "Deployment",
    },
    {
      id: "deadline-4",
      name: "Client demo preparation for new UI/UX changes",
      deadline: new Date(new Date().setDate(new Date().getDate() + 7)),
      daysLeft: 7,
      taskType: "Demo Prep",
    },
    {
      id: "deadline-5",
      name: "Complete security audit for payment gateway",
      deadline: new Date(new Date().setDate(new Date().getDate() + 10)),
      daysLeft: 10,
      taskType: "Audit",
    },
    {
      id: "deadline-6",
      name: "User Acceptance Testing (UAT) Phase 1",
      deadline: new Date(new Date().setDate(new Date().getDate() + 14)),
      daysLeft: 14,
      taskType: "Testing",
    },
  ] as UpcomingDeadlineItem[],
  [WidgetType.TimeToDeadline]: {
    projectName: "Q3 Platform Release",
    deadline: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 15),
    startDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
    percentageComplete: 35,
  } as TimeToDeadlineData,
};

export default function ProjectDashboard({
  taskStatusDistribution,
  projects, // Destructure new props
  tasks, // Destructure new props
}: ProjectDashboardProps) {
  const finalWidgetData = useMemo(() => {
    const data: Record<WidgetType, any> = JSON.parse(
      JSON.stringify(sampleWidgetData)
    );

    if (taskStatusDistribution && taskStatusDistribution.length > 0) {
      data[WidgetType.TaskStatus] = {
        statuses: taskStatusDistribution.map((item) => ({
          status: item.status,
          count: item.count,
        })),
      };
    }

    // Pass the real tasks data to the TagDistribution widget
    if (tasks) {
      data[WidgetType.TagDistribution] = tasks;
    }

    // Logic for ProjectProgressWidget-v2
    if (projects && projects.length > 0 && tasks) {
      const currentProject = projects[0];
      // Ensure currentProject is valid and has an id and name before proceeding
      if (
        currentProject &&
        currentProject.id &&
        typeof currentProject.name === "string"
      ) {
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(
          (task) => task.status === "Completed"
        ).length;
        const progress =
          totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        // Calculate task status distribution
        let taskStatusDistribution: ProjectTaskStatusDistributionItem[] = [];
        if (totalTasks > 0) {
          const statusCounts: Record<string, number> = {
            "To Do": 0,
            "In Progress": 0,
            Blocked: 0,
            "In Review": 0,
            Completed: 0,
          };

          // Define colors for each status
          // These colors are chosen to be Tailwind CSS compatible or common hex values
          const statusColors: Record<string, string> = {
            "To Do": "#d4d4d8", // Tailwind zinc-300
            "In Progress": "#6A13FF", // Tailwind blue-500
            Blocked: "#FF1081", // Tailwind red-500
            "In Review": "#C7FF1D", // Tailwind amber-500
            Completed: "#09fc69", // Tailwind green-500
          };

          tasks.forEach((task) => {
            // Ensure the task status is one of the predefined keys in statusCounts
            if (task.status in statusCounts) {
              statusCounts[task.status]++;
            }
          });

          taskStatusDistribution = Object.entries(statusCounts)
            .map(([status, count]) => ({
              status,
              count,
              percentage: parseFloat(((count / totalTasks) * 100).toFixed(1)),
              color: statusColors[status] || "#000000", // Default to black if status somehow not in map
            }))
            .filter((item) => item.count > 0); // Only include statuses that have tasks
        }

        data[WidgetType.ProjectProgress] = {
          id: currentProject.id,
          name: currentProject.name,
          progress: Math.round(progress),
          totalTasks: totalTasks,
          completedTasks: completedTasks,
          taskStatusDistribution:
            taskStatusDistribution.length > 0
              ? taskStatusDistribution
              : undefined,
        } as ProjectProgressData;
      } else {
        // currentProject is not valid (e.g., missing id or name)
        data[WidgetType.ProjectProgress] = undefined;
      }
    } else {
      // No projects array, projects array is empty, or tasks array is missing.
      data[WidgetType.ProjectProgress] = undefined;
    }

    return data;
  }, [taskStatusDistribution, projects, tasks]); // Add projects and tasks to dependency array

  return (
    <div className="space-y-6">
      <DashboardGrid
        initialWidgets={initialWidgets}
        widgetData={finalWidgetData} // Use finalWidgetData
      />
    </div>
  );
}
