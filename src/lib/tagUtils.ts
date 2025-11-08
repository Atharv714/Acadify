import { Task } from "./types";

export interface ProjectTag {
  id: string;
  name: string;
  color: string;
}

// Normalize project.tags (which may be strings or {id,name,color}) to a unique, sorted list of tag names
export function normalizeProjectTagNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = raw
    .map((t: any) => (typeof t === "string" ? t : t?.name))
    .filter(
      (n: any): n is string => typeof n === "string" && n.trim().length > 0
    )
    .map((n) => n.trim());
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

// Collect unique tag names used across a list of tasks
export function collectTaskUsedTags(
  tasks: Task[] | undefined | null
): string[] {
  if (!tasks || !Array.isArray(tasks)) return [];
  const set = new Set<string>();
  for (const t of tasks) {
    if (Array.isArray(t.tags)) {
      for (const tag of t.tags) {
        if (typeof tag === "string" && tag.trim()) set.add(tag.trim());
      }
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// Union of task-used tags and project-level tag names
export function computeAvailableTags(
  tasks: Task[] | undefined | null,
  projectTagNames: string[] | undefined | null
): string[] {
  const used = collectTaskUsedTags(tasks);
  const fromProject = Array.isArray(projectTagNames) ? projectTagNames : [];
  return Array.from(new Set([...(used || []), ...(fromProject || [])])).sort(
    (a, b) => a.localeCompare(b)
  );
}

// Create a standardized ProjectTag object with a default color
export function makeProjectTag(name: string, color?: string): ProjectTag {
  return {
    id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    color: color || "bg-zinc-500/20 text-zinc-700 border border-zinc-500/30",
  };
}

// Simple union for two arrays of tag name strings
export function unionTagNames(
  a: string[] | undefined | null,
  b: string[] | undefined | null
): string[] {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return Array.from(new Set([...(left || []), ...(right || [])])).sort((x, y) =>
    x.localeCompare(y)
  );
}
