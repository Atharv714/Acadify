// filepath: /Users/atharvrastogi/Documents/GitHub/organization-dashboard/src/app/dashboard/projects/[projectId]/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react"; // Added useMemo
import { KanbanBoard } from "@/components/kanban-pangea";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area"; // For scrollable user list
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import AssigneeSelector from "@/components/tasks/AssigneeSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
import DeleteConfirmation from "@/components/DeleteConfirmation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // Import Table components
import { TimelineView, GanttView } from "@/components/timeline"; // Import TimelineView and new GanttView
import { ListView } from "@/components/list"; // Import ListView
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
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  ChevronRight,
  ArrowLeft,
  Edit3,
  Save,
  X,
  Hash,
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
  CalendarDays,
  Info,
  RefreshCw,
  LayoutDashboard,
  ClipboardList,
  TableIcon,
  Columns,
  List,
  CalendarClock,
  PlusCircle,
  Command,
  CornerDownLeft,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {Kbd, KbdGroup} from "@/components/ui/kbd"
import ProjectDashboard from "@/components/dashboard/ProjectDashboard";
import {
  Project,
  Task,
  DisplayUser as MainDisplayUser,
  Department,
} from "@/lib/types";
import { navigateToTask, isValidTaskContext } from "@/lib/task-navigation";
import {
  getDepartmentAssignmentContext,
  validateAssignmentScope,
  getContextAwareUserList,
  fetchOrganizationMembersByDepartments,
} from "@/lib/departmentUtils";
import { localCache } from "@/lib/localCache";
import {
  normalizeProjectTagNames,
  computeAvailableTags,
  makeProjectTag,
  unionTagNames,
} from "@/lib/tagUtils";

// Helper function to safely convert various date types to a JavaScript Date object
const getSafeDate = (
  dateInput: Date | Timestamp | undefined
): Date | undefined => {
  if (!dateInput) return undefined;
  if (dateInput instanceof Date) return dateInput;
  if (dateInput instanceof Timestamp) return dateInput.toDate();
  return undefined;
};

// Helper function to safely get time from Date or Timestamp
const getSafeTime = (dateInput: Date | Timestamp): number => {
  if (dateInput instanceof Date) return dateInput.getTime();
  if (dateInput instanceof Timestamp) return dateInput.toDate().getTime();
  return 0;
};

// Adjusted interfaces to better match Firestore data and types.ts
// Assuming AppUser structure from your types.ts for fetched user details
interface DisplayUser {
  id: string;
  name?: string | null; // from displayName
  avatarUrl?: string | null; // from photoURL
  email?: string | null;
}

interface ProjectTag {
  id: string;

  name: string;
  color: string;
}

// This interface will represent the shape of the project data once fully processed
// (e.g., user details fetched, timestamps converted)
interface DisplayProject {
  id: string;
  name: string;
  description?: string;
  assignees: DisplayUser[]; // Changed from User[] to DisplayUser[]
  deadline?: Date; // Will be Date object after conversion
  tags: ProjectTag[];
  departmentId: string;
  departmentName?: string;
  orgId: string; // Added orgId for fetching related projects
  assignedUserIds?: string[]; // Keep track of raw IDs for updates if needed
}

// Interface for other projects in the dropdown
interface OtherProjectOption {
  id: string;
  name: string;
  departmentId: string; // Added to ensure correct routing for other projects
}

// Define Task interface and constants locally
interface NewTaskData {
  name: string;
  description: string;
  dueDate?: Date;
  priority: "Low" | "Medium" | "High";
  status: "To Do" | "In Progress" | "Blocked" | "In Review" | "Completed";
  tags: string; // Comma-separated string for input
  parentTaskId?: string; // ID of the parent task if this is a subtask
}

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

const taskPriorities = ["Low", "Medium", "High"] as const;
const taskStatuses = [
  "To Do",
  "In Progress",
  "Blocked",
  "In Review",
  "Completed",
] as const;

// Utility functions for task hierarchy
const getTaskHierarchy = (
  tasks: Task[],
  parentId?: string,
  level: number = 0
): Task[] => {
  const result: Task[] = [];

  // If no parentId is provided, start with the root-level tasks (no parent)
  const targetTasks =
    parentId === undefined
      ? tasks.filter((t) => !t.parentTaskId)
      : tasks.filter((t) => t.parentTaskId === parentId);

  for (const task of targetTasks) {
    const taskWithLevel = { ...task, level };
    result.push(taskWithLevel);
    result.push(...getTaskHierarchy(tasks, task.id, level + 1));
  }

  return result;
};

const getPriorityConfig = (priority: Task["priority"]) => {
  switch (priority) {
    case "High":
      return "border-red-500 text-red-700 bg-red-500/10";
    case "Medium":
      return "border-yellow-500 text-yellow-700 bg-yellow-500/10";
    case "Low":
      return "border-green-500 text-green-700 bg-green-500/10";
    default:
      return "";
  }
};

const getStatusConfig = (status: Task["status"]) => {
  switch (status) {
    case "To Do":
      return "bg-zinc-200/80 dark:bg-zinc-200/20 text-zinc-700 dark:text-zinc-300";
    case "In Progress":
      return "bg-blue-500/30 text-white";
    case "Blocked":
      return "bg-red-500/30 text-white";
    case "In Review":
      return "bg-yellow-500/30 text-white";
    case "Completed":
      return "bg-green-500/30 text-white";
    default:
      return "";
  }
};

const getbgStatusConfig = (status: Task["status"]) => {
  switch (status) {
    case "To Do":
      return "bg-zinc-200/15 dark:bg-zinc-950/15 text-zinc-700 dark:text-zinc-300";
    case "In Progress":
      return "bg-blue-950/15 dark:text-white";
    case "Blocked":
      return "bg-red-950/15 dark:text-white";
    case "In Review":
      return "bg-yellow-950/15 dark:text-white";
    case "Completed":
      return "bg-green-950/15 dark:text-white";
    default:
      return "";
  }
};

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const departmentId = params.departmentId as string; // Added departmentId
  const [departmentNameResolved, setDepartmentNameResolved] = useState<
    string | null
  >(null);

  // Hook for dynamic sidebar width calculation
  const { availableWidth, isMobile } = useSidebarWidth();

  // Synchronous cache-first hydration to avoid initial skeleton on navigation
  const initialCachedProject = projectId
    ? (localCache.getProject(projectId) as any)
    : null;
  const [project, setProject] = useState<DisplayProject | null>(() => {
    if (!initialCachedProject) return null;
    return {
      id: initialCachedProject.id,
      name: initialCachedProject.name,
      description: initialCachedProject.description,
      assignees: initialCachedProject.assignees || [],
      deadline:
        initialCachedProject.deadline instanceof Date
          ? initialCachedProject.deadline
          : initialCachedProject.deadline
            ? (initialCachedProject.deadline as any).toDate?.() || undefined
            : undefined,
      tags: initialCachedProject.tags || [],
      departmentId: initialCachedProject.departmentId,
      departmentName: initialCachedProject.departmentName,
      orgId: initialCachedProject.orgId,
      assignedUserIds: initialCachedProject.assignedUserIds,
    } as DisplayProject;
  });
  const [otherProjects, setOtherProjects] = useState<OtherProjectOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !initialCachedProject
  );
  const [isUpdating, setIsUpdating] = useState(false); // General updating state

  const [currentDeadline, setCurrentDeadline] = useState<Date | undefined>(
    undefined
  );
  const [isDeadlinePopoverOpen, setIsDeadlinePopoverOpen] = useState(false);

  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  // Updated tag colors to be more descriptive and include text/border for better badge styling
  const availableTagColors = [
    "bg-red-500/20 text-red-700 border border-red-500/30",
    "bg-blue-500/20 text-blue-700 border border-blue-500/30",
    "bg-green-500/20 text-green-700 border border-green-500/30",
    "bg-yellow-500/20 text-yellow-700 border border-yellow-500/30",
    "bg-purple-500/20 text-purple-700 border border-purple-500/30",
    "bg-pink-500/20 text-pink-700 border border-pink-500/30",
    "bg-indigo-500/20 text-indigo-700 border border-indigo-500/30",
    "bg-zinc-500/20 text-zinc-700 border border-zinc-500/30",
  ];

  // Resolve department name from Firestore if we only have departmentId
  useEffect(() => {
    const loadDeptName = async () => {
      try {
        const id = (project?.departmentId || departmentId) as
          | string
          | undefined;
        if (!id) return;
        // If project already has a departmentName, use it directly
        if (project?.departmentName) {
          setDepartmentNameResolved(project.departmentName);
          return;
        }
        const snap = await getDoc(doc(db, "departments", id));
        if (snap.exists()) {
          const data = snap.data() as any;
          setDepartmentNameResolved(data.name || null);
        } else {
          setDepartmentNameResolved(null);
        }
      } catch (e) {
        console.warn("Failed to resolve department name", e);
        setDepartmentNameResolved(null);
      }
    };
    loadDeptName();
  }, [project?.departmentId, project?.departmentName, departmentId]);
  const [newTagColor, setNewTagColor] = useState(availableTagColors[0]);

  // For Assignee Management (Project Level)
  const [isProjectAssigneePopoverOpen, setIsProjectAssigneePopoverOpen] =
    useState(false);
  const [allOrgUsers, setAllOrgUsers] = useState<DisplayUser[]>([]);
  const [department, setDepartment] = useState<Department | null>(null);
  const [contextAwareUsers, setContextAwareUsers] = useState<DisplayUser[]>([]);
  const [selectedProjectAssigneeIds, setSelectedProjectAssigneeIds] = useState<
    string[]
  >([]);
  const [projectAssigneeSearchTerm, setProjectAssigneeSearchTerm] =
    useState("");

  // State for New Parent Task Dialog
  const [isNewParentTaskDialogOpen, setIsNewParentTaskDialogOpen] =
    useState(false);
  const [newParentTaskData, setNewParentTaskData] = useState<NewTaskData>({
    name: "",
    description: "",
    priority: "Medium",
    status: "To Do",
    tags: "",
    parentTaskId: undefined,
  });
  const [isCreatingParentTask, setIsCreatingParentTask] = useState(false);
  const [selectedParentTaskAssigneeIds, setSelectedParentTaskAssigneeIds] =
    useState<string[]>([]);
  const [parentTaskAssigneeSearchTerm, setParentTaskAssigneeSearchTerm] =
    useState("");
  const [isParentTaskAssigneePopoverOpen, setIsParentTaskAssigneePopoverOpen] =
    useState(false);
  const [isParentTaskDueDatePopoverOpen, setIsParentTaskDueDatePopoverOpen] =
    useState(false);
  // Ensure Priority and Status selects in Parent dialog don't open together
  const [isParentPriorityOpen, setIsParentPriorityOpen] = useState(false);
  const [isParentStatusOpen, setIsParentStatusOpen] = useState(false);

  // State for New Subtask Dialog
  const [isNewSubtaskDialogOpen, setIsNewSubtaskDialogOpen] = useState(false);
  const [newSubtaskData, setNewSubtaskData] = useState<NewTaskData>({
    name: "",
    description: "",
    priority: "Medium",
    status: "To Do",
    tags: "",
    parentTaskId: undefined,
  });
  const [currentParentTaskForSubtask, setCurrentParentTaskForSubtask] =
    useState<Task | null>(null);
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
  const [selectedSubtaskAssigneeIds, setSelectedSubtaskAssigneeIds] = useState<
    string[]
  >([]);
  const [subtaskAssigneeSearchTerm, setSubtaskAssigneeSearchTerm] =
    useState("");
  const [isSubtaskAssigneePopoverOpen, setIsSubtaskAssigneePopoverOpen] =
    useState(false);
  const [isSubtaskDueDatePopoverOpen, setIsSubtaskDueDatePopoverOpen] =
    useState(false);
  // Ensure Priority and Status selects in Subtask dialog don't open together
  const [isSubtaskPriorityOpen, setIsSubtaskPriorityOpen] = useState(false);
  const [isSubtaskStatusOpen, setIsSubtaskStatusOpen] = useState(false);

  // State for Edit Task Dialog
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  const [currentEditingTask, setCurrentEditingTask] = useState<Task | null>(
    null
  );
  const [editTaskData, setEditTaskData] = useState<NewTaskData>({
    name: "",
    description: "",
    priority: "Medium",
    status: "To Do",
    tags: "",
  });
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  // Unified state for task assignee selection popover (used by Edit Task and potentially others if form is extracted)
  const [selectedEditTaskAssigneeIds, setSelectedEditTaskAssigneeIds] =
    useState<string[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Search and filter states
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [taskSort, setTaskSort] = useState<"name-asc" | "name-desc" | "">("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<
    "tomorrow" | "yesterday" | "this-week" | ""
  >("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  // Delete confirmation state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const [editTaskAssigneeSearchTerm, setEditTaskAssigneeSearchTerm] =
    useState("");
  const [isEditTaskAssigneePopoverOpen, setIsEditTaskAssigneePopoverOpen] =
    useState(false);

  // State for assignees column search in table view
  const [assigneesColumnSearchTerm, setAssigneesColumnSearchTerm] =
    useState("");
  // Unified state for task due date popover (used by Edit Task)
  const [isEditTaskDueDatePopoverOpen, setIsEditTaskDueDatePopoverOpen] =
    useState(false);
  // Ensure Priority and Status selects in Edit dialog don't open together
  const [isEditTaskPriorityOpen, setIsEditTaskPriorityOpen] = useState(false);
  const [isEditTaskStatusOpen, setIsEditTaskStatusOpen] = useState(false);

  // State for tasks (cache-first init)
  const initialCachedTasks = projectId
    ? (localCache.getTasks(projectId) as any[])
    : null;
  const [tasks, setTasks] = useState<Task[]>(() =>
    initialCachedTasks && initialCachedTasks.length
      ? (initialCachedTasks as Task[])
      : []
  );
  const [isLoadingTasks, setIsLoadingTasks] = useState<boolean>(
    () => !(initialCachedTasks && initialCachedTasks.length)
  );

  // Conditional timeline height: apply viewport height only when tasks fit, remove when they exceed
  const [shouldUseViewportHeight, setShouldUseViewportHeight] = useState(true);
  const [availableTimelineHeight, setAvailableTimelineHeight] = useState<
    number | null
  >(null);
  useEffect(() => {
    const ROW_HEIGHT = 70; // Gantt row height
    const GANTT_HEADER_HEIGHT = 64; // Max Gantt header height (day view has 2 rows)
    const VIEWPORT_OFFSET = 200; // matches calc(100vh - 200px)

    const checkTaskFit = () => {
      const availableHeight = window.innerHeight - VIEWPORT_OFFSET;
      const requiredHeight = tasks.length * ROW_HEIGHT + GANTT_HEADER_HEIGHT;
      const shouldFit = requiredHeight <= availableHeight;

      setShouldUseViewportHeight(shouldFit);
      // Pass the full available height to ensure complete viewport coverage
      setAvailableTimelineHeight(availableHeight);
    };

    checkTaskFit();
    window.addEventListener("resize", checkTaskFit);
    return () => window.removeEventListener("resize", checkTaskFit);
  }, [tasks.length]);

  // Track which view to use for task display: table (default) or kanban
  const [taskView, setTaskView] = useState<
    "table" | "kanban" | "timeline" | "list"
  >("table");

  // Timeline mode toggle: default to Gantt view
  const [timelineMode, setTimelineMode] = useState<"gantt" | "timeline">(
    "gantt"
  );

  // State for managing task actions dropdown visibility
  const [isTaskActionsDropdownOpen, setIsTaskActionsDropdownOpen] =
    useState(false);

  // State for tag management in table
  const [availableTaskTags, setAvailableTaskTags] = useState<string[]>([]);
  const [isTagPopoverOpenForTask, setIsTagPopoverOpenForTask] = useState<
    string | null
  >(null);
  const [newTagInput, setNewTagInput] = useState("");
  const [selectedTagsForTask, setSelectedTagsForTask] = useState<{
    [taskId: string]: string[];
  }>({});

  // Add a new state to manage the order of tasks for the Kanban view
  // This will be updated when tasks are reordered within a column
  const [kanbanOrderedTasks, setKanbanOrderedTasks] = useState<Task[]>([]);

  // When tasks are fetched or updated, also update kanbanOrderedTasks
  // This ensures that the initial order is respected and that reordering
  // builds upon the correct dataset.
  useEffect(() => {
    setKanbanOrderedTasks(tasks);
  }, [tasks]);

  // Populate availableTaskTags as a union of task-used tags and project-level tags (names)
  useEffect(() => {
    const names = normalizeProjectTagNames(projectTags as any);
    const next = computeAvailableTags(tasks, names);
    setAvailableTaskTags(next);
  }, [tasks, projectTags]);

  // Track hovered task row in Table view for keyboard shortcuts
  const [hoveredTableTaskId, setHoveredTableTaskId] = useState<string | null>(
    null
  );

  // Match TimelineView: status options for context menu
  const statusOptions = [
    { label: "To Do", value: "To Do", icon: Circle },
    { label: "In Progress", value: "In Progress", icon: Clock },
    { label: "In Review", value: "In Review", icon: Search },
    { label: "Blocked", value: "Blocked", icon: AlertCircle },
    { label: "Completed", value: "Completed", icon: CircleCheck },
  ];

  // Linear.app style keyboard shortcuts for Table view
  useEffect(() => {
    if (taskView !== "table") return;

    const isEditableElement = (el: Element | null) => {
      if (!el) return false;
      const he = el as HTMLElement;
      const tag = he.tagName?.toLowerCase();
      if (he.isContentEditable) return true;
      if (tag === "input" || tag === "textarea" || tag === "select")
        return true;
      if (he.getAttribute("role") === "textbox") return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hoveredTableTaskId) return;

      // Allow OS/Browser shortcuts (e.g., Cmd+R) and ignore when typing in inputs
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableElement(document.activeElement)) return;

      const task = tasks.find((t) => t.id === hoveredTableTaskId);
      if (!task) return;

      switch (e.key.toLowerCase()) {
        case "enter":
          e.preventDefault();
          handleTaskClick(hoveredTableTaskId);
          break;
        case "r": {
          e.preventDefault();
          const rowEl = document.querySelector(
            `[data-table-task-id="${hoveredTableTaskId}"]`
          ) as HTMLElement | null;
          if (rowEl) {
            const rect = rowEl.getBoundingClientRect();
            const x = rect.left + rect.width * 0.7;
            const y = rect.top + rect.height * 0.5;
            rowEl.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: x,
                clientY: y,
              })
            );
          }
          break;
        }
        case "e":
          e.preventDefault();
          closeContextMenuThen(() => handleEditTask(hoveredTableTaskId));
          break;
        case "c": {
          e.preventDefault();
          const t = tasks.find((x) => x.id === hoveredTableTaskId);
          if (t) closeContextMenuThen(() => openNewSubtaskDialog(t));
          break;
        }
        case "s": {
          e.preventDefault();
          const hasSubtasks = tasks.some(
            (t) => t.parentTaskId === hoveredTableTaskId
          );
          if (hasSubtasks) toggleTaskExpanded(hoveredTableTaskId);
          break;
        }
        case "d":
          e.preventDefault();
          closeContextMenuThen(() => handleDeleteTaskClick(hoveredTableTaskId));
          break;
        case "1":
          e.preventDefault();
          handleUpdateTaskStatus(hoveredTableTaskId, "To Do");
          break;
        case "2":
          e.preventDefault();
          handleUpdateTaskStatus(hoveredTableTaskId, "In Progress");
          break;
        case "3":
          e.preventDefault();
          handleUpdateTaskStatus(hoveredTableTaskId, "In Review");
          break;
        case "4":
          e.preventDefault();
          handleUpdateTaskStatus(hoveredTableTaskId, "Blocked");
          break;
        case "5":
          e.preventDefault();
          handleUpdateTaskStatus(hoveredTableTaskId, "Completed");
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hoveredTableTaskId, tasks, taskView]);

  // Ensure context menu unmounts before opening any dialogs/popovers to avoid aria-hidden issues
  const closeContextMenuThen = (action: () => void) => {
    // Close any open Radix context menus
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    // Slight delay to allow unmount before opening dialogs
    setTimeout(() => action(), 10);
  };

  // Check if any task in the project has subtasks
  const anyTaskHasSubtasks = useMemo(() => {
    return tasks.some((task) => task.subtaskIds && task.subtaskIds.length > 0);
  }, [tasks]);

  // Adjusted to check if level is 0 and there are no tasks with subtasks
  const getTaskPadding = (task: Task) => {
    if (!anyTaskHasSubtasks) {
      // If no task has subtasks, use 8px padding for all tasks
      return "8px";
    }

    // Otherwise use the hierarchical indentation
    return task.subtaskIds.length > 0
      ? "0px"
      : `${22 + (task.level || 0) * 22}px`;
  };

  // for taskstatusdistribution widget
  const [taskStatusDistribution, setTaskStatusDistribution] = useState<
    TaskStatusDistributionItem[]
  >([]);

  useEffect(() => {
    // Mapping from your Task's status values to the names TaskStatusWidget-v2 expects
    const statusMapping: { [key: string]: WidgetTaskStatusName | undefined } = {
      "To Do": "To Do",
      "In Progress": "In Progress",
      Blocked: "Blocked",
      "In Review": "Review",
      Completed: "Completed",
    };

    // Define the order and names of statuses as expected by the widget
    const widgetExpectedStatuses: WidgetTaskStatusName[] = [
      "To Do",
      "In Progress",
      "Review",
      "Completed",
      "Blocked",
    ];

    if (tasks && tasks.length > 0) {
      const counts: { [K in WidgetTaskStatusName]?: number } = {};
      widgetExpectedStatuses.forEach((statusName) => {
        counts[statusName] = 0;
      });

      tasks.forEach((task) => {
        const taskActualStatus = task.status;
        const widgetStatusName = statusMapping[taskActualStatus];
        if (widgetStatusName && counts.hasOwnProperty(widgetStatusName)) {
          counts[widgetStatusName] = (counts[widgetStatusName] || 0) + 1;
        }
      });

      const distributionData: TaskStatusDistributionItem[] =
        widgetExpectedStatuses.map((statusName) => ({
          status: statusName,
          count: counts[statusName] || 0,
        }));
      setTaskStatusDistribution(distributionData);
    } else {
      const initialDistribution: TaskStatusDistributionItem[] =
        widgetExpectedStatuses.map((statusName) => ({
          status: statusName,
          count: 0,
        }));
      setTaskStatusDistribution(initialDistribution);
    }
  }, [tasks]);

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleUpdateTaskStatus = async (
    taskId: string,
    newStatus: Task["status"]
  ) => {
    const taskDocRef = doc(db, "tasks", taskId);
    toast.promise(
      updateDoc(taskDocRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })
        .then(() => {
          // UI updates via onSnapshot, but we might need to manually update kanbanOrderedTasks if not using Firestore for order
          setKanbanOrderedTasks((prevTasks) =>
            prevTasks.map((t) =>
              t.id === taskId ? { ...t, status: newStatus } : t
            )
          );
          return `Task status updated to "${newStatus}".`;
        })
        .catch((err) => {
          console.error("Error updating task status:", err);
          throw new Error("Failed to update task status.");
        }),
      {
        loading: "Updating task status...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // ADD THIS FUNCTION
  const handleReorderTasksInColumn = (
    columnStatus: Task["status"],
    reorderedTasksInColumn: Task[]
  ) => {
    setKanbanOrderedTasks((prevTasks) => {
      const otherColumnTasks = prevTasks.filter(
        (task) => task.status !== columnStatus
      );
      const newFullTaskList = [...otherColumnTasks, ...reorderedTasksInColumn];
      // Optional: Persist order to Firestore (see previous detailed comment)
      return newFullTaskList;
    });
  };
  // END ADD THIS FUNCTION

  // Handler for updating task priority via ListView popover
  const handleUpdateTaskPriority = async (
    taskId: string,
    priority: Task["priority"]
  ) => {
    const taskDocRef = doc(db, "tasks", taskId);
    toast.promise(
      updateDoc(taskDocRef, {
        priority: priority,
        updatedAt: serverTimestamp(),
      })
        .then(() => {
          return `Task priority updated to "${priority}".`;
        })
        .catch((err) => {
          console.error("Error updating task priority:", err);
          throw new Error("Failed to update task priority.");
        }),
      {
        loading: "Updating task priority...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // Handler for updating task due date via ListView popover
  const handleUpdateTaskDueDate = async (
    taskId: string,
    dueDate: Date | null
  ) => {
    const taskDocRef = doc(db, "tasks", taskId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (dueDate) {
      updateData.dueDate = Timestamp.fromDate(dueDate);
    } else {
      updateData.dueDate = null;
    }

    toast.promise(
      updateDoc(taskDocRef, updateData)
        .then(() => {
          return dueDate
            ? `Task due date updated to ${format(dueDate, "MMM d, yyyy")}.`
            : "Task due date cleared.";
        })
        .catch((err) => {
          console.error("Error updating task due date:", err);
          throw new Error("Failed to update task due date.");
        }),
      {
        loading: "Updating task due date...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // Handler for updating task assignees via ListView popover
  const handleUpdateTaskAssignees = async (
    taskId: string,
    assigneeIds: string[]
  ) => {
    const taskDocRef = doc(db, "tasks", taskId);
    toast.promise(
      updateDoc(taskDocRef, {
        assignedUserIds: assigneeIds,
        updatedAt: serverTimestamp(),
      })
        .then(() => {
          const assigneeCount = assigneeIds.length;
          return assigneeCount > 0
            ? `Task assignees updated (${assigneeCount} user${
                assigneeCount !== 1 ? "s" : ""
              }).`
            : "Task assignees cleared.";
        })
        .catch((err) => {
          console.error("Error updating task assignees:", err);
          throw new Error("Failed to update task assignees.");
        }),
      {
        loading: "Updating task assignees...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // Handler for updating task tags
  const handleUpdateTaskTags = async (taskId: string, newTags: string[]) => {
    const taskDocRef = doc(db, "tasks", taskId);
    toast.promise(
      updateDoc(taskDocRef, {
        tags: newTags,
        updatedAt: serverTimestamp(),
      })
        .then(() => {
          const tagCount = newTags.length;
          return tagCount > 0
            ? `Task tags updated (${tagCount} tag${tagCount !== 1 ? "s" : ""}).`
            : "Task tags cleared.";
        })
        .catch((err) => {
          console.error("Error updating task tags:", err);
          throw new Error("Failed to update task tags.");
        }),
      {
        loading: "Updating task tags...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // Handler for adding a new tag to the project and available tags
  const handleCreateNewTag = async (tagName: string) => {
    if (!tagName.trim() || !project) return;

    const trimmedTag = tagName.trim();

    // Add to available tags immediately for UX
    if (!availableTaskTags.includes(trimmedTag)) {
      setAvailableTaskTags((prev) => unionTagNames(prev, [trimmedTag]));
    }

    // Persist into project-level tag registry so it remains available even if unused by any task
    try {
      const projectDocRef = doc(db, "projects", project.id);
      // Normalize existing projectTags to objects
      const existingNames = new Set(
        normalizeProjectTagNames(projectTags as any)
      );
      if (!existingNames.has(trimmedTag)) {
        const newProjectTag = makeProjectTag(
          trimmedTag,
          "bg-zinc-500/20 text-zinc-700 border border-zinc-500/30"
        );
        const updatedTags = [...(projectTags as any[]), newProjectTag];
        await updateDoc(projectDocRef, { tags: updatedTags });
        setProjectTags(updatedTags);
      }
    } catch (e) {
      console.error("Failed to persist project tag:", e);
      // Non-fatal; tag will still be in available list for this session
    }

    setNewTagInput("");
    return trimmedTag;
  };

  // Handler for deleting a tag from the system
  const handleDeleteTag = async (tagToDelete: string) => {
    if (!project || !tagToDelete.trim()) return;

    try {
      // Show confirmation dialog
      const confirmDelete = confirm(
        `Are you sure you want to delete the tag "${tagToDelete}"?\n\nThis will remove it from all tasks that use this tag. This action cannot be undone.`
      );

      if (!confirmDelete) return;

      // Remove from available tags
      setAvailableTaskTags((prev) => prev.filter((tag) => tag !== tagToDelete));

      // Get all tasks that use this tag and update them
      const tasksToUpdate = tasks.filter((task) =>
        task.tags.includes(tagToDelete)
      );

      if (tasksToUpdate.length > 0) {
        const updatePromises = tasksToUpdate.map((task) => {
          const taskDocRef = doc(db, "tasks", task.id);
          const newTags = task.tags.filter((tag) => tag !== tagToDelete);
          return updateDoc(taskDocRef, {
            tags: newTags,
            updatedAt: serverTimestamp(),
          });
        });

        await Promise.all(updatePromises);
        toast.success(
          `Tag "${tagToDelete}" deleted and removed from ${tasksToUpdate.length} task(s)`
        );
      } else {
        toast.success(`Tag "${tagToDelete}" deleted successfully`);
      }

      // Also remove from project-level tag registry
      try {
        const projectDocRef = doc(db, "projects", project.id);
        const filteredProjectTags = (projectTags as any[]).filter((t) => {
          const name = typeof t === "string" ? t : t?.name;
          return name !== tagToDelete;
        });
        await updateDoc(projectDocRef, { tags: filteredProjectTags });
        setProjectTags(filteredProjectTags as any);
      } catch (e) {
        console.error("Failed to remove tag from project registry:", e);
      }
    } catch (error) {
      console.error("Error deleting tag:", error);
      toast.error("Failed to delete tag. Please try again.");
    }
  };

  // Task navigation handler
  const handleTaskClick = (taskId: string) => {
    if (!isValidTaskContext({ taskId, projectId, departmentId })) {
      console.error("Invalid task navigation context:", {
        taskId,
        projectId,
        departmentId,
      });
      toast.error("Cannot navigate to task: invalid context");
      return;
    }

    navigateToTask(router, { taskId, projectId, departmentId });
  };

  // Handler for editing a task
  const handleEditTask = (taskId: string) => {
    // Close dropdown first to avoid focus conflicts
    setIsTaskActionsDropdownOpen(false);

    // Small delay to ensure dropdown closes before dialog opens
    setTimeout(() => {
      const taskToEdit = tasks.find((t) => t.id === taskId);
      if (taskToEdit) {
        setCurrentEditingTask(taskToEdit);
        setEditTaskData({
          name: taskToEdit.name,
          description: taskToEdit.description || "",
          dueDate: getSafeDate(taskToEdit.dueDate),
          priority: taskToEdit.priority,
          status: taskToEdit.status,
          tags: taskToEdit.tags.join(", "),
          parentTaskId: taskToEdit.parentTaskId, // Keep parentTaskId if editing
        });
        setSelectedEditTaskAssigneeIds(taskToEdit.assignedUserIds || []);
        setIsEditTaskDialogOpen(true);
      }
    }, 50);
  };

  // Handler for updating an existing task
  const handleUpdateTask = async () => {
    if (!currentEditingTask || !editTaskData.name.trim()) {
      toast.error("Task name is required.");
      return;
    }
    setIsUpdatingTask(true);

    const taskToUpdate: any = {
      name: editTaskData.name.trim(),
      description: editTaskData.description.trim(),
      assignedUserIds: selectedEditTaskAssigneeIds,
      priority: editTaskData.priority,
      status: editTaskData.status,
      tags: editTaskData.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
      updatedAt: serverTimestamp(),
    };

    if (editTaskData.dueDate) {
      taskToUpdate.dueDate = Timestamp.fromDate(editTaskData.dueDate);
    } else {
      taskToUpdate.dueDate = null;
    }

    const taskDocRef = doc(db, "tasks", currentEditingTask.id);

    toast.promise(
      updateDoc(taskDocRef, taskToUpdate)
        .then(() => {
          setIsEditTaskDialogOpen(false);
          setCurrentEditingTask(null);
          setSelectedEditTaskAssigneeIds([]);
          setEditTaskAssigneeSearchTerm("");
          return "Task updated successfully!";
        })
        .catch((err) => {
          console.error("Error updating task:", err);
          throw new Error("Failed to update task.");
        })
        .finally(() => {
          setIsUpdatingTask(false);
        }),
      {
        loading: "Updating task...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // (Removed duplicate early hydration; see later hydration effect that also sets isLoading(false))

  useEffect(() => {
    if (!projectId || !departmentId) {
      setIsLoading(false);
      setProject(null);
      return;
    }

    // Only show loading if we don't already have cached project data
    if (!project) {
      setIsLoading(true);
    }
    const projectDocRef = doc(db, "projects", projectId);

    // Subscribe to the project doc: persistence returns cached data instantly, then updates from server
    const unsubscribe = onSnapshot(
      projectDocRef,
      { includeMetadataChanges: true },
      async (projectSnap) => {
        if (projectSnap.exists()) {
          const projectData = projectSnap.data() as any;

          // Fetch assignee details for the project (IDs live on project)
          let assigneesDetails: DisplayUser[] = [];
          const currentAssignedUserIds = projectData.assignedUserIds || [];
          setSelectedProjectAssigneeIds(currentAssignedUserIds);

          if (currentAssignedUserIds.length > 0) {
            // best-effort: read each user once; these reads will also hit cache first
            const details: DisplayUser[] = [];
            for (const userId of currentAssignedUserIds) {
              try {
                const userDocRef = doc(db, "users", userId);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                  const userData = userSnap.data();
                  details.push({
                    id: userSnap.id,
                    name: userData.displayName || "Unknown User",
                    avatarUrl: userData.photoURL,
                    email: userData.email,
                  });
                } else {
                  details.push({
                    id: userId,
                    name: "Unknown User (not found)",
                  });
                }
              } catch {
                details.push({ id: userId, name: "Unknown User (error)" });
              }
            }
            assigneesDetails = details;
          }

          const deadlineDate =
            projectData.dueDate instanceof Timestamp
              ? projectData.dueDate.toDate()
              : projectData.dueDate;

          const processedProject: DisplayProject = {
            id: projectSnap.id,
            name: projectData.name || "Unnamed Project",
            description: projectData.description,
            assignees: assigneesDetails,
            deadline: deadlineDate,
            tags: projectData.tags || [],
            departmentId: projectData.departmentId,
            departmentName: projectData.departmentName,
            orgId: projectData.orgId,
            assignedUserIds: currentAssignedUserIds,
          };

          setProject(processedProject);
          // keep cache hot for next navigation
          localCache.setProject(projectId, {
            ...processedProject,
          } as any);
          setCurrentDeadline(processedProject.deadline);
          setProjectTags(processedProject.tags);

          // Defer heavier one-off queries to separate effects keyed by project/org
          setIsLoading(false);
        } else {
          setProject(null);
          setIsLoading(false);
          toast.error(`Project with ID "${projectId}" not found.`);
        }
      },
      (error) => {
        console.error("ProjectPage: Error subscribing to project:", error);
        setProject(null);
        setIsLoading(false);
        toast.error("Failed to load project data.");
      }
    );

    return () => unsubscribe();
  }, [projectId, departmentId, db]);

  // Fetch org users from memberships grouping (ensures consistent multi-org visibility)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!project?.orgId) {
        setAllOrgUsers([]);
        return;
      }
      const map = await fetchOrganizationMembersByDepartments(project.orgId);
      const unique: Record<string, DisplayUser> = {};
      map.forEach((members) => {
        members.forEach((m: any) => {
          const id = m.uid || m.id;
          if (!id || unique[id]) return;
          unique[id] = {
            id,
            name: m.displayName || m.name || "Unnamed User",
            avatarUrl: m.photoURL || m.avatarUrl || null,
            email: m.email || null,
          };
        });
      });
      // Ensure currently assigned users exist even if not in membership (should not happen after backfill)
      (project.assignedUserIds || []).forEach((id) => {
        if (!unique[id]) {
          unique[id] = { id, name: "Member", avatarUrl: null, email: null };
        }
      });
      if (!cancelled) setAllOrgUsers(Object.values(unique));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [project?.orgId, project?.assignedUserIds]);

  // Subscribe to department data (cache-first) and compute context-aware users
  useEffect(() => {
    if (!departmentId) {
      setDepartment(null);
      setContextAwareUsers(allOrgUsers);
      return;
    }

    const departmentDocRef = doc(db, "departments", departmentId);
    const unsubscribe = onSnapshot(
      departmentDocRef,
      { includeMetadataChanges: true },
      (departmentSnap) => {
        if (departmentSnap.exists()) {
          const departmentData = departmentSnap.data() as Department;
          setDepartment(departmentData);

          // Map department members using already-subscribed org users
          let departmentMembers: DisplayUser[] = [];
          if (departmentData.memberIds?.length) {
            const idSet = new Set(departmentData.memberIds);
            departmentMembers = allOrgUsers.filter((u) => idSet.has(u.id));
          }
          const contextAwareUserList = getContextAwareUserList(
            departmentData,
            departmentMembers,
            allOrgUsers
          );
          setContextAwareUsers(contextAwareUserList);
        } else {
          setDepartment(null);
          setContextAwareUsers(allOrgUsers);
        }
      },
      (error) => {
        console.error("Error subscribing to department:", error);
      }
    );

    return () => unsubscribe();
  }, [departmentId, allOrgUsers, db]);

  // Subscribe to other projects in the same org (cache-first)
  useEffect(() => {
    if (!project?.orgId) {
      setOtherProjects([]);
      return;
    }

    const otherProjectsQ = query(
      collection(db, "projects"),
      where("orgId", "==", project.orgId)
    );
    const unsubscribe = onSnapshot(
      otherProjectsQ,
      { includeMetadataChanges: true },
      (snap) => {
        const list: OtherProjectOption[] = [];
        snap.forEach((docSnap) => {
          if (docSnap.id !== projectId) {
            const data = docSnap.data();
            if (data.departmentId) {
              list.push({
                id: docSnap.id,
                name: data.name || "Unnamed Project",
                departmentId: data.departmentId,
              });
            }
          }
        });
        setOtherProjects(list.slice(0, 5));
      },
      (error) => {
        console.error("Error subscribing to other projects:", error);
      }
    );

    return () => unsubscribe();
  }, [project?.orgId, projectId, db]);

  // useEffect to fetch tasks when project.id is available (hydrate from cache first)
  useEffect(() => {
    if (!project?.id || !allOrgUsers.length) {
      // Prerequisites (project or users) not ready yet.
      // Attempt cache hydration ONLY to immediately show tasks if we have them; otherwise keep loading state true to avoid empty flicker.
      if (projectId) {
        try {
          const cachedTasks = localCache.getTasks(projectId);
          if (cachedTasks && (cachedTasks as any[]).length) {
            setTasks(cachedTasks as any);
            setIsLoadingTasks(false); // We have real data; safe to stop loading.
          } else {
            // Ensure tasks array is cleared (e.g., navigating between projects) but DO NOT flip loading false yet.
            setTasks([]);
          }
        } catch {
          // Ignore cache errors; keep loading state.
        }
      }
      return; // Wait for deps before establishing snapshot listener.
    }
    // Hydrate from cache immediately if available; otherwise show loader
    try {
      const cached = localCache.getTasks(project.id);
      if (cached && (cached as any[]).length) {
        setTasks(cached as any);
        setIsLoadingTasks(false);
      } else {
        setIsLoadingTasks(true);
      }
    } catch {
      setIsLoadingTasks(true);
    }
    const tasksQuery = query(
      collection(db, "tasks"),
      where("projectId", "==", project.id)
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      async (querySnapshot) => {
        const fetchedTasks: Task[] = [];
        for (const docSnap of querySnapshot.docs) {
          const taskData = docSnap.data();
          let assignedUsersDetails: DisplayUser[] = [];
          if (taskData.assignedUserIds && taskData.assignedUserIds.length > 0) {
            assignedUsersDetails = taskData.assignedUserIds.map(
              (userId: string) => {
                const userDetail = allOrgUsers.find((u) => u.id === userId);
                return userDetail || { id: userId, name: "Unknown User" };
              }
            );
          }

          fetchedTasks.push({
            id: docSnap.id,
            name: taskData.name,
            description: taskData.description,
            assignedUsers: assignedUsersDetails,
            assignedUserIds: taskData.assignedUserIds || [],
            dueDate:
              taskData.dueDate instanceof Timestamp
                ? taskData.dueDate.toDate()
                : undefined,
            priority: taskData.priority,
            status: taskData.status,
            tags: taskData.tags || [],
            projectId: taskData.projectId,
            departmentId: taskData.departmentId,
            orgId: taskData.orgId,
            createdAt:
              taskData.createdAt instanceof Timestamp
                ? taskData.createdAt.toDate()
                : new Date(),
            updatedAt:
              taskData.updatedAt instanceof Timestamp
                ? taskData.updatedAt.toDate()
                : new Date(),
            parentTaskId: taskData.parentTaskId,
            subtaskIds: taskData.subtaskIds || [],
            level: taskData.level || 0,
          });
        }
        const sortedTasks = fetchedTasks.sort(
          (a, b) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt)
        );
        setTasks(sortedTasks); // Sort by creation date, newest first
        // cache tasks for instant re-entry
        try {
          localCache.setTasks(project.id, sortedTasks as any);
        } catch {}
        setIsLoadingTasks(false);
      },
      (error) => {
        console.error("Error fetching tasks: ", error);
        toast.error("Failed to load tasks.");
        setIsLoadingTasks(false);
      }
    );

    return () => unsubscribe(); // Cleanup listener on component unmount or project change
  }, [project?.id, allOrgUsers]); // Rerun if project.id or allOrgUsers changes

  const handleDeadlineSelect = async (date: Date | undefined) => {
    if (date && project && !isUpdating) {
      setIsUpdating(true);
      const projectDocRef = doc(db, "projects", project.id);
      const newDeadline = Timestamp.fromDate(date);

      toast.promise(
        updateDoc(projectDocRef, { dueDate: newDeadline })
          .then(() => {
            setCurrentDeadline(date);
            setProject((prev) => (prev ? { ...prev, deadline: date } : null));
            setIsDeadlinePopoverOpen(false);
            return "Deadline updated successfully!";
          })
          .catch((err) => {
            console.error("Error updating deadline:", err);
            throw new Error("Failed to update deadline.");
          })
          .finally(() => {
            setIsUpdating(false);
          }),
        {
          loading: "Updating deadline...",
          success: (message) => message,
          error: (err) => err.message,
        }
      );
    } else if (!date && project && !isUpdating) {
      // Handle clearing the deadline
      setIsUpdating(true);
      const projectDocRef = doc(db, "projects", project.id);
      toast.promise(
        updateDoc(projectDocRef, { dueDate: null }) // Or serverTimestamp.delete() if using Firestore sentinel
          .then(() => {
            setCurrentDeadline(undefined);
            setProject((prev) =>
              prev ? { ...prev, deadline: undefined } : null
            );
            setIsDeadlinePopoverOpen(false);
            return "Deadline cleared successfully!";
          })
          .catch((err) => {
            console.error("Error clearing deadline:", err);
            throw new Error("Failed to clear deadline.");
          })
          .finally(() => {
            setIsUpdating(false);
          }),
        {
          loading: "Clearing deadline...",
          success: (message) => message,
          error: (err) => err.message,
        }
      );
    }
  };

  const handleAddTag = async () => {
    if (newTagName.trim() && project && !isUpdating) {
      setIsUpdating(true);
      const newTag: ProjectTag = {
        id: `tag-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // More unique ID
        name: newTagName.trim(),
        color: newTagColor + " text-white", // Assuming newTagColor is like "bg-red-500/20"
      };
      const updatedTags = [...projectTags, newTag];
      const projectDocRef = doc(db, "projects", project.id);

      toast.promise(
        updateDoc(projectDocRef, { tags: updatedTags }) // Overwrite the tags array
          .then(() => {
            setProjectTags(updatedTags);
            setProject((prev) =>
              prev ? { ...prev, tags: updatedTags } : null
            );
            setNewTagName("");
            // setIsTagPopoverOpen(false); // Optionally close
            return "Tag added successfully!";
          })
          .catch((err) => {
            console.error("Error adding tag:", err);
            throw new Error("Failed to add tag.");
          })
          .finally(() => {
            setIsUpdating(false);
          }),
        {
          loading: "Adding tag...",
          success: (message) => message,
          error: (err) => err.message,
        }
      );
    }
  };

  const handleRemoveTag = async (tagIdToRemove: string) => {
    if (project && !isUpdating) {
      setIsUpdating(true);
      const updatedTags = projectTags.filter((tag) => tag.id !== tagIdToRemove);
      const projectDocRef = doc(db, "projects", project.id);

      toast.promise(
        updateDoc(projectDocRef, { tags: updatedTags }) // Overwrite the tags array
          .then(() => {
            setProjectTags(updatedTags);
            setProject((prev) =>
              prev ? { ...prev, tags: updatedTags } : null
            );
            return "Tag removed successfully!";
          })
          .catch((err) => {
            console.error("Error removing tag:", err);
            throw new Error("Failed to remove tag.");
          })
          .finally(() => {
            setIsUpdating(false);
          }),
        {
          loading: "Removing tag...",
          success: (message) => message,
          error: (err) => err.message,
        }
      );
    }
  };

  const filteredProjectAssigneeSearch = useMemo(() => {
    if (!projectAssigneeSearchTerm) return allOrgUsers;
    return allOrgUsers.filter(
      (user) =>
        user.name
          ?.toLowerCase()
          .includes(projectAssigneeSearchTerm.toLowerCase()) ||
        user.email
          ?.toLowerCase()
          .includes(projectAssigneeSearchTerm.toLowerCase())
    );
  }, [allOrgUsers, projectAssigneeSearchTerm]);

  const handleProjectAssigneeToggle = (userId: string) => {
    setSelectedProjectAssigneeIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleUpdateProjectAssignees = async () => {
    if (!project || isUpdating) return; // Added return

    // Validate assignment scope for context-aware assignments
    if (department && selectedProjectAssigneeIds.length > 0) {
      try {
        const validation = validateAssignmentScope(
          selectedProjectAssigneeIds,
          department,
          contextAwareUsers,
          allOrgUsers
        );
        if (!validation.isValid) {
          toast.error(
            validation.errorMessage || "Assignment validation failed"
          );
          return;
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Assignment validation failed"
        );
        return;
      }
    }

    setIsUpdating(true);
    const projectDocRef = doc(db, "projects", project.id);

    const newAssigneeDetailsPromises = selectedProjectAssigneeIds.map(
      async (userId) => {
        const existingUser = allOrgUsers.find((u) => u.id === userId);
        if (existingUser) return existingUser;
        // Fallback: fetch if not in allOrgUsers (should ideally be there)
        const userDocRef = doc(db, "users", userId);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          return {
            id: userSnap.id,
            name: userData.displayName || userData.email || "Unknown User",
            avatarUrl: userData.photoURL,
            email: userData.email,
          };
        }
        return { id: userId, name: "Unknown User (not found)" };
      }
    );

    toast.promise(
      Promise.all(newAssigneeDetailsPromises)
        .then((newAssignees) => {
          return updateDoc(projectDocRef, {
            assignedUserIds: selectedProjectAssigneeIds,
          }).then(() => {
            setProject(
              (prev) =>
                prev
                  ? { ...prev, assignees: newAssignees as DisplayUser[] }
                  : null // Ensure type cast
            );
            setIsProjectAssigneePopoverOpen(false);
            setProjectAssigneeSearchTerm("");
            return "Assignees updated successfully!";
          });
        })
        .catch((err) => {
          console.error("Error updating assignees:", err);
          throw new Error("Failed to update assignees.");
        })
        .finally(() => {
          setIsUpdating(false);
        }),
      {
        loading: "Updating assignees...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  const filteredOrgUsersForProjectDialog = contextAwareUsers.filter((user) => {
    const searchTermLower = projectAssigneeSearchTerm.toLowerCase();
    const nameMatch = user.name?.toLowerCase().includes(searchTermLower);
    const emailMatch = user.email?.toLowerCase().includes(searchTermLower);
    return nameMatch || emailMatch;
  });

  // --- New Parent Task Dialog Handlers ---
  const handleNewParentTaskDataChange = (
    field: keyof NewTaskData,
    value: any
  ) => {
    setNewParentTaskData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNewParentTaskDateSelect = (date: Date | undefined) => {
    setNewParentTaskData((prev) => ({ ...prev, dueDate: date }));
    // setIsParentTaskDueDatePopoverOpen(false); // Optionally close
  };

  const handleParentTaskAssigneeToggle = (userId: string) => {
    setSelectedParentTaskAssigneeIds((prevSelectedIds) =>
      prevSelectedIds.includes(userId)
        ? prevSelectedIds.filter((id) => id !== userId)
        : [...prevSelectedIds, userId]
    );
  };

  const openNewParentTaskDialog = () => {
    setNewParentTaskData({
      name: "",
      description: "",
      priority: "Medium",
      status: "To Do",
      tags: "",
      parentTaskId: undefined, // Ensure no parent
    });
    setSelectedParentTaskAssigneeIds([]);
    setParentTaskAssigneeSearchTerm("");
    setIsParentTaskAssigneePopoverOpen(false);
    setIsParentTaskDueDatePopoverOpen(false);
    setIsNewParentTaskDialogOpen(true);
  };

  const openNewParentTaskDialogWithStatus = (
    defaultStatus?: Task["status"]
  ) => {
    setNewParentTaskData({
      name: "",
      description: "",
      priority: "Medium",
      status: defaultStatus || "To Do",
      tags: "",
      parentTaskId: undefined, // Ensure no parent
    });
    setSelectedParentTaskAssigneeIds([]);
    setParentTaskAssigneeSearchTerm("");
    setIsParentTaskAssigneePopoverOpen(false);
    setIsParentTaskDueDatePopoverOpen(false);
    setIsNewParentTaskDialogOpen(true);
  };

  const handleCreateParentTask = async () => {
    if (!project || !newParentTaskData.name.trim()) {
      toast.error("Task name is required.");
      return;
    }
    setIsCreatingParentTask(true);

    const taskToSubmit = {
      name: newParentTaskData.name.trim(),
      description: newParentTaskData.description.trim(),
      assignedUserIds: selectedParentTaskAssigneeIds,
      priority: newParentTaskData.priority,
      status: newParentTaskData.status,
      tags: newParentTaskData.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
      projectId: project.id,
      departmentId: project.departmentId,
      orgId: project.orgId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      subtaskIds: [] as string[],
      level: 0, // Top-level task
      dueDate: newParentTaskData.dueDate
        ? Timestamp.fromDate(newParentTaskData.dueDate)
        : null,
      // parentTaskId is intentionally omitted
    };

    toast.promise(
      addDoc(collection(db, "tasks"), taskToSubmit)
        .then(() => {
          setNewParentTaskData({
            name: "",
            description: "",
            priority: "Medium",
            status: "To Do",
            tags: "",
            parentTaskId: undefined,
          });
          setSelectedParentTaskAssigneeIds([]);
          setParentTaskAssigneeSearchTerm("");
          setIsParentTaskAssigneePopoverOpen(false);
          setIsParentTaskDueDatePopoverOpen(false);
          setIsNewParentTaskDialogOpen(false);
          return "Parent task created successfully!";
        })
        .catch((err) => {
          console.error("Error creating parent task:", err);
          throw new Error("Failed to create parent task.");
        })
        .finally(() => {
          setIsCreatingParentTask(false);
        }),
      {
        loading: "Creating parent task...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // --- New Subtask Dialog Handlers ---
  const handleNewSubtaskDataChange = (field: keyof NewTaskData, value: any) => {
    setNewSubtaskData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNewSubtaskDateSelect = (date: Date | undefined) => {
    setNewSubtaskData((prev) => ({ ...prev, dueDate: date }));
    // setIsSubtaskDueDatePopoverOpen(false); // Optionally close
  };

  const handleSubtaskAssigneeToggle = (userId: string) => {
    setSelectedSubtaskAssigneeIds((prevSelectedIds) =>
      prevSelectedIds.includes(userId)
        ? prevSelectedIds.filter((id) => id !== userId)
        : [...prevSelectedIds, userId]
    );
  };

  const openNewSubtaskDialog = (parentTask: Task) => {
    // Close dropdown first to avoid focus conflicts
    setIsTaskActionsDropdownOpen(false);

    // Small delay to ensure dropdown closes before dialog opens
    setTimeout(() => {
      setCurrentParentTaskForSubtask(parentTask);
      setNewSubtaskData({
        name: "",
        description: "",
        priority: "Medium",
        status: "To Do",
        tags: "",
        parentTaskId: parentTask.id, // Set parent ID
      });
      setSelectedSubtaskAssigneeIds([]);
      setSubtaskAssigneeSearchTerm("");
      setIsSubtaskAssigneePopoverOpen(false);
      setIsSubtaskDueDatePopoverOpen(false);
      setIsNewSubtaskDialogOpen(true);
    }, 50);
  };

  const handleCreateSubtask = async () => {
    if (
      !project ||
      !newSubtaskData.name.trim() ||
      !currentParentTaskForSubtask
    ) {
      toast.error("Task name and parent task information are required.");
      return;
    }
    setIsCreatingSubtask(true);

    const taskToSubmit = {
      name: newSubtaskData.name.trim(),
      description: newSubtaskData.description.trim(),
      assignedUserIds: selectedSubtaskAssigneeIds,
      priority: newSubtaskData.priority,
      status: newSubtaskData.status,
      tags: newSubtaskData.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
      projectId: project.id,
      departmentId: project.departmentId,
      orgId: project.orgId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      subtaskIds: [] as string[],
      parentTaskId: currentParentTaskForSubtask.id,
      level: (currentParentTaskForSubtask.level || 0) + 1,
      dueDate: newSubtaskData.dueDate
        ? Timestamp.fromDate(newSubtaskData.dueDate)
        : null,
    };

    toast.promise(
      addDoc(collection(db, "tasks"), taskToSubmit)
        .then(async (docRef) => {
          // Update the parent task's subtaskIds
          const parentTaskRef = doc(
            db,
            "tasks",
            currentParentTaskForSubtask.id
          );
          await updateDoc(parentTaskRef, {
            subtaskIds: arrayUnion(docRef.id),
            updatedAt: serverTimestamp(),
          });

          setNewSubtaskData({
            name: "",
            description: "",
            priority: "Medium",
            status: "To Do",
            tags: "",
            parentTaskId: undefined,
          });
          setSelectedSubtaskAssigneeIds([]);
          setSubtaskAssigneeSearchTerm("");
          setCurrentParentTaskForSubtask(null);
          setIsSubtaskAssigneePopoverOpen(false);
          setIsSubtaskDueDatePopoverOpen(false);
          setIsNewSubtaskDialogOpen(false);
          return "Subtask created successfully!";
        })
        .catch((err) => {
          console.error("Error creating subtask:", err);
          throw new Error("Failed to create subtask.");
        })
        .finally(() => {
          setIsCreatingSubtask(false);
        }),
      {
        loading: "Creating subtask...",
        success: (message) => message,
        error: (err) => err.message,
      }
    );
  };

  // --- Edit Task Dialog Assignee & Date Handlers (if different from new task) ---
  const handleEditTaskAssigneeToggle = (userId: string) => {
    setSelectedEditTaskAssigneeIds((prevSelectedIds) =>
      prevSelectedIds.includes(userId)
        ? prevSelectedIds.filter((id) => id !== userId)
        : [...prevSelectedIds, userId]
    );
  };

  const handleEditTaskDateSelect = (date: Date | undefined) => {
    setEditTaskData((prev) => ({ ...prev, dueDate: date }));
    // setIsEditTaskDueDatePopoverOpen(false); // Optionally close
  };

  const projectMemberUsers = useMemo(() => {
    if (!project || !contextAwareUsers.length) return [];
    const projectAssigneeIds = project.assignedUserIds || [];
    return contextAwareUsers.filter((user) =>
      projectAssigneeIds.includes(user.id)
    );
  }, [contextAwareUsers, project]);

  // Filtered assignees for Parent Task Dialog
  const filteredAssigneesForParentTaskDialog = useMemo(() => {
    const members = projectMemberUsers;
    if (!parentTaskAssigneeSearchTerm) return members;
    return members.filter(
      (user) =>
        user.name
          ?.toLowerCase()
          .includes(parentTaskAssigneeSearchTerm.toLowerCase()) ||
        user.email
          ?.toLowerCase()
          .includes(parentTaskAssigneeSearchTerm.toLowerCase())
    );
  }, [projectMemberUsers, parentTaskAssigneeSearchTerm]);

  // Filtered assignees for Subtask Dialog
  const filteredAssigneesForSubtaskDialog = useMemo(() => {
    const members = projectMemberUsers;
    if (!subtaskAssigneeSearchTerm) return members;
    return members.filter(
      (user) =>
        user.name
          ?.toLowerCase()
          .includes(subtaskAssigneeSearchTerm.toLowerCase()) ||
        user.email
          ?.toLowerCase()
          .includes(subtaskAssigneeSearchTerm.toLowerCase())
    );
  }, [projectMemberUsers, subtaskAssigneeSearchTerm]);

  // Filtered assignees for Edit Task Dialog
  const filteredAssigneesForEditTaskDialog = useMemo(() => {
    const members = projectMemberUsers;
    if (!editTaskAssigneeSearchTerm) return members;
    return members.filter(
      (user) =>
        user.name
          ?.toLowerCase()
          .includes(editTaskAssigneeSearchTerm.toLowerCase()) ||
        user.email
          ?.toLowerCase()
          .includes(editTaskAssigneeSearchTerm.toLowerCase())
    );
  }, [projectMemberUsers, editTaskAssigneeSearchTerm]);

  // (Removed duplicate project cache hydration useEffect; using state initializer instead)

  // Filtered assignees for Assignees Column in Table View
  const filteredAssigneesForColumn = useMemo(() => {
    const members = projectMemberUsers;
    if (!assigneesColumnSearchTerm) return members;
    return members.filter(
      (user) =>
        user.name
          ?.toLowerCase()
          .includes(assigneesColumnSearchTerm.toLowerCase()) ||
        user.email
          ?.toLowerCase()
          .includes(assigneesColumnSearchTerm.toLowerCase())
    );
  }, [projectMemberUsers, assigneesColumnSearchTerm]);

  const handleDeleteTask = async (taskIdToDelete: string) => {
    const loadingToastId = toast.loading("Deleting task...");

    // Recursive function to delete a task and all its subtasks
    const deleteTaskRecursive = async (taskId: string) => {
      const taskToDelete = tasks.find((t) => t.id === taskId);
      if (!taskToDelete) {
        console.warn(`Task with ID ${taskId} not found for deletion.`);
        return; // Should not happen if UI is in sync
      }

      // Recursively delete subtasks first
      if (taskToDelete.subtaskIds && taskToDelete.subtaskIds.length > 0) {
        for (const subtaskId of taskToDelete.subtaskIds) {
          await deleteTaskRecursive(subtaskId);
        }
      }

      // Delete the task itself
      const taskDocRef = doc(db, "tasks", taskId);
      await deleteDoc(taskDocRef);
      console.log(`Task ${taskId} deleted.`);

      // If this task was a subtask, remove it from its parent's subtaskIds array
      if (taskToDelete.parentTaskId) {
        const parentTaskRef = doc(db, "tasks", taskToDelete.parentTaskId);
        // Ensure parent task still exists before trying to update it
        const parentSnap = await getDoc(parentTaskRef);
        if (parentSnap.exists()) {
          await updateDoc(parentTaskRef, {
            subtaskIds: arrayRemove(taskId),
            updatedAt: serverTimestamp(),
          });
          console.log(
            `Removed subtask ${taskId} from parent ${taskToDelete.parentTaskId}`
          );
        } else {
          console.warn(
            `Parent task ${taskToDelete.parentTaskId} not found when trying to remove subtask ${taskId}.`
          );
        }
      }
    };

    try {
      await deleteTaskRecursive(taskIdToDelete);
      toast.success("Task and all its subtasks deleted successfully!", {
        id: loadingToastId,
      });
      // The UI will update automatically due to the onSnapshot listener for tasks.
    } catch (error) {
      console.error("Error deleting task(s):", error);
      toast.error("Failed to delete task(s). Please try again.", {
        id: loadingToastId,
      });
    }
  };

  // Close all popovers function to prevent aria-hidden conflicts
  const closeAllPopovers = () => {
    setIsTagPopoverOpen(false);
    setIsDeadlinePopoverOpen(false);
    setIsProjectAssigneePopoverOpen(false);
    setIsParentTaskAssigneePopoverOpen(false);
    setIsParentTaskDueDatePopoverOpen(false);
    setIsSubtaskAssigneePopoverOpen(false);
    setIsSubtaskDueDatePopoverOpen(false);
    setIsEditTaskAssigneePopoverOpen(false);
    setIsEditTaskDueDatePopoverOpen(false);
    setIsTagPopoverOpenForTask(null);
  };

  // New handler to open delete confirmation
  const handleDeleteTaskClick = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      // Close all popovers first to prevent aria-hidden conflicts
      closeAllPopovers();

      // Small delay to ensure popovers are fully closed before opening dialog
      setTimeout(() => {
        setTaskToDelete(task);
        setIsDeleteConfirmOpen(true);
      }, 50);
    }
  };

  // New handler to confirm deletion
  const handleConfirmDelete = async () => {
    if (taskToDelete) {
      setIsDeleteConfirmOpen(false);
      await handleDeleteTask(taskToDelete.id);
      setTaskToDelete(null);
    }
  };

  // Effect to handle aria-hidden cleanup when delete dialog closes
  useEffect(() => {
    if (!isDeleteConfirmOpen) {
      // Small delay to ensure dialog is fully closed
      const timer = setTimeout(() => {
        // Clean up any stuck aria-hidden attributes
        const hiddenElements = document.querySelectorAll(
          '[aria-hidden="true"]'
        );
        hiddenElements.forEach((el) => {
          // Only remove aria-hidden if the element doesn't contain focused content
          if (!el.contains(document.activeElement)) {
            el.removeAttribute("aria-hidden");
          }
        });

        // Ensure body is interactive
        document.body.style.pointerEvents = "";
        document.body.removeAttribute("aria-hidden");
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isDeleteConfirmOpen]);

  // (Removed legacy getDoc-based fetch effect; onSnapshot + cache-first now handles data flow without flicker.)

  // Global 'n' shortcut to open New Task dialog when not typing in inputs/textareas/contenteditable
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only plain 'n'
      if (!e.key) return;
      if (e.key.toLowerCase() !== "n") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const ae = (document.activeElement as HTMLElement | null);
      const isTyping = !!(
        ae && (
          ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.tagName === "SELECT" ||
          ae.isContentEditable ||
          ae.getAttribute("role") === "textbox"
        )
      );
      if (isTyping) return;

      e.preventDefault();
      try {
        // Prefer existing helper if present
        // @ts-ignore - allow calling if defined in scope
        if (typeof openNewParentTaskDialog === "function") {
          // @ts-ignore
          openNewParentTaskDialog();
        } else {
          // Fallback to state setter if available
          // @ts-ignore
          setIsNewParentTaskDialogOpen?.(true);
        }
      } catch (_) {
        // no-op
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Blur the task search input when user presses Escape or clicks outside it
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const input = document.getElementById("task-search-input") as HTMLInputElement | null;
      if (input && document.activeElement === input) {
        input.blur();
      }
    }

    function onMouseDown(e: MouseEvent) {
      const input = document.getElementById("task-search-input") as HTMLInputElement | null;
      if (!input) return;
      const target = e.target as Node | null;
      // If the search input is focused and the mousedown target is outside the input, blur it
      if (document.activeElement === input && target && !input.contains(target)) {
        input.blur();
      }
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + / focuses the task search input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only react to key when modifier pressed and key is '/'
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "/") return;

      // Don't trigger while typing in editable fields
      const ae = document.activeElement as HTMLElement | null;
      if (ae) {
        const tag = ae.tagName;
        const isEditable = ae.getAttribute("contenteditable") === "true" || ae.isContentEditable;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || isEditable) return;
      }

      const input = document.getElementById("task-search-input") as HTMLInputElement | null;
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Return loading skeleton or project not found UI if applicable
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center space-x-2 mb-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-12 w-2/3" />
        <div className="grid grid-cols-1 gap-3 mt-6">
          <div className="flex items-center space-x-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-20" />
            <div className="flex -space-x-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="flex items-center space-x-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
        <Skeleton className="h-10 w-1/3 mt-6" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-xl text-muted-foreground">
          Project not found (ID: {projectId}).
        </p>
        <Button onClick={() => router.push("/dashboard")} className="mt-4">
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <Tabs defaultValue="task-management" className="w-full">
      <div className="flex flex-col space-y-6 p-0">
        {/* Top Navigation Bar - Monday.com style */}
        <div className="flex items-center px-3 pt-6 pb-2 text-sm text-muted-foreground outfit">
          <Button
            variant="ghost"
            className="px-2 h-auto font-medium hover:bg-transparent hover:text-primary"
            onClick={() => router.push("/dashboard")}
          >
            Dashboard
          </Button>
          <ChevronRight className="h-4 w-4 mx-1" />
          <Button
            variant="ghost"
            className="px-2 h-auto font-medium hover:bg-transparent hover:text-primary"
            onClick={() => router.push("/dashboard/teams")}
          >
            Teams
          </Button>
          <ChevronRight className="h-4 w-4 mx-1" />
          <Button
            variant="ghost"
            className="px-2 h-auto font-medium hover:bg-transparent hover:text-primary"
            onClick={() =>
              router.push(`/dashboard/teams/${project.departmentId}`)
            } // Uses project.departmentId
          >
            {departmentNameResolved ?? project.departmentId}
          </Button>
          <ChevronRight className="h-4 w-4 mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger className="px-2 flex items-center gap-1 hover:text-primary transition-colors">
              <span className="font-medium">{project.name}</span>
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Switch Project</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {otherProjects.map((op) => (
                <DropdownMenuItem
                  key={op.id}
                  // Assuming other projects also live under a department route.
                  // If other projects can be in different departments, this needs op.departmentId
                  onClick={() =>
                    router.push(
                      `/dashboard/teams/${op.departmentId}/projects/${op.id}`
                    )
                  }
                >
                  {op.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto">
            <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
              <TabsTrigger value="dashboard" className="gap-1.5">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="task-management" className="gap-1.5">
                <ClipboardList className="h-4 w-4" /> Task Management
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Project Title Section */}
        <div className="px-6">
          <h1 className="spacegrot font-medium text-3xl">{project.name}</h1>
        </div>

        <TabsContent value="dashboard" className="mt-1 px-6">
          {/* Project Attributes - Monday.com style rows */}
          <div className="flex flex-col space-y-1 pt-0 mb-6">
            {/* Row 1: Assigned to */}
            <div className="flex items-center h-12 hover:bg-muted/40 p-2 rounded-md -ml-2">
              <div className="w-40 flex items-center">
                <Users className="h-5 w-5 mr-3 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">
                  Assigned to
                </span>
              </div>
              <div className="flex items-center">
                {project.assignees.length > 0 ? (
                  <>
                    <div className="flex -space-x-2 mr-2">
                      {project.assignees.slice(0, 4).map((user) => (
                        <Avatar
                          key={user.id}
                          className="h-8 w-8 border-2 border-background"
                        >
                          <AvatarImage
                            src={user.avatarUrl ?? undefined}
                            alt={user.name ?? "User"}
                          />
                          <AvatarFallback className="bg-black border text-primary">
                            {user.name
                              ? user.name.substring(0, 1).toUpperCase()
                              : "U"}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {project.assignees.length > 4 && (
                        <Avatar className="h-8 w-8 border-2 border-background">
                          <AvatarFallback className="bg-muted">
                            +{project.assignees.length - 4}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground mr-2">
                    No one assigned
                  </span>
                )}
                <Popover
                  open={isProjectAssigneePopoverOpen}
                  onOpenChange={setIsProjectAssigneePopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-sm text-muted-foreground"
                      onClick={() => {
                        // Sync selectedAssigneeIds with current project assignees when opening
                        setSelectedProjectAssigneeIds(
                          project.assignedUserIds || []
                        );
                        setProjectAssigneeSearchTerm(""); // Reset search
                        setIsProjectAssigneePopoverOpen(true);
                      }}
                      disabled={isUpdating}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {project.assignees.length > 0
                        ? "Add / Manage"
                        : "Add Assignee"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 p-0 z-100 pointer-events-auto"
                    align="start"
                  >
                    <div className="p-4 border-b">
                      <h4 className="font-medium text-sm">Assign Members</h4>
                      <p className="text-xs text-muted-foreground mb-2">
                        Select members to assign to this project.
                      </p>
                      {/* Context-aware assignment scope indicator */}
                      {department?.parentDepartmentId && (
                        <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                          <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                            <Users className="h-3 w-3" />
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
                        className="mt-1 h-8 text-xs"
                        value={projectAssigneeSearchTerm}
                        onChange={(e) =>
                          setProjectAssigneeSearchTerm(e.target.value)
                        }
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                      {filteredOrgUsersForProjectDialog.length > 0 ? (
                        filteredOrgUsersForProjectDialog.map((user) => (
                          <div
                            key={user.id}
                            className={cn(
                              "flex items-center justify-between p-2 hover:bg-muted/50 rounded-md cursor-pointer",
                              selectedProjectAssigneeIds.includes(user.id) &&
                                "bg-muted/50"
                            )}
                            onClick={() => handleProjectAssigneeToggle(user.id)}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage
                                  src={user.avatarUrl ?? undefined}
                                  alt={user.name ?? undefined}
                                />
                                <AvatarFallback className="text-xs">
                                  {user.name
                                    ? user.name.substring(0, 1).toUpperCase()
                                    : "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-xs font-medium">
                                  {user.name || "Unnamed User"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {user.email || "No email"}
                                </p>
                              </div>
                            </div>
                            {selectedProjectAssigneeIds.includes(user.id) ? (
                              <CircleCheck className="h-4 w-4 text-primary" />
                            ) : (
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {projectAssigneeSearchTerm
                            ? "No users match your search."
                            : "No users available in this organization."}
                        </p>
                      )}
                    </div>
                    <div className="p-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                      <Button
                        onClick={handleUpdateProjectAssignees}
                        size="sm"
                        className="w-full"
                        disabled={isUpdating}
                      >
                        {isUpdating
                          ? "Saving..."
                          : `Update Assignees (${selectedProjectAssigneeIds.length})`}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Row 2: Deadline */}
            <div className="flex items-center h-12 hover:bg-muted/40 p-2 rounded-md -ml-2">
              <div className="w-40 flex items-center">
                <CalendarDays className="h-5 w-5 mr-3 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">
                  Deadline
                </span>
              </div>
              <Popover
                open={isDeadlinePopoverOpen}
                onOpenChange={setIsDeadlinePopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "px-3 h-auto text-muted-foreground hover:text-foreground",
                      !currentDeadline && "text-muted-foreground/70" // Style if no deadline
                    )}
                    disabled={isUpdating}
                  >
                    {currentDeadline
                      ? format(currentDeadline, "dd MMM yyyy")
                      : "Set deadline"}
                    <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-70" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 z-100 pointer-events-auto"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    selected={currentDeadline}
                    onSelect={handleDeadlineSelect}
                    initialFocus
                    footer={
                      // Add a clear button to the calendar
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeadlineSelect(undefined)} // Call with undefined to clear
                        disabled={!currentDeadline || isUpdating}
                      >
                        Clear deadline
                      </Button>
                    }
                    disabled={(date) =>
                      date <
                      new Date(new Date().setDate(new Date().getDate() - 1))
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Row 3: Tags */}
            <div className="z-100 pointer-events-auto flex items-start min-h-12 hover:bg-muted/40 p-2 rounded-md -ml-2">
              {" "}
              {/* items-start for alignment */}
              <div className="w-40 flex items-center pt-1.5">
                {" "}
                {/* Adjust padding for alignment */}
                <Tag className="h-5 w-5 mr-3 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">Tags</span>
              </div>
              <div className="flex items-center flex-wrap gap-2 flex-1">
                {" "}
                {/* flex-1 to take remaining space */}
                {projectTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    className={cn(
                      // Use cn for combining classes
                      tag.color, // This is the full Tailwind class string
                      "text-xs font-normal rounded-full px-2.5 py-0.5 h-6 cursor-default group relative" // Adjusted padding
                    )}
                  >
                    {tag.name}
                    <button
                      onClick={() => handleRemoveTag(tag.id)} // Pass the whole tag object
                      className="ml-1.5 -mr-0.5 opacity-50 hover:opacity-100 focus:outline-none disabled:opacity-30"
                      aria-label="Remove tag"
                      disabled={isUpdating}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Popover
                  open={isTagPopoverOpen}
                  onOpenChange={setIsTagPopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs border border-dashed border-muted-foreground/50 text-muted-foreground hover:text-foreground rounded-full"
                      disabled={isUpdating}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-64 p-4 space-y-3 z-100 pointer-events-auto"
                    align="start"
                  >
                    <Label htmlFor="newTagName" className="text-sm font-medium">
                      Add New Tag
                    </Label>
                    <Input
                      id="newTagName"
                      placeholder="Tag name"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="h-8 text-sm"
                      disabled={isUpdating}
                    />
                    <Label className="text-xs text-muted-foreground">
                      Choose color:
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      {availableTagColors.map((colorClass) => (
                        <button
                          key={colorClass}
                          onClick={() => setNewTagColor(colorClass)}
                          title={colorClass
                            .split(" ")[0]
                            .replace("bg-", "")
                            .replace("/20", "")} // Show color name on hover
                          className={cn(
                            `h-6 w-full rounded border-2`,
                            newTagColor === colorClass
                              ? `border-ring ring-2 ring-ring ring-offset-1` // Use theme-aware ring
                              : "border-transparent",
                            colorClass.split(" ")[0] // Get the bg-color part for display
                          )}
                        />
                      ))}
                    </div>
                    <Button
                      onClick={handleAddTag}
                      size="sm"
                      className="w-full h-8 text-sm"
                      disabled={isUpdating || !newTagName.trim()}
                    >
                      {isUpdating ? "Adding..." : "Add Tag"}
                    </Button>
                  </PopoverContent>
                </Popover>
                {projectTags.length === 0 &&
                  !isTagPopoverOpen && ( // Hide "No tags" when popover is open
                    <span className="text-xs text-muted-foreground">
                      No tags
                    </span>
                  )}
              </div>
            </div>
          </div>
          <Card className="-mt-3 -ml-6 -mr-6 border-t-1 border-l-0 border-r-0 border-b-0">
            <CardContent className="">
              <ProjectDashboard
                taskStatusDistribution={taskStatusDistribution}
                projects={project ? [project as any] : []} // Cast to 'any' for now if DisplayProject and Project types differ slightly. Ideally, ensure they are compatible or map DisplayProject to Project.
                tasks={tasks}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="task-management"
          className="mt-6 space-y-4 px-6 overflow-hidden"
        >
          <div className="flex justify-between items-center">
            <Tabs
              value={taskView}
              onValueChange={(value) =>
                setTaskView(value as "table" | "kanban" | "timeline" | "list")
              }
              className="w-auto"
            >
              <TabsList>
                <TabsTrigger
                  value="table"
                  className="flex items-center gap-1.5"
                >
                  <TableIcon className="h-4 w-4" /> Table
                </TabsTrigger>
                <TabsTrigger
                  value="kanban"
                  className="flex items-center gap-1.5"
                >
                  <Columns className="h-4 w-4" /> Board
                </TabsTrigger>
                <TabsTrigger value="list" className="flex items-center gap-1.5">
                  <List className="h-4 w-4" /> List
                </TabsTrigger>
                <TabsTrigger
                  value="timeline"
                  className="flex items-center gap-1.5"
                >
                  <CalendarClock className="h-4 w-4" /> Timeline
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              {/* Timeline/Gantt toggle - only show when in timeline view */}
              {taskView === "timeline" && (
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "font-medium",
                      timelineMode === "timeline"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    Timeline
                  </span>
                  <Switch
                    checked={timelineMode === "gantt"}
                    onCheckedChange={(checked) =>
                      setTimelineMode(checked ? "gantt" : "timeline")
                    }
                    className="data-[state=checked]:bg-primary"
                  />
                  <span
                    className={cn(
                      "font-medium",
                      timelineMode === "gantt"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    Gantt
                  </span>
                </div>
              )}
              {/* Dialog for Creating New Parent Task */}
              {(isNewParentTaskDialogOpen || isNewSubtaskDialogOpen || isEditTaskDialogOpen) && (
                <div className="fixed inset-0 z-40 pointer-events-none backdrop-blur-[3px] opacity-100 bg-black/30" />
              )}
              <Dialog
                open={isNewParentTaskDialogOpen} // Corrected: Was potentially isNewTaskDialogOpen
                onOpenChange={setIsNewParentTaskDialogOpen} // Corrected: Was potentially setIsNewTaskDialogOpen
              >
                <DialogTrigger asChild>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={openNewParentTaskDialog}
                          size="sm"
                          className="proximavara gap-1.5"
                        >
                          <PlusCircle className="h-4 w-4" /> New Task
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="rounded-sm  text-xs proximavara">
                        <p>press <Kbd>N</Kbd> for new task</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </DialogTrigger>
                <DialogContent 
                  className="proximavara sm:max-w-[740px] flex flex-col backdrop-blur-[10px] dark:bg-black/0 bg-white/90 border-2 rounded-lg sm:top-[27%]"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (!isCreatingParentTask && newParentTaskData.name.trim()) {
                        handleCreateParentTask();
                      }
                    }
                  }}
                >
                  <ScrollArea className="flex-grow -mx-4 -my-4">
                    <div className="space-y-2 px-2">
                      {/* Breadcrumb above task title */}
                      <div className="mt-2 mb-3 flex items-center gap-1 text-[13px] text-muted-foreground">
                        <span className="truncate max-w-[160px]">{department?.name ?? "Team"}</span>
                        <ChevronRight className="h-3 w-3 opacity-60" />
                        <span className="truncate max-w-[160px]">{project?.name ?? "Project"}</span>
                        <ChevronRight className="h-3 w-3 opacity-60" />
                        <span className="text-foreground">New Task</span>
                      </div>
                      {/* Large title field - seamless */}
                      <Input
                        id="parentTaskName"
                        value={newParentTaskData.name}
                        onChange={(e) => handleNewParentTaskDataChange("name", e.target.value)}
                        className="spacegrot w-full text-lg md:text-xl font-semibold placeholder:text-muted-foreground/70 focus-visible:ring-0 px-0 border-0 dark:bg-black/0 bg-white/0 shadow-none"
                        placeholder="Task Title"
                      />

                      {/* Description - seamless */}
                      <Textarea
                        id="parentTaskDescription"
                        value={newParentTaskData.description}
                        onChange={(e) => handleNewParentTaskDataChange("description", e.target.value)}
                        className="min-h-[30px] w-full text-base placeholder:text-muted-foreground/60 dark:bg-black/10 bg-white/0 shadow-none border-0 focus-visible:ring-0 resize-none px-0"
                        placeholder="Add Description..."
                      />

                      {/* Options bar: seamless pills */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {/* Assignee */}
                        <AssigneeSelector
                          open={isParentTaskAssigneePopoverOpen}
                          onOpenChange={setIsParentTaskAssigneePopoverOpen}
                          users={allOrgUsers}
                          selectedIds={selectedParentTaskAssigneeIds}
                          onToggle={(id) => handleParentTaskAssigneeToggle(id)}
                          searchTerm={parentTaskAssigneeSearchTerm}
                          onSearchTermChange={setParentTaskAssigneeSearchTerm}
                          buttonLabel={
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              Assignee
                            </span>
                          }
                          buttonClassName="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60"
                        />

                        {/* Due date */}
                        <Popover
                          open={isParentTaskDueDatePopoverOpen}
                          onOpenChange={setIsParentTaskDueDatePopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              className={cn(
                                "h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60",
                                !newParentTaskData.dueDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                              {newParentTaskData.dueDate ? (
                                format(newParentTaskData.dueDate, "MMM dd")
                              ) : (
                                <span>Due date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto p-0 backdrop-blur-[10px] dark:bg-black/10 bg-white/10 border-1"
                            align="start"
                          >
                            <Calendar
                              mode="single"
                              selected={newParentTaskData.dueDate}
                              onSelect={handleNewParentTaskDateSelect}
                              initialFocus
                              disabled={(date) =>
                                date < new Date(new Date().setDate(new Date().getDate() - 1))
                              }
                            />
                            <div className="p-2 border-t border-border/50">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-muted-foreground hover:text-destructive h-7 text-xs"
                                onClick={() => handleNewParentTaskDateSelect(undefined)}
                                disabled={!newParentTaskData.dueDate}
                              >
                                Clear date
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Priority */}
                        <Select
                          open={isParentPriorityOpen}
                          onOpenChange={(open) => {
                            setIsParentPriorityOpen(open);
                            if (open) setIsParentStatusOpen(false);
                          }}
                          value={newParentTaskData.priority}
                          onValueChange={(value: NewTaskData["priority"]) =>
                            handleNewParentTaskDataChange("priority", value)
                          }
                        >
                          <SelectTrigger className="h-9 px-3 text-sm rounded-full border-0 hover:bg-muted/60 w-auto gap-1.5">
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent className="backdrop-blur-[10px] dark:bg-black/10 bg-white/70">
                            {taskPriorities.map((p) => (
                              <SelectItem key={p} value={p}>
                                <div className="flex items-center gap-2 dark:bg-black/10 ">
                                  <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    p === "High" && "bg-red-500",
                                    p === "Medium" && "bg-yellow-500",
                                    p === "Low" && "bg-green-500"
                                  )} />
                                  {p}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Status */}
                        <Select
                          open={isParentStatusOpen}
                          onOpenChange={(open) => {
                            setIsParentStatusOpen(open);
                            if (open) setIsParentPriorityOpen(false);
                          }}
                          value={newParentTaskData.status}
                          onValueChange={(value: NewTaskData["status"]) =>
                            handleNewParentTaskDataChange("status", value)
                          }
                        >
                          <SelectTrigger className="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60 w-auto gap-1.5">
                            {newParentTaskData.status === "To Do"}
                            {newParentTaskData.status === "In Progress"}
                            {newParentTaskData.status === "Blocked"}
                            {newParentTaskData.status === "In Review"}
                            {newParentTaskData.status === "Completed"}
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent className="backdrop-blur-[10px] dark:bg-black/10 bg-white/70">
                            {taskStatuses.map((s) => (
                              <SelectItem key={s} value={s}>
                                <div className="flex items-center gap-2">
                                  {s === "To Do" && <Circle className="h-3.5 w-3.5" />}
                                  {s === "In Progress" && <Clock className="h-3.5 w-3.5 text-blue-600" />}
                                  {s === "Blocked" && <AlertCircle className="h-3.5 w-3.5 text-red-600" />}
                                  {s === "In Review" && <Eye className="h-3.5 w-3.5 text-yellow-600" />}
                                  {s === "Completed" && <CircleCheck className="h-3.5 w-3.5 text-green-600" />}
                                  {s}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Tags - inline with max 3 visible */}
                        {(() => {
                          const tags = newParentTaskData.tags.split(",").filter((tag) => tag.trim());
                          const visibleTags = tags.slice(0, 3);
                          const hiddenCount = tags.length - 3;
                          
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60 gap-1.5"
                                >
                                  <Tag className="h-3.5 w-3.5" />
                                  {tags.length > 0 ? (
                                    <span className="flex items-center gap-1">
                                      {visibleTags.map((tag, i) => (
                                        <span key={i}>{tag.trim()}{i < visibleTags.length - 1 && ','}</span>
                                      ))}
                                      {hiddenCount > 0 && <span className="text-muted-foreground">+{hiddenCount}</span>}
                                    </span>
                                  ) : (
                                    "Tags"
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-80 max-h-72 p-0 backdrop-blur-[10px] dark:bg-black/10 bg-white/10 border-1 overflow-hidden pointer-events-auto"
                                align="start"
                              >
                                <div className="p-3 space-y-3">
                                  {/* Selected tags */}
                                  {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-muted/20">
                                      {tags.map((tag, index) => (
                                        <Badge
                                          key={index}
                                          variant="secondary"
                                          className="text-xs px-2 py-0.5 h-6 gap-1"
                                        >
                                          {tag.trim()}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentTags = newParentTaskData.tags
                                                .split(",")
                                                .filter((t) => t.trim());
                                              const updatedTags = currentTags.filter((_, i) => i !== index);
                                              handleNewParentTaskDataChange("tags", updatedTags.join(", "));
                                            }}
                                            className="hover:bg-destructive/20 rounded-full p-0.5"
                                          >
                                            <X className="h-2.5 w-2.5" />
                                          </button>
                                        </Badge>
                                      ))}
                                    </div>
                                  )}

                                  {/* Available tags */}
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Available Tags</Label>
                                    <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                      {availableTaskTags.length > 0 ? (
                                        availableTaskTags.map((tag) => {
                                          const isSelected = newParentTaskData.tags
                                            .split(",")
                                            .map((t) => t.trim())
                                            .includes(tag);
                                          return (
                                            <button
                                              key={tag}
                                              type="button"
                                              onClick={() => {
                                                const currentTags = newParentTaskData.tags
                                                  .split(",")
                                                  .filter((t) => t.trim());
                                                if (isSelected) {
                                                  const updatedTags = currentTags.filter((t) => t !== tag);
                                                  handleNewParentTaskDataChange("tags", updatedTags.join(", "));
                                                } else {
                                                  handleNewParentTaskDataChange("tags", [...currentTags, tag].join(", "));
                                                }
                                              }}
                                              className={cn(
                                                "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 group",
                                                isSelected
                                                  ? "bg-primary/20 text-primary border border-primary/30"
                                                  : "hover:bg-muted/50"
                                              )}
                                            >
                                              <div
                                                className={cn(
                                                  "w-2 h-2 rounded-full border",
                                                  isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                                                )}
                                              />
                                              <span className="flex-1">{tag}</span>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteTag(tag);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded-full transition-all"
                                                title="Delete tag"
                                              >
                                                <Trash2 className="h-3 w-3 text-destructive" />
                                              </button>
                                            </button>
                                          );
                                        })
                                      ) : (
                                        <div className="text-xs text-muted-foreground">No available tags</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </div>
                    </div>
                  </ScrollArea>
                  <DialogFooter className="pt-4 border-t-0 mt-2">
                    <div className="flex justify-end items-center w-full gap-1">
                      <Button
                        className="dark:bg-white bg-primary text-primary-foreground hover:bg-primary/90 px-2 rounded-lg"
                        onClick={handleCreateParentTask}
                        disabled={
                          isCreatingParentTask || !newParentTaskData.name.trim()
                        }
                      >
                        {isCreatingParentTask ? "Creating..." : "Create Task"}
                        {!isCreatingParentTask && (
                          <div className="hidden sm:flex items-center gap-1">
                            {navigator?.platform?.toLowerCase().includes('mac') ? (
                              <>
                                {/* Command key - explicit inline size and no bg */}
                                <Kbd className="key-icon dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground text-sm">
                                  {/* <Command className="" /> */}
                                  ⌘
                                </Kbd>
                                {/* Enter arrow - explicit inline size and no bg */}
                                <Kbd className="key-icon dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground">
                                  {/* <CornerDownLeft />
                                   */}
                                   &#x23CE;
                                </Kbd>
                              </>
                            ) : (
                              <>
                                {/* Ctrl text - compact, no bg */}
                                <Kbd className="dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground">
                                  Ctrl
                                </Kbd>
                                {/* Enter arrow - compact, no bg */}
                                <Kbd className="dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground">
                                  <CornerDownLeft/>
                                </Kbd>
                              </>
                            )}
                          </div>
                        )}
                      </Button>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Dialog for Creating New Subtask */}
              <Dialog
                open={isNewSubtaskDialogOpen}
                onOpenChange={setIsNewSubtaskDialogOpen} // Correct: This was already correct for subtask dialog
              >
                {/* DialogTrigger for subtask is typically not a top-level button, 
                  but rather from a context menu on an existing task. 
                  The trigger is handled by openNewSubtaskDialog(task) call.
                  So, no DialogTrigger needed here directly unless there's a specific UI for it.
              */}
                <DialogContent 
                  className="proximavara sm:max-w-[740px] flex flex-col backdrop-blur-[10px] dark:bg-black/0 bg-white/90 border-2 sm:top-[27%]"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (!isCreatingSubtask && newSubtaskData.name.trim()) {
                        handleCreateSubtask();
                      }
                    }
                  }}
                >
                  <ScrollArea className="flex-grow -mx-4 -my-4">
                    <div className="space-y-2 px-2">
                      {/* Breadcrumb above task title */}
                      <div className="mt-2 mb-3 flex items-center gap-1 text-[13px] text-muted-foreground">
                        <span className="truncate max-w-[160px]">{department?.name ?? "Team"}</span>
                        <ChevronRight className="h-3 w-3 opacity-60" />
                        <span className="truncate max-w-[160px]">{project?.name ?? "Project"}</span>
                        <ChevronRight className="h-3 w-3 opacity-60" />
                        <span className="text-foreground">New Subtask</span>
                      </div>
                      {/* Large title field - seamless */}
                      <Input
                        id="subtaskName"
                        value={newSubtaskData.name}
                        onChange={(e) => handleNewSubtaskDataChange("name", e.target.value)}
                        className="spacegrot w-full text-lg md:text-xl font-semibold placeholder:text-muted-foreground/70 focus-visible:ring-0 px-0 border-0 dark:bg-black/0 bg-white/0 shadow-none"
                        placeholder="Task Title"
                      />

                      {/* Description - seamless */}
                      <Textarea
                        id="subtaskDescription"
                        value={newSubtaskData.description}
                        onChange={(e) => handleNewSubtaskDataChange("description", e.target.value)}
                        className="min-h-[30px] w-full text-base placeholder:text-muted-foreground/60 dark:bg-black/10 bg-white/0 shadow-none border-0 focus-visible:ring-0 resize-none px-0"
                        placeholder="Add Description..."
                      />

                      {/* Options bar: seamless pills */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {/* Assignee */}
                        <AssigneeSelector
                          open={isSubtaskAssigneePopoverOpen}
                          onOpenChange={setIsSubtaskAssigneePopoverOpen}
                          users={allOrgUsers}
                          selectedIds={selectedSubtaskAssigneeIds}
                          onToggle={(id) => handleSubtaskAssigneeToggle(id)}
                          searchTerm={subtaskAssigneeSearchTerm}
                          onSearchTermChange={setSubtaskAssigneeSearchTerm}
                          buttonLabel={
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              Assignee
                            </span>
                          }
                          buttonClassName="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60"
                        />

                        {/* Due date */}
                        <Popover
                          open={isSubtaskDueDatePopoverOpen}
                          onOpenChange={setIsSubtaskDueDatePopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              className={cn(
                                "h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60",
                                !newSubtaskData.dueDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                              {newSubtaskData.dueDate ? (
                                format(newSubtaskData.dueDate, "MMM dd")
                              ) : (
                                <span>Due date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto p-0 backdrop-blur-[10px] dark:bg-black/10 bg-white/10 border-1"
                            align="start"
                          >
                            <Calendar
                              mode="single"
                              selected={newSubtaskData.dueDate}
                              onSelect={handleNewSubtaskDateSelect}
                              initialFocus
                              disabled={(date) =>
                                date < new Date(new Date().setDate(new Date().getDate() - 1))
                              }
                            />
                            <div className="p-2 border-t border-border/50">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-muted-foreground hover:text-destructive h-7 text-xs"
                                onClick={() => handleNewSubtaskDateSelect(undefined)}
                                disabled={!newSubtaskData.dueDate}
                              >
                                Clear date
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Priority */}
                        <Select
                          open={isSubtaskPriorityOpen}
                          onOpenChange={(open) => {
                            setIsSubtaskPriorityOpen(open);
                            if (open) setIsSubtaskStatusOpen(false);
                          }}
                          value={newSubtaskData.priority}
                          onValueChange={(value: NewTaskData["priority"]) =>
                            handleNewSubtaskDataChange("priority", value)
                          }
                        >
                          <SelectTrigger className="h-9 px-3 text-sm rounded-full border-0 bg-black/40 hover:bg-muted/60 w-auto gap-1.5">
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent className="backdrop-blur-[10px] dark:bg-black/10 bg-white/70">
                            {taskPriorities.map((p) => (
                              <SelectItem key={p} value={p}>
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    p === "High" && "bg-red-500",
                                    p === "Medium" && "bg-yellow-500",
                                    p === "Low" && "bg-green-500"
                                  )} />
                                  {p}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Status */}
                        <Select
                          open={isSubtaskStatusOpen}
                          onOpenChange={(open) => {
                            setIsSubtaskStatusOpen(open);
                            if (open) setIsSubtaskPriorityOpen(false);
                          }}
                          value={newSubtaskData.status}
                          onValueChange={(value: NewTaskData["status"]) =>
                            handleNewSubtaskDataChange("status", value)
                          }
                        >
                          <SelectTrigger className="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60 w-auto gap-1.5">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent className="backdrop-blur-[10px] dark:bg-black/10 bg-white/70">
                            {taskStatuses.map((s) => (
                              <SelectItem key={s} value={s}>
                                <div className="flex items-center gap-2">
                                  {s === "To Do" && <Circle className="h-3.5 w-3.5" />}
                                  {s === "In Progress" && <Clock className="h-3.5 w-3.5 text-blue-600" />}
                                  {s === "Blocked" && <AlertCircle className="h-3.5 w-3.5 text-red-600" />}
                                  {s === "In Review" && <Eye className="h-3.5 w-3.5 text-yellow-600" />}
                                  {s === "Completed" && <CircleCheck className="h-3.5 w-3.5 text-green-600" />}
                                  {s}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Tags - inline with max 3 visible */}
                        {(() => {
                          const tags = newSubtaskData.tags.split(",").filter((tag) => tag.trim());
                          const visibleTags = tags.slice(0, 3);
                          const hiddenCount = tags.length - 3;
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60 gap-1.5"
                                >
                                  <Tag className="h-3.5 w-3.5" />
                                  {tags.length > 0 ? (
                                    <span className="flex items-center gap-1">
                                      {visibleTags.map((tag, i) => (
                                        <span key={i}>{tag.trim()}{i < visibleTags.length - 1 && ','}</span>
                                      ))}
                                      {hiddenCount > 0 && <span className="text-muted-foreground">+{hiddenCount}</span>}
                                    </span>
                                  ) : (
                                    "Tags"
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-80 max-h-72 p-0 backdrop-blur-[10px] dark:bg-black/10 bg-white/10 border-1 overflow-hidden pointer-events-auto"
                                align="start"
                              >
                                <div className="p-3 space-y-3">
                                  {/* Selected tags */}
                                  {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-muted/20">
                                      {tags.map((tag, index) => (
                                        <Badge
                                          key={index}
                                          variant="secondary"
                                          className="text-xs px-2 py-0.5 h-6 gap-1"
                                        >
                                          {tag.trim()}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentTags = newSubtaskData.tags
                                                .split(",")
                                                .filter((t) => t.trim());
                                              const updatedTags = currentTags.filter((_, i) => i !== index);
                                              handleNewSubtaskDataChange("tags", updatedTags.join(", "));
                                            }}
                                            className="hover:bg-destructive/20 rounded-full p-0.5"
                                          >
                                            <X className="h-2.5 w-2.5" />
                                          </button>
                                        </Badge>
                                      ))}
                                    </div>
                                  )}

                                  {/* Available tags */}
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Available Tags</Label>
                                    <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                      {availableTaskTags.length > 0 ? (
                                        availableTaskTags.map((tag) => {
                                          const isSelected = newSubtaskData.tags
                                            .split(",")
                                            .map((t) => t.trim())
                                            .includes(tag);
                                          return (
                                            <button
                                              key={tag}
                                              type="button"
                                              onClick={() => {
                                                const currentTags = newSubtaskData.tags
                                                  .split(",")
                                                  .filter((t) => t.trim());
                                                if (isSelected) {
                                                  const updatedTags = currentTags.filter((t) => t !== tag);
                                                  handleNewSubtaskDataChange("tags", updatedTags.join(", "));
                                                } else {
                                                  handleNewSubtaskDataChange("tags", [...currentTags, tag].join(", "));
                                                }
                                              }}
                                              className={cn(
                                                "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 group",
                                                isSelected ? "bg-primary/20 text-primary border border-primary/30" : "hover:bg-muted/50"
                                              )}
                                            >
                                              <div className={cn("w-2 h-2 rounded-full border", isSelected ? "bg-primary border-primary" : "border-muted-foreground/30")} />
                                              <span className="flex-1">{tag}</span>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag); }}
                                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded-full transition-all"
                                                title="Delete tag"
                                              >
                                                <Trash2 className="h-3 w-3 text-destructive" />
                                              </button>
                                            </button>
                                          );
                                        })
                                      ) : (
                                        <div className="text-xs text-muted-foreground">No available tags</div>
                                      )}
                                    </div>
                                  </div>

                                  <Separator />

                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Create New Tag</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        placeholder="Tag name..."
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        className="h-7 text-xs flex-1"
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && newTagInput.trim()) {
                                            e.preventDefault();
                                            const trimmedTag = newTagInput.trim();
                                            const currentTags = newSubtaskData.tags.split(",").filter((t) => t.trim());
                                            if (!currentTags.includes(trimmedTag)) {
                                              handleNewSubtaskDataChange("tags", [...currentTags, trimmedTag].join(", "));
                                              handleCreateNewTag(trimmedTag);
                                            }
                                            setNewTagInput("");
                                          }
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2"
                                        onClick={() => {
                                          if (newTagInput.trim()) {
                                            const trimmedTag = newTagInput.trim();
                                            const currentTags = newSubtaskData.tags.split(",").filter((t) => t.trim());
                                            if (!currentTags.includes(trimmedTag)) {
                                              handleNewSubtaskDataChange("tags", [...currentTags, trimmedTag].join(", "));
                                              handleCreateNewTag(trimmedTag);
                                            }
                                            setNewTagInput("");
                                          }
                                        }}
                                        disabled={!newTagInput.trim()}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </div>
                    </div>
                  </ScrollArea>
                  <DialogFooter className="pt-4 border-t-0 mt-2">
                    <div className="flex justify-end items-center w-full gap-1">
                      <Button
                        className="dark:bg-white bg-primary text-primary-foreground hover:bg-primary/90 px-2 rounded-lg"
                        onClick={handleCreateSubtask}
                        disabled={isCreatingSubtask || !newSubtaskData.name.trim()}
                      >
                        {isCreatingSubtask ? "Creating..." : "Create Subtask"}
                        {!isCreatingSubtask && (
                          <div className="hidden sm:flex items-center gap-1">
                            {navigator?.platform?.toLowerCase().includes('mac') ? (
                              <>
                                <Kbd className="key-icon dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground text-sm">⌘</Kbd>
                                <Kbd className="key-icon dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground">&#x23CE;</Kbd>
                              </>
                            ) : (
                              <>
                                <Kbd className="dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground">Ctrl</Kbd>
                                <Kbd className="dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground"><CornerDownLeft/></Kbd>
                              </>
                            )}
                          </div>
                        )}
                      </Button>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Edit Task Dialog */}
              <Dialog
                open={isEditTaskDialogOpen}
                onOpenChange={setIsEditTaskDialogOpen}
              >
                <DialogContent 
                  className="proximavara sm:max-w-[740px] flex flex-col backdrop-blur-[10px] dark:bg-black/0 bg-white/90 border-2 sm:top-[27%]"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (!isUpdatingTask && editTaskData.name.trim()) {
                        handleUpdateTask();
                      }
                    }
                  }}
                >
                  <ScrollArea className="flex-grow -mx-4 -my-4">
                    <div className="space-y-2 px-2">
                      {/* Breadcrumb above task title */}
                      <div className="mt-2 mb-3 flex items-center gap-1 text-[13px] text-muted-foreground">
                        <span className="truncate max-w-[160px]">{department?.name ?? "Team"}</span>
                        <ChevronRight className="h-3 w-3 opacity-60" />
                        <span className="truncate max-w-[160px]">{project?.name ?? "Project"}</span>
                        <ChevronRight className="h-3 w-3 opacity-60" />
                        <span className="text-foreground">Edit Task</span>
                      </div>
                      {/* Large title field - seamless */}
                      <Input
                        id="editTaskName"
                        value={editTaskData.name}
                        onChange={(e) => setEditTaskData((prev) => ({ ...prev, name: e.target.value }))}
                        className="spacegrot w-full text-lg md:text-xl font-semibold placeholder:text-muted-foreground/70 focus-visible:ring-0 px-0 border-0 dark:bg-black/0 bg-white/0 shadow-none"
                        placeholder="Task Title"
                      />

                      {/* Description - seamless */}
                      <Textarea
                        id="editTaskDescription"
                        value={editTaskData.description}
                        onChange={(e) => setEditTaskData((prev) => ({ ...prev, description: e.target.value }))}
                        className="min-h-[30px] w-full text-base placeholder:text-muted-foreground/60 dark:bg-black/10 bg-white/0 shadow-none border-0 focus-visible:ring-0 resize-none px-0"
                        placeholder="Add Description..."
                      />

                      {/* Options bar: seamless pills */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {/* Assignee */}
                        <AssigneeSelector
                          open={isEditTaskAssigneePopoverOpen}
                          onOpenChange={setIsEditTaskAssigneePopoverOpen}
                          users={allOrgUsers}
                          selectedIds={selectedEditTaskAssigneeIds}
                          onToggle={(id) => handleEditTaskAssigneeToggle(id)}
                          searchTerm={editTaskAssigneeSearchTerm}
                          onSearchTermChange={setEditTaskAssigneeSearchTerm}
                          buttonLabel={
                            <span className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              Assignee
                            </span>
                          }
                          buttonClassName="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60"
                        />

                        {/* Due date */}
                        <Popover
                          open={isEditTaskDueDatePopoverOpen}
                          onOpenChange={setIsEditTaskDueDatePopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              className={cn(
                                "h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60",
                                !editTaskData.dueDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                              {editTaskData.dueDate ? (
                                format(editTaskData.dueDate, "MMM dd")
                              ) : (
                                <span>Due date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto p-0 backdrop-blur-[10px] dark:bg-black/10 bg-white/10 border-1"
                            align="start"
                          >
                            <Calendar
                              mode="single"
                              selected={editTaskData.dueDate}
                              onSelect={(date) => {
                                handleEditTaskDateSelect(date);
                                if (date) setIsEditTaskDueDatePopoverOpen(false);
                              }}
                              initialFocus
                              disabled={(date) =>
                                date < new Date(new Date().setDate(new Date().getDate() - 1))
                              }
                            />
                            <div className="p-2 border-t border-border/50">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-muted-foreground hover:text-destructive h-7 text-xs"
                                onClick={() => { handleEditTaskDateSelect(undefined); setIsEditTaskDueDatePopoverOpen(false); }}
                                disabled={!editTaskData.dueDate}
                              >
                                Clear date
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Priority */}
                        <Select
                          open={isEditTaskPriorityOpen}
                          onOpenChange={(open) => { setIsEditTaskPriorityOpen(open); if (open) setIsEditTaskStatusOpen(false); }}
                          value={editTaskData.priority}
                          onValueChange={(value: Task["priority"]) => setEditTaskData((prev) => ({ ...prev, priority: value }))}
                        >
                          <SelectTrigger className="h-9 px-3 text-sm rounded-full border-0 bg-black/40 hover:bg-muted/60 w-auto gap-1.5">
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent className="backdrop-blur-[10px] dark:bg-black/10 bg-white/70">
                            {taskPriorities.map((p) => (
                              <SelectItem key={p} value={p}>
                                <div className="flex items-center gap-2">
                                  <div className={cn("w-2 h-2 rounded-full", p === "High" && "bg-red-500", p === "Medium" && "bg-yellow-500", p === "Low" && "bg-green-500")} />
                                  {p}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Status */}
                        <Select
                          open={isEditTaskStatusOpen}
                          onOpenChange={(open) => { setIsEditTaskStatusOpen(open); if (open) setIsEditTaskPriorityOpen(false); }}
                          value={editTaskData.status}
                          onValueChange={(value: Task["status"]) => setEditTaskData((prev) => ({ ...prev, status: value }))}
                        >
                          <SelectTrigger className="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60 w-auto gap-1.5">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent className="backdrop-blur-[10px] dark:bg-black/10 bg-white/70">
                            {taskStatuses.map((s) => (
                              <SelectItem key={s} value={s}>
                                <div className="flex items-center gap-2">
                                  {s === "To Do" && <Circle className="h-3.5 w-3.5" />}
                                  {s === "In Progress" && <Clock className="h-3.5 w-3.5 text-blue-600" />}
                                  {s === "Blocked" && <AlertCircle className="h-3.5 w-3.5 text-red-600" />}
                                  {s === "In Review" && <Eye className="h-3.5 w-3.5 text-yellow-600" />}
                                  {s === "Completed" && <CircleCheck className="h-3.5 w-3.5 text-green-600" />}
                                  {s}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Tags - inline with max 3 visible */}
                        {(() => {
                          const tags = editTaskData.tags.split(",").filter((tag) => tag.trim());
                          const visibleTags = tags.slice(0, 3);
                          const hiddenCount = tags.length - 3;
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="h-9 px-3 text-sm rounded-full border-0 bg-muted/40 hover:bg-muted/60 gap-1.5"
                                >
                                  <Tag className="h-3.5 w-3.5" />
                                  {tags.length > 0 ? (
                                    <span className="flex items-center gap-1">
                                      {visibleTags.map((tag, i) => (
                                        <span key={i}>{tag.trim()}{i < visibleTags.length - 1 && ','}</span>
                                      ))}
                                      {hiddenCount > 0 && <span className="text-muted-foreground">+{hiddenCount}</span>}
                                    </span>
                                  ) : (
                                    "Tags"
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-80 max-h-72 p-0 backdrop-blur-[10px] dark:bg-black/10 bg-white/10 border-1 overflow-hidden pointer-events-auto"
                                align="start"
                              >
                                <div className="p-3 space-y-3">
                                  {/* Selected tags */}
                                  {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-muted/20">
                                      {tags.map((tag, index) => (
                                        <Badge
                                          key={index}
                                          variant="secondary"
                                          className="text-xs px-2 py-0.5 h-6 gap-1"
                                        >
                                          {tag.trim()}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentTags = editTaskData.tags
                                                .split(",")
                                                .filter((t) => t.trim());
                                              const updatedTags = currentTags.filter((_, i) => i !== index);
                                              setEditTaskData((prev) => ({ ...prev, tags: updatedTags.join(", ") }));
                                            }}
                                            className="hover:bg-destructive/20 rounded-full p-0.5"
                                          >
                                            <X className="h-2.5 w-2.5" />
                                          </button>
                                        </Badge>
                                      ))}
                                    </div>
                                  )}

                                  {/* Available tags */}
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Available Tags</Label>
                                    <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                      {availableTaskTags.length > 0 ? (
                                        availableTaskTags.map((tag) => {
                                          const isSelected = editTaskData.tags
                                            .split(",")
                                            .map((t) => t.trim())
                                            .includes(tag);
                                          return (
                                            <button
                                              key={tag}
                                              type="button"
                                              onClick={() => {
                                                const currentTags = editTaskData.tags
                                                  .split(",")
                                                  .filter((t) => t.trim());
                                                if (isSelected) {
                                                  const updatedTags = currentTags.filter((t) => t !== tag);
                                                  setEditTaskData((prev) => ({ ...prev, tags: updatedTags.join(", ") }));
                                                } else {
                                                  setEditTaskData((prev) => ({ ...prev, tags: [...currentTags, tag].join(", ") }));
                                                }
                                              }}
                                              className={cn(
                                                "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 group",
                                                isSelected ? "bg-primary/20 text-primary border border-primary/30" : "hover:bg-muted/50"
                                              )}
                                            >
                                              <div className={cn("w-2 h-2 rounded-full border", isSelected ? "bg-primary border-primary" : "border-muted-foreground/30")} />
                                              <span className="flex-1">{tag}</span>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag); }}
                                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded-full transition-all"
                                                title="Delete tag"
                                              >
                                                <Trash2 className="h-3 w-3 text-destructive" />
                                              </button>
                                            </button>
                                          );
                                        })
                                      ) : (
                                        <div className="text-xs text-muted-foreground">No available tags</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </div>
                    </div>
                  </ScrollArea>
                  <DialogFooter className="pt-4 border-t-0 mt-2">
                    <div className="flex justify-end items-center w-full gap-1">
                      <Button
                        className="dark:bg-white bg-primary text-primary-foreground hover:bg-primary/90 px-2 rounded-lg"
                        onClick={handleUpdateTask}
                        disabled={isUpdatingTask || !editTaskData.name.trim()}
                      >
                        {isUpdatingTask ? "Updating..." : "Update Task"}
                        {!isUpdatingTask && (
                          <div className="hidden sm:flex items-center gap-1">
                            {navigator?.platform?.toLowerCase().includes('mac') ? (
                              <>
                                <Kbd className="key-icon dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground text-sm">⌘</Kbd>
                                <Kbd className="key-icon dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground">&#x23CE;</Kbd>
                              </>
                            ) : (
                              <>
                                <Kbd className="dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground">Ctrl</Kbd>
                                <Kbd className="dark:bg-[#F5F5F5] bg-[#262626] text-primary-foreground"><CornerDownLeft/></Kbd>
                              </>
                            )}
                          </div>
                        )}
                      </Button>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Card className="rounded-none border-t-1 border-l-0 border-r-0 border-b-0 dark:bg-black py-3 -mx-6">
            {/* task card */}
            <CardContent
              className={taskView === "kanban" ? "px-6 -mr-6" : "px-6"}
            >
              {isLoadingTasks ? (
                <div className="space-y-2 mt-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <p className="text-center text-sm text-muted-foreground pt-2">
                    Loading tasks...
                  </p>
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-muted rounded-lg">
                  <h3 className="text-xl font-semibold text-muted-foreground">
                    No Tasks Yet
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Create your first task for this project using the "New Task"
                    button.
                  </p>
                </div>
              ) : taskView === "kanban" ? (
                <div
                  className="overflow-x-auto overflow-y-hidden -mx-6 pl-6 kanban-scroll-container"
                  style={{
                    maxWidth: `${availableWidth - 30}px`,
                    width: "100%",
                  }}
                >
                  <div style={{ width: "max-content", minWidth: "100%" }}>
                    <KanbanBoard
                      tasks={taskView === "kanban" ? kanbanOrderedTasks : tasks} // Use kanbanOrderedTasks for Kanban view
                      onUpdateTaskStatus={handleUpdateTaskStatus}
                      onEditTask={handleEditTask}
                      onDeleteTask={handleDeleteTaskClick}
                      onTaskClick={handleTaskClick} // Add task navigation handler
                      onReorderTasks={handleReorderTasksInColumn} // Pass the new handler
                      isLoadingTasks={isLoadingTasks}
                    />
                  </div>
                </div>
              ) : taskView === "list" ? (
                <ListView
                  tasks={tasks}
                  onUpdateTaskStatus={handleUpdateTaskStatus}
                  onEditTask={handleEditTask}
                  onDeleteTask={handleDeleteTaskClick}
                  onCreateSubtask={openNewSubtaskDialog}
                  onCreateTask={openNewParentTaskDialogWithStatus}
                  onUpdateTaskPriority={handleUpdateTaskPriority}
                  onUpdateTaskDueDate={handleUpdateTaskDueDate}
                  onUpdateTaskAssignees={handleUpdateTaskAssignees}
                  onTaskClick={handleTaskClick} // Add task navigation handler
                  allOrgUsers={projectMemberUsers}
                  isLoading={isLoadingTasks}
                  projectName={project?.name}
                />
              ) : taskView === "timeline" ? (
                <div
                  className="w-full mt-2 flex-1 flex flex-col min-h-0"
                  style={
                    shouldUseViewportHeight
                      ? { minHeight: "calc(100vh - 200px)" }
                      : {}
                  }
                >
                  {/* Show Gantt by default; toggle with timelineMode */}
                  {timelineMode === "gantt" ? (
                    <GanttView
                      tasks={tasks}
                      allOrgUsers={projectMemberUsers}
                      onTaskClick={handleTaskClick}
                      isLoading={isLoadingTasks}
                      // Option A: when tasks fit, force canvas height to available viewport height so filler rows + grid extend
                      forcedHeight={
                        shouldUseViewportHeight && availableTimelineHeight
                          ? availableTimelineHeight
                          : undefined
                      }
                      onUpdateTaskDates={async (
                        taskId: string,
                        startDate: Date,
                        endDate: Date
                      ) => {
                        try {
                          const taskRef = doc(db, "tasks", taskId);
                          await updateDoc(taskRef, {
                            createdAt: Timestamp.fromDate(startDate),
                            dueDate: Timestamp.fromDate(endDate),
                            updatedAt: serverTimestamp(),
                          });
                          toast.success("Task dates updated successfully");
                        } catch (error) {
                          console.error("Error updating task dates:", error);
                          toast.error("Failed to update task dates");
                        }
                      }}
                      onCreateSubtask={(parentTaskId) => {
                        const parentTask = tasks.find(
                          (t) => t.id === parentTaskId
                        );
                        if (parentTask) {
                          openNewSubtaskDialog(parentTask);
                        }
                      }}
                      onEditTask={(taskId) => {
                        const task = tasks.find((t) => t.id === taskId);
                        if (task) {
                          setCurrentEditingTask(task);
                          setEditTaskData({
                            name: task.name,
                            description: task.description || "",
                            dueDate:
                              task.dueDate instanceof Date
                                ? task.dueDate
                                : (task.dueDate as any)?.toDate?.() || null,
                            priority: task.priority || "Low",
                            status: task.status,
                            tags: Array.isArray(task.tags)
                              ? task.tags.join(", ")
                              : task.tags || "",
                          });
                          setSelectedEditTaskAssigneeIds(
                            task.assignedUsers?.map((u) => u.id) || []
                          );
                          setIsEditTaskDialogOpen(true);
                        }
                      }}
                      onDeleteTask={(taskId) => {
                        const task = tasks.find((t) => t.id === taskId);
                        if (task) {
                          setTaskToDelete(task);
                          setIsDeleteConfirmOpen(true);
                        }
                      }}
                      onUpdateTaskStatus={async (taskId: string, status) => {
                        try {
                          const taskRef = doc(db, "tasks", taskId);
                          await updateDoc(taskRef, {
                            status: status,
                            updatedAt: serverTimestamp(),
                          });
                          toast.success("Task status updated successfully");
                        } catch (error) {
                          console.error("Error updating task status:", error);
                          toast.error("Failed to update task status");
                        }
                      }}
                    />
                  ) : (
                    <TimelineView
                      tasks={tasks}
                      allOrgUsers={projectMemberUsers}
                      onUpdateTaskDates={async (
                        taskId: string,
                        startDate: Date,
                        endDate: Date
                      ) => {
                        try {
                          const taskRef = doc(db, "tasks", taskId);
                          await updateDoc(taskRef, {
                            createdAt: Timestamp.fromDate(startDate),
                            dueDate: Timestamp.fromDate(endDate),
                            updatedAt: serverTimestamp(),
                          });
                          toast.success("Task dates updated successfully");
                        } catch (error) {
                          console.error("Error updating task dates:", error);
                          toast.error("Failed to update task dates");
                        }
                      }}
                      onTaskClick={handleTaskClick}
                      onCreateSubtask={(parentTaskId) => {
                        const parentTask = tasks.find(
                          (t) => t.id === parentTaskId
                        );
                        if (parentTask) {
                          // Reuse central helper to open and prefill dialog
                          openNewSubtaskDialog(parentTask);
                        }
                      }}
                      onEditTask={(taskId) => {
                        const task = tasks.find((t) => t.id === taskId);
                        if (task) {
                          setCurrentEditingTask(task);
                          setEditTaskData({
                            name: task.name,
                            description: task.description || "",
                            dueDate:
                              task.dueDate instanceof Date
                                ? task.dueDate
                                : (task.dueDate as any)?.toDate?.() || null,
                            priority: task.priority || "Low",
                            status: task.status,
                            tags: Array.isArray(task.tags)
                              ? task.tags.join(", ")
                              : task.tags || "",
                          });
                          setSelectedEditTaskAssigneeIds(
                            task.assignedUsers?.map((u) => u.id) || []
                          );
                          setIsEditTaskDialogOpen(true);
                        }
                      }}
                      onDeleteTask={(taskId) => {
                        const task = tasks.find((t) => t.id === taskId);
                        if (task) {
                          setTaskToDelete(task);
                          setIsDeleteConfirmOpen(true);
                        }
                      }}
                      onUpdateTaskStatus={async (
                        taskId: string,
                        status: string
                      ) => {
                        try {
                          const taskRef = doc(db, "tasks", taskId);
                          await updateDoc(taskRef, {
                            status: status,
                            updatedAt: serverTimestamp(),
                          });
                          toast.success("Task status updated successfully");
                        } catch (error) {
                          console.error("Error updating task status:", error);
                          toast.error("Failed to update task status");
                        }
                      }}
                      isLoading={isLoadingTasks}
                    />
                  )}
                </div>
              ) : (
                <div className="border-border/50 overflow-x-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-6 -my-3">
                  {/* Search Controls */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <div className="relative">
                        <Input
                          id="task-search-input"
                          placeholder="Search tasks and subtasks..."
                          value={taskSearchQuery}
                          onChange={(e) => setTaskSearchQuery(e.target.value)}
                          className="pl-9 pr-12 h-8 text-sm"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 hidden sm:flex items-center gap-1">
                          {typeof navigator !== "undefined" && navigator?.platform?.toLowerCase().includes("mac") ? (
                            <>
                              <Kbd className="key-icon">⌘</Kbd>
                              <Kbd>/</Kbd>
                            </>
                          ) : (
                            <>
                              <Kbd>Ctrl</Kbd>
                              <Kbd>/</Kbd>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
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
                              <PopoverContent
                                className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                align="start"
                              >
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">
                                    Sort
                                  </Label>
                                  <div className="space-y-1">
                                    <button
                                      onClick={() => setTaskSort("name-asc")}
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors",
                                        taskSort === "name-asc"
                                          ? "bg-muted"
                                          : "hover:bg-muted/50"
                                      )}
                                    >
                                      Name A-Z
                                    </button>
                                    <button
                                      onClick={() => setTaskSort("name-desc")}
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors",
                                        taskSort === "name-desc"
                                          ? "bg-muted"
                                          : "hover:bg-muted/50"
                                      )}
                                    >
                                      Name Z-A
                                    </button>
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
                              <PopoverContent
                                className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                align="start"
                              >
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">
                                    Filter by Status
                                  </Label>
                                  <div className="space-y-1">
                                    {[
                                      "To Do",
                                      "In Progress",
                                      "In Review",
                                      "Blocked",
                                      "Completed",
                                    ].map((status) => (
                                      <div
                                        key={status}
                                        className="flex items-center space-x-2"
                                      >
                                        <Checkbox
                                          id={`status-${status}`}
                                          checked={statusFilter.includes(
                                            status
                                          )}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              setStatusFilter([
                                                ...statusFilter,
                                                status,
                                              ]);
                                            } else {
                                              setStatusFilter(
                                                statusFilter.filter(
                                                  (s) => s !== status
                                                )
                                              );
                                            }
                                          }}
                                        />
                                        <Label
                                          htmlFor={`status-${status}`}
                                          className="text-xs"
                                        >
                                          {status}
                                        </Label>
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
                              <PopoverContent
                                className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                align="start"
                              >
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">
                                    Filter by Priority
                                  </Label>
                                  <div className="space-y-1">
                                    {["Low", "Medium", "High"].map(
                                      (priority) => (
                                        <div
                                          key={priority}
                                          className="flex items-center space-x-2"
                                        >
                                          <Checkbox
                                            id={`priority-${priority}`}
                                            checked={priorityFilter.includes(
                                              priority
                                            )}
                                            onCheckedChange={(checked) => {
                                              if (checked) {
                                                setPriorityFilter([
                                                  ...priorityFilter,
                                                  priority,
                                                ]);
                                              } else {
                                                setPriorityFilter(
                                                  priorityFilter.filter(
                                                    (p) => p !== priority
                                                  )
                                                );
                                              }
                                            }}
                                          />
                                          <Label
                                            htmlFor={`priority-${priority}`}
                                            className="text-xs flex items-center gap-2"
                                          >
                                            <div
                                              className={cn(
                                                "w-2 h-2 rounded-full",
                                                priority === "High" &&
                                                  "bg-red-500",
                                                priority === "Medium" &&
                                                  "bg-yellow-500",
                                                priority === "Low" &&
                                                  "bg-green-500"
                                              )}
                                            />
                                            {priority}
                                          </Label>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[10%]">
                            Assignees
                          </TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[12%]">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-2 hover:text-foreground transition-colors">
                                  Due Date
                                  <Filter className="h-3 w-3" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-48 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                align="start"
                              >
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">
                                    Filter by Due Date
                                  </Label>
                                  <div className="space-y-1">
                                    <button
                                      onClick={() =>
                                        setDueDateFilter("tomorrow")
                                      }
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors",
                                        dueDateFilter === "tomorrow"
                                          ? "bg-muted"
                                          : "hover:bg-muted/50"
                                      )}
                                    >
                                      Due Tomorrow
                                    </button>
                                    <button
                                      onClick={() =>
                                        setDueDateFilter("yesterday")
                                      }
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors",
                                        dueDateFilter === "yesterday"
                                          ? "bg-muted"
                                          : "hover:bg-muted/50"
                                      )}
                                    >
                                      Due Yesterday
                                    </button>
                                    <button
                                      onClick={() =>
                                        setDueDateFilter("this-week")
                                      }
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors",
                                        dueDateFilter === "this-week"
                                          ? "bg-muted"
                                          : "hover:bg-muted/50"
                                      )}
                                    >
                                      Due This Week
                                    </button>
                                    <button
                                      onClick={() => setDueDateFilter("")}
                                      className={cn(
                                        "w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors",
                                        dueDateFilter === ""
                                          ? "bg-muted"
                                          : "hover:bg-muted/50"
                                      )}
                                    >
                                      Clear Filter
                                    </button>
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
                              <PopoverContent
                                className="w-64 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                align="start"
                              >
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium">
                                    Filter by Tags
                                  </Label>
                                  <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                    {availableTaskTags.map((tag) => (
                                      <div
                                        key={tag}
                                        className="flex items-center space-x-2"
                                      >
                                        <Checkbox
                                          id={`tag-${tag}`}
                                          checked={tagFilter.includes(tag)}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              setTagFilter([...tagFilter, tag]);
                                            } else {
                                              setTagFilter(
                                                tagFilter.filter(
                                                  (t) => t !== tag
                                                )
                                              );
                                            }
                                          }}
                                        />
                                        <Label
                                          htmlFor={`tag-${tag}`}
                                          className="text-xs"
                                        >
                                          {tag}
                                        </Label>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableHead>
                          <TableHead className="h-8 px-4 py-2 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[5%]">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          // Helper: filter and sort tasks
                          function filterAndSortTasks(tasks: Task[]): Task[] {
                            let filteredTasks = [...tasks];

                            // Search filter (searches both tasks and subtasks)
                            if (taskSearchQuery.trim()) {
                              const searchLower = taskSearchQuery.toLowerCase();
                              filteredTasks = filteredTasks.filter((task) => {
                                const taskMatches =
                                  task.name
                                    .toLowerCase()
                                    .includes(searchLower) ||
                                  (task.description &&
                                    task.description
                                      .toLowerCase()
                                      .includes(searchLower));

                                // Check if any subtask matches (if this is a parent task)
                                const subtaskMatches = tasks.some(
                                  (subtask) =>
                                    subtask.parentTaskId === task.id &&
                                    (subtask.name
                                      .toLowerCase()
                                      .includes(searchLower) ||
                                      (subtask.description &&
                                        subtask.description
                                          .toLowerCase()
                                          .includes(searchLower)))
                                );

                                // Check if parent task matches (if this is a subtask)
                                const parentMatches = task.parentTaskId
                                  ? tasks.some(
                                      (parentTask) =>
                                        parentTask.id === task.parentTaskId &&
                                        (parentTask.name
                                          .toLowerCase()
                                          .includes(searchLower) ||
                                          (parentTask.description &&
                                            parentTask.description
                                              .toLowerCase()
                                              .includes(searchLower)))
                                    )
                                  : false;

                                return (
                                  taskMatches || subtaskMatches || parentMatches
                                );
                              });
                            }

                            // Status filter
                            if (statusFilter.length > 0) {
                              filteredTasks = filteredTasks.filter((task) =>
                                statusFilter.includes(task.status)
                              );
                            }

                            // Priority filter
                            if (priorityFilter.length > 0) {
                              filteredTasks = filteredTasks.filter(
                                (task) =>
                                  task.priority &&
                                  priorityFilter.includes(task.priority)
                              );
                            }

                            // Due date filter
                            if (dueDateFilter) {
                              const now = new Date();
                              const today = new Date(
                                now.getFullYear(),
                                now.getMonth(),
                                now.getDate()
                              );
                              const tomorrow = new Date(today);
                              tomorrow.setDate(tomorrow.getDate() + 1);
                              const yesterday = new Date(today);
                              yesterday.setDate(yesterday.getDate() - 1);
                              const weekStart = new Date(today);
                              weekStart.setDate(
                                today.getDate() - today.getDay()
                              );
                              const weekEnd = new Date(weekStart);
                              weekEnd.setDate(weekStart.getDate() + 6);

                              filteredTasks = filteredTasks.filter((task) => {
                                if (!task.dueDate) return false;
                                const dueDate = getSafeDate(task.dueDate);
                                if (!dueDate) return false;

                                const dueDateOnly = new Date(
                                  dueDate.getFullYear(),
                                  dueDate.getMonth(),
                                  dueDate.getDate()
                                );

                                switch (dueDateFilter) {
                                  case "tomorrow":
                                    return (
                                      dueDateOnly.getTime() ===
                                      tomorrow.getTime()
                                    );
                                  case "yesterday":
                                    return (
                                      dueDateOnly.getTime() ===
                                      yesterday.getTime()
                                    );
                                  case "this-week":
                                    return (
                                      dueDateOnly >= weekStart &&
                                      dueDateOnly <= weekEnd
                                    );
                                  default:
                                    return true;
                                }
                              });
                            }

                            // Tag filter
                            if (tagFilter.length > 0) {
                              filteredTasks = filteredTasks.filter((task) =>
                                tagFilter.some((tag) => task.tags.includes(tag))
                              );
                            }

                            // Sort
                            if (taskSort) {
                              filteredTasks.sort((a, b) => {
                                switch (taskSort) {
                                  case "name-asc":
                                    return a.name.localeCompare(b.name);
                                  case "name-desc":
                                    return b.name.localeCompare(a.name);
                                  default:
                                    return 0;
                                }
                              });
                            }

                            return filteredTasks;
                          }

                          // Helper: build hierarchical structure
                          function buildHierarchy(tasks: Task[]): Array<
                            Task & {
                              subtasks: Array<Task & { subtasks: any[] }>;
                            }
                          > {
                            const map: Record<
                              string,
                              Task & { subtasks: any[] }
                            > = {};
                            tasks.forEach(
                              (t) => (map[t.id] = { ...t, subtasks: [] })
                            );
                            const roots: Array<Task & { subtasks: any[] }> = [];
                            tasks.forEach((t) => {
                              if (t.parentTaskId && map[t.parentTaskId]) {
                                map[t.parentTaskId].subtasks.push(map[t.id]);
                              } else {
                                roots.push(map[t.id]);
                              }
                            });
                            return roots;
                          }

                          // Recursive render function
                          function renderTaskRow(
                            task: Task & {
                              subtasks?: Array<Task & { subtasks?: any[] }>;
                            },
                            depth = 0
                          ): React.ReactNode[] {
                            // Generate task ID like ATH-11
                            const prefix = project?.name
                              ? project.name
                                  .replace(/[^A-Za-z]/g, "")
                                  .substring(0, 3)
                                  .toUpperCase()
                              : "TSK";
                            let hash = 0;
                            for (let i = 0; i < task.id.length; i++) {
                              hash = (hash << 5) - hash + task.id.charCodeAt(i);
                              hash = hash & hash;
                            }
                            const number = (Math.abs(hash) % 100) + 10;
                            const taskId = `${prefix}-${number}`;

                            // Fixed indentation system
                            const ICON_SPACE = 32; // Always reserve space for expand icon
                            const INDENT_PER_LEVEL = 24; // Clean 24px per level
                            const BASE_PADDING = 16; // Base cell padding

                            // Calculate total left padding
                            const totalPadding =
                              BASE_PADDING + depth * INDENT_PER_LEVEL;

                            const hasSubtasks = !!(
                              task.subtasks && task.subtasks.length > 0
                            );

                            return [
                              <ContextMenu key={task.id}>
                                <ContextMenuTrigger asChild>
                                  <TableRow
                                    className={cn(
                                      "group border-b hover:bg-muted/30 transition-all duration-200",
                                      task.status === "Completed" &&
                                        "opacity-60",
                                      depth > 0 && "bg-muted/20 border-muted/40"
                                    )}
                                    data-table-task-id={task.id}
                                    onMouseEnter={() =>
                                      setHoveredTableTaskId(task.id)
                                    }
                                    onMouseLeave={() =>
                                      setHoveredTableTaskId(null)
                                    }
                                  >
                                    {/* Task Name Column */}
                                    <TableCell
                                      className="px-1 py-2 w-[40%] max-w-0"
                                      style={{
                                        paddingLeft: `${totalPadding}px`,
                                      }}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        {/* ALWAYS reserve 32px for expand button area */}
                                        <div className="w-8 flex justify-center flex-shrink-0">
                                          {task.subtasks &&
                                          task.subtasks.length > 0 ? (
                                            <button
                                              onClick={() =>
                                                toggleTaskExpanded(task.id)
                                              }
                                              className="p-1 hover:bg-muted rounded-sm transition-colors"
                                              title={
                                                expandedTasks.has(task.id)
                                                  ? "Collapse subtasks"
                                                  : "Expand subtasks"
                                              }
                                            >
                                              {expandedTasks.has(task.id) ? (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                              )}
                                            </button>
                                          ) : (
                                            // Empty space but same width as button
                                            <div className="w-6 h-6" />
                                          )}
                                        </div>

                                        {/* Status Icon */}
                                        <div className="flex-shrink-0">
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button
                                                className="p-0.5 hover:bg-muted rounded-sm transition-colors"
                                                title={`Change status from ${task.status}`}
                                              >
                                                {task.status === "To Do" && (
                                                  <Circle className="h-4 w-4 text-zinc-600" />
                                                )}
                                                {task.status ===
                                                  "In Progress" && (
                                                  <Clock className="h-4 w-4 text-blue-600" />
                                                )}
                                                {task.status === "Blocked" && (
                                                  <AlertCircle className="h-4 w-4 text-red-600" />
                                                )}
                                                {task.status ===
                                                  "In Review" && (
                                                  <Eye className="h-4 w-4 text-yellow-600" />
                                                )}
                                                {task.status ===
                                                  "Completed" && (
                                                  <CircleCheck className="h-4 w-4 text-green-600" />
                                                )}
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent
                                              className="w-48 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                              align="center"
                                            >
                                              <div className="space-y-1">
                                                {taskStatuses.map((status) => (
                                                  <button
                                                    key={status}
                                                    onClick={() =>
                                                      handleUpdateTaskStatus(
                                                        task.id,
                                                        status
                                                      )
                                                    }
                                                    className={cn(
                                                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors",
                                                      task.status === status
                                                        ? "bg-muted text-foreground"
                                                        : "hover:bg-muted/50"
                                                    )}
                                                  >
                                                    {status === "To Do" && (
                                                      <Circle className="h-4 w-4 text-zinc-600" />
                                                    )}
                                                    {status ===
                                                      "In Progress" && (
                                                      <Clock className="h-4 w-4 text-blue-600" />
                                                    )}
                                                    {status === "Blocked" && (
                                                      <AlertCircle className="h-4 w-4 text-red-600" />
                                                    )}
                                                    {status === "In Review" && (
                                                      <Eye className="h-4 w-4 text-yellow-600" />
                                                    )}
                                                    {status === "Completed" && (
                                                      <CircleCheck className="h-4 w-4 text-green-600" />
                                                    )}
                                                    {status}
                                                  </button>
                                                ))}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        </div>

                                        {/* Task ID */}
                                        <div className="flex-shrink-0 text-xs text-muted-foreground font-mono">
                                          <span className="font-medium">
                                            {taskId}
                                          </span>
                                        </div>

                                        {/* Task Name */}
                                        <div className="flex-1 min-w-0">
                                          <span
                                            className={cn(
                                              "font-medium cursor-pointer hover:text-primary transition-colors truncate block",
                                              task.status === "Completed" &&
                                                "line-through"
                                            )}
                                            onClick={() =>
                                              handleTaskClick(task.id)
                                            }
                                          >
                                            {task.name}
                                          </span>
                                          {task.description && (
                                            <p className="text-xs text-muted-foreground mt-1 truncate">
                                              {task.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </TableCell>

                                    {/* Status Column */}
                                    <TableCell className="px-4 py-2 w-[10%]">
                                      <div
                                        className={cn(
                                          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap",
                                          task.status === "To Do" &&
                                            "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
                                          task.status === "In Progress" &&
                                            "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
                                          task.status === "Blocked" &&
                                            "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300",
                                          task.status === "In Review" &&
                                            "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300",
                                          task.status === "Completed" &&
                                            "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300"
                                        )}
                                      >
                                        {task.status}
                                      </div>
                                    </TableCell>

                                    {/* Priority Column */}
                                    <TableCell className="px-4 py-3 w-[10%]">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            className={cn(
                                              "inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors hover:opacity-80",
                                              task.priority === "High" &&
                                                "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800",
                                              task.priority === "Medium" &&
                                                "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
                                              task.priority === "Low" &&
                                                "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800",
                                              !task.priority &&
                                                "text-muted-foreground bg-muted/30 border-dashed border-muted-foreground/30"
                                            )}
                                          >
                                            {task.priority && (
                                              <div
                                                className={cn(
                                                  "w-2 h-2 rounded-full",
                                                  task.priority === "High" &&
                                                    "bg-red-500",
                                                  task.priority === "Medium" &&
                                                    "bg-yellow-500",
                                                  task.priority === "Low" &&
                                                    "bg-green-500"
                                                )}
                                              />
                                            )}
                                            {task.priority || "Set priority"}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-40 p-1 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                          align="center"
                                        >
                                          <div className="space-y-1">
                                            {(
                                              ["High", "Medium", "Low"] as const
                                            ).map((priority) => (
                                              <button
                                                key={priority}
                                                onClick={() =>
                                                  handleUpdateTaskPriority?.(
                                                    task.id,
                                                    priority
                                                  )
                                                }
                                                className={cn(
                                                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors",
                                                  task.priority === priority
                                                    ? "bg-muted text-foreground"
                                                    : "hover:bg-muted/50"
                                                )}
                                              >
                                                <div
                                                  className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    priority === "High" &&
                                                      "bg-red-500",
                                                    priority === "Medium" &&
                                                      "bg-yellow-500",
                                                    priority === "Low" &&
                                                      "bg-green-500"
                                                  )}
                                                />
                                                {priority}
                                              </button>
                                            ))}
                                            {task.priority && (
                                              <button
                                                onClick={() => {
                                                  const taskDocRef = doc(
                                                    db,
                                                    "tasks",
                                                    task.id
                                                  );
                                                  updateDoc(taskDocRef, {
                                                    priority: null,
                                                    updatedAt:
                                                      serverTimestamp(),
                                                  });
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-3 text-sm text-left rounded-md transition-colors hover:bg-muted/50 text-muted-foreground"
                                              >
                                                <X className="w-3 h-3" />
                                                Remove priority
                                              </button>
                                            )}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </TableCell>

                                    {/* Assignees Column */}
                                    <TableCell className="pl-4 py-3 w-[10%]">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="flex items-center hover:bg-muted/30 rounded-sm p-1 transition-colors">
                                            {task.assignedUsers &&
                                            task.assignedUsers.length > 0 ? (
                                              <div className="flex -space-x-1">
                                                {task.assignedUsers
                                                  .slice(0, 3)
                                                  .map((user) => (
                                                    <Avatar
                                                      key={user.id}
                                                      className="h-7 w-7 border-2 border-background ring-1 ring-border/20"
                                                    >
                                                      <AvatarImage
                                                        src={
                                                          user.avatarUrl ??
                                                          undefined
                                                        }
                                                        alt={
                                                          user.name ?? "User"
                                                        }
                                                      />
                                                      <AvatarFallback className="text-xs">
                                                        {user.name
                                                          ? user.name[0].toUpperCase()
                                                          : "U"}
                                                      </AvatarFallback>
                                                    </Avatar>
                                                  ))}
                                                {task.assignedUsers.length >
                                                  3 && (
                                                  <Avatar className="h-7 w-7 border-2 border-background ring-1 ring-border/20">
                                                    <AvatarFallback className="text-xs bg-muted">
                                                      +
                                                      {task.assignedUsers
                                                        .length - 3}
                                                    </AvatarFallback>
                                                  </Avatar>
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
                                        <PopoverContent
                                          className="w-64 p-2 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                          align="center"
                                        >
                                          <div className="space-y-2">
                                            <Input
                                              placeholder="Search people..."
                                              value={assigneesColumnSearchTerm}
                                              onChange={(e) =>
                                                setAssigneesColumnSearchTerm(
                                                  e.target.value
                                                )
                                              }
                                              className="h-8 text-xs"
                                            />
                                            <div className="max-h-48 overflow-y-auto space-y-1 assignee-selector-scroll">
                                              {filteredAssigneesForColumn.map(
                                                (user: DisplayUser) => (
                                                  <div
                                                    key={user.id}
                                                    className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                                                    onClick={() => {
                                                      const currentAssignees =
                                                        task.assignedUserIds ||
                                                        [];
                                                      const isAssigned =
                                                        currentAssignees.includes(
                                                          user.id
                                                        );
                                                      const newAssignees =
                                                        isAssigned
                                                          ? currentAssignees.filter(
                                                              (id) =>
                                                                id !== user.id
                                                            )
                                                          : [
                                                              ...currentAssignees,
                                                              user.id,
                                                            ];
                                                      handleUpdateTaskAssignees?.(
                                                        task.id,
                                                        newAssignees
                                                      );
                                                    }}
                                                  >
                                                    <Avatar className="h-6 w-6">
                                                      <AvatarImage
                                                        src={
                                                          user.avatarUrl ??
                                                          undefined
                                                        }
                                                        alt={
                                                          user.name ?? "User"
                                                        }
                                                      />
                                                      <AvatarFallback className="text-xs">
                                                        {user.name
                                                          ? user.name[0].toUpperCase()
                                                          : "U"}
                                                      </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                      <p className="text-sm font-medium truncate">
                                                        {user.name ||
                                                          "Unknown User"}
                                                      </p>
                                                      <p className="text-xs text-muted-foreground truncate">
                                                        {user.email ||
                                                          "No email"}
                                                      </p>
                                                    </div>
                                                    {task.assignedUserIds?.includes(
                                                      user.id
                                                    ) && (
                                                      <CircleCheck className="h-4 w-4 text-primary" />
                                                    )}
                                                  </div>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </TableCell>

                                    {/* Due Date Column */}
                                    <TableCell className="px-0 py-3 w-[12%]">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            className={cn(
                                              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors hover:bg-muted/50",
                                              task.dueDate
                                                ? "text-foreground bg-muted/30"
                                                : "text-muted-foreground border border-dashed border-muted-foreground/30"
                                            )}
                                          >
                                            <CalendarClock className="h-3 w-3" />
                                            {task.dueDate
                                              ? format(
                                                  getSafeDate(task.dueDate) ||
                                                    new Date(),
                                                  "MMM d, yyyy"
                                                )
                                              : "Set date"}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-auto p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                          align="center"
                                        >
                                          <Calendar
                                            mode="single"
                                            selected={getSafeDate(task.dueDate)}
                                            onSelect={(date) => {
                                              handleUpdateTaskDueDate?.(
                                                task.id,
                                                date || null
                                              );
                                            }}
                                            disabled={(date) =>
                                              date <
                                              new Date(
                                                Date.now() - 24 * 60 * 60 * 1000
                                              )
                                            }
                                          />
                                          {task.dueDate && (
                                            <div className="p-2 border-t">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() =>
                                                  handleUpdateTaskDueDate?.(
                                                    task.id,
                                                    null
                                                  )
                                                }
                                              >
                                                Remove date
                                              </Button>
                                            </div>
                                          )}
                                        </PopoverContent>
                                      </Popover>
                                    </TableCell>

                                    {/* Tags Column */}
                                    <TableCell className="px-0 py-3 w-[13%]">
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button className="flex items-center gap-1 hover:bg-muted/30 rounded-sm p-1 transition-colors w-full">
                                            {task.tags.length > 0 ? (
                                              <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
                                                {task.tags
                                                  .slice(0, 2)
                                                  .map(
                                                    (
                                                      tag: string,
                                                      index: number
                                                    ) => (
                                                      <Badge
                                                        key={index}
                                                        variant="secondary"
                                                        className="text-xs h-5 px-2 bg-muted/60"
                                                      >
                                                        {tag}
                                                      </Badge>
                                                    )
                                                  )}
                                                {task.tags.length > 2 && (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-xs h-5 px-2 border-dashed"
                                                  >
                                                    +{task.tags.length - 2}
                                                  </Badge>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-xs text-muted-foreground px-2 py-1 border border-dashed border-muted-foreground/30 rounded-md">
                                                Add tags
                                              </span>
                                            )}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-80 p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                                          align="center"
                                        >
                                          <div className="p-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                              <Label className="text-sm font-medium">
                                                Task Tags
                                              </Label>
                                              <span className="text-xs text-muted-foreground">
                                                {task.tags.length} selected
                                              </span>
                                            </div>

                                            {/* Selected Tags Display */}
                                            <div className="min-h-[40px] p-2 border rounded-md bg-background">
                                              {task.tags.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                  {task.tags.map(
                                                    (
                                                      tag: string,
                                                      index: number
                                                    ) => (
                                                      <Badge
                                                        key={index}
                                                        variant="secondary"
                                                        className="text-xs px-2 py-0.5 h-6 gap-1"
                                                      >
                                                        {tag}
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const newTags =
                                                              task.tags.filter(
                                                                (t: string) =>
                                                                  t !== tag
                                                              );
                                                            handleUpdateTaskTags(
                                                              task.id,
                                                              newTags
                                                            );
                                                          }}
                                                          className="hover:bg-destructive/20 rounded-full p-0.5"
                                                        >
                                                          <X className="h-2.5 w-2.5" />
                                                        </button>
                                                      </Badge>
                                                    )
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="text-sm text-muted-foreground">
                                                  No tags selected
                                                </span>
                                              )}
                                            </div>

                                            <div className="space-y-2">
                                              <Label className="text-xs font-medium">
                                                Available Tags
                                              </Label>
                                              <div className="max-h-32 overflow-y-auto space-y-1 tag-selector-scroll">
                                                {availableTaskTags.length >
                                                0 ? (
                                                  availableTaskTags
                                                    .filter(
                                                      (tag) =>
                                                        !task.tags.includes(tag)
                                                    )
                                                    .map((tag) => (
                                                      <button
                                                        key={tag}
                                                        type="button"
                                                        onClick={() => {
                                                          const newTags = [
                                                            ...task.tags,
                                                            tag,
                                                          ];
                                                          handleUpdateTaskTags(
                                                            task.id,
                                                            newTags
                                                          );
                                                        }}
                                                        className="w-full text-left px-2 py-1.5 text-xs rounded-sm transition-colors flex items-center gap-2 hover:bg-muted/50 group"
                                                      >
                                                        <div className="w-2 h-2 rounded-full border border-muted-foreground/30" />
                                                        <span className="flex-1">
                                                          {tag}
                                                        </span>
                                                        <button
                                                          type="button"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteTag(
                                                              tag
                                                            );
                                                          }}
                                                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded-full transition-all"
                                                          title="Delete tag"
                                                        >
                                                          <Trash2 className="h-3 w-3 text-destructive" />
                                                        </button>
                                                      </button>
                                                    ))
                                                ) : (
                                                  <p className="text-xs text-muted-foreground text-center py-2">
                                                    No available tags
                                                  </p>
                                                )}
                                              </div>
                                            </div>

                                            <Separator />

                                            <div className="space-y-2">
                                              <Label className="text-xs font-medium">
                                                Create New Tag
                                              </Label>
                                              <div className="flex gap-2">
                                                <Input
                                                  placeholder="Tag name..."
                                                  value={newTagInput}
                                                  onChange={(e) =>
                                                    setNewTagInput(
                                                      e.target.value
                                                    )
                                                  }
                                                  className="h-7 text-xs flex-1"
                                                  onKeyDown={async (e) => {
                                                    if (
                                                      e.key === "Enter" &&
                                                      newTagInput.trim()
                                                    ) {
                                                      e.preventDefault();
                                                      const trimmedTag =
                                                        newTagInput.trim();
                                                      if (
                                                        !task.tags.includes(
                                                          trimmedTag
                                                        )
                                                      ) {
                                                        const newTags = [
                                                          ...task.tags,
                                                          trimmedTag,
                                                        ];
                                                        await handleCreateNewTag(
                                                          trimmedTag
                                                        );
                                                        handleUpdateTaskTags(
                                                          task.id,
                                                          newTags
                                                        );
                                                      }
                                                      setNewTagInput("");
                                                    }
                                                  }}
                                                />
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 px-2"
                                                  onClick={async () => {
                                                    if (newTagInput.trim()) {
                                                      const trimmedTag =
                                                        newTagInput.trim();
                                                      if (
                                                        !task.tags.includes(
                                                          trimmedTag
                                                        )
                                                      ) {
                                                        const newTags = [
                                                          ...task.tags,
                                                          trimmedTag,
                                                        ];
                                                        await handleCreateNewTag(
                                                          trimmedTag
                                                        );
                                                        handleUpdateTaskTags(
                                                          task.id,
                                                          newTags
                                                        );
                                                      }
                                                      setNewTagInput("");
                                                    }
                                                  }}
                                                  disabled={!newTagInput.trim()}
                                                >
                                                  <Plus className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </TableCell>

                                    {/* Actions Column */}
                                    <TableCell className="px-0 py-3 w-[5%]">
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-8 p-0"
                                            >
                                              <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent
                                            align="end"
                                            className="w-40"
                                          >
                                            <DropdownMenuItem
                                              onClick={() =>
                                                closeContextMenuThen(() =>
                                                  handleEditTask(task.id)
                                                )
                                              }
                                            >
                                              <Edit3 className="mr-2 h-4 w-4" />
                                              Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onClick={() =>
                                                closeContextMenuThen(() =>
                                                  openNewSubtaskDialog(task)
                                                )
                                              }
                                            >
                                              <ListPlus className="mr-2 h-4 w-4" />
                                              Add subtask
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              onClick={() =>
                                                closeContextMenuThen(() =>
                                                  handleDeleteTaskClick(task.id)
                                                )
                                              }
                                              className="text-destructive focus:text-red-600"
                                            >
                                              <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                              Delete
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
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
                                      document.dispatchEvent(
                                        new KeyboardEvent("keydown", {
                                          key: "Escape",
                                        })
                                      );
                                    };

                                    switch (key) {
                                      case "enter":
                                        execAndClose(() =>
                                          handleTaskClick(task.id)
                                        );
                                        break;
                                      case "s":
                                        if (hasSubtasks) {
                                          execAndClose(() =>
                                            toggleTaskExpanded(task.id)
                                          );
                                        }
                                        break;
                                      case "c":
                                        execAndClose(() =>
                                          closeContextMenuThen(() =>
                                            openNewSubtaskDialog(task)
                                          )
                                        );
                                        break;
                                      case "e":
                                        execAndClose(() =>
                                          closeContextMenuThen(() =>
                                            handleEditTask(task.id)
                                          )
                                        );
                                        break;
                                      case "d":
                                        execAndClose(() =>
                                          closeContextMenuThen(() =>
                                            handleDeleteTaskClick(task.id)
                                          )
                                        );
                                        break;
                                      case "1":
                                        execAndClose(() =>
                                          handleUpdateTaskStatus(
                                            task.id,
                                            "To Do"
                                          )
                                        );
                                        break;
                                      case "2":
                                        execAndClose(() =>
                                          handleUpdateTaskStatus(
                                            task.id,
                                            "In Progress"
                                          )
                                        );
                                        break;
                                      case "3":
                                        execAndClose(() =>
                                          handleUpdateTaskStatus(
                                            task.id,
                                            "In Review"
                                          )
                                        );
                                        break;
                                      case "4":
                                        execAndClose(() =>
                                          handleUpdateTaskStatus(
                                            task.id,
                                            "Blocked"
                                          )
                                        );
                                        break;
                                      case "5":
                                        execAndClose(() =>
                                          handleUpdateTaskStatus(
                                            task.id,
                                            "Completed"
                                          )
                                        );
                                        break;
                                    }
                                  }}
                                >
                                  <ContextMenuItem
                                    onClick={() => handleTaskClick(task.id)}
                                  >
                                    <Info className="mr-2 h-3 w-4" />
                                    Show Details
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      Enter
                                    </span>
                                  </ContextMenuItem>
                                  <ContextMenuSeparator />
                                  {hasSubtasks && (
                                    <ContextMenuItem
                                      onClick={() =>
                                        toggleTaskExpanded(task.id)
                                      }
                                    >
                                      <Eye className="mr-2 h-3 w-4" />
                                      Show Subtasks
                                      <span className="ml-auto text-xs text-muted-foreground">
                                        S
                                      </span>
                                    </ContextMenuItem>
                                  )}
                                  <ContextMenuItem
                                    onClick={() =>
                                      closeContextMenuThen(() =>
                                        openNewSubtaskDialog(task)
                                      )
                                    }
                                  >
                                    <Plus className="mr-2 h-3 w-4" />
                                    Create Subtask
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      C
                                    </span>
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    onClick={() =>
                                      closeContextMenuThen(() =>
                                        handleEditTask(task.id)
                                      )
                                    }
                                  >
                                    <Edit3 className="mr-2 h-3 w-4" />
                                    Edit Task
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      E
                                    </span>
                                  </ContextMenuItem>
                                  <ContextMenuSub>
                                    <ContextMenuSubTrigger>
                                      <RefreshCw className="mr-4 h-3 w-4 text-muted-foreground" />
                                      Change Status
                                    </ContextMenuSubTrigger>
                                    <ContextMenuPortal>
                                      <ContextMenuSubContent className="w-44 z-[100]">
                                        {statusOptions.map((status) => {
                                          const IconComponent = status.icon;
                                          const isCurrent =
                                            task.status === status.value;
                                          const getStatusColor = (
                                            statusValue: string
                                          ) => {
                                            switch (statusValue) {
                                              case "To Do":
                                                return "text-gray-600 dark:text-gray-600";
                                              case "In Progress":
                                                return "text-blue-600 dark:text-blue-600";
                                              case "In Review":
                                                return "text-yellow-600 dark:text-yellow-600";
                                              case "Blocked":
                                                return "text-red-600 dark:text-red-600";
                                              case "Completed":
                                                return "text-green-600 dark:text-green-600";
                                              default:
                                                return "text-gray-600 dark:text-gray-600";
                                            }
                                          };
                                          const statusColor = getStatusColor(
                                            status.value
                                          );
                                          return (
                                            <ContextMenuItem
                                              key={status.value}
                                              onClick={() =>
                                                handleUpdateTaskStatus(
                                                  task.id,
                                                  status.value as any
                                                )
                                              }
                                              className={
                                                isCurrent
                                                  ? "bg-accent text-accent-foreground font-medium"
                                                  : "hover:bg-accent/50"
                                              }
                                            >
                                              <IconComponent
                                                className={`mr-2 h-3 w-4 ${statusColor}`}
                                              />
                                              {status.label}
                                              {isCurrent ? (
                                                <span
                                                  className={`ml-auto text-xs font-bold ${statusColor}`}
                                                >
                                                  ✓
                                                </span>
                                              ) : (
                                                <span className="ml-auto text-xs text-muted-foreground">
                                                  {status.value === "To Do"
                                                    ? "1"
                                                    : status.value ===
                                                        "In Progress"
                                                      ? "2"
                                                      : status.value ===
                                                          "In Review"
                                                        ? "3"
                                                        : status.value ===
                                                            "Blocked"
                                                          ? "4"
                                                          : status.value ===
                                                              "Completed"
                                                            ? "5"
                                                            : ""}
                                                </span>
                                              )}
                                            </ContextMenuItem>
                                          );
                                        })}
                                      </ContextMenuSubContent>
                                    </ContextMenuPortal>
                                  </ContextMenuSub>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem
                                    onClick={() =>
                                      closeContextMenuThen(() =>
                                        handleDeleteTaskClick(task.id)
                                      )
                                    }
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-3 w-4" />
                                    Delete Task
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      D
                                    </span>
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>,
                              ...(task.subtasks &&
                              task.subtasks.length > 0 &&
                              expandedTasks.has(task.id)
                                ? task.subtasks.flatMap((subtask) =>
                                    renderTaskRow(subtask, depth + 1)
                                  )
                                : []),
                            ];
                          }

                          // Build hierarchy and render with filtered tasks
                          const filteredTasks = filterAndSortTasks(tasks);
                          return buildHierarchy(filteredTasks).flatMap((task) =>
                            renderTaskRow(task, 0)
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmation
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => {
          setIsDeleteConfirmOpen(open);
          if (!open) {
            // If dialog is closing, clean up task to delete
            setTaskToDelete(null);
          }
        }}
        itemName={taskToDelete?.name}
        hasSubtasksWarning={!!(taskToDelete && tasks.some((t) => t.parentTaskId === taskToDelete.id))}
        onConfirm={() => {
          handleConfirmDelete();
          setIsDeleteConfirmOpen(false);
          setTaskToDelete(null);
        }}
      />
    </Tabs>
  );
}