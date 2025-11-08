"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { localCache } from "@/lib/localCache";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  Timestamp,
  addDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import {
  Organization,
  AppUser,
  Department, // Assuming you'll have a Department type
  Project,
  OrgRole,
  UserOrgRole,
  Task,
} from "@/lib/types";
import {
  validateAssignmentScope,
  getContextAwareUserList,
  getUsersInOrganization,
  fetchOrganizationMembersByDepartments,
  fetchDepartmentMembersUnified,
} from "@/lib/departmentUtils";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, Trash2, Users, Edit3, Clock, CheckCircle, AlertCircle, Search, Building2 } from "lucide-react";
import { RotatingLines } from "react-loader-spinner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox"; // Added for controller selection
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // For priority
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"; // For date picker
import { CalendarIcon } from "lucide-react"; // For date picker
import { format } from "date-fns"; // For date picker
import { Calendar } from "@/components/ui/calendar"; // For date picker
import SubDepartmentsView from "@/components/dashboard/SubDepartmentsView"; // Sub-departments component
import ManagersSettings from "@/components/dashboard/ManagersSettings";
import {
  ProjectsSummary as DepartmentProjectsSummary,
  ProjectProgressAndDeadlines as DepartmentProjectProgressAndDeadlines,
  StatusDonut as DepartmentStatusDonut,
  FluoroWorkloadHeatmap,
  BurndownChart as DepartmentBurndownChart,
} from "@/components/DepartmentWidgets";

const PREDEFINED_COLORS = [
  "#EF4444", // Red
  "#F59E0B", // Orange
  "#10B981", // Green
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
];

// Helper function to determine if a color is light or dark for checkmark visibility
const isLightColor = (color: string): boolean => {
  if (!color || color.length < 4) return false; // Basic check for valid color string
  const hex = color.replace("#", "");
  let r: number, g: number, b: number;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return false; // Not a valid hex color
  }

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155; // Threshold for light color (0-255 range)
};

//

interface DepartmentPageParams {
  departmentId: string;
}

// Helper to compute KPIs for Department dashboard (projects summary)
function computeDepartmentKPIs(projects: Project[]) {
  const total = projects.length;
  const completed = projects.filter((p) => p.status === "completed").length;
  const now = new Date();
  const toDate = (d: any) =>
    d instanceof Date ? d : (d instanceof Timestamp ? d.toDate() : null);

  const overdue = projects.filter((p) => {
    const dd = toDate((p as any).dueDate);
    return dd && dd.getTime() < now.getTime() && p.status !== "completed";
  }).length;

  const atRisk = projects.filter((p) => {
    const dd = toDate((p as any).dueDate);
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const noAssignee = !p.assignedUserIds || p.assignedUserIds.length === 0;
    const dueSoon = dd && dd <= in7 && p.status !== "completed";
    const isOverdue = dd && dd < now && p.status !== "completed";
    const highNoOwner = p.priority === "high" && noAssignee;
    return Boolean(dueSoon || isOverdue || highNoOwner);
  }).length;

  return { total, completed, overdue, atRisk };
}

function DashboardKPIs({
  projects,
  tasksByProject,
}: {
  projects: Project[];
  tasksByProject: Record<string, Pick<Task, "status">[]>;
}) {
  // Replaced separate cards with the combined ProjectsSummary widget
  return (
    <div className="mt-0">
      <DepartmentProjectsSummary
        projects={projects}
        tasksByProject={tasksByProject}
      />
    </div>
  );
}

export default function DepartmentPage() {
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const params = useParams();
  const departmentId = params.departmentId as string;

  // Cache-first hydration
  const initialDepartment =
    (departmentId
      ? (localCache.getDepartment(departmentId) as Department | undefined)
      : null) || null;
  const initialProjects =
    (departmentId
      ? (localCache.getDepartmentProjects(departmentId) as
          | Project[]
          | undefined)
      : null) || [];

  // UNIFIED: Try cache-first hydration from the department-members map (like teams page)
  const getCachedMembers = () => {
    if (!departmentId || !user?.organizationId) return [];
    const cachedMap = localCache.getDepartmentMembersMap(user.organizationId);
    if (cachedMap) {
      return cachedMap.get(departmentId) || [];
    }
    // Fallback to old single-department cache
    return (
      (localCache.getDepartmentMembers(departmentId) as
        | AppUser[]
        | undefined) || []
    );
  };

  const initialMembers = getCachedMembers();

  const [department, setDepartment] = useState<Department | null>(
    initialDepartment
  );
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [tasksByProject, setTasksByProject] = useState<Record<string, { status: Task["status"]; isLeaf?: boolean }[]>>({});
  const [flatTasks, setFlatTasks] = useState<
    (Pick<
      Task,
      | "id"
      | "name"
      | "dueDate"
      | "priority"
      | "status"
      | "projectId"
      | "assignedUserIds"
    > & {
      createdAt?: Task["createdAt"]; // historical gating for burndown
      completedAt?: Task["completedAt"]; // historical gating for burndown
    })[]
  >([]);
  const [hasTriedProjectsFetch, setHasTriedProjectsFetch] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [departmentMembers, setDepartmentMembers] =
    useState<AppUser[]>(initialMembers);
  const hadAnyCache = !!(
    initialDepartment ||
    initialProjects.length ||
    initialMembers.length
  );
  const [isLoading, setIsLoading] = useState(!hadAnyCache);
  const [hasTriedFetch, setHasTriedFetch] = useState(false);
  const [currentUserOrgRole, setCurrentUserOrgRole] = useState<OrgRole | null>(
    null
  );
  const [selectedControllerIds, setSelectedControllerIds] = useState<string[]>(
    []
  ); // New state for department controllers

  // For project creation/editing dialog
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<Partial<Project> | null>(
    null
  ); // For editing
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#000000"); // Default color
  const [newProjectPriority, setNewProjectPriority] =
    useState<Project["priority"]>("medium");
  const [newProjectDueDate, setNewProjectDueDate] = useState<Date | null>(null);
  const [newProjectAssignedUserIds, setNewProjectAssignedUserIds] = useState<
    string[]
  >([]);
  const [allOrgUsersForAssign, setAllOrgUsersForAssign] = useState<AppUser[]>(
    []
  ); // For assignee selection
  const [isUpdatingControllers, setIsUpdatingControllers] = useState(false);

  // Onboarding state for empty sub-departments
  const [onboardingSelectedMembers, setOnboardingSelectedMembers] = useState<
    string[]
  >([]);
  const [onboardingSearchTerm, setOnboardingSearchTerm] = useState("");
  const [isAssigningMembers, setIsAssigningMembers] = useState(false);

  // Managers + permissions (Department Settings)
  const [managerUserIds, setManagerUserIds] = useState<string[]>([]);
  const [permAllowCreate, setPermAllowCreate] = useState<boolean>(true);
  const [permAllowDelete, setPermAllowDelete] = useState<boolean>(false);
  const [permAllowEdit, setPermAllowEdit] = useState<boolean>(true);
  const [permAllowViewUnassigned, setPermAllowViewUnassigned] =
    useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // UI state
  const [showOnlyMyProjects, setShowOnlyMyProjects] = useState(true); // Toggle between "My Projects" and "All Projects"
  const [projectViewType, setProjectViewType] = useState<"grid" | "list">(
    "grid"
  ); // Toggle between grid and list view

  // Search state
  const [membersSearchTerm, setMembersSearchTerm] = useState("");
  const [controllersSearchTerm, setControllersSearchTerm] = useState("");
  const [assigneeSearchTerm, setAssigneeSearchTerm] = useState(""); // New state for assignee search
  const [sortField, setSortField] = useState<string>("displayName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeSettingsTab, setActiveSettingsTab] = useState("members"); // New state for settings sub-tabs
  const [activeMainTab, setActiveMainTab] = useState("projects"); // State for main dashboard tabs

  // PS5-style transition state (like teams/page.tsx)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // PS5-style navigation function
  const handlePS5Navigation = (projectId: string) => {
    if (isTransitioning || !department) return; // Prevent multiple clicks during animation

    setSelectedCardId(projectId);
    setIsTransitioning(true);

    // Quick transition to match teams page
    setTimeout(() => {
      router.push(`/dashboard/teams/${department.id}/projects/${projectId}`);
    }, 0); // Quick delay like teams page
  };

  // --- Burndown data (simple derivation): last 7 days remaining tasks ---
  const burndownData = useMemo(() => {
    // Build a 7-day window ending today
    const days = 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const points: { date: Date; label: string; remaining: number }[] = [];

    // Remaining tasks: tasks not Completed
    const isActive = (s: Task["status"]) => (s || "").toString().toLowerCase() !== "completed";

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      // Count tasks whose status wasn't completed as of that day.
      // We don't have historical status per day, so approximate by using current status and dueDate >= day
      const remaining = flatTasks.filter((t) => {
        const status = (t as any).status as Task["status"];
        if (!isActive(status)) return false;
        const due = (t as any).dueDate;
        const dd = due instanceof Date ? due : (typeof due?.toDate === "function" ? due.toDate() : null);
        if (!dd) return true; // tasks without due date treated as still remaining
        // If due date is on/after this day, consider it remaining
        const cmp = new Date(dd);
        cmp.setHours(0, 0, 0, 0);
        return cmp.getTime() >= d.getTime();
      }).length;
      points.push({ date: d, label, remaining });
    }
    return points;
  }, [flatTasks]);

  // Helper to show ⌘ on macOS and Ctrl elsewhere in shortcut hints
  const getKeyModifier = () => {
    if (typeof window !== "undefined") {
      const platform = navigator?.platform || navigator?.userAgent || "";
      return /Mac|iPhone|iPad|iPod/.test(platform) ? "⌘" : "Ctrl";
    }
    return "Ctrl";
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const fetchDepartmentData = async () => {
      if (!user.organizationId || !departmentId) {
        toast.error("Organization or Department ID is missing.");
        setIsLoading(false);
        router.push("/dashboard/teams");
        return;
      }
      // Only show loader if no cache
      if (!hadAnyCache) setIsLoading(true);
      try {
        // Fetch Organization
        const orgDocRef = doc(db, "organizations", user.organizationId);
        const orgDocSnap = await getDoc(orgDocRef);
        if (orgDocSnap.exists()) {
          const orgData = {
            id: orgDocSnap.id,
            ...orgDocSnap.data(),
          } as Organization;
          setOrganization(orgData);
          const userRoleDetails = user.orgRoles?.find(
            (r) => r.orgId === user.organizationId
          );
          setCurrentUserOrgRole(userRoleDetails?.orgRole || null);

          // Fetch Department details - check new structure first, then legacy, with org scoping
          let dept: Department | null = null;

          // Try new structure first (separate departments collection)
          const deptDocRef = doc(db, "departments", departmentId);
          const deptDocSnap = await getDoc(deptDocRef);

          if (deptDocSnap.exists()) {
            const candidate = {
              id: deptDocSnap.id,
              ...deptDocSnap.data(),
            } as Department;
            if (candidate.orgId === user.organizationId) {
              dept = candidate;
            } else {
              console.warn(
                `Cross-org department ID collision detected. Ignoring foreign doc. Dept orgId=${candidate.orgId}, user orgId=${user.organizationId}`
              );
            }
          }

          // Fallback to legacy structure (nested in organization) if not found or foreign
          if (!dept) {
            const legacyDept = (orgData as any).customDepartments?.find(
              (d: any) => d.id === departmentId
            );
            if (legacyDept) {
              // Try to locate the migrated root department doc for this org
              try {
                const qMigrated = query(
                  collection(db, "departments"),
                  where("orgId", "==", user.organizationId),
                  where("level", "==", 0),
                  where("name", "==", legacyDept.name)
                );
                const migratedSnap = await getDocs(qMigrated);
                if (!migratedSnap.empty) {
                  const doc0 = migratedSnap.docs[0];
                  const migrated = {
                    id: doc0.id,
                    ...doc0.data(),
                  } as Department;
                  dept = migrated;
                  // Normalize the URL to the migrated department ID so child relations work
                  if (doc0.id !== departmentId) {
                    router.replace(`/dashboard/teams/${doc0.id}`);
                  }
                }
              } catch (e) {
                // If composite index missing or other error, continue with legacy shim below
                console.warn(
                  "Could not resolve migrated department by name",
                  e
                );
              }

              if (!dept) {
                // Convert legacy department to new format for compatibility (shim only)
                dept = {
                  id: legacyDept.id,
                  name: legacyDept.name,
                  description: legacyDept.description || "",
                  orgId: orgData.id,
                  memberIds: legacyDept.memberIds || [],
                  controllerUserIds: legacyDept.controllerUserIds || [],
                  parentDepartmentId: null,
                  path: "/",
                  level: 0,
                  childDepartmentIds: [],
                  hasChildren: false,
                  ancestorIds: [],
                  createdAt: legacyDept.createdAt || new Date(),
                  updatedAt: legacyDept.updatedAt || new Date(),
                };
              }
            }
          }

          if (dept) {
            setDepartment(dept);
            // write-through cache
            localCache.setDepartment(departmentId, dept);
            // Initialize managers state (backward-compat: controllerUserIds)
            const initManagers =
              (dept as any).managerUserIds || dept.controllerUserIds || [];
            setManagerUserIds(initManagers);
            setSelectedControllerIds(dept.controllerUserIds || []); // Deprecated - kept for fallback
            const perms = (dept as any).permissions || {};
            setPermAllowCreate(perms.allowCreate ?? true);
            setPermAllowDelete(perms.allowDelete ?? false);
            setPermAllowEdit(perms.allowEdit ?? true);
            setPermAllowViewUnassigned(perms.allowViewUnassigned ?? true);
          } else {
            toast.error("Department not found within the organization.");
            router.push("/dashboard/teams");
            return;
          }

          // Subscribe Projects for this department (realtime)
          const projectsQueryRef = query(
            collection(db, "projects"),
            where("departmentId", "==", departmentId),
            where("orgId", "==", user.organizationId)
          );
          const unsubProjects = onSnapshot(
            projectsQueryRef,
            (projectsSnapshot) => {
              const projectsData = projectsSnapshot.docs.map(
                (d) =>
                  ({
                    id: d.id,
                    ...d.data(),
                    dueDate: (d.data() as any).dueDate || null,
                  }) as Project
              );
              setProjects(projectsData);
              setHasTriedProjectsFetch(true);
              // Write-through cache
              localCache.setDepartmentProjects(departmentId, projectsData);
            },
            (err) => {
              setHasTriedProjectsFetch(true);
              console.error("Projects subscription error:", err);
            }
          );
          unsubList.push(unsubProjects);

          // Task subscriptions are handled in a separate effect keyed by current projects (projectId-based, chunked)

          // **UNIFIED: Use the scalable unified function for department member fetching**
          console.log(
            `🔄 Using UNIFIED fetchOrganizationMembersByDepartments for dept: ${departmentId}`
          );
          const departmentMembersMap =
            await fetchOrganizationMembersByDepartments(user.organizationId);
          // Cache the map for next navigation
          localCache.setDepartmentMembersMap(
            user.organizationId,
            departmentMembersMap
          );

          // Resolve department members with fallbacks for legacy vs migrated IDs
          let deptMembers = departmentMembersMap.get(departmentId) || [];
          if ((!deptMembers || deptMembers.length === 0) && dept) {
            // 1) Try name slug fallback
            const nameSlug = (dept.name || "")
              .trim()
              .toLowerCase()
              .replace(/\s+/g, "-");
            if (nameSlug && departmentMembersMap.has(nameSlug)) {
              console.warn(
                `⚠️ No members under id=${departmentId}, using name slug fallback: ${nameSlug}`
              );
              deptMembers = departmentMembersMap.get(nameSlug) || [];
            }
            // 2) Try legacy customDepartments id (same name) if available
            if (
              (!deptMembers || deptMembers.length === 0) &&
              (orgData as any).customDepartments
            ) {
              const legacyMatch = (orgData as any).customDepartments.find(
                (d: any) =>
                  d.id &&
                  departmentMembersMap.has(d.id) &&
                  d.name?.trim()?.toLowerCase?.() ===
                    (dept.name || "").trim().toLowerCase()
              );
              if (legacyMatch) {
                console.warn(
                  `⚠️ Using legacy department id fallback: ${legacyMatch.id} for name ${legacyMatch.name}`
                );
                deptMembers = departmentMembersMap.get(legacyMatch.id) || [];
              }
            }

            // 3) Freshly created sub-department path: use unified scan of users' departmentalRoles
            if (!deptMembers || deptMembers.length === 0) {
              try {
                console.warn(
                  `⚠️ OrgMemberships map empty for ${departmentId}. Falling back to unified departmentalRoles scan...`
                );
                const scanned = await fetchDepartmentMembersUnified(
                  departmentId,
                  user.organizationId
                );
                if (scanned && scanned.length) {
                  deptMembers = scanned as any;
                }
              } catch (e) {
                console.warn("Unified scan fallback failed:", e);
              }
            }
          }
          console.log(
            "👥 Members (from unified memberships):",
            (deptMembers || []).map((m: any) => m.displayName || m.email)
          );
          setDepartmentMembers((deptMembers as any) || []);
          localCache.setDepartmentMembers(
            departmentId,
            (deptMembers as any) || []
          );

          // **UNIFIED: Extract all unique users from the department map for consistent assignee list**
          const seen = new Set<string>();
          const allUniqueUsers: AppUser[] = [];
          departmentMembersMap.forEach((members) => {
            members.forEach((u) => {
              if (!u.uid) return;
              if (seen.has(u.uid)) return;
              seen.add(u.uid);
              allUniqueUsers.push(u);
            });
          });
          console.log(
            "👥 All org users (from unified memberships):",
            allUniqueUsers.map((m) => m.displayName || m.email)
          );
          // Always ensure assignee pool has org users even if dept bucket is empty
          setAllOrgUsersForAssign(allUniqueUsers as any);
        } else {
          toast.error("Organization not found.");
          router.push("/dashboard"); // Or a more appropriate fallback
          return;
        }
      } catch (error) {
        console.error("Error fetching department data:", error);
        toast.error("Failed to load department data.");
        router.push("/dashboard/teams");
      } finally {
        setIsLoading(false);
        setHasTriedFetch(true);
      }
    };

    const unsubList: Array<() => void> = [];
    fetchDepartmentData();
    return () => {
      // Cleanup any subscriptions we created inside fetchDepartmentData
      unsubList.forEach((u) => u());
    };
  }, [user, authLoading, departmentId, router, hadAnyCache]);

  // Subscribe to tasks by projectId chunks to ensure accuracy even if departmentId is missing on tasks
  useEffect(() => {
    if (!user?.organizationId) return;
    if (!projects || projects.length === 0) {
      setTasksByProject({});
      setFlatTasks([]);
      return;
    }

    const projectIds = projects.map((p) => p.id).filter(Boolean);
    const chunkSize = 10; // Firestore in filter supports up to 30 per query; keep conservative
    const chunks: string[][] = [];
    for (let i = 0; i < projectIds.length; i += chunkSize) {
      chunks.push(projectIds.slice(i, i + chunkSize));
    }

  const unsubscribers: Array<() => void> = [];
  const accum: Record<string, { status: Task["status"]; isLeaf?: boolean }[]> = {};
  // Include assignedUserIds so downstream consumers (e.g., heatmap) can highlight per-user workload
  const taskMap = new Map<string, {
    id: string;
    name: string;
    dueDate: any;
    priority: any;
    status: Task["status"];
    projectId: string;
    assignedUserIds: string[];
    createdAt?: Task["createdAt"];
    completedAt?: Task["completedAt"];
  }>();
  const taskIdsByProject = new Map<string, Set<string>>();

    chunks.forEach((ids) => {
      const qRef = query(
        collection(db, "tasks"),
        where("orgId", "==", user.organizationId),
        where("projectId", "in", ids)
      );
      const unsub = onSnapshot(
        qRef,
        (snap) => {
          // Rebuild for this chunk then merge
          const part: Record<string, { status: Task["status"]; isLeaf?: boolean }[]> = {};
          // Before processing, clear existing tasks for these project ids in taskMap
          ids.forEach((pid) => {
            const existing = taskIdsByProject.get(pid);
            if (existing) {
              existing.forEach((tid) => taskMap.delete(tid));
              existing.clear();
            }
          });

          snap.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const pid = data.projectId as string | undefined;
            const status = data.status as Task["status"] | undefined;
            if (!pid || !status) return;
            const isLeaf = !data.subtaskIds || (Array.isArray(data.subtaskIds) && data.subtaskIds.length === 0);
            if (!part[pid]) part[pid] = [];
            part[pid].push({ status, isLeaf });

            // Collect flat task info
            const tId = docSnap.id;
            const tName = (data.name || data.title || "Untitled") as string;
            const tDue = data.dueDate ?? null;
            const tPriority = data.priority ?? "Medium";
            const tStatus = status;
            const tAssignees = Array.isArray(data.assignedUserIds)
              ? (data.assignedUserIds as string[])
              : [];
            // Derive creation/completion timestamps defensively
            const createdAt = data.createdAt ?? (docSnap as any)?.writeTime ?? null;
            const completedAt = data.completedAt ?? null;

            taskMap.set(tId, {
              id: tId,
              name: tName,
              dueDate: tDue,
              priority: tPriority,
              status: tStatus,
              projectId: pid,
              assignedUserIds: tAssignees,
              // Add temporal fields used by burndown for historical gating
              createdAt,
              completedAt,
            });
            // Track mapping
            let setForPid = taskIdsByProject.get(pid);
            if (!setForPid) {
              setForPid = new Set<string>();
              taskIdsByProject.set(pid, setForPid);
            }
            setForPid.add(tId);
          });
          // Merge part into accum safely, then publish a fresh object to state
          const next: typeof accum = { ...accum };
          // Remove any stale entries for these ids before merging to avoid duplicates
          ids.forEach((id) => {
            delete next[id];
          });
          Object.keys(part).forEach((pid) => {
            next[pid] = part[pid];
          });
          // Fill in empty arrays for projects with no tasks so percent falls back gracefully
          ids.forEach((id) => {
            if (!next[id]) next[id] = [];
          });
          setTasksByProject({ ...next });
          // Publish flat tasks list
          setFlatTasks(Array.from(taskMap.values()));
          // Update accum reference for subsequent merges
          Object.assign(accum, next);
        },
        (err) => {
          console.error("Tasks subscription (by projects) error:", err);
        }
      );
      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach((u) => u());
    };
  }, [projects, user?.organizationId]);

  const canManageSettings =
    currentUserOrgRole === OrgRole.OWNER ||
    currentUserOrgRole === OrgRole.ADMIN ||
    (managerUserIds?.includes(user?.uid || "") ?? false) ||
    (department?.controllerUserIds?.includes(user?.uid || "") ?? false); // legacy

  // For now, anyone in the department can create. Deletion is more restricted.
  const isMember = departmentMembers.some((m) => m.uid === user?.uid);
  const canCreateProjects = canManageSettings || (permAllowCreate && isMember);

  // Updated canDeleteProjects logic
  const canDeleteProjects =
    currentUserOrgRole === OrgRole.OWNER ||
    currentUserOrgRole === OrgRole.ADMIN ||
    managerUserIds.includes(user?.uid || "") ||
    (department?.controllerUserIds?.includes(user?.uid || "") ?? false) ||
    (permAllowDelete && isMember);

  // Placeholder for who can manage department settings (e.g., assign department admins)
  const canManageDepartmentSpecificSettings =
    currentUserOrgRole === OrgRole.OWNER ||
    currentUserOrgRole === OrgRole.ADMIN;

  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd/Ctrl + number keys
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        switch (event.key) {
          case "1":
            event.preventDefault();
            setActiveMainTab("dashboard");
            break;
          case "2":
            event.preventDefault();
            setActiveMainTab("sub-departments");
            break;
          case "3":
            event.preventDefault();
            setActiveMainTab("projects");
            break;
          case "4":
            if (canManageSettings) {
              event.preventDefault();
              setActiveMainTab("settings");
            }
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canManageSettings]);

  const handleUpdateDepartmentControllers = async () => {
    if (
      !organization ||
      !user?.organizationId ||
      !departmentId ||
      !department
    ) {
      toast.error("Required data is missing to update controllers.");
      return;
    }
    setIsUpdatingControllers(true);
    try {
      // Check if department exists in new structure
      const deptDocRef = doc(db, "departments", departmentId);
      const deptDocSnap = await getDoc(deptDocRef);

      if (deptDocSnap.exists()) {
        // Update in new structure
        await updateDoc(deptDocRef, {
          controllerUserIds: selectedControllerIds,
          updatedAt: new Date(),
        });
      } else {
        // Update in legacy structure
        const currentOrgDepartments =
          (organization as any).customDepartments || [];
        const updatedCustomDepartments = currentOrgDepartments.map(
          (dept: any) => {
            if (dept.id === departmentId) {
              return { ...dept, controllerUserIds: selectedControllerIds };
            }
            return dept;
          }
        );

        const orgDocRef = doc(db, "organizations", user.organizationId);
        await updateDoc(orgDocRef, {
          customDepartments: updatedCustomDepartments,
        });
      }

      // Update local state
      setDepartment((prev) =>
        prev ? { ...prev, controllerUserIds: selectedControllerIds } : null
      );

      toast.success("Department controllers updated successfully!");
    } catch (error) {
      console.error("Error updating department controllers:", error);
      toast.error("Failed to update department controllers.");
    } finally {
      setIsUpdatingControllers(false);
    }
  };

  const handleCreateOrUpdateProject = async () => {
    if (
      !newProjectName ||
      !departmentId ||
      !user?.organizationId ||
      !user?.uid
    ) {
      toast.error(
        "Project name, department ID, and organization ID are required."
      );
      return;
    }

    // VALIDATION: Context-aware assignment validation
    if (newProjectAssignedUserIds.length > 0) {
      const validation = validateAssignmentScope(
        newProjectAssignedUserIds,
        department,
        departmentMembers,
        allOrgUsersForAssign
      );

      if (!validation.isValid) {
        toast.error(validation.errorMessage!);
        return;
      }
    }

    const projectPayload: Omit<Project, "id" | "createdAt"> & {
      createdAt?: Timestamp;
    } = {
      name: newProjectName,
      description: newProjectDescription,
      departmentId: departmentId,
      orgId: user.organizationId,
      status: "todo", // Explicitly use one of the allowed status values
      assignedUserIds:
        newProjectAssignedUserIds.length > 0
          ? newProjectAssignedUserIds
          : [user.uid], // Assign creator if no one else is assigned
      createdBy: user.uid,
      color: newProjectColor,
      priority: newProjectPriority,
      dueDate: newProjectDueDate ? Timestamp.fromDate(newProjectDueDate) : null,
    };

    // If editing, enforce edit permission for members
    if (
      currentProject?.id &&
      !(
        canManageSettings ||
        managerUserIds.includes(user.uid) ||
        (permAllowEdit && isMember)
      )
    ) {
      toast.error("You don't have permission to edit projects.");
      return;
    }

    try {
      setIsLoading(true);
      if (currentProject && currentProject.id) {
        // Editing existing project
        const projectRef = doc(db, "projects", currentProject.id);
        // Only update fields that are meant to be editable
        const updatePayload: Partial<Project> = {
          name: newProjectName,
          description: newProjectDescription,
          color: newProjectColor,
          priority: newProjectPriority,
          dueDate: newProjectDueDate
            ? Timestamp.fromDate(newProjectDueDate)
            : null,
          assignedUserIds: newProjectAssignedUserIds,
          // status can be updated separately if needed
        };
        await updateDoc(projectRef, updatePayload);
        setProjects(
          projects.map((p) =>
            p.id === currentProject.id
              ? { ...p, ...updatePayload, dueDate: updatePayload.dueDate } // Use Timestamp from updatePayload
              : p
          )
        );
        toast.success("Project updated successfully!");
      } else {
        // Creating new project
        if (!canCreateProjects) {
          toast.error("You don't have permission to create projects.");
          setIsLoading(false);
          return;
        }
        const completeProjectData = {
          ...projectPayload,
          createdAt: Timestamp.now(),
        } as Project; // Cast to Project after adding createdAt
        const docRef = await addDoc(
          collection(db, "projects"),
          completeProjectData
        );
        // Ensure local state uses Date for dueDate
        const newProjectForState = {
          ...completeProjectData,
          id: docRef.id,
          dueDate: completeProjectData.dueDate, // Use Timestamp from completeProjectData
        };
        setProjects([...projects, newProjectForState]);
        toast.success("Project created successfully!");
      }
      setIsProjectDialogOpen(false);
      // Reset form fields
      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectColor("#000000");
      setNewProjectPriority("medium");
      setNewProjectDueDate(null);
      setNewProjectAssignedUserIds([]);
      setCurrentProject(null);
    } catch (error) {
      console.error("Error saving project:", error);
      toast.error("Failed to save project.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!canDeleteProjects) {
      toast.error("You don't have permission to delete projects.");
      return;
    }
    if (!confirm("Are you sure you want to delete this project?")) return;

    try {
      setIsLoading(true);
      await deleteDoc(doc(db, "projects", projectId));
      setProjects(projects.filter((p) => p.id !== projectId));
      toast.success("Project deleted successfully.");
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Failed to delete project.");
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if onboarding overlay should be shown (only for sub-departments with no members)
  const shouldShowOnboarding = useMemo(() => {
    if (!department) return false;
    const isSubDepartment = !!department.parentDepartmentId;
    const noMembers = (departmentMembers?.length || 0) === 0;
    return isSubDepartment && noMembers && hasTriedFetch && !isLoading;
  }, [department, departmentMembers, hasTriedFetch, isLoading]);

  // Available members for onboarding (org users not yet in this department)
  const availableMembersForOnboarding = useMemo(() => {
    if (!department) return [] as AppUser[];
    const currentMemberIds = new Set(department.memberIds || []);
    let pool = allOrgUsersForAssign.filter((u) => !currentMemberIds.has(u.uid));
    if (onboardingSearchTerm.trim()) {
      const q = onboardingSearchTerm.toLowerCase();
      pool = pool.filter(
        (u) =>
          (u.displayName?.toLowerCase() || "").includes(q) ||
          (u.email?.toLowerCase() || "").includes(q)
      );
    }
    // Sort by displayName/email for consistent UI
    return pool.sort((a, b) => {
      const an = (a.displayName || a.email || "").toLowerCase();
      const bn = (b.displayName || b.email || "").toLowerCase();
      return an.localeCompare(bn);
    });
  }, [department, allOrgUsersForAssign, onboardingSearchTerm]);

  // Assign selected members to the department and update users' departmentalRoles
  const handleAssignMembers = async () => {
    if (
      !user?.organizationId ||
      !department?.id ||
      onboardingSelectedMembers.length === 0
    ) {
      toast.error("Select at least one member.");
      return;
    }
    try {
      setIsAssigningMembers(true);
      const deptRef = doc(db, "departments", department.id);
      const deptSnap = await getDoc(deptRef);
      if (!deptSnap.exists()) {
        toast.error("Department not found.");
        return;
      }

      const curr = (deptSnap.data() as any).memberIds || [];
      const newMemberIds = Array.from(
        new Set([...(curr as string[]), ...onboardingSelectedMembers])
      );
      await updateDoc(deptRef, {
        memberIds: newMemberIds,
        updatedAt: new Date(),
      });

      // Update each user's orgRoles.departmentalRoles
      for (const memberId of onboardingSelectedMembers) {
        const uRef = doc(db, "users", memberId);
        const uSnap = await getDoc(uRef);
        if (!uSnap.exists()) continue;
        const data = uSnap.data() as any;
        const roles: UserOrgRole[] = data.orgRoles || [];
        const updated = roles.map((r) => {
          if (r.orgId === user.organizationId) {
            const deptRoles = Array.from(
              new Set([...(r.departmentalRoles || []), department.id])
            );
            return { ...r, departmentalRoles: deptRoles } as UserOrgRole;
          }
          return r;
        });
        await updateDoc(uRef, { orgRoles: updated });
      }

      // Update local state
      setDepartment((prev) =>
        prev ? { ...prev, memberIds: newMemberIds } : prev
      );
      const newlyAdded = onboardingSelectedMembers
        .map((id) => allOrgUsersForAssign.find((u) => u.uid === id))
        .filter(Boolean) as AppUser[];
      setDepartmentMembers(newlyAdded); // since there were none before
      setOnboardingSelectedMembers([]);
      setOnboardingSearchTerm("");
      toast.success("Members added to the department.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to add members. Try again.");
    } finally {
      setIsAssigningMembers(false);
    }
  };

  const openProjectDialog = (project?: Project) => {
    if (project) {
      setCurrentProject(project);
      setNewProjectName(project.name);
      setNewProjectDescription(project.description || "");
      setNewProjectColor(project.color || "#000000");
      setNewProjectPriority(project.priority || "medium");
      setNewProjectDueDate(
        project.dueDate
          ? (project.dueDate as any) instanceof Timestamp
            ? (project.dueDate as any).toDate()
            : project.dueDate
          : null
      ); // Handle both Timestamp and Date
      setNewProjectAssignedUserIds(project.assignedUserIds || []);
      // Ensure any assigned users not currently in the org user list (due to active org switches) are fetched & represented
      if (project.assignedUserIds?.length) {
        (async () => {
          const missingIds = project.assignedUserIds!.filter(
            (id) => !allOrgUsersForAssign.some((u) => (u as any).uid === id)
          );
          if (!missingIds.length) return;
          const fetched: AppUser[] = [];
          for (const id of missingIds) {
            try {
              const snap = await getDoc(doc(db, "users", id));
              if (snap.exists()) {
                const data = snap.data() as any;
                fetched.push({
                  ...(data as AppUser),
                  uid: id,
                });
              } else {
                fetched.push({
                  uid: id,
                  displayName: "Unknown User",
                  email: undefined,
                } as any);
              }
            } catch {
              fetched.push({
                uid: id,
                displayName: "Unknown User",
                email: undefined,
              } as any);
            }
          }
          if (fetched.length) {
            setAllOrgUsersForAssign((prev) => [...prev, ...fetched]);
          }
        })();
      }
    } else {
      setCurrentProject(null);
      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectColor("#000000");
      setNewProjectPriority("medium");
      setNewProjectDueDate(null);
      setNewProjectAssignedUserIds(user ? [user.uid] : []); // Default to assigning creator
    }
    setIsProjectDialogOpen(true);
  };

  // Filter and sort members based on search term
  const filteredMembers = useMemo(() => {
    let filtered = [...departmentMembers];

    // Apply search filter if search term exists
    if (membersSearchTerm.trim() !== "") {
      const searchLower = membersSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (member) =>
          (member.displayName?.toLowerCase() || "").includes(searchLower) ||
          (member.email?.toLowerCase() || "").includes(searchLower)
      );
    }

    // Sort members
    filtered.sort((a, b) => {
      let aValue = a[sortField as keyof AppUser];
      let bValue = b[sortField as keyof AppUser];

      // Handle undefined values
      if (aValue === undefined) aValue = "";
      if (bValue === undefined) bValue = "";

      // Handle string comparison
      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      // Handle date comparison if we add date fields later
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === "asc"
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }

      // Default comparison with null checks
      if (aValue !== null && bValue !== null) {
        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [departmentMembers, membersSearchTerm, sortField, sortDirection]);

  // Filter controllers based on search term
  const filteredControllerMembers = useMemo(() => {
    if (controllersSearchTerm.trim() === "") {
      return departmentMembers;
    }

    const searchLower = controllersSearchTerm.toLowerCase();
    return departmentMembers.filter(
      (member) =>
        (member.displayName?.toLowerCase() || "").includes(searchLower) ||
        (member.email?.toLowerCase() || "").includes(searchLower)
    );
  }, [departmentMembers, controllersSearchTerm]);

  // Filter all organization users for assignee selection based on search term and context
  const filteredAssignees = useMemo(() => {
    // Only show members of the current department
    let availableUsers = departmentMembers;

    // Apply search filter
    if (assigneeSearchTerm.trim() === "") {
      return availableUsers;
    }

    const searchLower = assigneeSearchTerm.toLowerCase();
    return availableUsers.filter(
      (user) =>
        (user.displayName?.toLowerCase() || "").includes(searchLower) ||
        (user.email?.toLowerCase() || "").includes(searchLower)
    );
  }, [departmentMembers, assigneeSearchTerm]);

  // Filter projects based on the showOnlyMyProjects toggle
  const canViewUnassigned = canManageSettings || permAllowViewUnassigned;
  const displayProjects = useMemo(() => {
    if (!user) return projects;
    // If members are not allowed to view unassigned, always restrict for non-managers
    if (!canViewUnassigned && !canManageSettings) {
      return projects.filter(
        (p) => p.assignedUserIds?.includes(user.uid) || p.createdBy === user.uid
      );
    }
    // Otherwise respect the toggle
    if (showOnlyMyProjects) {
      return projects.filter(
        (p) => p.assignedUserIds?.includes(user.uid) || p.createdBy === user.uid
      );
    }
    return projects;
  }, [
    projects,
    showOnlyMyProjects,
    user,
    canViewUnassigned,
    canManageSettings,
  ]);

  // Hide scrollbars during Metro animation to prevent overflow during x: 200 slide-in
  useEffect(() => {
    if (!isLoading && displayProjects.length > 0) {
      // Hide scrollbars temporarily
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";

      // Calculate animation duration: longest card animation + buffer
      const totalAnimationDuration =
        (displayProjects.length * 0.04 + 0.7) * 1000 + 200; // Convert to ms and add buffer

      // Restore scrollbars after animation completes
      const timer = setTimeout(() => {
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      }, totalAnimationDuration);

      return () => {
        clearTimeout(timer);
        // Cleanup: ensure scrollbars are restored if component unmounts
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      };
    }
  }, [isLoading, displayProjects.length]);

  if (
    isLoading ||
    authLoading ||
    (!department && !hasTriedFetch) ||
    !hasTriedProjectsFetch
  ) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4 md:p-6">
        <div className="flex flex-col items-center space-y-4">
          <RotatingLines
            visible={true}
            width="44"
            strokeColor={theme === "dark" ? "#fff" : "#000"}
            strokeWidth="3"
            animationDuration="0.75"
            ariaLabel="rotating-lines-loading"
          />
          <p className="text-lg font-medium text-muted-foreground animate-pulse spacemono">
            Loading department data...
          </p>
        </div>
      </div>
    );
  }

  if (!department) {
    return (
      <div className="p-4 md:p-6 text-center">
        <p className="spacemono">
          Department not found or you do not have access.
        </p>
        <Button
          onClick={() => router.push("/dashboard/teams")}
          className="mt-4"
        >
          Back to Department Groups
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key="department-page"
          initial={{ opacity: 1, scale: 1, rotateX: 0 }}
          animate={{
            opacity: isTransitioning ? 0 : 1,
            scale: isTransitioning ? 1.2 : 1, // Reduced scale to prevent overflow
            rotateX: isTransitioning ? -15 : 0, // Reduced rotation to prevent breaking
            filter: isTransitioning ? "blur(8px)" : "blur(0px)", // Reduced blur for smoother effect
          }}
          exit={{
            opacity: 0,
            scale: 2, // Reduced exit scale
            rotateX: -25, // Reduced exit rotation
            filter: "blur(20px)", // Reduced exit blur
          }}
          transition={{
            duration: isTransitioning ? 0.7 : 0.7, // Reduced duration to match navigation delay
            ease: isTransitioning
              ? [0.23, 1, 0.32, 1]
              : [0.25, 0.46, 0.45, 0.94],
            filter: { duration: 0.7 }, // Matched filter duration
          }}
          style={{
            transformStyle: "preserve-3d",
            perspective: 1000,
            transformOrigin: "center center", // Ensure transforms stay centered
          }}
          className="relative overflow-hidden" // Added overflow-hidden to prevent scrollbars
        >
          {/* PS5-style particle overlay during transition */}
          <AnimatePresence>
            {isTransitioning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 pointer-events-none"
              >
                {/* Particle effect background */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-cyan-600/10" />

                {/* Animated particles */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      opacity: 0,
                      scale: 0,
                      x: Math.random() * window.innerWidth,
                      y: Math.random() * window.innerHeight,
                    }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      x: Math.random() * window.innerWidth,
                      y: Math.random() * window.innerHeight,
                    }}
                    transition={{
                      duration: 1.5, // Reduced from 1.5 for faster particles
                      delay: i * 0.05, // Reduced delay for tighter timing
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute w-1 h-1 bg-blue-400 rounded-full"
                  />
                ))}

                {/* Central loading indicator */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0, rotate: 0 }}
                    animate={{ scale: 1, rotate: 360 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="relative"
                  >
                    <div className="w-16 h-16 border-2 border-blue-500/30 rounded-full" />
                    <div className="absolute inset-0 w-16 h-16 border-2 border-transparent border-t-blue-500 rounded-full animate-spin" />
                    <div className="absolute inset-2 w-12 h-12 border border-cyan-400/50 rounded-full animate-pulse" />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-4 md:p-6 overflow-hidden min-h-[calc(100vh-4rem)]">
            {/* Added min-height and contained overflow */}
            <Tabs
              value={activeMainTab}
              onValueChange={setActiveMainTab}
              className="w-full"
            >
              <div className="flex justify-between items-center mb-6">
                <header>
                  <h1 className="text-3xl montserrat font-medium">
                    {department.name}
                  </h1>
                </header>
                <TabsList className="grid grid-cols-4 proximavara">
                  <TabsTrigger
                    value="dashboard"
                    className="flex items-center gap-2"
                  >
                    <span>Dashboard</span>
                    <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                      <span className="text-xs">{getKeyModifier()}</span>1
                    </kbd>
                  </TabsTrigger>
                  <TabsTrigger
                    value="sub-departments"
                    className="flex items-center gap-2"
                  >
                    <span>Sub Departments</span>
                    <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                      <span className="text-xs">{getKeyModifier()}</span>2
                    </kbd>
                  </TabsTrigger>
                  <TabsTrigger
                    value="projects"
                    className="flex items-center gap-2"
                  >
                    <span>Projects</span>
                    <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                      <span className="text-xs">{getKeyModifier()}</span>3
                    </kbd>
                  </TabsTrigger>
                  {canManageSettings && (
                    <TabsTrigger
                      value="settings"
                      className="flex items-center gap-2"
                    >
                      <span>Settings</span>
                      <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                        <span className="text-xs">{getKeyModifier()}</span>4
                      </kbd>
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <TabsContent value="dashboard">
                {/* Department Analytics Dashboard */}
                {/* KPI Grid */}
                <DashboardKPIs
                  projects={projects}
                  tasksByProject={tasksByProject}
                />

                {/* Row 1: Task Status Overview (Donut) on left 1/3 with pure borders; right 2/3 reserved */}
                <div className="relative w-full">
                  {/* Full-bleed bottom border for the row */}
                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 w-screen border-b-1" />
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left 1/3: Status Donut with right divider that meets row borders */}
                    <div className="relative lg:col-span-1">
                      <div className="pointer-events-none hidden lg:block absolute top-0 bottom-0 right-[-0.75rem] border-r-1" />
                      <DepartmentStatusDonut projects={projects} tasks={flatTasks} />
                    </div>
                    {/* Right 2/3: Placeholder for future widgets; keep empty to match sketch */}
                    <div className="lg:col-span-2 !text-sm spacegrot mt-4 text-md px-4">
                      <FluoroWorkloadHeatmap
                        members={departmentMembers.filter((m:any)=> m && m.uid)}
                        tasks={flatTasks}
                        title="Workload by time"
                      />
                    </div>
                  </div>
                </div>


                {/* Row 2: Project Progress Overview (left) + Upcoming Deadlines (right) */}
                <DepartmentProjectProgressAndDeadlines
                  projects={projects}
                  tasksByProject={tasksByProject}
                  tasks={flatTasks}
                  daysWindow={30}
                  maxItems={10}
                />



                {/* Other widgets can be added below as needed */}
              </TabsContent>

              <TabsContent value="sub-departments">
                <Card className="-mx-6 border-t rounded-none -my-6 border-0">
                  <CardContent>
                    <SubDepartmentsView
                      parentDepartment={department}
                      orgId={department.orgId}
                      canManageSettings={canManageSettings}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="projects" className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl montserrat tracking-tight">
                      {department.name} Projects
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4 spacemono">
                      {displayProjects.length}{" "}
                      {displayProjects.length === 1 ? "project" : "projects"} in
                      total
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!canManageSettings && permAllowViewUnassigned && (
                      <div className="flex items-center gap-2 mr-4">
                        <Switch
                          checked={showOnlyMyProjects}
                          onCheckedChange={setShowOnlyMyProjects}
                        />
                        <span className="text-sm font-medium">
                          {showOnlyMyProjects ? "My Projects" : "All Projects"}
                        </span>
                      </div>
                    )}
                    {canCreateProjects && (
                      <Button
                        onClick={() => openProjectDialog()}
                        size="sm"
                        className="gap-1.5 proximavara"
                        variant="default"
                      >
                        <PlusCircle className="h-4 w-4 proximavara" /> New
                        Project
                      </Button>
                    )}
                  </div>
                </div>

                {displayProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-20">
                    <div className="rounded-full bg-primary/10 p-6 mb-4">
                      <PlusCircle className="h-12 w-12 text-primary" />
                    </div>
                    <h3 className="text-2xl font-semibold mb-2 spacegrot">
                      No Projects Yet
                    </h3>
                    <p className="text-muted-foreground max-w-sm mb-6 proximavara">
                      This department doesn't have any projects yet. Create your
                      first project to get started.
                    </p>
                    {canCreateProjects && (
                      <Button
                        onClick={() => openProjectDialog()}
                        size="lg"
                        className="px-8 proximavara"
                      >
                        Create Project
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="proximavara grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6 gap-4">
                    {displayProjects.map((project, index) => {
                      // Format due date for display
                      const dueDateDisplay =
                        project.dueDate instanceof Date
                          ? project.dueDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : project.dueDate instanceof Timestamp
                            ? project.dueDate
                                .toDate()
                                .toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                            : "";

                      return (
                        <motion.div
                          key={project.id}
                          initial={{
                            opacity: 0,
                            x: 300,
                            scale: 0.8,
                          }}
                          animate={
                            isTransitioning
                              ? // Smart fly off screen animation based on selected card position
                                project.id === selectedCardId
                                ? // Selected card moves towards center of screen
                                  (() => {
                                    // Calculate how much to move the selected card towards center
                                    // This creates a subtle pull-to-center effect before page transition
                                    const gridCols =
                                      window.innerWidth >= 1536
                                        ? 6
                                        : window.innerWidth >= 1280
                                          ? 5
                                          : window.innerWidth >= 1024
                                            ? 4
                                            : window.innerWidth >= 768
                                              ? 3
                                              : window.innerWidth >= 640
                                                ? 3
                                                : 2;

                                    const selectedIndex =
                                      displayProjects.findIndex(
                                        (p) => p.id === selectedCardId
                                      );
                                    const row = Math.floor(
                                      selectedIndex / gridCols
                                    );
                                    const col = selectedIndex % gridCols;
                                    const centerCol = (gridCols - 1) / 2;

                                    // Move towards center column (more dramatic movement)
                                    const moveTowardsCenter =
                                      (centerCol - col) * 100; // Increased movement for better focal effect

                                    return {
                                      opacity: 1,
                                      x: moveTowardsCenter,
                                      scale: 1.15, // More dramatic scale up to create focal point
                                      zIndex: 10, // Bring to front
                                      y: 0, // Slight upward movement for emphasis
                                    };
                                  })()
                                : // Other cards fly off screen left/right based on position relative to selected card
                                  (() => {
                                    const selectedIndex =
                                      displayProjects.findIndex(
                                        (p) => p.id === selectedCardId
                                      );
                                    const isLeftOfSelected =
                                      index < selectedIndex;
                                    const isRightOfSelected =
                                      index > selectedIndex;

                                    return {
                                      opacity: 0,
                                      x: isLeftOfSelected
                                        ? -900
                                        : isRightOfSelected
                                          ? 900
                                          : index % 2 === 0
                                            ? -900
                                            : 900,
                                      scale: 0.7,
                                    };
                                  })()
                              : // Normal state
                                {
                                  opacity: 1,
                                  x: 0,
                                  scale: 1,
                                }
                          }
                          transition={
                            isTransitioning
                              ? // Windows 8 Metro-style timing - slow down as they exit
                                project.id === selectedCardId
                                ? // Selected card gets faster, smoother transition to center with dramatic expansion
                                  {
                                    duration: 0.5, // Slightly longer for the expansion effect
                                    ease: [0.34, 1.56, 0.64, 1], // Bounce-like easing for dramatic effect
                                  }
                                : // Other cards get staggered exit timing
                                  {
                                    duration: 0.6,
                                    delay: Math.abs(index) * 0.03, // Stagger based on position
                                    ease: [0.25, 0.1, 0.25, 1], // Slow down and stop easing
                                  }
                              : // Normal entry transition
                                {
                                  duration: 0.6,
                                  delay: index * 0.04,
                                  ease: [0.25, 0.46, 0.45, 0.94],
                                }
                          }
                        >
                          <div
                            className={`group rounded-lg shadow-sm hover:shadow-xl border overflow-hidden h-[240px] transform transition-all duration-300 hover:scale-[1.03] bg-card dark:bg-zinc-950 relative flex flex-col cursor-pointer hover:border-[project.color]`}
                            onClick={() => handlePS5Navigation(project.id)}
                          >
                            {/* Color band on top matching project color - thicker for Netflix-style visual impact */}
                            {/* <div
                        className="absolute top-0 left-0 w-full h-2 opacity-90"
                        style={{ backgroundColor: project.color || "#3b82f6" }}
                      /> */}

                            {/* Content container */}
                            <div className="flex-1 p-5 flex flex-col">
                              {/* Project name & color */}
                              <div className="flex items-start gap-2 mb-3">
                                <div
                                  className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
                                  style={{
                                    backgroundColor: project.color || "#3b82f6",
                                    boxShadow:
                                      "0 0 0 2px rgba(255,255,255,0.15)",
                                  }}
                                />
                                <div>
                                  <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors duration-200">
                                    {project.name}
                                  </h3>
                                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                    {project.description ||
                                      "No description provided"}
                                  </p>
                                </div>
                              </div>

                              {/* Project info items */}
                              <div className="mt-auto space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>
                                    {project.assignedUserIds?.length || 0}{" "}
                                    {project.assignedUserIds?.length === 1
                                      ? "member"
                                      : "members"}
                                  </span>
                                </div>

                                {dueDateDisplay && (
                                  <div className="flex items-center gap-2">
                                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>{dueDateDisplay}</span>
                                  </div>
                                )}

                                <div className="flex items-center gap-2">
                                  <div className="h-3.5 w-3.5 flex items-center justify-center">
                                    {project.priority === "high" ? (
                                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                                    ) : project.priority === "medium" ? (
                                      <Clock className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                    )}
                                  </div>
                                  <span className="capitalize">
                                    {project.priority || "medium"} priority
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Overlay that appears on hover with actions - Netflix-style sleek dark gradient */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-between p-4 backdrop-blur-[1.5px] translate-y-1 group-hover:translate-y-0">
                              <Button
                                variant="default"
                                size="sm"
                                className="text-xs transition-transform duration-300 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 delay-75"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  /* View details action */
                                }}
                              >
                                View Details
                              </Button>

                              <div className="flex gap-1.5 transition-transform duration-300 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 delay-100">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-white/25 text-white hover:bg-white/40 shadow-lg backdrop-blur-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openProjectDialog(project);
                                  }}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>

                                {canDeleteProjects && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-white/25 text-white hover:bg-destructive/60 shadow-lg backdrop-blur-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProject(project.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}

                    {/* Add Project Card */}
                    {canCreateProjects && (
                      <motion.div
                        key="add-project"
                        initial={{
                          opacity: 0,
                          x: 200,
                          scale: 0.8,
                        }}
                        animate={
                          isTransitioning
                            ? // Smart fly off screen during transition based on selected card position
                              (() => {
                                const selectedIndex = displayProjects.findIndex(
                                  (p) => p.id === selectedCardId
                                );
                                const addCardIndex = displayProjects.length; // Add card is always at the end
                                const isRightOfSelected =
                                  addCardIndex > selectedIndex;

                                return {
                                  opacity: 0,
                                  x: isRightOfSelected ? 800 : -800, // Fly right if after selected, left if somehow before
                                  scale: 0.8,
                                };
                              })()
                            : // Normal state
                              {
                                opacity: 1,
                                x: 0,
                                scale: 1,
                              }
                        }
                        transition={
                          isTransitioning
                            ? // Windows 8 Metro-style timing - slow down as it exits
                              {
                                duration: 0.6,
                                delay: displayProjects.length * 0.03, // Stagger after the project cards
                                ease: [0.25, 0.1, 0.25, 1], // Slow down and stop easing
                              }
                            : // Normal entry transition
                              {
                                duration: 0.6,
                                delay: displayProjects.length * 0.03,
                                ease: [0.25, 0.46, 0.45, 0.94],
                              }
                        }
                      >
                        <div
                          className="flex flex-col items-center justify-center rounded-lg border border-dashed h-[240px] cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-all duration-300 hover:scale-[1.03] hover:shadow-lg"
                          onClick={() => openProjectDialog()}
                        >
                          <div className="rounded-full bg-muted p-3 mb-3 transition-transform duration-300 group-hover:scale-110">
                            <PlusCircle className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <p className="text-muted-foreground font-medium proximavara">
                            Add Project
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </TabsContent>

              {canManageSettings && (
                <TabsContent value="settings">
                  <ManagersSettings
                    departmentId={department.id}
                    departmentName={department.name}
                    members={departmentMembers}
                    initialManagers={
                      (department as any).managerUserIds ||
                      department.controllerUserIds ||
                      []
                    }
                    initialPermissions={(department as any).permissions || {}}
                    onSaved={({ managers, permissions }) => {
                      setManagerUserIds(managers);
                      setPermAllowCreate(permissions.allowCreate);
                      setPermAllowDelete(permissions.allowDelete);
                      setPermAllowEdit(permissions.allowEdit);
                      setPermAllowViewUnassigned(
                        permissions.allowViewUnassigned
                      );
                      setDepartment((prev) =>
                        prev
                          ? ({
                              ...prev,
                              managerUserIds: managers,
                              permissions,
                            } as any)
                          : prev
                      );
                      toast.success("Settings updated");
                    }}
                  />
                </TabsContent>
              )}

              {/* Project Creation/Edit Dialog */}
              <Dialog
                open={isProjectDialogOpen}
                onOpenChange={setIsProjectDialogOpen}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="spacegrot">
                      {currentProject ? "Edit Project" : "Create New Project"}
                    </DialogTitle>
                    <DialogDescription>
                      {currentProject
                        ? "Update the details of your project."
                        : "Fill in the details to create a new project for this department."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-6 py-4 proximavara">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="projectName" className="text-right">
                        Name
                      </Label>
                      <Input
                        id="projectName"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        className="col-span-3"
                        placeholder="E.g., Q3 Marketing Campaign"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label
                        htmlFor="projectDescription"
                        className="text-right"
                      >
                        Description
                      </Label>
                      <Textarea
                        id="projectDescription"
                        value={newProjectDescription}
                        onChange={(e) =>
                          setNewProjectDescription(e.target.value)
                        }
                        className="col-span-3"
                        placeholder="A brief description of the project's goals and objectives."
                      />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                      {" "}
                      {/* Changed to items-start */}
                      <Label
                        htmlFor="projectColor"
                        className="text-right pt-1.5"
                      >
                        {" "}
                        {/* Added pt-1.5 for alignment */}
                        Color
                      </Label>
                      <div className="col-span-3">
                        <div className="flex items-center space-x-10 mb-2">
                          {" "}
                          {/* Added mb-2 for spacing before hex display */}
                          {/* Predefined colors */}
                          {PREDEFINED_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setNewProjectColor(color)}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150`}
                              style={{ backgroundColor: color }}
                              aria-label={`Select color ${color}`}
                              title={`Select color ${color.toUpperCase()}`}
                            >
                              {newProjectColor === color && (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke={
                                    isLightColor(newProjectColor)
                                      ? "black"
                                      : "white"
                                  }
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                            </button>
                          ))}
                          {/* Custom color picker button */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                const customColorInput =
                                  document.getElementById(
                                    "customProjectColorInput"
                                  );
                                if (customColorInput) {
                                  customColorInput.click();
                                }
                              }}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 hover:opacity-80 ${
                                !PREDEFINED_COLORS.includes(newProjectColor)
                                  ? "ring-2 ring-offset-2 ring-offset-background dark:ring-offset-zinc-900"
                                  : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                              }`}
                              aria-label="Choose custom color"
                              title="Choose custom color"
                              style={
                                !PREDEFINED_COLORS.includes(newProjectColor)
                                  ? {
                                      backgroundColor: newProjectColor,
                                      borderColor: newProjectColor,
                                    }
                                  : {
                                      backgroundImage:
                                        "conic-gradient(#f00 0deg,#ff0 60deg,#0f0 120deg,#0ff 180deg,#00f 240deg,#f0f 300deg,#f00 360deg)",
                                    }
                              }
                            >
                              {!PREDEFINED_COLORS.includes(newProjectColor) && (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke={
                                    isLightColor(newProjectColor)
                                      ? "black"
                                      : "white"
                                  }
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                            </button>
                            <Input
                              id="customProjectColorInput"
                              type="color"
                              value={newProjectColor} // Ensures the native picker shows the current color
                              onChange={(e) =>
                                setNewProjectColor(e.target.value)
                              }
                              className="absolute w-0 h-0 opacity-0" // Visually hidden
                              aria-label="Custom color input" // For accessibility
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Priority</Label>
                      <RadioGroup
                        value={newProjectPriority}
                        onValueChange={(value) =>
                          setNewProjectPriority(value as Project["priority"])
                        }
                        className="col-span-3 flex space-x-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="low" id="priority-low" />
                          <Label htmlFor="priority-low">Low</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="medium" id="priority-medium" />
                          <Label htmlFor="priority-medium">Medium</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="high" id="priority-high" />
                          <Label htmlFor="priority-high">High</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="projectDueDate" className="text-right">
                        Due Date
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant={"outline"}
                            className={`col-span-3 justify-start text-left font-normal ${
                              !newProjectDueDate && "text-muted-foreground"
                            }`}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newProjectDueDate ? (
                              format(newProjectDueDate, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={newProjectDueDate ?? undefined} // Ensure undefined is passed if null
                            onSelect={(date) =>
                              setNewProjectDueDate(date || null)
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                      <Label className="text-right pt-1.5">Assignees</Label>
                      <div className="col-span-3">
                        {/* Context-aware assignment scope indicator */}
                        {department?.parentDepartmentId && (
                          <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                              <Building2 className="h-3 w-3" />
                              <span>
                                Sub-department projects can only assign members
                                from this department
                              </span>
                            </div>
                          </div>
                        )}
                        <Input
                          type="search"
                          placeholder="Search by name or email..."
                          value={assigneeSearchTerm}
                          onChange={(e) =>
                            setAssigneeSearchTerm(e.target.value)
                          }
                          className="mb-2"
                        />
                        <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                          {filteredAssignees.length > 0 ? (
                            filteredAssignees.map((user) => (
                              <div
                                key={user.uid}
                                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                onClick={() => {
                                  const newSelection =
                                    newProjectAssignedUserIds.includes(user.uid)
                                      ? newProjectAssignedUserIds.filter(
                                          (id) => id !== user.uid
                                        )
                                      : [
                                          ...newProjectAssignedUserIds,
                                          user.uid,
                                        ];
                                  setNewProjectAssignedUserIds(newSelection);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                                    {user.displayName
                                      ? user.displayName.charAt(0).toUpperCase()
                                      : user.email?.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {user.displayName || user.email}
                                    </p>
                                    {user.displayName && (
                                      <p className="text-xs text-muted-foreground">
                                        {user.email}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <Checkbox
                                  checked={newProjectAssignedUserIds.includes(user.uid)}
                                  onCheckedChange={(checked) => {
                                    const isChecked = Boolean(checked);
                                    const newSelection = isChecked
                                      ? Array.from(new Set([...newProjectAssignedUserIds, user.uid]))
                                      : newProjectAssignedUserIds.filter((id) => id !== user.uid);
                                    setNewProjectAssignedUserIds(newSelection);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-muted-foreground">
                              No matching users
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Selected: {newProjectAssignedUserIds.length}
                        </p>
                      </div>
                    </div>
                    {/* End Assignees */}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsProjectDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateOrUpdateProject}
                      disabled={isLoading}
                    >
                      {currentProject ? "Save Changes" : "Create Project"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Tabs>
          </div>
        </motion.div>
      </AnimatePresence>
      {/* Full-screen onboarding overlay for empty sub-departments */}
      {shouldShowOnboarding && (
        <div className="fixed inset-0 z-50 transition-all duration-75">
          {/* Blurry dimmed backdrop */}
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

          {/* Centered card */}
          <div className="relative h-full w-full flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-xl border bg-card dark:bg-black/20 shadow-xl overflow-hidden backdrop-blur-xl">
              <div className="p-6 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold spacegrot">
                      Add members to {department?.name}
                    </h2>
                    <p className="text-sm text-muted-foreground proximavara">
                      This sub-department is empty. Choose who should be part of
                      it to continue.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 proximavara">
                  <Button
                    variant="ghost"
                    onClick={() => router.push("/dashboard/teams")}
                  >
                    Leave
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4 proximavara">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email"
                    value={onboardingSearchTerm}
                    onChange={(e) => setOnboardingSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* List */}
                <div className="max-h-[50vh] overflow-y-auto border rounded-md divide-y">
                  {availableMembersForOnboarding.length > 0 ? (
                    availableMembersForOnboarding.map((u) => {
                      const selected = onboardingSelectedMembers.includes(
                        u.uid
                      );
                      return (
                        <div
                          key={u.uid}
                          className={`flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer ${selected ? "bg-muted/40" : ""}`}
                          onClick={() =>
                            setOnboardingSelectedMembers((prev) =>
                              prev.includes(u.uid)
                                ? prev.filter((id) => id !== u.uid)
                                : [...prev, u.uid]
                            )
                          }
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                              {(u.displayName || u.email || "?")!
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium leading-none">
                                {u.displayName || u.email}
                              </p>
                              {u.displayName && (
                                <p className="text-sm text-muted-foreground">
                                  {u.email}
                                </p>
                              )}
                            </div>
                          </div>
                          <Checkbox checked={selected} onChange={() => {}} />
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-10 text-center text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-2 opacity-60" />
                      <p className="font-medium">No available members</p>
                      <p className="text-sm">
                        Invite people to your organization first.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Selected: {onboardingSelectedMembers.length}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => router.push("/dashboard/teams")}
                      disabled={isAssigningMembers}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAssignMembers}
                      disabled={
                        onboardingSelectedMembers.length === 0 ||
                        isAssigningMembers
                      }
                      className="min-w-[140px]"
                    >
                      {isAssigningMembers
                        ? "Assigning..."
                        : `Add ${onboardingSelectedMembers.length || 0} Member${onboardingSelectedMembers.length === 1 ? "" : "s"}`}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
