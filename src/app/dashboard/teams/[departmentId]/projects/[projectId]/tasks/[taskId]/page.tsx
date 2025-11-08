"use client";


import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  Timestamp,
  serverTimestamp,
  addDoc,
  collection,
  arrayUnion,
  arrayRemove,
  query,
  where,
  getDocs,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Task, DisplayUser, Project, Department } from "@/lib/types";
import { format } from "date-fns";
import {
  ChevronRight,
  ArrowLeft,
  Edit3,
  Save,
  X,
  Hash,
  Calendar,
  Users,
  Tag,
  FolderOpen,
  Signal,
  SignalMedium,
  SignalLow,
  Circle,
  AlertCircle,
  Clock,
  CircleCheck,
  MoreHorizontal,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  ListPlus,
  Loader2,
  Building2,
  User,
  Plus,
  Eye,
  ChevronDown,
  Search,
  Filter,
  SortAsc,
  CalendarClock,
  CalendarDays,
  Info,
  RefreshCw,
  UploadCloud,
  Image as ImageIcon,
  File as FileIcon,
  FileText,
  Archive,
  Video,
  Music,
  FileCode,
  Link as LinkIcon,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CommentsThread } from "@/components/comments/CommentsThread";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import DeleteConfirmation from "@/components/DeleteConfirmation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import DialogShell from "@/components/tasks/DialogShell";
import AssigneeSelector from "@/components/tasks/AssigneeSelector";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuPortal,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import NovelEditor, {
  NovelEditorRef,
  JSONContent,
} from "@/components/editor/NovelEditor";
import {
  normalizeProjectTagNames,
  unionTagNames,
  makeProjectTag,
} from "@/lib/tagUtils";

// Local interfaces for this page
interface DisplayProject {
  id: string;
  name: string;
  description?: string;
  assignees: DisplayUser[];
  deadline?: Date;
  departmentId: string;
  departmentName?: string;
  orgId: string;
  assignedUserIds?: string[];
}

interface TaskPageData {
  task: Task;
  project: DisplayProject;
  department: Department;
  allProjectMembers: DisplayUser[];
  subtasks: Task[];
}

const statusConfig = {
  "To Do": {
    icon: Circle,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/20",
  },
  "In Progress": {
    icon: Clock,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
  },
  Blocked: {
    icon: AlertCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  "In Review": {
    icon: Clock,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
  },
  Completed: {
    icon: CircleCheck,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
};

// Match project table: status options for context menu
const statusOptions = [
  { label: "To Do", value: "To Do", icon: Circle },
  { label: "In Progress", value: "In Progress", icon: Clock },
  { label: "In Review", value: "In Review", icon: Search },
  { label: "Blocked", value: "Blocked", icon: AlertCircle },
  { label: "Completed", value: "Completed", icon: CircleCheck },
];

const priorityConfig = {
  High: {
    icon: Signal,
    color: "text-red-500",
  },
  Medium: {
    icon: SignalMedium,
    color: "text-yellow-500",
  },
  Low: {
    icon: SignalLow,
    color: "text-green-500",
  },
};

const getSafeDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  if (dateValue?.toDate && typeof dateValue.toDate === "function") {
    return dateValue.toDate();
  }
  if (typeof dateValue === "string" || typeof dateValue === "number") {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
};

// Prefer a human-friendly name derived from email when displayName is missing
const nameFromEmail = (email?: string | null): string | null => {
  if (!email) return null;
  const local = email.split("@")[0] || "";
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned
    .split(/\s+/)
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" ");
};

// Prefer explicit firstName/lastName when present
const nameFromParts = (u: any): string | null => {
  const first = (u?.firstName || "").toString().trim();
  const last = (u?.lastName || "").toString().trim();
  const combined = `${first} ${last}`.trim();
  return combined || null;
};

export default function TaskPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;
  const projectId = params.projectId as string;
  const departmentId = params.departmentId as string;
  const { user } = useAuth();

  // No local caching on this page – always rely on live snapshots only

  // Core state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TaskPageData | null>(null);

  // Edit and UI states
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedTask, setEditedTask] = useState<Partial<Task>>({
    name: "",
    description: "",
    status: "To Do" as Task["status"],
    priority: "Medium" as Task["priority"],
    assignedUserIds: [],
    dueDate: undefined,
    tags: [],
  });

  const [activeTab, setActiveTab] = useState<
    "subtasks" | "document" | "comments" | "attachments" | "details"
  >("subtasks");
  // Comments handled by CommentsThread now
  const [attachments, setAttachments] = useState<
    { id: string; name: string; size: number; type: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const novelEditorRef = useRef<NovelEditorRef | null>(null);
  const [isCreatingSubtask, setIsCreatingSubtask] = useState<boolean>(false);
  const [newSubtaskName, setNewSubtaskName] = useState<string>("");
  const [assigneesColumnSearchTerm, setAssigneesColumnSearchTerm] = useState<string>("");
  // Toolbar and filters identical to project table
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<Array<Task["status"]>>([]);
  const [priorityFilter, setPriorityFilter] = useState<Array<Task["priority"]>>([]);
  const [dueDateFilter, setDueDateFilter] = useState<""|"tomorrow"|"yesterday"|"this-week">("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [taskSort, setTaskSort] = useState<"name-asc"|"name-desc"|"">("");
  // Removed fullscreen feature

  // Comments badge state for the "Comments" tab: show "@" if mentioned, else show count
  const [commentBadge, setCommentBadge] = useState<{ count: number; mentioned: boolean }>({
    count: 0,
    mentioned: false,
  });
  const [mentionLatestMs, setMentionLatestMs] = useState<number>(0);
  const [lastSeenMentionMs, setLastSeenMentionMs] = useState<number>(0);

  // Initialize last seen mention timestamp from localStorage
  useEffect(() => {
    const uid = (user as any)?.uid as string | undefined;
    if (!uid || !taskId) return;
    try {
      const key = `mentions:lastSeen:${uid}:${taskId}`;
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      const parsed = raw ? parseInt(raw, 10) : 0;
      if (!isNaN(parsed)) setLastSeenMentionMs(parsed);
    } catch {}
  }, [taskId, (user as any)?.uid]);

  useEffect(() => {
    if (!taskId) return;
    // Lightweight watcher for all comments under this task to compute total count and mention presence
    const q = query(collection(db, "comments"), where("taskId", "==", taskId));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{
        id: string;
        text?: string;
        parentId?: string | null;
        authorId?: string;
      }>;

  const totalCount = rows.length; // counting all comments (top-level + replies)

      // Build candidate mention name patterns for current user (prefer displayName; fallback to first+last)
      let candidateNames: string[] = [];
      const displayName = (user as any)?.displayName as string | undefined;
      const first = (user as any)?.firstName as string | undefined;
      const last = (user as any)?.lastName as string | undefined;
      const full = [first, last].filter(Boolean).join(" ").trim();
      if (displayName && !candidateNames.includes(displayName)) candidateNames.push(displayName);
      if (full && full.length > 0 && full !== displayName) candidateNames.push(full);

      const regexes = candidateNames.map((name) => {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Match "@Name" with boundaries; allow preceding non-word or start; avoid trailing word char
        return new RegExp(`(^|[^@\\w])@${escaped}(?![\\w])`, "i");
      });

      const currentUserId = (user as any)?.uid as string | undefined;
      let latest = 0;
      if (regexes.length > 0) {
        for (const r of rows) {
          if (currentUserId && r.authorId === currentUserId) continue; // ignore self-authored mentions
          const t = (r.text || "").trim();
          if (t && regexes.some((re) => re.test(t))) {
            const ts = (r as any).createdAtMs as number | undefined;
            if (typeof ts === "number") latest = Math.max(latest, ts);
          }
        }
      }

      setMentionLatestMs(latest);
      const hasUnreadMention = latest > (lastSeenMentionMs || 0);
      setCommentBadge({ count: totalCount, mentioned: hasUnreadMention });
    });
    return () => unsub();
  }, [taskId, user?.displayName, (user as any)?.firstName, (user as any)?.lastName, lastSeenMentionMs]);

  // When opening the Comments tab, mark mentions as read (persist last seen)
  useEffect(() => {
    if (activeTab !== "comments") return;
    const uid = (user as any)?.uid as string | undefined;
    if (!uid || !taskId) return;
    try {
      const key = `mentions:lastSeen:${uid}:${taskId}`;
      if (mentionLatestMs > 0) {
        if (typeof window !== "undefined") window.localStorage.setItem(key, String(mentionLatestMs));
        setLastSeenMentionMs(mentionLatestMs);
        setCommentBadge((prev) => ({ ...prev, mentioned: false }));
      }
    } catch {}
  }, [activeTab, mentionLatestMs, taskId, (user as any)?.uid]);

  // Tags and popovers
  const [allExistingTags, setAllExistingTags] = useState<string[]>([]);
  const [projectTagNames, setProjectTagNames] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState<string>("");
  const [openPopovers, setOpenPopovers] = useState({
    status: false,
    priority: false,
    assignees: false,
    dueDate: false,
    tags: false,
  });
  // Inline description editing (Details tab)
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState<string>("");
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const descCancelNextBlurRef = useRef<boolean>(false);
  const togglePopover = (
    key: keyof typeof openPopovers,
    open?: boolean
  ) => setOpenPopovers((prev) => ({ ...prev, [key]: open ?? !prev[key] }));

  // Available tag names for subtasks: union of projectTagNames and tag names found in current subtasks
  const availableSubtaskTags = useMemo(() => {
    const fromProject = projectTagNames || [];
    const fromSubtasks = (data?.subtasks || []).flatMap((t) => t.tags || []);
    return Array.from(new Set([...(fromProject as string[]), ...fromSubtasks]));
  }, [projectTagNames, data?.subtasks]);

  // Indentation constants to mirror project table view
  const BASE_PADDING = 16; // px
  const INDENT_PER_LEVEL = 24; // px per level

  // Subscriptions helpers
  const unsubsRef = useRef<Array<() => void>>([]);
  const lastTaskRef = useRef<Task | null>(null);
  // Cache members to avoid brief empty states that cause assignee flicker
  const memberIndexRef = useRef<Record<string, DisplayUser>>({});

  // Fetch project-level tags independently (used on mount for availability)
  const fetchExistingTags = useCallback(async () => {
    if (!projectId) return;
    try {
      const projectRef = doc(db, "projects", projectId);
      const snap = await getDoc(projectRef);
      if (snap.exists()) {
        const rawTags = (snap.data() as any).tags || [];
        const unique = normalizeProjectTagNames(rawTags);
        if (unique.length) {
          setProjectTagNames(unique);
          setAllExistingTags((prev) => unionTagNames(prev, unique));
        }
      }
    } catch (e) {
      // non-fatal: leave tags empty
    }
  }, [projectId]);

  // Fetch task, project and subtasks (live via snapshot)
  const fetchTaskData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Subscribe to task
      const taskRef = doc(db, "tasks", taskId);
      const unsubTask = onSnapshot(taskRef, (taskDoc) => {
        if (!taskDoc.exists()) {
          setError("Task not found");
          setIsLoading(false);
          return;
        }
        const taskData = { id: taskDoc.id, ...(taskDoc.data() as any) } as Task;
        lastTaskRef.current = taskData;
        setData((prev) => ({
          task: taskData,
          project: prev?.project || ({} as any),
          department: prev?.department || ({} as any),
          allProjectMembers: prev?.allProjectMembers || [],
          subtasks: prev?.subtasks || [],
        } as TaskPageData));
        setEditedTask((prev) => ({
          ...prev,
          name: taskData.name,
          description: (taskData as any).description,
          status: taskData.status,
          priority: taskData.priority,
          assignedUserIds: taskData.assignedUserIds || [],
          dueDate: (taskData as any).dueDate,
          tags: (taskData as any).tags || [],
        }));
      });
      unsubsRef.current.push(unsubTask);

      // Subscribe to project and populate members + department + tags
      const projectRef = doc(db, "projects", projectId);
      const unsubProject = onSnapshot(projectRef, async (projectDoc) => {
        if (!projectDoc.exists()) {
          setError("Project not found");
          setIsLoading(false);
          return;
        }
        const projectRawData = {
          id: projectDoc.id,
          ...projectDoc.data(),
        } as Project;

        if (projectRawData.departmentId !== departmentId) {
          setError("Project does not belong to this department");
          setIsLoading(false);
          return;
        }

        // Department details from organization's customDepartments
        let departmentData: Department | null = null;
        try {
          const orgDoc = await getDoc(doc(db, "organizations", projectRawData.orgId));
          if (orgDoc.exists()) {
            const orgData = orgDoc.data();
            const customDepartments = orgData.customDepartments || [];
            const foundDepartment = customDepartments.find(
              (dept: any) => dept.id === projectRawData.departmentId
            );
            if (foundDepartment) {
              departmentData = {
                id: foundDepartment.id,
                name: foundDepartment.name,
                description:
                  foundDepartment.description || `Department: ${foundDepartment.name}`,
                orgId: projectRawData.orgId,
                memberIds: orgData.memberUserIds || [],
                createdAt: orgData.createdAt?.toDate() || new Date(),
                updatedAt: orgData.updatedAt?.toDate() || new Date(),
                controllerUserIds: foundDepartment.controllerUserIds || [],
                parentDepartmentId: foundDepartment.parentDepartmentId ?? null,
                path: foundDepartment.path ?? "/",
                level: foundDepartment.level ?? 0,
                childDepartmentIds: foundDepartment.childDepartmentIds || [],
                hasChildren: foundDepartment.hasChildren ?? false,
                ancestorIds: foundDepartment.ancestorIds || [],
              } as Department;
            }
          }
        } catch (deptError) {
          // fall back to placeholder
        }
        if (!departmentData) {
          departmentData = {
            id: projectRawData.departmentId,
            name: projectRawData.departmentId,
            description: `Department: ${projectRawData.departmentId}`,
            orgId: projectRawData.orgId,
            memberIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            controllerUserIds: [],
            parentDepartmentId: null,
            path: "/",
            level: 0,
            childDepartmentIds: [],
            hasChildren: false,
            ancestorIds: [],
          } as Department;
        }

        const displayProject: DisplayProject = {
          id: projectRawData.id,
          name: projectRawData.name,
          description: projectRawData.description,
          assignees: [],
          deadline: (projectRawData as any).dueDate
            ? getSafeDate((projectRawData as any).dueDate) || undefined
            : undefined,
          departmentId: projectRawData.departmentId,
          departmentName: (departmentData as Department).name,
          orgId: projectRawData.orgId,
          assignedUserIds: (projectRawData as any).assignedUserIds,
        };

        // Members
  const allProjectMembers: DisplayUser[] = [];
        if ((projectRawData as any).assignedUserIds?.length > 0) {
          for (const userId of (projectRawData as any).assignedUserIds as string[]) {
            try {
              const userDoc = await getDoc(doc(db, "users", userId));
              if (userDoc.exists()) {
                const userData = userDoc.data() as any;
                allProjectMembers.push({
                  id: userDoc.id,
                  name:
                    userData.displayName ||
                    userData.name ||
                    nameFromParts(userData) ||
                    nameFromEmail(userData.email) ||
                    (userData.email || "").toString() ||
                    "Unknown User",
                  email: userData.email,
                  avatarUrl: userData.photoURL || userData.avatarUrl,
                });
              }
            } catch (userError) {
              console.warn(`Failed to fetch user ${userId}:`, userError);
            }
          }
        }
        // Update cache with latest members
        if (allProjectMembers.length > 0) {
          for (const u of allProjectMembers) {
            if (u && u.id) memberIndexRef.current[u.id] = u;
          }
        }
        displayProject.assignees = allProjectMembers;

        // Tags
        try {
          const rawTags = (projectDoc.data() as any).tags || [];
          const unique = normalizeProjectTagNames(rawTags);
          if (unique.length) {
            setProjectTagNames(unique);
            setAllExistingTags((prev) => unionTagNames(prev, unique));
          }
        } catch {}

        // No local cache writes on this page

        // Subtasks subscription
        const subtasksQuery = query(
          collection(db, "tasks"),
          where("parentTaskId", "==", taskId)
        );
        const unsubSubtasks = onSnapshot(subtasksQuery, (snap) => {
          const subtasks: Task[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as any;
          setData((prev) => (prev ? { ...prev, subtasks } : prev));
        });
        unsubsRef.current.push(unsubSubtasks);

        // Merge task with members
        setData((prev) => {
          const baseTask = lastTaskRef.current || prev?.task || null;
          const mergedTask = baseTask
            ? ({
                ...baseTask,
                assignedUsers: (baseTask.assignedUserIds || [])
                  .map((userId) =>
                    allProjectMembers.find((member) => member.id === userId) || memberIndexRef.current[userId]
                  )
                  .filter(Boolean) as DisplayUser[],
              } as any)
            : null;

          // Avoid clearing member list to empty on transient updates
          const finalMembers = allProjectMembers.length > 0 ? allProjectMembers : (prev?.allProjectMembers || []);

          const nextData: TaskPageData = {
            task: (mergedTask as Task) || (prev?.task as Task),
            project: displayProject,
            department: departmentData as Department,
            allProjectMembers: finalMembers,
            subtasks: prev?.subtasks || [],
          };
          return nextData;
        });
        setIsLoading(false);
      });
      unsubsRef.current.push(unsubProject);
    } catch (error) {
      console.error("Error fetching task data:", error);
      setError(error instanceof Error ? error.message : "Failed to load task");
    } finally {
      // loading is turned off by snapshots when they deliver
    }
  }, [taskId, projectId, departmentId]);

  useEffect(() => {
    // cleanup any stale subscriptions first
    if (unsubsRef.current.length) {
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
    }
    fetchTaskData();
    fetchExistingTags();
    return () => {
      // Unsubscribe from active listeners
      if (unsubsRef.current.length) {
        unsubsRef.current.forEach((u) => u());
        unsubsRef.current = [];
      }
    };
  }, [fetchTaskData, fetchExistingTags]);

  const handleUpdateTask = async (updates: Partial<Task>) => {
    if (!data?.task) return;

    setIsUpdating(true);
    try {
      const taskRef = doc(db, "tasks", data.task.id);

      await updateDoc(taskRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      // Update local state with populated assignees if assignedUserIds were updated
      const updatedTask = { ...data.task, ...updates };
      if (updates.assignedUserIds) {
        const taskAssignees = (updates.assignedUserIds || [])
          .map((userId) =>
            data.allProjectMembers.find((member) => member.id === userId)
          )
          .filter(Boolean) as DisplayUser[];
        updatedTask.assignedUsers = taskAssignees;
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              task: updatedTask,
            }
          : null
      );

      setEditedTask((prev) => ({ ...prev, ...updates }));

      // Refresh existing tags if tags were updated
      if (updates.tags) {
        fetchExistingTags();
      }

      toast.success("Task updated successfully");
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle document content updates from Novel Editor
  const handleDocumentChange = useCallback(
    async (content: JSONContent) => {
      if (!data?.task) return;

      try {
        const taskRef = doc(db, "tasks", data.task.id);
        await updateDoc(taskRef, {
          document: content,
          updatedAt: serverTimestamp(),
        });

        // Update local state
        setData((prev) =>
          prev
            ? {
                ...prev,
                task: { ...prev.task, document: content },
              }
            : null
        );
      } catch (error) {
        console.error("Error updating task document:", error);
        // Don't show error toast for auto-save to avoid spam
      }
    },
    [data?.task]
  );

  const handleSaveEdits = async () => {
    if (!data?.task || !editedTask.name?.trim()) {
      toast.error("Task name is required");
      return;
    }

    const updates: Partial<Task> = {
      name: editedTask.name.trim(),
      status: editedTask.status,
      priority: editedTask.priority,
      assignedUserIds: editedTask.assignedUserIds || [],
      tags: editedTask.tags || [],
    };

    // Only update description if user explicitly edited it in the form
    if (
      editedTask.description !== undefined &&
      editedTask.description !== data.task.description
    ) {
      updates.description = editedTask.description;
    }

    if (editedTask.dueDate) {
      updates.dueDate =
        editedTask.dueDate instanceof Date
          ? Timestamp.fromDate(editedTask.dueDate)
          : editedTask.dueDate;
    }

    await handleUpdateTask(updates);
    setIsEditing(false);
  };

  const handleCreateSubtask = async () => {
    if (!data?.task || !newSubtaskName.trim()) {
      toast.error("Subtask name is required");
      return;
    }

    setIsCreatingSubtask(true);
    try {
      // Create the new subtask
      const subtaskData = {
        name: newSubtaskName.trim(),
        description: "",
        status: "To Do" as const,
        priority: "Medium" as const,
        projectId: data.task.projectId,
        orgId: data.project.orgId,
        assignedUserIds: [],
        tags: [],
        parentTaskId: data.task.id,
        subtaskIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const subtaskRef = await addDoc(collection(db, "tasks"), subtaskData);

      // Update parent task's subtaskIds array
      const taskRef = doc(db, "tasks", data.task.id);
      await updateDoc(taskRef, {
        subtaskIds: arrayUnion(subtaskRef.id),
        updatedAt: serverTimestamp(),
      });

  // Existing snapshots will reflect the new subtask
  setNewSubtaskName("");
      toast.success("Subtask created successfully");
    } catch (error) {
      console.error("Error creating subtask:", error);
      toast.error("Failed to create subtask");
    } finally {
      setIsCreatingSubtask(false);
    }
  };

  // Comments handled by CommentsThread

  // Attachments via Azure Blob (server-routed)
  type AzureAttachment = { name: string; blobName: string; size: number; contentType?: string; lastModified?: string; uploadedAt?: string; uploadedByName?: string; uploadedById?: string };
  const [azureAttachments, setAzureAttachments] = useState<AzureAttachment[]>([]);
  const [attachmentQuery, setAttachmentQuery] = useState<string>("");
  type UploadItem = { id: string; name: string; size: number; progress: number; status: "uploading"|"done"|"error" };
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [attachmentView, setAttachmentView] = useState<"list"|"grid">("list");
  const uploadXhrsRef = useRef<Record<string, XMLHttpRequest>>({});

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/attachments/${taskId}/list`, { cache: "no-store" });
      if (!res.ok) throw new Error("list failed");
      const data = await res.json();
      setAzureAttachments(data.items || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load attachments");
    }
  }, [taskId]);

  // Simple fuzzy subsequence match (case-insensitive)
  const fuzzyIncludes = (text: string, query: string) => {
    const t = (text || "").toLowerCase();
    const q = (query || "").toLowerCase();
    if (!q) return true;
    // quick substring first
    if (t.includes(q)) return true;
    // subsequence match
    let ti = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const ch = q[qi];
      ti = t.indexOf(ch, ti);
      if (ti === -1) return false;
      ti += 1;
    }
    return true;
  };

  const filteredAttachments = useMemo(() => {
    const q = attachmentQuery.trim();
    if (!q) return azureAttachments;
    return azureAttachments.filter((a) =>
      fuzzyIncludes(a.name || "", q) ||
      fuzzyIncludes(a.contentType || "", q) ||
      fuzzyIncludes(a.uploadedByName || "", q)
    );
  }, [azureAttachments, attachmentQuery]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleFilesChosen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const max = 100 * 1024 * 1024; // 100 MB max (matches server SAS cap)
    const arr = Array.from(files).filter((f) => {
      if (f.size > max) {
        toast.error(`${f.name} exceeds 100 MB`);
        return false;
      }
      return true;
    });
    if (arr.length === 0) return;
    await Promise.all(arr.map((file) => uploadWithProgress(file)));
  };

  const uploadWithProgress = (file: File) => new Promise<void>(async (resolve) => {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    setUploads((prev) => [...prev, { id, name: file.name, size: file.size, progress: 0, status: "uploading" }]);

    try {
      // 1) Ask server for a short-lived upload SAS for this specific blob
      const sasRes = await fetch(`/api/attachments/${taskId}/sas/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size }),
      });
      if (!sasRes.ok) throw new Error("failed to get upload SAS");
      const { uploadUrl, requiredHeaders } = await sasRes.json();

      // 2) PUT the file directly to Azure Blob using the SAS URL
      const xhr = new XMLHttpRequest();
      uploadXhrsRef.current[id] = xhr;
      xhr.open("PUT", uploadUrl, true);
      // Required Azure headers
      xhr.setRequestHeader("x-ms-blob-type", (requiredHeaders?.["x-ms-blob-type"]) || "BlockBlob");
      xhr.setRequestHeader("x-ms-blob-content-type", (requiredHeaders?.["x-ms-blob-content-type"]) || (file.type || "application/octet-stream"));
      // Metadata
      try {
        const u: any = user;
        const uploaderName = (u?.displayName as string) || nameFromEmail(u?.email) || "";
        if (file.name) xhr.setRequestHeader("x-ms-meta-originalName", encodeURIComponent(file.name));
        if (taskId) xhr.setRequestHeader("x-ms-meta-taskId", encodeURIComponent(taskId));
        if (uploaderName) xhr.setRequestHeader("x-ms-meta-uploadedByName", encodeURIComponent(uploaderName));
        if (u?.uid) xhr.setRequestHeader("x-ms-meta-uploadedById", encodeURIComponent(u.uid));
        xhr.setRequestHeader("x-ms-meta-uploadedAt", new Date().toISOString());
      } catch {}

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: pct } : u)));
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          const ok = xhr.status >= 200 && xhr.status < 300;
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: 100, status: ok ? "done" : "error" } : u)));
          if (ok) {
            fetchAttachments();
            toast.success(`${file.name} uploaded`);
          } else {
            console.error("Upload failed:", xhr.responseText);
            toast.error(`${file.name} failed`);
          }
          delete uploadXhrsRef.current[id];
          setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== id || u.status === "uploading")), 1200);
          resolve();
        }
      };
      xhr.send(file);
    } catch (err) {
      console.error(err);
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "error" } : u)));
      delete uploadXhrsRef.current[id];
      toast.error(`${file.name} failed`);
      resolve();
    }
  });

  const cancelUpload = (id: string) => {
    try {
      uploadXhrsRef.current[id]?.abort();
    } catch {}
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "error" } : u)));
  };

  const onDropFiles = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files || null;
    if (files) handleFilesChosen(files);
  };

  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
  };

  const formatBytes = (bytes: number) => {
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let num = bytes;
    while (num >= 1024 && i < units.length - 1) {
      num /= 1024;
      i++;
    }
    return `${num.toFixed(num >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const fileIconFor = (ct?: string, name?: string) => {
    const ext = (name || "").split(".").pop()?.toLowerCase() || "";
    if (ct?.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return <ImageIcon className="h-4 w-4" />;
    if (ct === "application/pdf" || ext === "pdf") return <FileText className="h-4 w-4" />;
    if (["zip","rar","7z","gz","tar"].includes(ext)) return <Archive className="h-4 w-4" />;
    if ((ct||"").startsWith("video/") || ["mp4","mov","webm","mkv"].includes(ext)) return <Video className="h-4 w-4" />;
    if ((ct||"").startsWith("audio/") || ["mp3","wav","m4a","flac"].includes(ext)) return <Music className="h-4 w-4" />;
    if (["ts","tsx","js","jsx","json","yml","yaml","xml","md","txt"].includes(ext)) return <FileCode className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  };

  // Accent colors for playful vibes by file type
  const fileAccentFor = (ct?: string, name?: string) => {
    const ext = (name || "").split(".").pop()?.toLowerCase() || "";
    if (ct?.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg"].includes(ext)) return { bg: "bg-pink-500/15", text: "text-pink-500" };
    if (ct === "application/pdf" || ext === "pdf") return { bg: "bg-red-500/15", text: "text-red-500" };
    if ((ct||"").startsWith("video/") || ["mp4","mov","webm","mkv"].includes(ext)) return { bg: "bg-violet-500/15", text: "text-violet-500" };
    if ((ct||"").startsWith("audio/") || ["mp3","wav","m4a","flac"].includes(ext)) return { bg: "bg-emerald-500/15", text: "text-emerald-600" };
    if (["doc","docx"].includes(ext)) return { bg: "bg-sky-500/15", text: "text-sky-600" };
    if (["xls","xlsx","csv"].includes(ext)) return { bg: "bg-green-500/15", text: "text-green-600" };
    if (["ppt","pptx"].includes(ext)) return { bg: "bg-orange-500/15", text: "text-orange-600" };
    if (["zip","rar","7z","gz","tar"].includes(ext)) return { bg: "bg-amber-500/15", text: "text-amber-600" };
    return { bg: "bg-blue-500/12", text: "text-blue-600" };
  };

  const handleSubtaskStatusChange = async (
    subtaskId: string,
    newStatus: Task["status"]
  ) => {
    try {
      const subtaskRef = doc(db, "tasks", subtaskId);
      await updateDoc(subtaskRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        const updatedSubtasks = prev.subtasks.map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, status: newStatus } : subtask
        );
        return { ...prev, subtasks: updatedSubtasks };
      });

      toast.success("Subtask status updated");
    } catch (error) {
      console.error("Error updating subtask status:", error);
      toast.error("Failed to update subtask status");
    }
  };

  // Additional subtask update helpers for table view
  const handleUpdateSubtaskPriority = async (
    subtaskId: string,
    newPriority: Task["priority"] | null
  ) => {
    try {
      const subtaskRef = doc(db, "tasks", subtaskId);
      await updateDoc(subtaskRef, {
        priority: newPriority,
        updatedAt: serverTimestamp(),
      } as any);

      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.subtasks.map((t) =>
          t.id === subtaskId ? ({ ...t, priority: newPriority } as Task) : t
        );
        return { ...prev, subtasks: updated };
      });
    } catch (e) {
      console.error("Failed to update subtask priority", e);
      toast.error("Failed to update subtask priority");
    }
  };

  const handleUpdateSubtaskAssignees = async (
    subtaskId: string,
    newAssigneeIds: string[]
  ) => {
    try {
      const subtaskRef = doc(db, "tasks", subtaskId);
      await updateDoc(subtaskRef, {
        assignedUserIds: newAssigneeIds,
        updatedAt: serverTimestamp(),
      });

      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.subtasks.map((t) =>
          t.id === subtaskId ? ({ ...t, assignedUserIds: newAssigneeIds } as Task) : t
        );
        return { ...prev, subtasks: updated };
      });
    } catch (e) {
      console.error("Failed to update subtask assignees", e);
      toast.error("Failed to update subtask assignees");
    }
  };

  const handleUpdateSubtaskDueDate = async (
    subtaskId: string,
    date: Date | null
  ) => {
    try {
      const subtaskRef = doc(db, "tasks", subtaskId);
      await updateDoc(subtaskRef, {
        dueDate: date ? Timestamp.fromDate(date) : null,
        updatedAt: serverTimestamp(),
      } as any);

      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.subtasks.map((t) =>
          t.id === subtaskId ? ({ ...t, dueDate: date ? Timestamp.fromDate(date) : (null as any) } as Task) : t
        );
        return { ...prev, subtasks: updated };
      });
    } catch (e) {
      console.error("Failed to update subtask due date", e);
      toast.error("Failed to update subtask due date");
    }
  };

  const handleUpdateSubtaskTags = async (
    subtaskId: string,
    newTags: string[]
  ) => {
    try {
      const subtaskRef = doc(db, "tasks", subtaskId);
      await updateDoc(subtaskRef, {
        tags: newTags,
        updatedAt: serverTimestamp(),
      });

      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.subtasks.map((t) =>
          t.id === subtaskId ? ({ ...t, tags: newTags } as Task) : t
        );
        return { ...prev, subtasks: updated };
      });
    } catch (e) {
      console.error("Failed to update subtask tags", e);
      toast.error("Failed to update subtask tags");
    }
  };

  // Hierarchical expansion for nested subtasks (lazy subscribe on expand)
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());
  // Project-level children index (mirrors TABLE VIEW): parentTaskId -> immediate children
  const [projectTasksIndex, setProjectTasksIndex] = useState<Record<string, Task[]>>({});
  // Track ids being deleted to avoid flicker when snapshot briefly still contains them
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const childUnsubsRef = useRef<Record<string, () => void>>({});
  // Track hovered subtask row for keyboard shortcuts (parity with project table)
  const [hoveredSubtaskId, setHoveredSubtaskId] = useState<string | null>(null);
  // Subtask deletion modal state (parity with project table)
  const [isDeleteConfirmOpenSub, setIsDeleteConfirmOpenSub] = useState(false);
  const [subtaskToDelete, setSubtaskToDelete] = useState<Task | null>(null);
  // New Subtask dialog state for header button
  const [isNewSubtaskDialogOpen, setIsNewSubtaskDialogOpen] = useState(false);
  const [currentParentTaskForSubtask, setCurrentParentTaskForSubtask] = useState<Task | null>(null);
  // Rich Subtask dialog state (parity with table view)
  type NewTaskData = { name: string; description: string; priority: "Low"|"Medium"|"High"; status: Task["status"]; tags: string; parentTaskId?: string; dueDate?: Date };
  const [newSubtaskData, setNewSubtaskData] = useState<NewTaskData>({ name: "", description: "", priority: "Medium", status: "To Do", tags: "", parentTaskId: undefined });
  const [selectedSubtaskAssigneeIds, setSelectedSubtaskAssigneeIds] = useState<string[]>([]);
  const [subtaskAssigneeSearchTerm, setSubtaskAssigneeSearchTerm] = useState("");
  const [isSubtaskAssigneePopoverOpen, setIsSubtaskAssigneePopoverOpen] = useState(false);
  const [isSubtaskDueDatePopoverOpen, setIsSubtaskDueDatePopoverOpen] = useState(false);
  // Edit Task dialog state (full parity)
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  const [currentEditingTask, setCurrentEditingTask] = useState<Task | null>(null);
  const [editTaskData, setEditTaskData] = useState<NewTaskData>({ name: "", description: "", priority: "Medium", status: "To Do", tags: "", parentTaskId: undefined });
  const [selectedEditTaskAssigneeIds, setSelectedEditTaskAssigneeIds] = useState<string[]>([]);
  const [editTaskAssigneeSearchTerm, setEditTaskAssigneeSearchTerm] = useState("");
  const [isEditTaskAssigneePopoverOpen, setIsEditTaskAssigneePopoverOpen] = useState(false);
  const [isEditTaskDueDatePopoverOpen, setIsEditTaskDueDatePopoverOpen] = useState(false);
  const filteredAssigneesForSubtaskDialog = useMemo(() => {
    const members = data?.allProjectMembers || [];
    if (!subtaskAssigneeSearchTerm) return members;
    return members.filter((user) => (user.name||"").toLowerCase().includes(subtaskAssigneeSearchTerm.toLowerCase()) || (user.email||"").toLowerCase().includes(subtaskAssigneeSearchTerm.toLowerCase()));
  }, [data?.allProjectMembers, subtaskAssigneeSearchTerm]);

  const filteredAssigneesForEditTaskDialog = useMemo(() => {
    const members = data?.allProjectMembers || [];
    if (!editTaskAssigneeSearchTerm) return members;
    return members.filter((user) => (user.name||"").toLowerCase().includes(editTaskAssigneeSearchTerm.toLowerCase()) || (user.email||"").toLowerCase().includes(editTaskAssigneeSearchTerm.toLowerCase()));
  }, [data?.allProjectMembers, editTaskAssigneeSearchTerm]);

  const openEditTaskDialog = (t: Task) => {
    setCurrentEditingTask(t);
    setEditTaskData({
      name: t.name,
      description: (t as any).description || "",
      priority: t.priority || "Medium",
      status: t.status,
      tags: (t.tags || []).join(", "),
      parentTaskId: t.parentTaskId,
      dueDate: getSafeDate((t as any).dueDate) || undefined,
    });
    setSelectedEditTaskAssigneeIds(t.assignedUserIds || []);
    setEditTaskAssigneeSearchTerm("");
    setIsEditTaskAssigneePopoverOpen(false);
    setIsEditTaskDueDatePopoverOpen(false);
    setIsEditTaskDialogOpen(true);
  };

  const handleUpdateExistingTask = async () => {
    if (!currentEditingTask || !editTaskData.name.trim()) {
      toast.error("Task name is required.");
      return;
    }
    try {
      const taskRef = doc(db, "tasks", currentEditingTask.id);
      await updateDoc(taskRef, {
        name: editTaskData.name.trim(),
        description: editTaskData.description.trim(),
        assignedUserIds: selectedEditTaskAssigneeIds,
        priority: editTaskData.priority,
        status: editTaskData.status,
        tags: editTaskData.tags.split(",").map((t)=> t.trim()).filter(Boolean),
        dueDate: editTaskData.dueDate ? Timestamp.fromDate(editTaskData.dueDate) : null,
        updatedAt: serverTimestamp(),
      } as any);
      toast.success("Task updated successfully!");
      setIsEditTaskDialogOpen(false);
      setCurrentEditingTask(null);
      setSelectedEditTaskAssigneeIds([]);
      setEditTaskAssigneeSearchTerm("");
    } catch (e) {
      console.error("Failed to update task", e);
      toast.error("Failed to update task.");
    }
  };

  // Ensure context menu unmounts before opening any dialogs/popovers to avoid aria-hidden issues
  const closeContextMenuThen = (action: () => void) => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    setTimeout(() => action(), 10);
  };

  // Keyboard shortcuts for Subtasks table (active only on subtasks tab)
  useEffect(() => {
    if (activeTab !== "subtasks") return;

    const isEditableElement = (el: Element | null) => {
      if (!el) return false;
      const he = el as HTMLElement;
      const tag = he.tagName?.toLowerCase();
      if (he.isContentEditable) return true;
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (he.getAttribute("role") === "textbox") return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hoveredSubtaskId) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableElement(document.activeElement)) return;

      const st =
        (data?.subtasks || []).find((t) => t.id === hoveredSubtaskId) ||
        Object.values(projectTasksIndex).flat().find((t) => t.id === hoveredSubtaskId);
      if (!st) return;

      switch (e.key.toLowerCase()) {
        case "enter":
          e.preventDefault();
          closeContextMenuThen(() => router.push(`/dashboard/teams/${departmentId}/projects/${projectId}/tasks/${hoveredSubtaskId}`));
          break;
        case "r": {
          e.preventDefault();
          const rowEl = document.querySelector(`[data-subtask-row-id="${hoveredSubtaskId}"]`) as HTMLElement | null;
          if (rowEl) {
            const rect = rowEl.getBoundingClientRect();
            const x = rect.left + rect.width * 0.7;
            const y = rect.top + rect.height * 0.5;
            rowEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: x, clientY: y }));
          }
          break;
        }
        case "e": {
          e.preventDefault();
          closeContextMenuThen(() => openEditTaskDialog(st));
          break;
        }
        case "c": {
          e.preventDefault();
          closeContextMenuThen(() => openNewChildSubtaskDialog(st));
          break;
        }
        case "s": {
          e.preventDefault();
          const hasChildren =
            ((st.subtaskIds?.length || 0) > 0) ||
            ((projectTasksIndex[st.id]?.length || 0) > 0) ||
            expandedSubtasks.has(st.id);
          if (hasChildren) toggleSubtaskExpanded(st.id);
          break;
        }
        case "d": {
          e.preventDefault();
          handleDeleteSubtaskClick(st.id);
          break;
        }
        case "1": e.preventDefault(); handleSubtaskStatusChange(st.id, "To Do"); break;
        case "2": e.preventDefault(); handleSubtaskStatusChange(st.id, "In Progress"); break;
        case "3": e.preventDefault(); handleSubtaskStatusChange(st.id, "In Review"); break;
        case "4": e.preventDefault(); handleSubtaskStatusChange(st.id, "Blocked"); break;
        case "5": e.preventDefault(); handleSubtaskStatusChange(st.id, "Completed"); break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, hoveredSubtaskId, data?.subtasks, projectTasksIndex]);

  const toggleSubtaskExpanded = (parentId: string) => {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId);
      return next;
    });
  };

  const handleSubtaskClick = (subtaskId: string) => {
    router.push(`/dashboard/teams/${departmentId}/projects/${projectId}/tasks/${subtaskId}`);
  };

  // Open create-subtask dialog under given subtask (reuse existing new-subtask flow with parent = that subtask)
  const openNewChildSubtaskDialog = (parent: Task) => {
    // Mirror table view: open the full dialog with selected parent
    setCurrentParentTaskForSubtask(parent);
    setNewSubtaskData({ name: "", description: "", priority: "Medium", status: "To Do", tags: "", parentTaskId: parent.id });
    setSelectedSubtaskAssigneeIds([]);
    setSubtaskAssigneeSearchTerm("");
    setIsSubtaskAssigneePopoverOpen(false);
    setIsSubtaskDueDatePopoverOpen(false);
    setIsNewSubtaskDialogOpen(true);
  };

  const handleDeleteSubtaskClick = (subtaskId: string) => {
  const st = (data?.subtasks || []).find((t) => t.id === subtaskId) || Object.values(projectTasksIndex).flat().find((t) => t.id === subtaskId);
    if (st) {
      setSubtaskToDelete(st);
      setIsDeleteConfirmOpenSub(true);
    }
  };

  const handleConfirmDeleteSubtask = async () => {
    if (!subtaskToDelete) return;
    try {
      // Suppress flicker by marking as pending deletion until snapshot no longer contains it
      pendingDeleteIdsRef.current.add(subtaskToDelete.id);
      
      // Optimistically remove from local data.subtasks
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subtasks: prev.subtasks.filter((t) => t.id !== subtaskToDelete.id),
        };
      });
      
      // remove from parent subtaskIds
      if (subtaskToDelete.parentTaskId) {
        // Optimistically update UI for the expanded parent's children list
        setProjectTasksIndex((m) => {
          const existing = m[subtaskToDelete.parentTaskId!] || [];
          const nextChildren = existing.filter((t) => t.id !== subtaskToDelete!.id);
          return { ...m, [subtaskToDelete.parentTaskId!]: nextChildren };
        });
        await updateDoc(doc(db, "tasks", subtaskToDelete.parentTaskId), {
          subtaskIds: arrayRemove(subtaskToDelete.id),
          updatedAt: serverTimestamp(),
        } as any);
      }
      
      await deleteDoc(doc(db, "tasks", subtaskToDelete.id));
      toast.success("Task deleted");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete task");
    } finally {
      setIsDeleteConfirmOpenSub(false);
      setSubtaskToDelete(null);
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup child subscriptions (unused now, but keep safe)
      Object.values(childUnsubsRef.current).forEach((u) => {
        try { u(); } catch {}
      });
      childUnsubsRef.current = {};
    };
  }, []);

  // Mirror TABLE VIEW: subscribe to all tasks in this project and build a children index
  useEffect(() => {
    if (!projectId) return;
    const q = query(collection(db, "tasks"), where("projectId", "==", projectId));
    const unsubAll = onSnapshot(q, (snap) => {
      const all: Task[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any;
      // Build a quick set of doc ids for pending cleanup
      const docIdSet = new Set(all.map((t) => t.id));

      // Filter out any task currently pending deletion to avoid flicker
      const visible: Task[] = all.filter((t) => !pendingDeleteIdsRef.current.has(t.id));

      // Clean up pending set entries that no longer exist in the snapshot
      if (pendingDeleteIdsRef.current.size) {
        const toClear: string[] = [];
        pendingDeleteIdsRef.current.forEach((id) => {
          if (!docIdSet.has(id)) toClear.push(id);
        });
        if (toClear.length) {
          toClear.forEach((id) => pendingDeleteIdsRef.current.delete(id));
        }
      }

      const index: Record<string, Task[]> = {};
      for (const t of visible) {
        if (!t.parentTaskId) continue;
        if (!index[t.parentTaskId]) index[t.parentTaskId] = [];
        index[t.parentTaskId].push(t);
      }
      setProjectTasksIndex(index);
    });
    return () => unsubAll();
  }, [projectId]);

  const handleAssigneeToggle = (userId: string) => {
    if (!data?.task) return;

    const currentAssignees = data.task.assignedUserIds || [];
    const isAssigned = currentAssignees.includes(userId);

    let updatedAssignees: string[];
    if (isAssigned) {
      updatedAssignees = currentAssignees.filter((id) => id !== userId);
    } else {
      updatedAssignees = [...currentAssignees, userId];
    }

    handleUpdateTask({ assignedUserIds: updatedAssignees });
  };

  const handleDueDateChange = (date: Date | undefined) => {
    if (!data?.task) return;

    const updates: Partial<Task> = {
      dueDate: date ? Timestamp.fromDate(date) : undefined,
    };

    handleUpdateTask(updates);
    togglePopover("dueDate", false);
  };

  const handleTagToggle = (tag: string) => {
    if (!data?.task) return;

    const currentTags = data.task.tags || [];
    const isSelected = currentTags.includes(tag);

    let updatedTags: string[];
    if (isSelected) {
      updatedTags = currentTags.filter((t) => t !== tag);
    } else {
      updatedTags = [...currentTags, tag];
    }

    handleUpdateTask({ tags: updatedTags });
  };

  const handleCreateNewTag = () => {
    if (!newTagName.trim() || !data?.task) return;

    const trimmedTag = newTagName.trim();
    const currentTags = data.task.tags || [];

    // Don't add if tag already exists
    if (
      currentTags.includes(trimmedTag) ||
      allExistingTags.includes(trimmedTag)
    ) {
      toast.error("Tag already exists");
      return;
    }

    const updatedTags = [...currentTags, trimmedTag];
    handleUpdateTask({ tags: updatedTags });

    // Persist to project-level tag registry so it stays available even if removed from all tasks later
    (async () => {
      try {
        const projectRef = doc(db, "projects", projectId);
        const newProjectTag = makeProjectTag(trimmedTag);
        await updateDoc(projectRef, { tags: arrayUnion(newProjectTag) });
      } catch (e) {
        // non-fatal
        console.warn("Failed to persist project tag:", e);
      } finally {
        // Always ensure local availability
        setProjectTagNames((prev) => unionTagNames(prev, [trimmedTag]));
        setAllExistingTags((prev) => unionTagNames(prev, [trimmedTag]));
      }
    })();
    setNewTagName("");
    toast.success("Tag created and added");
  };

  const goBackToProject = () => {
    router.push(`/dashboard/teams/${departmentId}/projects/${projectId}`);
  };

  // Compute taskAssigned at top level to avoid hook order violation
  const taskAssigned = useMemo(() => {
    if (!data?.task || !data?.allProjectMembers) return [];
    const ids = data.task.assignedUserIds || [];
    return ids
      .map((uid) => data.allProjectMembers.find((m) => m.id === uid))
      .filter(Boolean) as DisplayUser[];
  }, [data?.task?.assignedUserIds, data?.allProjectMembers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading task...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div>
            <h1 className="text-2xl font-semibold mb-2">Task Not Found</h1>
            <p className="text-muted-foreground mb-4">
              {error ||
                "This task doesn't exist or you don't have access to it."}
            </p>
            <Button onClick={goBackToProject} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Project
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // If snapshots haven't populated task/project yet, keep showing loader to avoid null access
  if (!data.task || !data.project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading task…</p>
        </div>
      </div>
    );
  }

  const d = data as TaskPageData;
  const { task, project, department, allProjectMembers, subtasks } = d;
  const StatusIcon = statusConfig[task.status]?.icon || Circle;
  const PriorityIcon = priorityConfig[task.priority]?.icon || SignalMedium;

  return (
    <div className={cn("space-y-4")}>
      <style jsx global>{`
        /* Custom Scrollbar Styling */
        .task-content-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .task-content-scroll::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 4px;
        }

        .task-content-scroll::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.3);
          border-radius: 4px;
          transition: background-color 0.2s ease;
        }

        .task-content-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.5);
        }

        .dark .task-content-scroll::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.3);
        }

        .dark .task-content-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(75, 85, 99, 0.5);
        }

        /* Sidebar scrollbar */
        .task-sidebar-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        .task-sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 3px;
        }

        .task-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.2);
          border-radius: 3px;
          transition: all 0.2s ease;
        }

        .task-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.4);
        }

        .dark .task-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.2);
        }

        .dark .task-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(75, 85, 99, 0.4);
        }

        /* Firefox scrollbar styling */
        .task-content-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
        }

        .dark .task-content-scroll {
          scrollbar-color: rgba(75, 85, 99, 0.3) transparent;
        }

        .task-sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.2) transparent;
        }

        .dark .task-sidebar-scroll {
          scrollbar-color: rgba(75, 85, 99, 0.2) transparent;
        }
      `}</style>
      {/* Header with breadcrumb and actions */}
  <div className={cn("proximavara sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-background/50 p-4")}> 
        <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="px-2 h-auto font-medium hover:bg-transparent hover:text-primary"
          >
            Dashboard
          </Button>
          <ChevronRight className="h-4 w-4" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/teams")}
            className="px-2 h-auto font-medium hover:bg-transparent hover:text-primary"
          >
            Teams
          </Button>
          <ChevronRight className="h-4 w-4" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/teams/${department.id}`)}
            className="px-2 h-auto font-medium hover:bg-transparent hover:text-primary"
          >
            {department.name}
          </Button>
          <ChevronRight className="h-4 w-4" />
          <Button
            variant="ghost"
            size="sm"
            onClick={goBackToProject}
            className="px-2 h-auto font-medium hover:bg-transparent hover:text-primary"
          >
            {project.name}
          </Button>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">
            #{task.id.slice(-8)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Fullscreen button removed */}
          <Button variant="outline" size="sm" onClick={goBackToProject}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Project
          </Button>
          {!isEditing ? (
            <Button size="sm" onClick={() => setIsEditing(true)}>
              <Edit3 className="mr-2 h-4 w-4" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdits} disabled={isUpdating}>
                {isUpdating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setEditedTask({
                    name: task.name,
                    description: task.description,
                    status: task.status,
                    priority: task.priority,
                    assignedUserIds: task.assignedUserIds || [],
                    dueDate: task.dueDate,
                    tags: task.tags || [],
                  });
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}
        </div>
        </div>
      </div>
              {/* Main content single column */}
              <div className={cn("h-[calc(100vh-140px)]") }>
                <div className="min-w-0 space-y-4 overflow-y-auto task-content-scroll">
                  {/* Task title and summary properties */}
                  <Card className="border-0 shadow-none p-4">
                    <CardHeader className="-m-3">
                      {isEditing ? (
                        <Input
                          value={editedTask.name || ""}
                          onChange={(e) => setEditedTask((prev) => ({ ...prev, name: e.target.value }))}
                          className="text-2xl md:text-3xl font-semibold border-none p-0 h-auto text-foreground bg-transparent focus-visible:ring-0"
                          placeholder="Task name"
                        />
                      ) : (
                        <h1 className="spacegrot text-2xl md:text-3xl font-semibold text-foreground tracking-tight">{task.name}</h1>
                      )}
                    </CardHeader>
                    <CardContent className="proximavara text-[15px] p-4 pt-0">
                      <div className="mt-2 space-y-0">
                        {/* Assignee */}
                        <div className="grid grid-cols-[140px_1fr] gap-6 items-center py-2.5 last:border-0">
                          <div className="text-sm text-muted-foreground">Assignee</div>
                          <div className="flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center hover:bg-muted/30 rounded-sm p-1 transition-colors">
                                  {(taskAssigned && taskAssigned.length > 0) ? (
                                    <div className="flex items-center gap-3">
                                      <div className="flex -space-x-2">
                                        {taskAssigned.slice(0,3).map((u) => (
                                          <Avatar key={u.id} className="h-8 w-8 border-2 border-background ring-1 ring-border/20">
                                            <AvatarImage src={u.avatarUrl ?? undefined} />
                                            <AvatarFallback className="text-sm">{(u.name?.[0]||"U").toUpperCase()}</AvatarFallback>
                                          </Avatar>
                                        ))}
                                        {taskAssigned.length > 3 && (
                                          <Avatar className="h-8 w-8 border-2 border-background ring-1 ring-border/20"><AvatarFallback className="text-sm bg-muted">+{taskAssigned.length-3}</AvatarFallback></Avatar>
                                        )}
                                      </div>
                                      <span className="text-sm text-muted-foreground">
                                        {taskAssigned.length} {taskAssigned.length === 1 ? "member" : "members"}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground px-2 py-1 border border-dashed border-muted-foreground/30 rounded-md">
                                      <Users className="h-4 w-4" />
                                      <span>Assign</span>
                                    </div>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                <div className="space-y-2">
                                  <Input placeholder="Search people..." value={assigneesColumnSearchTerm} onChange={(e)=> setAssigneesColumnSearchTerm(e.target.value)} className="h-8 text-xs" />
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {data?.allProjectMembers.map((member) => {
                                      const currentIds = task.assignedUserIds || [];
                                      const isAssigned = currentIds.includes(member.id);
                                      const matches = !assigneesColumnSearchTerm.trim() || (member.name||"").toLowerCase().includes(assigneesColumnSearchTerm.toLowerCase()) || (member.email||"").toLowerCase().includes(assigneesColumnSearchTerm.toLowerCase());
                                      if (!matches) return null;
                                      return (
                                        <div key={member.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md cursor-pointer" onClick={() => handleAssigneeToggle(member.id)}>
                                          <Avatar className="h-6 w-6"><AvatarImage src={member.avatarUrl ?? undefined} /><AvatarFallback className="text-xs">{(member.name?.[0]||"U").toUpperCase()}</AvatarFallback></Avatar>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{member.name || "Unknown User"}</p>
                                            <p className="text-xs text-muted-foreground truncate">{member.email || "No email"}</p>
                                          </div>
                                          {isAssigned && <CircleCheck className="h-4 w-4 text-primary" />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="grid grid-cols-[140px_1fr] gap-6 items-center py-2.5 last:border-0">
                          <div className="text-sm text-muted-foreground">Status</div>
                          <div className="flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:bg-muted/30 rounded-sm p-1 transition-colors">
                                  <div className="flex items-center gap-2">
                                    {task.status === "To Do" && <Circle className="h-4 w-4 text-zinc-600" />}
                                    {task.status === "In Progress" && <Clock className="h-4 w-4 text-blue-600" />}
                                    {task.status === "Blocked" && <AlertCircle className="h-4 w-4 text-red-600" />}
                                    {task.status === "In Review" && <Eye className="h-4 w-4 text-yellow-600" />}
                                    {task.status === "Completed" && <CircleCheck className="h-4 w-4 text-green-600" />}
                                    <span className="text-sm text-foreground">{task.status}</span>
                                  </div>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                <div className="space-y-1">
                                  {["To Do","In Progress","In Review","Blocked","Completed"].map((status) => (
                                    <button
                                      key={status}
                                      onClick={() => handleUpdateTask({ status: status as Task["status"] })}
                                      className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors",
                                        task.status===status ? "bg-muted text-foreground" : "hover:bg-muted/50"
                                      )}
                                    >
                                      {status === "To Do" && <Circle className="h-4 w-4 text-zinc-600" />}
                                      {status === "In Progress" && <Clock className="h-4 w-4 text-blue-600" />}
                                      {status === "Blocked" && <AlertCircle className="h-4 w-4 text-red-600" />}
                                      {status === "In Review" && <Eye className="h-4 w-4 text-yellow-600" />}
                                      {status === "Completed" && <CircleCheck className="h-4 w-4 text-green-600" />}
                                      {status}
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Due Date */}
                        <div className="grid grid-cols-[140px_1fr] gap-6 items-center py-2.5 last:border-0">
                          <div className="text-sm text-muted-foreground">Due Date</div>
                          <div className="flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:bg-muted/30 rounded-sm p-1 transition-colors">
                                  <CalendarDays className={cn("h-4 w-4", task.dueDate ? "text-foreground" : "text-muted-foreground")} />
                                  <span className={cn("text-sm", task.dueDate ? "text-foreground" : "text-muted-foreground")}>
                                    {task.dueDate ? format(getSafeDate(task.dueDate) || new Date(), "MMM d, yyyy") : "Set date"}
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                <CalendarComponent
                                  mode="single"
                                  selected={getSafeDate(task.dueDate) || undefined}
                                  onSelect={(date)=> handleUpdateTask({ dueDate: date ? Timestamp.fromDate(date) : undefined })}
                                />
                                {task.dueDate && (
                                  <div className="p-2 border-t">
                                    <Button variant="outline" size="sm" className="w-full" onClick={()=> handleUpdateTask({ dueDate: undefined })}>Remove date</Button>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Priority */}
                        <div className="grid grid-cols-[140px_1fr] gap-6 items-center py-2.5 last:border-0">
                          <div className="text-sm text-muted-foreground">Priority</div>
                          <div className="flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:bg-muted/30 rounded-sm p-1 transition-colors">
                                  {task.priority === "High" && (
                                    <>
                                      <Signal className="h-4 w-4 text-red-500" />
                                      <span className="text-sm text-red-500">High</span>
                                    </>
                                  )}
                                  {task.priority === "Medium" && (
                                    <>
                                      <SignalMedium className="h-4 w-4 text-yellow-500" />
                                      <span className="text-sm text-yellow-500">Medium</span>
                                    </>
                                  )}
                                  {task.priority === "Low" && (
                                    <>
                                      <SignalLow className="h-4 w-4 text-green-500" />
                                      <span className="text-sm text-green-500">Low</span>
                                    </>
                                  )}
                                  {!task.priority && (
                                    <>
                                      <SignalMedium className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-sm text-muted-foreground">Set priority</span>
                                    </>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-40 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                <div className="space-y-1">
                                  {[
                                    { label: "High", icon: Signal, color: "text-red-500" },
                                    { label: "Medium", icon: SignalMedium, color: "text-yellow-500" },
                                    { label: "Low", icon: SignalLow, color: "text-green-500" }
                                  ].map(({ label, icon: Icon, color }) => (
                                    <button
                                      key={label}
                                      onClick={() => handleUpdateTask({ priority: label as Task["priority"] })}
                                      className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors", task.priority===label?"bg-muted":"hover:bg-muted/50")}
                                    >
                                      <Icon className={cn("h-4 w-4", color)} />
                                      {label}
                                    </button>
                                  ))}
                                  {task.priority && (
                                    <button onClick={() => handleUpdateTask({ priority: null as any })} className="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-muted/50 text-muted-foreground">Clear</button>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="grid grid-cols-[140px_1fr] gap-6 items-center py-2.5">
                          <div className="text-sm text-muted-foreground">Tags</div>
                          <div className="flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:bg-muted/30 rounded-sm p-1 transition-colors">
                                  {task.tags && task.tags.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1">
                                      {task.tags.slice(0, 3).map((t, i) => (
                                        <span
                                          key={`${t}-${i}`}
                                          className={cn("px-2.5 py-1 rounded-full text-xs", tagColorClass(t))}
                                        >
                                          {t}
                                        </span>
                                      ))}
                                      {task.tags.length > 3 && (
                                        <span className="px-2.5 py-1 rounded-full text-xs bg-muted text-foreground border border-border/50">+{task.tags.length - 3}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground px-2 py-1 border border-dashed border-muted-foreground/30 rounded-md">
                                      <Tag className="h-4 w-4" />
                                      <span>Add tags</span>
                                    </div>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-3 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                <div className="space-y-3">
                                  {/* Selected tags */}
                                  <div>
                                    <div className="text-xs font-medium mb-2">Selected</div>
                                    <div className="min-h-[36px] p-2 border rounded-md bg-background">
                                      {task.tags && task.tags.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          {task.tags.map((t, i) => (
                                            <span key={`${t}-${i}`} className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs", tagColorClass(t))}>
                                              {t}
                                              <button
                                                type="button"
                                                onClick={() => handleTagToggle(t)}
                                                className="ml-1/2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5"
                                                title="Remove tag"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">No tags selected</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Available tags */}
                                  <div>
                                    <div className="text-xs font-medium mb-2">Available</div>
                                    <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5">
                                      {(allExistingTags || [])
                                        .filter((t) => !(task.tags || []).includes(t))
                                        .map((t) => (
                                          <button
                                            key={t}
                                            type="button"
                                            onClick={() => handleTagToggle(t)}
                                            className={cn("px-2.5 py-1 rounded-full text-xs hover:opacity-90", tagColorClass(t))}
                                            title={`Add ${t}`}
                                          >
                                            {t}
                                          </button>
                                        ))}
                                      {((allExistingTags || []).filter((t) => !(task.tags || []).includes(t)).length === 0) && (
                                        <span className="text-xs text-muted-foreground">No more tags</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Create new tag */}
                                  <div className="pt-1 border-t">
                                    <div className="flex items-center gap-2 mt-2">
                                      <Input
                                        placeholder="Create new tag"
                                        value={newTagName}
                                        onChange={(e) => setNewTagName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleCreateNewTag();
                                        }}
                                        className="h-8 text-xs"
                                      />
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleCreateNewTag}
                                        disabled={!newTagName.trim()}
                                        className="h-8"
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                        Add
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tabs: Document | Comments | Attachments | Details */}
                  <div className="proximavara -mt-6 p-4">
                    <div className="spacegrot font-bold flex items-center gap-8 border-b border-border">
                      {(["subtasks", "document", "comments", "attachments", "details"] as const).map((tab) => (
                        <button
                          key={tab}
                          className={cn(
                            "py-2.5 text-sm border-b-2 border-transparent transition-colors flex items-center gap-2",
                            activeTab === tab
                              ? "border-primary text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setActiveTab(tab)}
                        >
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                          {tab === "comments" && (
                            <Badge
                              variant={commentBadge.mentioned ? "default" : "secondary"}
                              className={cn(
                                "h-5 px-1.5 text-[10px] font-semibold",
                                commentBadge.mentioned && "bg-primary text-primary-foreground"
                              )}
                              aria-label={commentBadge.mentioned ? "You were mentioned" : `Total comments: ${commentBadge.count}`}
                            >
                              {commentBadge.mentioned ? "@" : commentBadge.count}
                            </Badge>
                          )}
                        </button>
                      ))}
                    </div>

                    {activeTab === "subtasks" && (
                      <div className="-mx-4 space-y-3">
                        <div className="border-border/50 overflow-x-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-0">
                          {/* Search Controls - parity with project table */}
                          <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
                            <div className="relative flex-1 max-w-sm">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                              <Input
                                placeholder="Search tasks and subtasks..."
                                value={taskSearchQuery}
                                onChange={(e) => setTaskSearchQuery(e.target.value)}
                                className="pl-9 h-8 text-sm"
                              />
                            </div>
                            <Button variant="secondary" onClick={() => {
                              setCurrentParentTaskForSubtask(task);
                              setNewSubtaskData({ name: "", description: "", priority: "Medium", status: "To Do", tags: "", parentTaskId: task.id });
                              setSelectedSubtaskAssigneeIds([]);
                              setSubtaskAssigneeSearchTerm("");
                              setIsSubtaskAssigneePopoverOpen(false);
                              setIsSubtaskDueDatePopoverOpen(false);
                              setIsNewSubtaskDialogOpen(true);
                            }} className="ml-auto h-8 px-3 text-sm border-0 bg-black dark:bg-white dark:text-black text-white hover:bg-black/80 dark:hover:bg-white/80">
                              New Subtask
                            </Button>
                          </div>
                          <div className="min-w-[800px]">
                            <Table className="table-fixed w-full proximavara text-[14.5px]">
                              <TableHeader>
                                <TableRow className="hover:bg-transparent border-b">
                                  <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[40%]">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="flex items-center gap-2 hover:text-foreground transition-colors">
                                          <Hash className="h-3 w-3" />
                                          Task
                                          <SortAsc className="h-3 w-3" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                        <div className="space-y-2">
                                          <Label className="text-xs font-medium">Sort</Label>
                                          <div className="space-y-1">
                                            <button onClick={() => setTaskSort("name-asc")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", taskSort === "name-asc" ? "bg-muted" : "hover:bg-muted/50")}>Name A-Z</button>
                                            <button onClick={() => setTaskSort("name-desc")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", taskSort === "name-desc" ? "bg-muted" : "hover:bg-muted/50")}>Name Z-A</button>
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </TableHead>
                                  <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[10%]">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="flex items-center gap-2 hover:text-foreground transition-colors">
                                          Status
                                          <Filter className="h-3 w-3" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                        <div className="space-y-2">
                                          <Label className="text-xs font-medium">Filter by Status</Label>
                                          <div className="space-y-1">
                                            {["To Do","In Progress","In Review","Blocked","Completed"].map((status)=> (
                                              <div key={status} className="flex items-center space-x-2">
                                                <Checkbox id={`sub-status-${status}`} checked={statusFilter.includes(status as Task["status"])} onCheckedChange={(checked)=> {
                                                  if (checked) setStatusFilter([...statusFilter, status as Task["status"]]);
                                                  else setStatusFilter(statusFilter.filter((s)=> s!== (status as Task["status"])));
                                                }} />
                                                <Label htmlFor={`sub-status-${status}`} className="text-xs">{status}</Label>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </TableHead>
                                  <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[10%]">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="flex items-center gap-2 hover:text-foreground transition-colors">
                                          Priority
                                          <Filter className="h-3 w-3" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                        <div className="space-y-2">
                                          <Label className="text-xs font-medium">Filter by Priority</Label>
                                          <div className="space-y-1">
                                            {["Low","Medium","High"].map((priority)=> (
                                              <div key={priority} className="flex items-center space-x-2">
                                                <Checkbox id={`sub-priority-${priority}`} checked={priorityFilter.includes(priority as Task["priority"])} onCheckedChange={(checked)=> {
                                                  if (checked) setPriorityFilter([...(priorityFilter as any), priority as Task["priority"]]);
                                                  else setPriorityFilter(priorityFilter.filter((p)=> p!== (priority as Task["priority"])));
                                                }} />
                                                <Label htmlFor={`sub-priority-${priority}`} className="text-xs flex items-center gap-2">
                                                  <div className={cn("w-2 h-2 rounded-full", priority === "High" && "bg-red-500", priority === "Medium" && "bg-yellow-500", priority === "Low" && "bg-green-500")} />
                                                  {priority}
                                                </Label>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </TableHead>
                                  <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[10%]">Assignees</TableHead>
                                  <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[12%]">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="flex items-center gap-2 hover:text-foreground transition-colors">
                                          Due Date
                                          <Filter className="h-3 w-3" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                        <div className="space-y-2">
                                          <Label className="text-xs font-medium">Filter by Due Date</Label>
                                          <div className="space-y-1">
                                            <button onClick={()=> setDueDateFilter("tomorrow")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", dueDateFilter === "tomorrow" ? "bg-muted" : "hover:bg-muted/50")}>Due Tomorrow</button>
                                            <button onClick={()=> setDueDateFilter("yesterday")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", dueDateFilter === "yesterday" ? "bg-muted" : "hover:bg-muted/50")}>Due Yesterday</button>
                                            <button onClick={()=> setDueDateFilter("this-week")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", dueDateFilter === "this-week" ? "bg-muted" : "hover:bg-muted/50")}>Due This Week</button>
                                            <button onClick={()=> setDueDateFilter("")} className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors", dueDateFilter === "" ? "bg-muted" : "hover:bg-muted/50")}>Clear Filter</button>
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </TableHead>
                                  <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[13%]">
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button className="flex items-center gap-2 hover:text-foreground transition-colors">
                                          Tags
                                          <Filter className="h-3 w-3" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-64 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                        <div className="space-y-2">
                                          <Label className="text-xs font-medium">Filter by Tags</Label>
                                          <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                            {availableSubtaskTags.map((tag)=> (
                                              <div key={tag} className="flex items-center space-x-2">
                                                <Checkbox id={`sub-tag-${tag}`} checked={tagFilter.includes(tag)} onCheckedChange={(checked)=> {
                                                  if (checked) setTagFilter([...tagFilter, tag]);
                                                  else setTagFilter(tagFilter.filter((t)=> t!== tag));
                                                }} />
                                                <Label htmlFor={`sub-tag-${tag}`} className="text-xs">{tag}</Label>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </TableHead>
                                  <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[5%]"><span className="sr-only">Actions</span></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(() => {
                                  // Apply search, filters, sort to subtasks list
                                  let rows = [...subtasks];
                                  const search = taskSearchQuery.trim().toLowerCase();
                                  if (search) {
                                    rows = rows.filter((t) =>
                                      t.name.toLowerCase().includes(search) ||
                                      (t as any).description?.toLowerCase?.().includes(search)
                                    );
                                  }
                                  if (statusFilter.length > 0) rows = rows.filter((t) => statusFilter.includes(t.status));
                                  if (priorityFilter.length > 0) rows = rows.filter((t) => (t.priority ? priorityFilter.includes(t.priority) : false));
                                  if (dueDateFilter) {
                                    const now = new Date();
                                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                                    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                                    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
                                    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
                                    rows = rows.filter((t) => {
                                      if (!t.dueDate) return false;
                                      const d = getSafeDate(t.dueDate);
                                      if (!d) return false;
                                      const only = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                      switch (dueDateFilter) {
                                        case "tomorrow": return only.getTime() === tomorrow.getTime();
                                        case "yesterday": return only.getTime() === yesterday.getTime();
                                        case "this-week": return only >= weekStart && only <= weekEnd;
                                        default: return true;
                                      }
                                    });
                                  }
                                  if (tagFilter.length > 0) rows = rows.filter((t) => tagFilter.some((tg) => (t.tags || []).includes(tg)));
                                  if (taskSort) {
                                    rows.sort((a,b) => taskSort === "name-asc" ? a.name.localeCompare(b.name) : taskSort === "name-desc" ? b.name.localeCompare(a.name) : 0);
                                  }

                                  if (rows.length === 0) {
                                    return (
                                      <TableRow>
                                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No subtasks match your filters</TableCell>
                                      </TableRow>
                                    );
                                  }
                                  return rows.map((st) => {
                                    const assignedUsers = (st.assignedUserIds || [])
                                      .map((uid) => allProjectMembers.find((m) => m.id === uid))
                                      .filter(Boolean) as DisplayUser[];
                                    const isExpanded = expandedSubtasks.has(st.id);
                                    const hasChildren = ((st.subtaskIds?.length || 0) > 0) || ((projectTasksIndex[st.id]?.length || 0) > 0) || isExpanded;
                                    return (
                                      <Fragment key={st.id}>
                                      <ContextMenu key={`cm-${st.id}`}>
                                        <ContextMenuTrigger asChild>
                                          <TableRow key={st.id} className="group border-b hover:bg-muted/30 transition-all duration-200" data-subtask-row-id={st.id} onMouseEnter={()=> setHoveredSubtaskId(st.id)} onMouseLeave={()=> setHoveredSubtaskId(null)}>
                                        {/* Task name with expand + left status icon */}
                                        <TableCell className="px-1 py-2 w-[40%] max-w-0" style={{ paddingLeft: `${BASE_PADDING + (st.level ? st.level : 0) * INDENT_PER_LEVEL}px` }}>
                                          <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 flex justify-center flex-shrink-0">
                                              {hasChildren ? (
                                                <button
                                                  onClick={() => toggleSubtaskExpanded(st.id)}
                                                  className="p-1 hover:bg-muted rounded-sm transition-colors"
                                                  title={isExpanded?"Collapse subtasks":"Expand subtasks"}
                                                >
                                                  {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                  ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                  )}
                                                </button>
                                              ) : (
                                                <div className="w-6 h-6" />
                                              )}
                                            </div>

                                            {/* Status icon same as project table */}
                                            <div className="flex-shrink-0">
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="p-0.5 hover:bg-muted rounded-sm transition-colors" title={`Change status from ${st.status}`}>
                                                    {st.status === "To Do" && (<Circle className="h-4 w-4 text-zinc-600" />)}
                                                    {st.status === "In Progress" && (<Clock className="h-4 w-4 text-blue-600" />)}
                                                    {st.status === "Blocked" && (<AlertCircle className="h-4 w-4 text-red-600" />)}
                                                    {st.status === "In Review" && (<Eye className="h-4 w-4 text-yellow-600" />)}
                                                    {st.status === "Completed" && (<CircleCheck className="h-4 w-4 text-green-600" />)}
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-48 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                                  <div className="space-y-1">
                                                    {["To Do","In Progress","In Review","Blocked","Completed"].map((status) => (
                                                      <button key={status} onClick={() => handleSubtaskStatusChange(st.id, status as Task["status"])} className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors", st.status===status?"bg-muted text-foreground":"hover:bg-muted/50") }>
                                                        {status === "To Do" && <Circle className="h-4 w-4 text-zinc-600" />}
                                                        {status === "In Progress" && <Clock className="h-4 w-4 text-blue-600" />}
                                                        {status === "Blocked" && <AlertCircle className="h-4 w-4 text-red-600" />}
                                                        {status === "In Review" && <Eye className="h-4 w-4 text-yellow-600" />}
                                                        {status === "Completed" && <CircleCheck className="h-4 w-4 text-green-600" />}
                                                        {status}
                                                      </button>
                                                    ))}
                                                  </div>
                                                </PopoverContent>
                                              </Popover>
                                            </div>

                                            {/* Name */}
                                            <div className="flex-1 min-w-0">
                                              <span className={cn("font-medium cursor-pointer hover:text-primary transition-colors truncate block", st.status === "Completed" && "line-through")}
                                                onClick={() => router.push(`/dashboard/teams/${departmentId}/projects/${projectId}/tasks/${st.id}`)}>
                                                {st.name}
                                              </span>
                                              {st.description && (
                                                <p className="text-xs text-muted-foreground mt-1 truncate">{(st as any).description}</p>
                                              )}
                                            </div>
                                          </div>
                                        </TableCell>

                                      {/* Status */}
                                      <TableCell className="px-4 py-2 w-[10%]">
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button
                                              className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap",
                                                st.status === "To Do" &&
                                                  "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                                                st.status === "In Progress" &&
                                                  "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
                                                st.status === "Blocked" &&
                                                  "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300",
                                                st.status === "In Review" &&
                                                  "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300",
                                                st.status === "Completed" &&
                                                  "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300"
                                              )}
                                            >
                                              {st.status}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-48 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                            <div className="space-y-1">
                                              {["To Do","In Progress","In Review","Blocked","Completed"].map((status) => (
                                                <button
                                                  key={status}
                                                  onClick={() => handleSubtaskStatusChange(st.id, status as Task["status"])}
                                                  className={cn(
                                                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors",
                                                    st.status===status ? "bg-muted text-foreground" : "hover:bg-muted/50"
                                                  )}
                                                >
                                                  {status === "To Do" && <Circle className="h-4 w-4 text-zinc-600" />}
                                                  {status === "In Progress" && <Clock className="h-4 w-4 text-blue-600" />}
                                                  {status === "Blocked" && <AlertCircle className="h-4 w-4 text-red-600" />}
                                                  {status === "In Review" && <Eye className="h-4 w-4 text-yellow-600" />}
                                                  {status === "Completed" && <CircleCheck className="h-4 w-4 text-green-600" />}
                                                  {status}
                                                </button>
                                              ))}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      </TableCell>

                                      {/* Priority */}
                                      <TableCell className="px-4 py-2 w-[10%]">
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button className={cn("inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors hover:opacity-80",
                                              st.priority === "High" && "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800",
                                              st.priority === "Medium" && "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
                                              st.priority === "Low" && "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800",
                                              !st.priority && "text-muted-foreground bg-muted/30 border-dashed border-muted-foreground/30"
                                            )}>
                                              {st.priority || "Set priority"}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-40 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                            <div className="space-y-1">
                                              {["High","Medium","Low"].map((p) => (
                                                <button key={p} onClick={() => handleUpdateSubtaskPriority(st.id, p as Task["priority"]) } className={cn("w-full text-left px-3 py-2 text-sm rounded-md transition-colors", st.priority===p?"bg-muted":"hover:bg-muted/50")}>{p}</button>
                                              ))}
                                              {st.priority && (
                                                <button onClick={() => handleUpdateSubtaskPriority(st.id, null)} className="w-full text-left px-3 py-2 text-sm rounded-md transition-colors hover:bg-muted/50 text-muted-foreground">Clear</button>
                                              )}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      </TableCell>

                                      {/* Assignees */}
                                      <TableCell className="pl-4 py-2 w-[10%]">
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button className="flex items-center hover:bg-muted/30 rounded-sm p-1 transition-colors">
                                              {assignedUsers.length>0 ? (
                                                <div className="flex -space-x-1">
                                                  {assignedUsers.slice(0,3).map((u) => (
                                                    <Avatar key={u.id} className="h-7 w-7 border-2 border-background ring-1 ring-border/20">
                                                      <AvatarImage src={u.avatarUrl ?? undefined} />
                                                      <AvatarFallback className="text-xs">{(u.name?.[0]||"U").toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                  ))}
                                                  {assignedUsers.length>3 && (
                                                    <Avatar className="h-7 w-7 border-2 border-background ring-1 ring-border/20"><AvatarFallback className="text-xs bg-muted">+{assignedUsers.length-3}</AvatarFallback></Avatar>
                                                  )}
                                                </div>
                                              ) : (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 border border-dashed border-muted-foreground/30 rounded-md">
                                                  <Users className="h-3 w-3" />
                                                  <span>Assign</span>
                                                </div>
                                              )}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-64 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                            <div className="space-y-2">
                                              <Input placeholder="Search people..." value={assigneesColumnSearchTerm} onChange={(e)=> setAssigneesColumnSearchTerm(e.target.value)} className="h-8 text-xs" />
                                              <div className="max-h-48 overflow-y-auto space-y-1">
                                              {allProjectMembers.map((member) => {
                                                const currentIds = st.assignedUserIds || [];
                                                const isAssigned = currentIds.includes(member.id);
                                                const matches = !assigneesColumnSearchTerm.trim() || (member.name||"").toLowerCase().includes(assigneesColumnSearchTerm.toLowerCase()) || (member.email||"").toLowerCase().includes(assigneesColumnSearchTerm.toLowerCase());
                                                if (!matches) return null;
                                                return (
                                                  <div key={member.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md cursor-pointer" onClick={() => {
                                                    const next = isAssigned ? currentIds.filter((id)=>id!==member.id) : [...currentIds, member.id];
                                                    handleUpdateSubtaskAssignees(st.id, next);
                                                  }}>
                                                    <Avatar className="h-6 w-6"><AvatarImage src={member.avatarUrl ?? undefined} /><AvatarFallback className="text-xs">{(member.name?.[0]||"U").toUpperCase()}</AvatarFallback></Avatar>
                                                    <div className="flex-1 min-w-0">
                                                      <p className="text-sm font-medium truncate">{member.name || "Unknown User"}</p>
                                                      <p className="text-xs text-muted-foreground truncate">{member.email || "No email"}</p>
                                                    </div>
                                                    {isAssigned && <CircleCheck className="h-4 w-4 text-primary" />}
                                                  </div>
                                                );
                                              })}
                                              </div>
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      </TableCell>

                                      {/* Due Date */}
                                      <TableCell className="px-0 py-2 w-[12%]">
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors hover:bg-muted/50", st.dueDate?"text-foreground bg-muted/30":"text-muted-foreground border border-dashed border-muted-foreground/30") }>
                                              <Calendar className="h-3 w-3" />
                                              {st.dueDate ? format(getSafeDate(st.dueDate) || new Date(), "MMM d, yyyy") : "Set date"}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                            <CalendarComponent mode="single" selected={getSafeDate(st.dueDate) || undefined} onSelect={(date)=> handleUpdateSubtaskDueDate(st.id, date || null)} />
                                            {st.dueDate && (
                                              <div className="p-2 border-t"><Button variant="outline" size="sm" className="w-full" onClick={()=>handleUpdateSubtaskDueDate(st.id, null)}>Remove date</Button></div>
                                            )}
                                          </PopoverContent>
                                        </Popover>
                                      </TableCell>

                                      {/* Tags */}
                                      <TableCell className="px-0 py-2 w-[13%]">
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button className="flex items-center gap-1 hover:bg-muted/30 rounded-sm p-1 transition-colors w-full">
                                              {st.tags && st.tags.length>0 ? (
                                                <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
                                                  {st.tags.slice(0,2).map((tag, idx) => (
                                                    <Badge key={idx} variant="secondary" className="text-xs h-5 px-2 bg-muted/60">{tag}</Badge>
                                                  ))}
                                                  {st.tags.length>2 && (
                                                    <Badge variant="outline" className="text-xs h-5 px-2 border-dashed">+{st.tags.length-2}</Badge>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="text-xs text-muted-foreground px-2 py-1 border border-dashed border-muted-foreground/30 rounded-md">Add tags</span>
                                              )}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-72 p-3 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="center">
                                            <div className="space-y-2">
                                              <div className="min-h-[40px] p-2 border rounded-md bg-background">
                                                {st.tags?.length>0 ? (
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {st.tags.map((tag,i)=> (
                                                      <Badge key={`${tag}-${i}`} variant="secondary" className="text-xs px-2 py-0.5 h-6 gap-1">
                                                        {tag}
                                                        <button type="button" onClick={()=> handleUpdateSubtaskTags(st.id, (st.tags||[]).filter((t)=>t!==tag))} className="hover:bg-destructive/20 rounded-full p-0.5">
                                                          <X className="h-2.5 w-2.5" />
                                                        </button>
                                                      </Badge>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <span className="text-sm text-muted-foreground">No tags selected</span>
                                                )}
                                              </div>
                                              {/* Available tags */}
                                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                                {availableSubtaskTags.filter((t)=> !(st.tags||[]).includes(t)).map((tag)=> (
                                                  <button key={tag} type="button" onClick={()=> handleUpdateSubtaskTags(st.id, [...(st.tags||[]), tag])} className="w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 hover:bg-muted/50">
                                                    <div className="w-2 h-2 rounded-full border border-muted-foreground/30" />
                                                    <span className="flex-1">{tag}</span>
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      </TableCell>

                                      {/* Actions */}
                                      <TableCell className="px-0 py-2 w-[5%]">
                                        <Button variant="ghost" size="sm" onClick={()=> router.push(`/dashboard/teams/${departmentId}/projects/${projectId}/tasks/${st.id}`)}>
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                          </TableRow>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent
                                          className="w-48 z-50 backdrop-blur-[5px] dark:bg-black/10"
                                          style={{
                                            backgroundImage:
                                              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1' numOctaves='1' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.03'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
                                            backgroundBlendMode: "overlay",
                                          }}
                                          onKeyDown={(e) => {
                                            const key = e.key.toLowerCase();
                                            const execAndClose = (fn: () => void) => {
                                              e.preventDefault();
                                              fn();
                                              document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
                                            };
                                            switch (key) {
                                              case "enter":
                                                execAndClose(() => handleSubtaskClick(st.id));
                                                break;
                                              case "s":
                                                if (hasChildren) execAndClose(() => toggleSubtaskExpanded(st.id));
                                                break;
                                              case "c":
                                                execAndClose(() => closeContextMenuThen(() => openNewChildSubtaskDialog(st)));
                                                break;
                                              case "e":
                                                execAndClose(() => closeContextMenuThen(() => setIsEditing(true)));
                                                break;
                                              case "d":
                                                execAndClose(() => closeContextMenuThen(() => handleDeleteSubtaskClick(st.id)));
                                                break;
                                              case "1": execAndClose(() => handleSubtaskStatusChange(st.id, "To Do")); break;
                                              case "2": execAndClose(() => handleSubtaskStatusChange(st.id, "In Progress")); break;
                                              case "3": execAndClose(() => handleSubtaskStatusChange(st.id, "In Review")); break;
                                              case "4": execAndClose(() => handleSubtaskStatusChange(st.id, "Blocked")); break;
                                              case "5": execAndClose(() => handleSubtaskStatusChange(st.id, "Completed")); break;
                                            }
                                          }}
                                        >
                                          <ContextMenuItem onClick={() => handleSubtaskClick(st.id)}>
                                            <Info className="mr-2 h-3 w-4" />
                                            Show Details
                                            <span className="ml-auto text-xs text-muted-foreground">Enter</span>
                                          </ContextMenuItem>
                                          <ContextMenuSeparator />
                                          {hasChildren && (
                                            <ContextMenuItem onClick={() => toggleSubtaskExpanded(st.id)}>
                                              <Eye className="mr-2 h-3 w-4" />
                                              Show Subtasks
                                              <span className="ml-auto text-xs text-muted-foreground">S</span>
                                            </ContextMenuItem>
                                          )}
                                          <ContextMenuItem onClick={() => closeContextMenuThen(() => openNewChildSubtaskDialog(st))}>
                                            <Plus className="mr-2 h-3 w-4" />
                                            Create Subtask
                                            <span className="ml-auto text-xs text-muted-foreground">C</span>
                                          </ContextMenuItem>
                                          <ContextMenuItem onClick={() => closeContextMenuThen(() => openEditTaskDialog(st))}>
                                            <Edit3 className="mr-2 h-3 w-4" />
                                            Edit Task
                                            <span className="ml-auto text-xs text-muted-foreground">E</span>
                                          </ContextMenuItem>
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger>
                                              <RefreshCw className="mr-4 h-3 w-4 text-muted-foreground" />
                                              Change Status
                                            </ContextMenuSubTrigger>
                                            <ContextMenuPortal>
                                              <ContextMenuSubContent className="w-44 z-[100]">
                                                {statusOptions.map((opt) => {
                                                  const Icon = opt.icon;
                                                  const isCurrent = st.status === opt.value;
                                                  const statusColor = opt.value === "To Do" ? "text-gray-600" : opt.value === "In Progress" ? "text-blue-600" : opt.value === "In Review" ? "text-yellow-600" : opt.value === "Blocked" ? "text-red-600" : "text-green-600";
                                                  return (
                                                    <ContextMenuItem
                                                      key={opt.value}
                                                      onClick={() => handleSubtaskStatusChange(st.id, opt.value as Task["status"]) }
                                                      className={isCurrent ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50"}
                                                    >
                                                      <Icon className={`mr-2 h-3 w-4 ${statusColor}`} />
                                                      {opt.label}
                                                      {isCurrent ? (
                                                        <span className={`ml-auto text-xs font-bold ${statusColor}`}>✓</span>
                                                      ) : (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                          {opt.value === "To Do" ? "1" : opt.value === "In Progress" ? "2" : opt.value === "In Review" ? "3" : opt.value === "Blocked" ? "4" : opt.value === "Completed" ? "5" : ""}
                                                        </span>
                                                      )}
                                                    </ContextMenuItem>
                                                  );
                                                })}
                                              </ContextMenuSubContent>
                                            </ContextMenuPortal>
                                          </ContextMenuSub>
                                          <ContextMenuSeparator />
                                          <ContextMenuItem onClick={() => closeContextMenuThen(() => handleDeleteSubtaskClick(st.id))} className="text-red-600 focus:text-red-600">
                                            <Trash2 className="mr-2 h-3 w-4" />
                                            Delete Task
                                            <span className="ml-auto text-xs text-muted-foreground">D</span>
                                          </ContextMenuItem>
                                        </ContextMenuContent>
                                      </ContextMenu>
                                      {/* Render children if expanded (apply same filters lightly) */}
                                      {isExpanded && (projectTasksIndex[st.id]||[]).filter((child)=> {
                                        // apply search and tag/status/priority filters to children too for parity
                                        const search = taskSearchQuery.trim().toLowerCase();
                                        const matchesSearch = !search || child.name.toLowerCase().includes(search) || (child as any).description?.toLowerCase?.().includes(search);
                                        const matchesStatus = statusFilter.length === 0 || statusFilter.includes(child.status);
                                        const matchesPriority = priorityFilter.length === 0 || (!!child.priority && priorityFilter.includes(child.priority));
                                        const matchesTags = tagFilter.length === 0 || tagFilter.some((tg)=> (child.tags||[]).includes(tg));
                                        let matchesDue = true;
                                        if (dueDateFilter) {
                                          if (!child.dueDate) matchesDue = false;
                                          else {
                                            const d = getSafeDate(child.dueDate);
                                            if (!d) matchesDue = false; else {
                                              const now = new Date();
                                              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                              const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                                              const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                                              const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
                                              const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
                                              const only = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                                              matchesDue = dueDateFilter === "tomorrow" ? only.getTime() === tomorrow.getTime() : dueDateFilter === "yesterday" ? only.getTime() === yesterday.getTime() : dueDateFilter === "this-week" ? (only >= weekStart && only <= weekEnd) : true;
                                            }
                                          }
                                        }
                                        return matchesSearch && matchesStatus && matchesPriority && matchesTags && matchesDue;
                                      }).map((child) => {
                                        const childAssigned = (child.assignedUserIds||[]).map((uid)=> allProjectMembers.find((m)=> m.id===uid)).filter(Boolean) as DisplayUser[];
                                        return (
                                          <ContextMenu key={`cm-${child.id}`}>
                                            <ContextMenuTrigger asChild>
                                              <TableRow key={child.id} className="group border-b hover:bg-muted/30 transition-all duration-200 bg-muted/20 border-muted/40" data-subtask-row-id={child.id} onMouseEnter={()=> setHoveredSubtaskId(child.id)} onMouseLeave={()=> setHoveredSubtaskId(null)}>
                                            {/* Indented name */}
                                            <TableCell className="px-1 py-2 w-[40%] max-w-0" style={{ paddingLeft: `${BASE_PADDING + ((child.level ?? (st.level ? st.level + 1 : 1))) * INDENT_PER_LEVEL}px` }}>
                                              <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8" />
                                                <div className="flex-shrink-0">
                                                  {child.status === "To Do" && (<Circle className="h-4 w-4 text-zinc-600" />)}
                                                  {child.status === "In Progress" && (<Clock className="h-4 w-4 text-blue-600" />)}
                                                  {child.status === "Blocked" && (<AlertCircle className="h-4 w-4 text-red-600" />)}
                                                  {child.status === "In Review" && (<Eye className="h-4 w-4 text-yellow-600" />)}
                                                  {child.status === "Completed" && (<CircleCheck className="h-4 w-4 text-green-600" />)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <span className={cn("font-medium cursor-pointer hover:text-primary transition-colors truncate block", child.status === "Completed" && "line-through")} onClick={()=> router.push(`/dashboard/teams/${departmentId}/projects/${projectId}/tasks/${child.id}`)}>
                                                    {child.name}
                                                  </span>
                                                  {child.description && (<p className="text-xs text-muted-foreground mt-1 truncate">{(child as any).description}</p>)}
                                                </div>
                                              </div>
                                            </TableCell>
                                            {/* Reuse columns via minimal rendering for brevity */}
                                            <TableCell className="px-4 py-2 w-[10%]"><div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap bg-muted/30">{child.status}</div></TableCell>
                                            <TableCell className="px-4 py-2 w-[10%]"><div className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border text-muted-foreground bg-muted/30 border-dashed border-muted-foreground/30">{child.priority || "—"}</div></TableCell>
                                            <TableCell className="pl-4 py-2 w-[10%]">
                                              {childAssigned.length>0 ? (
                                                <div className="flex -space-x-1">
                                                  {childAssigned.slice(0,3).map((u)=> (
                                                    <Avatar key={u.id} className="h-7 w-7 border-2 border-background ring-1 ring-border/20"><AvatarImage src={u.avatarUrl ?? undefined} /><AvatarFallback className="text-xs">{(u.name?.[0]||"U").toUpperCase()}</AvatarFallback></Avatar>
                                                  ))}
                                                </div>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                              )}
                                            </TableCell>
                                            <TableCell className="px-0 py-2 w-[12%]">{child.dueDate ? format(getSafeDate(child.dueDate) || new Date(), "MMM d, yyyy") : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                                            <TableCell className="px-0 py-2 w-[13%]">
                                              {child.tags?.length? (
                                                <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">{child.tags.slice(0,2).map((t,i)=> (<Badge key={`${t}-${i}`} variant="secondary" className="text-xs h-5 px-2 bg-muted/60">{t}</Badge>))}{child.tags.length>2 && (<Badge variant="outline" className="text-xs h-5 px-2 border-dashed">+{child.tags.length-2}</Badge>)}</div>
                                              ) : (<span className="text-xs text-muted-foreground">—</span>)}
                                            </TableCell>
                                            <TableCell className="px-0 py-2 w-[5%]"><Button variant="ghost" size="sm" onClick={()=> router.push(`/dashboard/teams/${departmentId}/projects/${projectId}/tasks/${child.id}`)}><MoreHorizontal className="h-4 w-4" /></Button></TableCell>
                                              </TableRow>
                                            </ContextMenuTrigger>
                                            <ContextMenuContent
                                              className="w-48 z-50 backdrop-blur-[5px] dark:bg-black/10"
                                              style={{
                                                backgroundImage:
                                                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1' numOctaves='1' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.03'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
                                                backgroundBlendMode: "overlay",
                                              }}
                                              onKeyDown={(e) => {
                                                const key = e.key.toLowerCase();
                                                const execAndClose = (fn: () => void) => {
                                                  e.preventDefault();
                                                  fn();
                                                  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
                                                };
                                                switch (key) {
                                                  case "enter":
                                                    execAndClose(() => handleSubtaskClick(child.id));
                                                    break;
                                                  case "c":
                                                    execAndClose(() => closeContextMenuThen(() => openNewChildSubtaskDialog(child)));
                                                    break;
                                                  case "e":
                                                    execAndClose(() => closeContextMenuThen(() => setIsEditing(true)));
                                                    break;
                                                  case "d":
                                                    execAndClose(() => closeContextMenuThen(() => handleDeleteSubtaskClick(child.id)));
                                                    break;
                                                  case "1": execAndClose(() => handleSubtaskStatusChange(child.id, "To Do")); break;
                                                  case "2": execAndClose(() => handleSubtaskStatusChange(child.id, "In Progress")); break;
                                                  case "3": execAndClose(() => handleSubtaskStatusChange(child.id, "In Review")); break;
                                                  case "4": execAndClose(() => handleSubtaskStatusChange(child.id, "Blocked")); break;
                                                  case "5": execAndClose(() => handleSubtaskStatusChange(child.id, "Completed")); break;
                                                }
                                              }}
                                            >
                                              <ContextMenuItem onClick={() => handleSubtaskClick(child.id)}>
                                                <Info className="mr-2 h-3 w-4" />
                                                Show Details
                                                <span className="ml-auto text-xs text-muted-foreground">Enter</span>
                                              </ContextMenuItem>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => closeContextMenuThen(() => openNewChildSubtaskDialog(child))}>
                                                <Plus className="mr-2 h-3 w-4" />
                                                Create Subtask
                                                <span className="ml-auto text-xs text-muted-foreground">C</span>
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => closeContextMenuThen(() => openEditTaskDialog(child))}>
                                                <Edit3 className="mr-2 h-3 w-4" />
                                                Edit Task
                                                <span className="ml-auto text-xs text-muted-foreground">E</span>
                                              </ContextMenuItem>
                                              <ContextMenuSub>
                                                <ContextMenuSubTrigger>
                                                  <RefreshCw className="mr-4 h-3 w-4 text-muted-foreground" />
                                                  Change Status
                                                </ContextMenuSubTrigger>
                                                <ContextMenuPortal>
                                                  <ContextMenuSubContent className="w-44 z-[100]">
                                                    {statusOptions.map((opt) => {
                                                      const Icon = opt.icon;
                                                      const isCurrent = child.status === opt.value;
                                                      const statusColor = opt.value === "To Do" ? "text-gray-600" : opt.value === "In Progress" ? "text-blue-600" : opt.value === "In Review" ? "text-yellow-600" : opt.value === "Blocked" ? "text-red-600" : "text-green-600";
                                                      return (
                                                        <ContextMenuItem
                                                          key={opt.value}
                                                          onClick={() => handleSubtaskStatusChange(child.id, opt.value as Task["status"]) }
                                                          className={isCurrent ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50"}
                                                        >
                                                          <Icon className={`mr-2 h-3 w-4 ${statusColor}`} />
                                                          {opt.label}
                                                          {isCurrent ? (
                                                            <span className={`ml-auto text-xs font-bold ${statusColor}`}>✓</span>
                                                          ) : (
                                                            <span className="ml-auto text-xs text-muted-foreground">
                                                              {opt.value === "To Do" ? "1" : opt.value === "In Progress" ? "2" : opt.value === "In Review" ? "3" : opt.value === "Blocked" ? "4" : opt.value === "Completed" ? "5" : ""}
                                                            </span>
                                                          )}
                                                        </ContextMenuItem>
                                                      );
                                                    })}
                                                  </ContextMenuSubContent>
                                                </ContextMenuPortal>
                                              </ContextMenuSub>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => closeContextMenuThen(() => handleDeleteSubtaskClick(child.id))} className="text-red-600 focus:text-red-600">
                                                <Trash2 className="mr-2 h-3 w-4" />
                                                Delete Task
                                                <span className="ml-auto text-xs text-muted-foreground">D</span>
                                              </ContextMenuItem>
                                            </ContextMenuContent>
                                          </ContextMenu>
                                        );
                                      })}
                                      </Fragment>
                                    );
                                  });
                                })()}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === "document" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                        </div>
                        <Card className="border-0 rounded-sm dark:bg-[#1A191C]">
                          <CardContent className="proximavara -my-3 -mx-3">
                            <div className="">
                              <NovelEditor ref={novelEditorRef} content={task.document} onChange={handleDocumentChange} placeholder="Start typing or press '/' for commands..." mentions={allProjectMembers} />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {activeTab === "comments" && (
                      <div className="mt-3">
                        <CommentsThread taskId={task.id} />
                      </div>
                    )}

                    {activeTab === "attachments" && (
                      <div className="mt-3 space-y-4">
                        <input type="file" multiple ref={fileInputRef} onChange={(e) => handleFilesChosen(e.target.files)} className="hidden" />
                        {/* Compact add-file row with drag support, playful and borderless */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={onDragOver}
                          onDrop={onDropFiles}
                          className="w-full flex items-center gap-4 rounded-xl bg-gradient-to-r from-primary/5 to-transparent px-4 py-3 text-left hover:from-primary/10 transition-colors"
                          title="Click to add files or drop them here"
                        >
                          <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm">
                            <Plus className="h-5 w-5" />
                          </div>
                          <div className="leading-tight">
                            <div className="text-sm font-medium">Add a new file</div>
                            <div className="text-xs text-muted-foreground">100 Mb max.</div>
                          </div>
                        </button>

                        {/* Upload queue */}
                        {uploads.length > 0 && (
                          <div className="space-y-2">
                            {uploads.map((u) => (
                              <Card key={u.id} className="p-3 bg-gradient-to-r from-background to-muted/40">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="truncate text-sm font-medium">{u.name}</div>
                                      <div className="text-xs text-muted-foreground whitespace-nowrap">{formatBytes(u.size)}</div>
                                    </div>
                                    <div className="mt-2">
                                      <Progress value={u.progress} className="h-2" />
                                    </div>
                                  </div>
                                  {u.status === "uploading" ? (
                                    <Button variant="ghost" size="icon" onClick={() => cancelUpload(u.id)} title="Cancel">
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <div className={cn("text-xs", u.status === "done" ? "text-emerald-600" : "text-red-600")}>{u.status}</div>
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-[220px] sm:w-[280px]">
                              <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  value={attachmentQuery}
                                  onChange={(e) => setAttachmentQuery(e.target.value)}
                                  placeholder="Search attachments..."
                                  className="h-8 pl-7"
                                />
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={fetchAttachments}>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Refresh
                            </Button>
                          </div>
                          <div className="flex items-center gap-1 rounded-md bg-muted/40 p-1 self-start sm:self-auto">
                            <Button
                              variant={attachmentView === "list" ? "secondary" : "ghost"}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setAttachmentView("list")}
                              title="List view"
                            >
                              <ListIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={attachmentView === "grid" ? "secondary" : "ghost"}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setAttachmentView("grid")}
                              title="Grid view"
                            >
                              <LayoutGrid className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Attachment list */}
                        {attachmentView === "list" ? (
                          <div className="space-y-3">
                            {azureAttachments.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No attachments yet</p>
                            ) : filteredAttachments.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No attachments found</p>
                            ) : (
                              filteredAttachments.map((f) => {
                                const isImage = (f.contentType||"").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name);
                                const base = `/api/attachments/${taskId}`;
                                const downloadHref = `${base}/download?name=${encodeURIComponent(f.blobName)}`;
                                const viewHref = `${base}/preview?name=${encodeURIComponent(f.blobName)}`;
                                const when = f.uploadedAt || f.lastModified;
                                const whenText = when ? format(new Date(when), "MMM d, yyyy") : undefined;
                                const sharedBy = f.uploadedByName || "Someone";
                                const accent = fileAccentFor(f.contentType, f.name);
                                return (
                                  <div
                                    key={f.blobName}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => window.open(viewHref, "_blank")}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.open(viewHref, "_blank"); } }}
                                    className="flex items-center justify-between rounded-2xl bg-background/70 px-4 py-3 hover:bg-primary/5 shadow-sm hover:shadow-md transition-all cursor-pointer"
                                  >
                                    <div className="flex items-center gap-4 min-w-0">
                                      {isImage ? (
                                        <img src={viewHref} alt={f.name} className="h-12 w-12 rounded-xl object-cover" />
                                      ) : (
                                        <div className={cn("h-12 w-12 flex items-center justify-center rounded-xl shadow-sm", accent.bg, accent.text)}>
                                          {fileIconFor(f.contentType, f.name)}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <div className="truncate text-[15px] font-semibold">{f.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {`Shared by ${sharedBy}`}{whenText ? ` on ${whenText}` : ""}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2 flex-shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e)=> e.stopPropagation()}>
                                      <a
                                        href={downloadHref}
                                        title="Download"
                                        className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted/60"
                                      >
                                        <span className="sr-only">Download</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                          <path d="M12 3a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4.001 4a1 1 0 01-1.412 0l-4.001-4a1 1 0 111.414-1.414L11 12.586V4a1 1 0 011-1z"/>
                                          <path d="M5 20a1 1 0 100-2h14a1 1 0 100 2H5z"/>
                                        </svg>
                                      </a>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button size="icon" variant="ghost" className="h-7 w-7">
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => window.open(viewHref, "_blank")}>Open</DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => { try { navigator.clipboard.writeText(window.location.origin + downloadHref); toast.success("Link copied"); } catch {}}}>
                                            Copy link
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={async () => {
                                              const yes = window.confirm(`Delete ${f.name}?`);
                                              if (!yes) return;
                                              try {
                                                const res = await fetch(`/api/attachments/${taskId}/delete?name=${encodeURIComponent(f.blobName)}`, { method: "DELETE" });
                                                if (!res.ok) throw new Error("delete failed");
                                                toast.success("File deleted");
                                                fetchAttachments();
                                              } catch (e) {
                                                console.error(e);
                                                toast.error("Failed to delete");
                                              }
                                            }}
                                          >
                                            Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {azureAttachments.length === 0 ? (
                              <p className="col-span-full text-sm text-muted-foreground">No attachments yet</p>
                            ) : filteredAttachments.length === 0 ? (
                              <p className="col-span-full text-sm text-muted-foreground">No attachments found</p>
                            ) : (
                              filteredAttachments.map((f) => {
                                const isImage = (f.contentType||"").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name);
                                const base = `/api/attachments/${taskId}`;
                                const downloadHref = `${base}/download?name=${encodeURIComponent(f.blobName)}`;
                                const viewHref = `${base}/preview?name=${encodeURIComponent(f.blobName)}`;
                                const accent = fileAccentFor(f.contentType, f.name);
                                return (
                                  <div
                                    key={f.blobName}
                                    className="group relative rounded-2xl overflow-hidden bg-background/70 shadow-sm hover:shadow-md transition-all cursor-pointer"
                                    onClick={() => window.open(viewHref, "_blank")}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.open(viewHref, "_blank"); } }}
                                  >
                                    <div className="aspect-square w-full">
                                      {isImage ? (
                                        <img src={viewHref} alt={f.name} className="h-full w-full object-cover" />
                                      ) : (
                                        <div className={cn("h-full w-full flex items-center justify-center", accent.bg, accent.text)}>
                                          {fileIconFor(f.contentType, f.name)}
                                        </div>
                                      )}
                                    </div>
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1" onClick={(e)=> e.stopPropagation()}>
                                      <a href={downloadHref} title="Download" className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-background/80 hover:bg-background">
                                        <span className="sr-only">Download</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                          <path d="M12 3a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4.001 4a1 1 0 01-1.412 0l-4.001-4a1 1 0 111.414-1.414L11 12.586V4a1 1 0 011-1z"/>
                                          <path d="M5 20a1 1 0 100-2h14a1 1 0 100 2H5z"/>
                                        </svg>
                                      </a>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button size="icon" variant="ghost" className="h-8 w-8 bg-background/80 hover:bg-background">
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => window.open(viewHref, "_blank")}>Open</DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => { try { navigator.clipboard.writeText(window.location.origin + downloadHref); toast.success("Link copied"); } catch {}}}>Copy link</DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={async () => {
                                              const yes = window.confirm(`Delete ${f.name}?`);
                                              if (!yes) return;
                                              try {
                                                const res = await fetch(`/api/attachments/${taskId}/delete?name=${encodeURIComponent(f.blobName)}`, { method: "DELETE" });
                                                if (!res.ok) throw new Error("delete failed");
                                                toast.success("File deleted");
                                                fetchAttachments();
                                              } catch (e) {
                                                console.error(e);
                                                toast.error("Failed to delete");
                                              }
                                            }}
                                          >Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                    <div className="p-2">
                                      <div className="truncate text-sm font-medium" title={f.name}>{f.name}</div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Activities tab removed */}
                    {activeTab === "details" && (
                      <div className="mt-3 space-y-3">
                        <Card className="border-0 shadow-none p-4">
                          <CardContent className="proximavara text-[15px] -mx-8 -mt-3">
                            {!isEditingDescription ? (
                              <button
                                className="text-left w-full"
                                onClick={() => {
                                  setIsEditingDescription(true);
                                  setDescriptionDraft((task.description || "").trim());
                                  setTimeout(() => {
                                    const ta = descTextareaRef.current;
                                    if (ta) {
                                      ta.focus();
                                      const len = ta.value?.length || 0;
                                      try {
                                        ta.setSelectionRange(len, len);
                                      } catch (e) {
                                        // ignore if not supported
                                      }
                                    }
                                  }, 0);
                                }}
                              >
                                {task.description && task.description.trim().length > 0 ? (
                                  <p className="whitespace-pre-wrap leading-6 text-foreground">
                                    {task.description}
                                  </p>
                                ) : (
                                  <p className="text-[15px] text-muted-foreground">No description added.</p>
                                )}
                              </button>
                            ) : (
                              <textarea
                                ref={descTextareaRef}
                                value={descriptionDraft}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDescriptionDraft(val);
                                  // debounce save
                                  if (descDebounceRef.current) clearTimeout(descDebounceRef.current);
                                  descDebounceRef.current = setTimeout(() => {
                                    handleUpdateTask({ description: val });
                                  }, 100);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    // Save immediately and exit
                                    if (descDebounceRef.current) clearTimeout(descDebounceRef.current);
                                    descCancelNextBlurRef.current = true; // prevent duplicate onBlur save
                                    handleUpdateTask({ description: descriptionDraft });
                                    setIsEditingDescription(false);
                                  }
                                  // Cmd/Ctrl+Enter -> save and exit
                                  if ((e.key === "Enter") && (e.metaKey || e.ctrlKey)) {
                                    if (descDebounceRef.current) clearTimeout(descDebounceRef.current);
                                    descCancelNextBlurRef.current = true;
                                    handleUpdateTask({ description: descriptionDraft });
                                    setIsEditingDescription(false);
                                  }
                                }}
                                onBlur={() => {
                                  if (descCancelNextBlurRef.current) {
                                    // reset flag and skip saving on this blur
                                    descCancelNextBlurRef.current = false;
                                    return;
                                  }
                                  if (descDebounceRef.current) clearTimeout(descDebounceRef.current);
                                  handleUpdateTask({ description: descriptionDraft });
                                  setIsEditingDescription(false);
                                }}
                                placeholder="No description added."
                                className="w-full min-h-[120px] resize-vertical bg-transparent outline-none focus:outline-none border-0 ring-0 focus:ring-0 placeholder:text-muted-foreground text-foreground leading-6"
                              />
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete Confirmation Modal for Subtasks */}
                <DeleteConfirmation
                  open={isDeleteConfirmOpenSub}
                  onOpenChange={(open) => {
                    setIsDeleteConfirmOpenSub(open);
                    if (!open) setSubtaskToDelete(null);
                  }}
                  itemName={subtaskToDelete?.name}
                  onConfirm={() => {
                    handleConfirmDeleteSubtask();
                    setIsDeleteConfirmOpenSub(false);
                    setSubtaskToDelete(null);
                  }}
                />

                {/* New Subtask Dialog (now using DialogShell) */}
                <DialogShell
                  open={isNewSubtaskDialogOpen}
                  onOpenChange={setIsNewSubtaskDialogOpen}
                  title="Create New Subtask"
                  description={`Adding a subtask to "${(currentParentTaskForSubtask?.name) || task.name}".`}
                >
                  <ScrollArea className="flex-grow pr-6 -mr-6">
                      <div className="grid gap-4 py-4 ">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="subtaskName" className="text-right col-span-1">Name</Label>
                          <Input id="subtaskName" value={newSubtaskData.name} onChange={(e)=> setNewSubtaskData((p)=> ({...p, name: e.target.value}))} className="col-span-3" placeholder="Enter subtask name" />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label htmlFor="subtaskDescription" className="text-right col-span-1 pt-2">Description</Label>
                          <Textarea id="subtaskDescription" value={newSubtaskData.description} onChange={(e)=> setNewSubtaskData((p)=> ({...p, description: e.target.value}))} className="col-span-3 min-h-[80px]" placeholder="Add a description (optional)" />
                        </div>

                        {/* Assignees for Subtask */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">Assignees</Label>
                          <div className="col-span-3">
                            <AssigneeSelector
                              open={isSubtaskAssigneePopoverOpen}
                              onOpenChange={setIsSubtaskAssigneePopoverOpen}
                              users={data?.allProjectMembers || []}
                              selectedIds={selectedSubtaskAssigneeIds}
                              onToggle={(id) =>
                                setSelectedSubtaskAssigneeIds((prev) =>
                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                )
                              }
                              searchTerm={subtaskAssigneeSearchTerm}
                              onSearchTermChange={setSubtaskAssigneeSearchTerm}
                              buttonLabel="Select assignees"
                            />
                          </div>
                        </div>

                        {/* Due Date for Subtask */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">Due Date</Label>
                          <Popover open={isSubtaskDueDatePopoverOpen} onOpenChange={setIsSubtaskDueDatePopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button variant={"outline"} className={cn("col-span-3 justify-start text-left font-normal h-auto py-2", !newSubtaskData.dueDate && "text-muted-foreground") }>
                                <CalendarDays className="mr-2 h-4 w-4" />
                                {newSubtaskData.dueDate ? format(newSubtaskData.dueDate, "PPP") : (<span>Pick a date</span>)}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-100 pointer-events-auto" align="start">
                              <CalendarComponent mode="single" selected={newSubtaskData.dueDate} onSelect={(d)=> setNewSubtaskData((p)=> ({...p, dueDate: d || undefined}))} />
                              <div className="p-2 border-t">
                                <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive h-7" onClick={()=> setNewSubtaskData((p)=> ({...p, dueDate: undefined}))} disabled={!newSubtaskData.dueDate}>Clear date</Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Priority */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="subtaskPriority" className="text-right col-span-1">Priority</Label>
                          <Select value={newSubtaskData.priority} onValueChange={(value: NewTaskData["priority"]) => setNewSubtaskData((p)=> ({...p, priority: value}))}>
                            <SelectTrigger className="col-span-3">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                              {(["Low","Medium","High"] as const).map((p)=> (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Status */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="subtaskStatus" className="text-right col-span-1">Status</Label>
                          <Select value={newSubtaskData.status} onValueChange={(value: Task["status"]) => setNewSubtaskData((p)=> ({...p, status: value}))}>
                            <SelectTrigger className="col-span-3">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {["To Do","In Progress","In Review","Blocked","Completed"].map((s)=> (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Tags */}
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label htmlFor="subtaskTags" className="text-right col-span-1 pt-2">Tags</Label>
                          <div className="col-span-3 space-y-2">
                            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-background">
                              {newSubtaskData.tags.split(",").filter((tag)=> tag.trim()).map((tag, index)=> (
                                <Badge key={index} variant="secondary" className="text-xs px-2 py-0.5 h-6 gap-1">
                                  {tag.trim()}
                                  <button type="button" onClick={()=> {
                                    const currentTags = newSubtaskData.tags.split(",").filter((t)=> t.trim());
                                    const updatedTags = currentTags.filter((_, i)=> i!==index);
                                    setNewSubtaskData((p)=> ({...p, tags: updatedTags.join(", ")}));
                                  }} className="hover:bg-destructive/20 rounded-full p-0.5"><X className="h-2.5 w-2.5" /></button>
                                </Badge>
                              ))}
                              {newSubtaskData.tags.split(",").filter((tag)=> tag.trim()).length === 0 && (<span className="text-sm text-muted-foreground">No tags selected</span>)}
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground h-8"><Plus className="h-3 w-3 mr-2" />Add tags</Button>
                              </PopoverTrigger>
                              <PopoverContent className="z-100 pointer-events-auto w-80 p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                <div className="p-3 space-y-3">
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Available Tags</Label>
                                    <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                      {(availableSubtaskTags||[]).map((tag)=> {
                                        const isSelected = newSubtaskData.tags.split(",").map((t)=> t.trim()).includes(tag);
                                        return (
                                          <button key={tag} type="button" onClick={()=> {
                                            const currentTags = newSubtaskData.tags.split(",").filter((t)=> t.trim());
                                            if (isSelected) {
                                              const updated = currentTags.filter((t)=> t!==tag);
                                              setNewSubtaskData((p)=> ({...p, tags: updated.join(", ")}));
                                            } else {
                                              setNewSubtaskData((p)=> ({...p, tags: [...currentTags, tag].join(", ")}));
                                            }
                                          }} className="w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 hover:bg-muted/50">
                                            <div className="w-2 h-2 rounded-full border border-muted-foreground/30" />
                                            <span className="flex-1">{tag}</span>
                                            {isSelected && <CircleCheck className="h-3.5 w-3.5 text-primary" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>
                  </ScrollArea>
                  {(
                    <>
                      <Button variant="outline" onClick={()=> setIsNewSubtaskDialogOpen(false)}>Cancel</Button>
                      <Button onClick={async ()=> {
                        if (!newSubtaskData.name.trim()) return;
                        const parent = currentParentTaskForSubtask || data?.task;
                        if (!parent) return;
                        setIsCreatingSubtask(true);
                        try {
                          const docRef = await addDoc(collection(db, "tasks"), {
                            name: newSubtaskData.name.trim(),
                            description: newSubtaskData.description.trim(),
                            assignedUserIds: selectedSubtaskAssigneeIds,
                            priority: newSubtaskData.priority,
                            status: newSubtaskData.status,
                            tags: newSubtaskData.tags.split(",").map((t)=> t.trim()).filter(Boolean),
                            projectId,
                            departmentId,
                            orgId: data?.project?.orgId || "",
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            subtaskIds: [],
                            parentTaskId: parent.id,
                            level: (parent.level || 0) + 1,
                            dueDate: newSubtaskData.dueDate ? Timestamp.fromDate(newSubtaskData.dueDate) : null,
                          } as any);
                          await updateDoc(doc(db, "tasks", parent.id), {
                            subtaskIds: arrayUnion(docRef.id),
                            updatedAt: serverTimestamp(),
                          });
                          toast.success("Subtask created successfully!");
                          setNewSubtaskData({ name: "", description: "", priority: "Medium", status: "To Do", tags: "", parentTaskId: undefined });
                          setSelectedSubtaskAssigneeIds([]);
                          setSubtaskAssigneeSearchTerm("");
                          setIsSubtaskAssigneePopoverOpen(false);
                          setIsSubtaskDueDatePopoverOpen(false);
                          setIsNewSubtaskDialogOpen(false);
                          setCurrentParentTaskForSubtask(null);
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to create subtask.");
                        } finally {
                          setIsCreatingSubtask(false);
                        }
                      }} disabled={isCreatingSubtask || !newSubtaskData.name.trim()}>
                        {isCreatingSubtask ? "Creating..." : "Create Subtask"}
                      </Button>
                    </>
                  )}
                </DialogShell>

                {/* Edit Task Dialog (now using DialogShell) */}
                <DialogShell
                  open={isEditTaskDialogOpen}
                  onOpenChange={setIsEditTaskDialogOpen}
                  title="Edit Task"
                  description="Update task details."
                >
                  <ScrollArea className="flex-grow pr-6 -mr-6">
                      <div className="grid gap-4 py-4 ">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="editTaskName" className="text-right col-span-1">Name</Label>
                          <Input id="editTaskName" value={editTaskData.name} onChange={(e)=> setEditTaskData((p)=> ({...p, name: e.target.value}))} className="col-span-3" placeholder="Enter task name" />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label htmlFor="editTaskDescription" className="text-right col-span-1 pt-2">Description</Label>
                          <Textarea id="editTaskDescription" value={editTaskData.description} onChange={(e)=> setEditTaskData((p)=> ({...p, description: e.target.value}))} className="col-span-3 min-h-[80px]" placeholder="Add a description (optional)" />
                        </div>

                        {/* Assignees */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">Assignees</Label>
                          <div className="col-span-3">
                            <AssigneeSelector
                              open={isEditTaskAssigneePopoverOpen}
                              onOpenChange={setIsEditTaskAssigneePopoverOpen}
                              users={data?.allProjectMembers || []}
                              selectedIds={selectedEditTaskAssigneeIds}
                              onToggle={(id) =>
                                setSelectedEditTaskAssigneeIds((prev) =>
                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                )
                              }
                              searchTerm={editTaskAssigneeSearchTerm}
                              onSearchTermChange={setEditTaskAssigneeSearchTerm}
                              buttonLabel="Select assignees"
                            />
                          </div>
                        </div>

                        {/* Due Date */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right col-span-1">Due Date</Label>
                          <Popover open={isEditTaskDueDatePopoverOpen} onOpenChange={setIsEditTaskDueDatePopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button variant={"outline"} className={cn("col-span-3 justify-start text-left font-normal h-auto py-2", !editTaskData.dueDate && "text-muted-foreground") }>
                                <CalendarDays className="mr-2 h-4 w-4" />
                                {editTaskData.dueDate ? format(editTaskData.dueDate, "PPP") : (<span>Pick a date</span>)}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-100 pointer-events-auto" align="start">
                              <CalendarComponent mode="single" selected={editTaskData.dueDate} onSelect={(d)=> setEditTaskData((p)=> ({...p, dueDate: d || undefined}))} />
                              <div className="p-2 border-t">
                                <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive h-7" onClick={()=> setEditTaskData((p)=> ({...p, dueDate: undefined}))} disabled={!editTaskData.dueDate}>Clear date</Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Priority */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="editTaskPriority" className="text-right col-span-1">Priority</Label>
                          <Select value={editTaskData.priority} onValueChange={(value: NewTaskData["priority"]) => setEditTaskData((p)=> ({...p, priority: value}))}>
                            <SelectTrigger className="col-span-3">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                              {(["Low","Medium","High"] as const).map((p)=> (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Status */}
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="editTaskStatus" className="text-right col-span-1">Status</Label>
                          <Select value={editTaskData.status} onValueChange={(value: Task["status"]) => setEditTaskData((p)=> ({...p, status: value}))}>
                            <SelectTrigger className="col-span-3">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {["To Do","In Progress","In Review","Blocked","Completed"].map((s)=> (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Tags */}
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label htmlFor="editTaskTags" className="text-right col-span-1 pt-2">Tags</Label>
                          <div className="col-span-3 space-y-2">
                            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-background">
                              {editTaskData.tags.split(",").filter((tag)=> tag.trim()).map((tag, index)=> (
                                <Badge key={index} variant="secondary" className="text-xs px-2 py-0.5 h-6 gap-1">
                                  {tag.trim()}
                                  <button type="button" onClick={()=> {
                                    const currentTags = editTaskData.tags.split(",").filter((t)=> t.trim());
                                    const updatedTags = currentTags.filter((_, i)=> i!==index);
                                    setEditTaskData((p)=> ({...p, tags: updatedTags.join(", ")}));
                                  }} className="hover:bg-destructive/20 rounded-full p-0.5"><X className="h-2.5 w-2.5" /></button>
                                </Badge>
                              ))}
                              {editTaskData.tags.split(",").filter((tag)=> tag.trim()).length === 0 && (<span className="text-sm text-muted-foreground">No tags selected</span>)}
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground h-8"><Plus className="h-3 w-3 mr-2" />Add tags</Button>
                              </PopoverTrigger>
                              <PopoverContent className="z-100 pointer-events-auto w-80 p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
                                <div className="p-3 space-y-3">
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Available Tags</Label>
                                    <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                      {(availableSubtaskTags||[]).map((tag)=> {
                                        const isSelected = editTaskData.tags.split(",").map((t)=> t.trim()).includes(tag);
                                        return (
                                          <button key={tag} type="button" onClick={()=> {
                                            const currentTags = editTaskData.tags.split(",").filter((t)=> t.trim());
                                            if (isSelected) {
                                              const updated = currentTags.filter((t)=> t!==tag);
                                              setEditTaskData((p)=> ({...p, tags: updated.join(", ")}));
                                            } else {
                                              setEditTaskData((p)=> ({...p, tags: [...currentTags, tag].join(", ")}));
                                            }
                                          }} className="w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 hover:bg-muted/50">
                                            <div className="w-2 h-2 rounded-full border border-muted-foreground/30" />
                                            <span className="flex-1">{tag}</span>
                                            {isSelected && <CircleCheck className="h-3.5 w-3.5 text-primary" />}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>
                  </ScrollArea>
                  {(
                    <>
                      <Button variant="outline" onClick={()=> setIsEditTaskDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleUpdateExistingTask} disabled={!editTaskData.name.trim()}>
                        Save Changes
                      </Button>
                    </>
                  )}
                </DialogShell>

              </div>
    </div>
  );
}

// Simple tag color hashing to create stable pill colors
function tagColorClass(name: string): string {
  const palette = [
    "bg-violet-700 text-white",
    "bg-emerald-700 text-white",
    "bg-sky-700 text-white",
    "bg-rose-700 text-white",
    "bg-amber-700 text-white",
    "bg-indigo-700 text-white",
    "bg-teal-700 text-white",
  ];
  const idx = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}
