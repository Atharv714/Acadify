/**
 * Task navigation utilities for consistent routing across the application
 * Provides robust navigation to individual task pages from all views (ListView, Kanban, Table, Timeline)
 */

import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export interface TaskNavigationContext {
  taskId: string;
  projectId: string;
  departmentId: string;
}

/**
 * Generates the task page URL
 */
export function getTaskPageUrl({
  taskId,
  projectId,
  departmentId,
}: TaskNavigationContext): string {
  return `/dashboard/teams/${departmentId}/projects/${projectId}/tasks/${taskId}`;
}

/**
 * Navigates to a task page using Next.js router
 */
export function navigateToTask(
  router: AppRouterInstance,
  context: TaskNavigationContext
): void {
  const url = getTaskPageUrl(context);
  router.push(url);
}

/**
 * Checks if a task navigation context is valid
 */
export function isValidTaskContext(
  context: Partial<TaskNavigationContext>
): context is TaskNavigationContext {
  return !!(
    context.taskId &&
    context.projectId &&
    context.departmentId &&
    typeof context.taskId === "string" &&
    typeof context.projectId === "string" &&
    typeof context.departmentId === "string" &&
    context.taskId.trim() !== "" &&
    context.projectId.trim() !== "" &&
    context.departmentId.trim() !== ""
  );
}

/**
 * Validates task navigation context and returns error message if invalid
 */
export function validateTaskContext(
  context: Partial<TaskNavigationContext>
): string | null {
  if (
    !context.taskId ||
    typeof context.taskId !== "string" ||
    context.taskId.trim() === ""
  ) {
    return "Invalid task ID";
  }
  if (
    !context.projectId ||
    typeof context.projectId !== "string" ||
    context.projectId.trim() === ""
  ) {
    return "Invalid project ID";
  }
  if (
    !context.departmentId ||
    typeof context.departmentId !== "string" ||
    context.departmentId.trim() === ""
  ) {
    return "Invalid department ID";
  }
  return null;
}
