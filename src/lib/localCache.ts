// Simple in-memory cache to provide instant, synchronous data on page revisit.
// This augments Firestore persistence by letting React render immediately before async snapshots fire.

import type { Timestamp } from "firebase/firestore";

export type CachedDisplayUser = {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
};

export type CachedProject = {
  id: string;
  name: string;
  description?: string;
  assignees: CachedDisplayUser[];
  deadline?: Date | Timestamp | null;
  tags: any[];
  departmentId: string;
  departmentName?: string;
  orgId: string;
  assignedUserIds?: string[];
};

export type CachedTask = any; // Use your Task type if importable without cycles
export type CachedDepartment = any; // Use your Department type if importable without cycles

class LocalCache {
  projects = new Map<string, CachedProject>();
  tasksByProject = new Map<string, CachedTask[]>();
  tasksById = new Map<string, CachedTask>();
  usersByOrg = new Map<string, CachedDisplayUser[]>();
  departments = new Map<string, CachedDepartment>();
  projectsByDepartment = new Map<string, any[]>();
  membersByDepartment = new Map<string, any[]>();
  // Optional: full department-members map per org for quick Teams page hydration
  departmentMembersMapByOrg = new Map<string, Map<string, any[]>>();
  otherProjectsByOrg = new Map<
    string,
    { id: string; name: string; departmentId: string }[]
  >();

  // Project
  getProject(projectId: string) {
    return this.projects.get(projectId);
  }
  setProject(projectId: string, project: CachedProject) {
    this.projects.set(projectId, project);
  }

  // Tasks
  getTasks(projectId: string) {
    return this.tasksByProject.get(projectId);
  }
  setTasks(projectId: string, tasks: CachedTask[]) {
    this.tasksByProject.set(projectId, tasks);
  }
  // Task by ID
  getTask(taskId: string) {
    return this.tasksById.get(taskId);
  }
  setTask(taskId: string, task: CachedTask) {
    this.tasksById.set(taskId, task);
  }

  // Users
  getUsers(orgId: string) {
    return this.usersByOrg.get(orgId);
  }
  setUsers(orgId: string, users: CachedDisplayUser[]) {
    this.usersByOrg.set(orgId, users);
  }

  // Department
  getDepartment(departmentId: string) {
    return this.departments.get(departmentId);
  }
  setDepartment(departmentId: string, dep: CachedDepartment) {
    this.departments.set(departmentId, dep);
  }
  // Department projects
  getDepartmentProjects(departmentId: string) {
    return this.projectsByDepartment.get(departmentId);
  }
  setDepartmentProjects(departmentId: string, projects: any[]) {
    this.projectsByDepartment.set(departmentId, projects);
  }
  // Department members (flat list)
  getDepartmentMembers(departmentId: string) {
    return this.membersByDepartment.get(departmentId);
  }
  setDepartmentMembers(departmentId: string, members: any[]) {
    this.membersByDepartment.set(departmentId, members);
  }
  // Org-wide department-members map for Teams page
  getDepartmentMembersMap(orgId: string) {
    return this.departmentMembersMapByOrg.get(orgId);
  }
  setDepartmentMembersMap(orgId: string, map: Map<string, any[]>) {
    this.departmentMembersMapByOrg.set(orgId, map);
  }

  // Other projects in org
  getOtherProjects(orgId: string) {
    return this.otherProjectsByOrg.get(orgId);
  }
  setOtherProjects(
    orgId: string,
    list: { id: string; name: string; departmentId: string }[]
  ) {
    this.otherProjectsByOrg.set(orgId, list);
  }
}

export const localCache = new LocalCache();
