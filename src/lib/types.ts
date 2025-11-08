import { User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
export enum OrgRole {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
}
export enum TeamRole {
  TEAM_ADMIN = "team_admin",
  MEMBER = "member",
}
export enum DepartmentalRole {
  DESIGN = "design",
  MARKETING = "marketing",
  SALES = "sales",
  TECH = "tech",
  HARDWARE = "hardware",
}
export interface UserOrgRole {
  orgId: string;
  orgRole: OrgRole;
  departmentalRoles?: string[];
  legacyDepartmentalRoles?: DepartmentalRole[];
  teams?: string[];
  designation?: string;
}
export interface UserTeamRole {
  teamId: string;
  teamRole: TeamRole;
}
export interface AppUser extends User {
  firstName?: string;
  lastName?: string;
  organizationId?: string;
  orgRoles?: UserOrgRole[];
  teamRoles?: UserTeamRole[];
  createdAt: Timestamp;
}
export interface DisplayUser {
  id: string;
  name?: string | null; // from displayName
  avatarUrl?: string | null; // from photoURL
  email?: string | null;
}
export interface OrgMembership {
  orgId: string;
  userId: string;
  orgRole: OrgRole;
  departmentIds: string[];
  active: boolean;
  displayName?: string;
  photoURL?: string | null;
  email?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface Organization {
  id: string;
  name: string;
  ownerUserId: string;
  memberUserIds: string[];
  orgAdmins?: string[];
  rootDepartmentIds?: string[];
  createdAt: Timestamp;
  inviteCode: string;
}
export interface Department {
  id: string;
  name: string;
  description?: string;
  orgId: string;
  memberIds: string[];
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  controllerUserIds?: string[];
  parentDepartmentId: string | null;
  path: string;
  level: number;
  childDepartmentIds: string[];
  hasChildren: boolean;
  ancestorIds: string[];
}
export interface Team {
  id: string;
  orgId: string;
  name: string;
  teamAdmins: string[];
  memberUserIds: string[];
  createdAt: Timestamp;
}
export interface Project {
  id: string;
  departmentId: string;
  orgId: string;
  name: string;
  description?: string;
  assignedUserIds: string[];
  status: "todo" | "in_progress" | "completed";
  createdAt: Timestamp;
  dueDate?: Timestamp | null;
  createdBy?: string;
  color?: string;
  priority?: "low" | "medium" | "high";
  tags?: Array<string | ProjectTag>;
}
export interface Task {
  id: string;
  projectId: string;
  departmentId: string;
  orgId: string;
  name: string;
  description?: string;
  document?: any;
  richDescription?: {
    type: "doc";
    content: Array<any>;
  };
  assignedUserIds: string[];
  assignedUsers?: DisplayUser[];
  status: "To Do" | "In Progress" | "Blocked" | "In Review" | "Completed";
  priority: "Low" | "Medium" | "High";
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  dueDate?: Date | Timestamp;
  completedAt?: Date | Timestamp;
  tags: string[];
  parentTaskId?: string;
  subtaskIds: string[];
  level?: number;
}
export interface PendingInvite {
  id: string;
  type: "organization" | "team";
  targetId: string;
  invitedUserEmail: string;
  invitedByUserId: string;
  createdAt: Timestamp;
  roleToAssign?: OrgRole | TeamRole | DepartmentalRole;
}

export interface UserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

export interface TaskStatusDataItem {
  name: string;
  value: number;
  fill: string;
}

export type TaskStatusData = TaskStatusDataItem[];
export interface ProjectTag {
  id: string;
  name: string;
  color: string;
}
export interface DepartmentTreeNode {
  department: Department;
  children: DepartmentTreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}
export interface DepartmentWithHierarchy extends Department {
  breadcrumb: string;
  ancestors: Department[];
  depth: number;
}
export interface DepartmentQueryOptions {
  includeChildren?: boolean;
  maxDepth?: number;
  parentId?: string;
  flatten?: boolean;
}
export interface DepartmentPayload {
  name: string;
  description?: string;
  parentDepartmentId?: string | null;
  memberIds?: string[];
  controllerUserIds?: string[];
}
