"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";
import {
  ChevronRight,
  MoreHorizontal,
  Circle,
  AlertCircle,
  Clock,
  Eye,
  CircleCheck,
  Edit3,
  ListPlus,
  Trash2,
  Plus,
  Filter,
  SortAsc,
  Hash,
  CalendarCog,
} from "lucide-react";
import { PiUserCirclePlus } from "react-icons/pi";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarDays, Users, User } from "lucide-react";
import { Task } from "@/lib/types";

interface ListViewProps {
  tasks: Task[];
  onUpdateTaskStatus: (
    taskId: string,
    newStatus: Task["status"]
  ) => Promise<void>;
  onEditTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateSubtask?: (parentTask: Task) => void;
  onCreateTask?: (defaultStatus?: Task["status"]) => void;
  onUpdateTaskPriority?: (
    taskId: string,
    priority: Task["priority"]
  ) => Promise<void>;
  onUpdateTaskDueDate?: (taskId: string, dueDate: Date | null) => Promise<void>;
  onUpdateTaskAssignees?: (
    taskId: string,
    assigneeIds: string[]
  ) => Promise<void>;
  onTaskClick?: (taskId: string) => void; // New prop for task navigation
  isLoading?: boolean;
  projectName?: string;
  allOrgUsers?: Array<{
    id: string;
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  }>; // Note: Despite the name, this should contain only project members, not all org users
}

type FilterPriority = "all" | Task["priority"];

const statusConfig = {
  "In Progress": {
    icon: Clock,
    color: "text-foreground",
    iconColor: "text-blue-600",
    backgroundColor: "bg-blue-100 dark:bg-blue-950/50",
    order: 1,
  },
  "To Do": {
    icon: Circle,
    color: "text-foreground",
    iconColor: "text-gray-600",
    backgroundColor: "bg-zinc-100 dark:bg-zinc-600/50",
    order: 2,
  },
  Completed: {
    icon: CircleCheck,
    color: "text-foreground",
    iconColor: "text-green-600",
    backgroundColor: "bg-green-100 dark:bg-green-900/30",
    order: 3,
  },
  "In Review": {
    icon: Eye,
    color: "text-foreground",
    iconColor: "text-yellow-600",
    backgroundColor: "bg-yellow-100 dark:bg-yellow-900/30",
    order: 4,
  },
  Blocked: {
    icon: AlertCircle,
    color: "text-foreground",
    iconColor: "text-red-600",
    backgroundColor: "bg-red-100 dark:bg-red-900/30",
    order: 5,
  },
};

const priorityColors = {
  High: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  Medium:
    "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  Low: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
};

// Helper function to safely get Date from Date | Timestamp
const getSafeDate = (
  dateInput: Date | Timestamp | undefined
): Date | undefined => {
  if (!dateInput) return undefined;
  if (dateInput instanceof Date) return dateInput;
  if (dateInput && typeof dateInput === "object" && "toDate" in dateInput) {
    return dateInput.toDate();
  }
  return undefined;
};

// Helper function to safely get time from Date or Timestamp
const getSafeTime = (dateInput: Date | Timestamp): number => {
  if (dateInput instanceof Date) return dateInput.getTime();
  if (dateInput instanceof Timestamp) return dateInput.toDate().getTime();
  return 0;
};

// Generate task ID like ATH-11, ATH-12 based on project name
const generateTaskId = (task: Task, projectName?: string): string => {
  const prefix = projectName
    ? projectName
        .replace(/[^A-Za-z]/g, "")
        .substring(0, 3)
        .toUpperCase()
    : "TSK";

  let hash = 0;
  for (let i = 0; i < task.id.length; i++) {
    const char = task.id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const number = (Math.abs(hash) % 100) + 10;

  return `${prefix}-${number}`;
};

// Helper function to get all subtasks for a task recursively
const getAllSubtasks = (taskId: string, allTasks: Task[]): Task[] => {
  const directSubtasks = allTasks.filter(
    (task) => task.parentTaskId === taskId
  );
  const nestedSubtasks = directSubtasks.flatMap((subtask) =>
    getAllSubtasks(subtask.id, allTasks)
  );
  return [...directSubtasks, ...nestedSubtasks];
};

// Helper function to build hierarchical structure maintaining original grouping
const buildHierarchicalStructure = (
  parentTasks: Task[],
  allTasks: Task[]
): (Task & { subtasks: Task[]; level: number })[] => {
  const buildSubtaskHierarchy = (
    task: Task,
    level: number
  ): Task & { subtasks: Task[]; level: number } => {
    const directSubtasks = allTasks.filter((t) => t.parentTaskId === task.id);
    const hierarchicalSubtasks = directSubtasks.map((subtask) =>
      buildSubtaskHierarchy(subtask, level + 1)
    );

    return {
      ...task,
      level,
      subtasks: hierarchicalSubtasks,
    };
  };

  return parentTasks.map((task) => buildSubtaskHierarchy(task, 0));
};

export const ListView: React.FC<ListViewProps> = ({
  tasks,
  onUpdateTaskStatus,
  onEditTask,
  onDeleteTask,
  onCreateSubtask,
  onCreateTask,
  onUpdateTaskPriority,
  onUpdateTaskDueDate,
  onUpdateTaskAssignees,
  onTaskClick, // Extract the new prop
  isLoading = false,
  projectName,
  allOrgUsers = [],
}) => {
  // Helper functions for localStorage persistence
  const getStorageKey = useCallback(
    (key: string) => `listview-${projectName || "default"}-${key}`,
    [projectName]
  );

  const loadFromStorage = useCallback(
    <T,>(key: string, defaultValue: T): T => {
      if (typeof window === "undefined") return defaultValue;
      try {
        const stored = localStorage.getItem(getStorageKey(key));
        return stored ? JSON.parse(stored) : defaultValue;
      } catch {
        return defaultValue;
      }
    },
    [getStorageKey]
  );

  const saveToStorage = useCallback(
    <T,>(key: string, value: T) => {
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(getStorageKey(key), JSON.stringify(value));
      } catch {
        // Ignore localStorage errors
      }
    },
    [getStorageKey]
  );

  // Initialize expanded groups with persistence - default to all expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(Object.keys(statusConfig))
  );

  // Initialize expanded tasks with persistence
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Load persisted state on mount
  useEffect(() => {
    const defaultExpandedGroups = new Set(Object.keys(statusConfig));
    const storedGroups = loadFromStorage(
      "expandedGroups",
      Array.from(defaultExpandedGroups)
    );
    setExpandedGroups(new Set(storedGroups));

    const defaultExpandedTasks = tasks
      .filter(
        (task) =>
          !task.parentTaskId && tasks.some((t) => t.parentTaskId === task.id)
      )
      .map((task) => task.id);
    const storedTasks = loadFromStorage("expandedTasks", defaultExpandedTasks);
    setExpandedTasks(new Set(storedTasks));
  }, [tasks, loadFromStorage]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("all");

  // State for assignees search in ListView popovers
  const [assigneesSearchTerms, setAssigneesSearchTerms] = useState<{
    [taskId: string]: string;
  }>({});

  // States for popovers
  const [openPopovers, setOpenPopovers] = useState<{
    [key: string]: {
      priority?: boolean;
      assignees?: boolean;
      dueDate?: boolean;
      status?: boolean;
    };
  }>({});

  // Helper to open/close popovers
  const togglePopover = (
    taskId: string,
    type: "priority" | "assignees" | "dueDate" | "status",
    isOpen: boolean
  ) => {
    setOpenPopovers((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [type]: isOpen,
      },
    }));
  };

  // Group tasks by status, but handle parent-child relationships
  const groupedTasks = useMemo(() => {
    let filteredTasks = tasks;

    // Apply search filter
    if (searchTerm) {
      filteredTasks = filteredTasks.filter(
        (task) =>
          task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          task.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply priority filter
    if (filterPriority !== "all") {
      filteredTasks = filteredTasks.filter(
        (task) => task.priority === filterPriority
      );
    }

    // Separate parent tasks and subtasks
    const parentTasks = filteredTasks.filter((task) => !task.parentTaskId);

    // Build hierarchical structure for parent tasks
    const hierarchicalTasks = buildHierarchicalStructure(
      parentTasks,
      filteredTasks
    );

    // Group hierarchical tasks by status
    const grouped = hierarchicalTasks.reduce(
      (acc, task) => {
        const status = task.status;
        if (!acc[status]) {
          acc[status] = [];
        }
        acc[status].push(task);
        return acc;
      },
      {} as Record<
        Task["status"],
        (Task & { subtasks: Task[]; level: number })[]
      >
    );

    // Sort statuses by order and tasks within each status by creation date
    const sortedGrouped: Partial<
      Record<Task["status"], (Task & { subtasks: Task[]; level: number })[]>
    > = {};

    Object.keys(statusConfig)
      .sort(
        (a, b) =>
          statusConfig[a as keyof typeof statusConfig].order -
          statusConfig[b as keyof typeof statusConfig].order
      )
      .forEach((status) => {
        if (grouped[status as Task["status"]]) {
          sortedGrouped[status as Task["status"]] = grouped[
            status as Task["status"]
          ].sort((a, b) => getSafeTime(b.createdAt) - getSafeTime(a.createdAt));
        }
      });

    return sortedGrouped;
  }, [tasks, searchTerm, filterPriority]);

  const toggleGroupExpanded = useCallback(
    (status: string) => {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(status)) {
          next.delete(status);
        } else {
          next.add(status);
        }
        // Persist to localStorage
        saveToStorage("expandedGroups", Array.from(next));
        return next;
      });
    },
    [saveToStorage]
  );

  const toggleTaskExpanded = useCallback(
    (taskId: string) => {
      setExpandedTasks((prev) => {
        const next = new Set(prev);
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
        // Persist to localStorage
        saveToStorage("expandedTasks", Array.from(next));
        return next;
      });
    },
    [saveToStorage]
  );

  // Calculate completion percentage for parent tasks with subtasks
  const getCompletionPercentage = (subtasks: Task[]) => {
    if (subtasks.length === 0) return 0;
    const completedCount = subtasks.filter(
      (subtask) => subtask.status === "Completed"
    ).length;
    return Math.round((completedCount / subtasks.length) * 100);
  };

  // Status Popover Component
  const StatusPopover = ({ task }: { task: Task }) => {
    const currentConfig = statusConfig[task.status];
    const CurrentIcon = currentConfig.icon;

    return (
      <Popover
        open={openPopovers[task.id]?.status || false}
        onOpenChange={(isOpen) => togglePopover(task.id, "status", isOpen)}
      >
        <PopoverTrigger asChild>
          <button
            className="p-0.5 hover:bg-muted rounded-sm transition-colors"
            title={`Change status from ${task.status}`}
            onClick={(e) => e.stopPropagation()} // Prevent triggering row click
          >
            <CurrentIcon className={cn("h-4 w-4", currentConfig.iconColor)} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="center">
          <div className="space-y-1">
            {Object.entries(statusConfig).map(([status, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={status}
                  onClick={() => {
                    onUpdateTaskStatus(task.id, status as Task["status"]);
                    togglePopover(task.id, "status", false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm transition-colors text-left",
                    task.status === status ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <Icon className={cn("h-4 w-4", config.iconColor)} />
                  <span>{status}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  // Priority Popover Component
  const PriorityPopover = ({ task }: { task: Task }) => (
    <Popover
      open={openPopovers[task.id]?.priority || false}
      onOpenChange={(isOpen) => togglePopover(task.id, "priority", isOpen)}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "text-xs font-normal h-5 px-2 rounded-md border transition-colors hover:opacity-80",
            task.priority
              ? priorityColors[task.priority]
              : "border-dashed border-muted-foreground/50 text-muted-foreground hover:border-muted-foreground"
          )}
          onClick={(e) => e.stopPropagation()} // Prevent triggering row click
        >
          {task.priority || "No priority"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="center">
        <div className="space-y-1">
          {(["High", "Medium", "Low"] as const).map((priority) => (
            <button
              key={priority}
              onClick={() => {
                onUpdateTaskPriority?.(task.id, priority);
                togglePopover(task.id, "priority", false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm transition-colors text-left",
                task.priority === priority ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  priority === "High"
                    ? "bg-red-500"
                    : priority === "Medium"
                      ? "bg-yellow-500"
                      : "bg-green-500"
                )}
              />
              {priority}
            </button>
          ))}
          {task.priority && (
            <>
              <div className="border-t my-1" />
              <button
                onClick={() => {
                  onUpdateTaskPriority?.(task.id, "Low"); // Default to Low or handle as null
                  togglePopover(task.id, "priority", false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm transition-colors text-left hover:bg-muted/50 text-muted-foreground"
              >
                Remove priority
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  // Due Date Popover Component
  const DueDatePopover = ({ task }: { task: Task }) => (
    <Popover
      open={openPopovers[task.id]?.dueDate || false}
      onOpenChange={(isOpen) => togglePopover(task.id, "dueDate", isOpen)}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "text-xs hover:bg-muted/30 rounded-sm px-2 py-1 transition-colors",
            task.dueDate ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={(e) => e.stopPropagation()} // Prevent triggering row click
        >
          {task.dueDate ? (
            format(getSafeDate(task.dueDate) || new Date(), "MMM d")
          ) : (
            <CalendarCog className="h-[17px] w-[17px]" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <Calendar
          mode="single"
          selected={getSafeDate(task.dueDate)}
          onSelect={(date) => {
            onUpdateTaskDueDate?.(task.id, date || null);
            togglePopover(task.id, "dueDate", false);
          }}
          disabled={(date) => date < new Date(Date.now() - 24 * 60 * 60 * 1000)} // Allow today and future dates
        />
        {task.dueDate && (
          <div className="p-2 border-t">
            <button
              onClick={() => {
                onUpdateTaskDueDate?.(task.id, null);
                togglePopover(task.id, "dueDate", false);
              }}
              className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear due date
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  // Recursive Task Rendering Component
  const renderTask = (
    task: Task & { subtasks: Task[]; level: number },
    depth: number = 0
  ): React.ReactNode => {
    const taskId = generateTaskId(task, projectName);
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const isTaskExpanded = expandedTasks.has(task.id);
    const completionPercentage = hasSubtasks
      ? getCompletionPercentage(task.subtasks)
      : 0;

    // Calculate indentation based on depth
    const baseIndentation = 24; // Base indentation for all tasks (replaces ml-6)
    const indentationLevel = baseIndentation + depth * 32; // 32px per level for subtasks

    return (
      <React.Fragment key={task.id}>
        {/* Task Row */}
        <div
          className={cn(
            "group flex items-center gap-3 px-3 rounded-md transition-all duration-200 hover:bg-muted/30",
            task.status === "Completed" && "opacity-60",
            depth === 0 ? "py-2" : "py-1.5", // Smaller padding for subtasks
            depth > 0 && "hover:bg-muted/20" // Lighter hover for subtasks
          )}
          style={{
            marginLeft: `${indentationLevel}px`,
            marginRight: 0, // Ensure no right margin interference
          }}
        >
          {/* Status Icon with optional expansion toggle */}
          <div className="flex items-center">
            {hasSubtasks ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    toggleTaskExpanded(task.id);
                  }}
                  className="p-0.5 hover:bg-muted rounded-sm transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-gray-300 dark:text-gray-400 transition-transform",
                      isTaskExpanded && "transform rotate-90"
                    )}
                  />
                </button>
                <StatusPopover task={task} />
              </div>
            ) : (
              <StatusPopover task={task} />
            )}
          </div>

          {/* Task ID */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <Hash className="h-3 w-3" />
            <span>{taskId}</span>
          </div>

          {/* Task Name */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h4
              className={cn(
                "text-sm font-medium truncate transition-colors",
                depth === 0 ? "text-foreground" : "text-muted-foreground",
                task.status === "Completed" && "line-through",
                onTaskClick && "cursor-pointer hover:text-primary"
              )}
              onClick={() => {
                if (onTaskClick) {
                  onTaskClick(task.id);
                }
              }}
            >
              {task.name}
            </h4>
            {hasSubtasks && (
              <span className="text-xs text-gray-400 bg-gray-800/60 px-1.5 py-0.5 rounded-md">
                {task.subtasks.length} subtask
                {task.subtasks.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Progress Bar (only for tasks with subtasks) */}
          {hasSubtasks && (
            <div className="flex items-center gap-2 min-w-24">
              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300 rounded-full"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {completionPercentage}%
              </span>
            </div>
          )}

          {/* Priority Badge */}
          {onUpdateTaskPriority ? (
            <PriorityPopover task={task} />
          ) : task.priority ? (
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-normal h-5 px-2",
                priorityColors[task.priority]
              )}
            >
              {task.priority}
            </Badge>
          ) : null}

          {/* Assignees */}
          {onUpdateTaskAssignees ? (
            <Popover
              open={openPopovers[task.id]?.assignees || false}
              onOpenChange={(isOpen) => {
                if (!isOpen) {
                  // Clear search when closing
                  setAssigneesSearchTerms((prev) => ({
                    ...prev,
                    [task.id]: "",
                  }));
                }
                togglePopover(task.id, "assignees", isOpen);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  className="flex items-center hover:bg-muted/30 rounded-sm p-1 transition-colors"
                  onClick={(e) => e.stopPropagation()} // Prevent triggering row click
                >
                  {task.assignedUsers && task.assignedUsers.length > 0 ? (
                    <div className="flex -space-x-1">
                      {task.assignedUsers.slice(0, 2).map((user) => (
                        <Avatar
                          key={user.id}
                          className="h-6 w-6 border-2 border-background"
                        >
                          <AvatarImage src={user.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {user.name ? user.name[0].toUpperCase() : "U"}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {task.assignedUsers.length > 2 && (
                        <Avatar className="h-6 w-6 border-2 border-background">
                          <AvatarFallback className="text-xs bg-muted">
                            +{task.assignedUsers.length - 2}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center text-muted-foreground hover:border-muted-foreground transition-colors">
                      <PiUserCirclePlus className="h-5 w-5" />
                    </div>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10"
                align="center"
              >
                <div className="space-y-2 p-2">
                  <Input
                    placeholder="Search people..."
                    value={assigneesSearchTerms[task.id] || ""}
                    onChange={(e) =>
                      setAssigneesSearchTerms((prev) => ({
                        ...prev,
                        [task.id]: e.target.value,
                      }))
                    }
                    className="h-8 text-xs"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1 assignee-selector-scroll">
                    {allOrgUsers
                      .filter((user) => {
                        const searchTerm = assigneesSearchTerms[task.id] || "";
                        if (!searchTerm) return true;
                        return (
                          user.name
                            ?.toLowerCase()
                            .includes(searchTerm.toLowerCase()) ||
                          user.email
                            ?.toLowerCase()
                            .includes(searchTerm.toLowerCase())
                        );
                      })
                      .map((user) => {
                        const isAssigned =
                          task.assignedUsers?.some((u) => u.id === user.id) ||
                          false;
                        return (
                          <div
                            key={user.id}
                            className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                            onClick={() => {
                              const currentAssigneeIds =
                                task.assignedUsers?.map((u) => u.id) || [];
                              const newAssigneeIds = isAssigned
                                ? currentAssigneeIds.filter(
                                    (id) => id !== user.id
                                  )
                                : [...currentAssigneeIds, user.id];
                              onUpdateTaskAssignees?.(task.id, newAssigneeIds);
                            }}
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarImage
                                src={user.avatarUrl ?? undefined}
                                alt={user.name ?? "User"}
                              />
                              <AvatarFallback className="text-xs">
                                {user.name ? user.name[0].toUpperCase() : "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {user.name || "Unknown User"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email || "No email"}
                              </p>
                            </div>
                            {isAssigned && (
                              <CircleCheck className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex items-center">
              {task.assignedUsers && task.assignedUsers.length > 0 ? (
                <div className="flex -space-x-1">
                  {task.assignedUsers.slice(0, 2).map((user) => (
                    <Avatar
                      key={user.id}
                      className={cn(
                        "border-2 border-background",
                        depth === 0 ? "h-6 w-6" : "h-5 w-5"
                      )}
                    >
                      <AvatarImage src={user.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {user.name ? user.name[0].toUpperCase() : "U"}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {task.assignedUsers.length > 2 && (
                    <Avatar
                      className={cn(
                        "border-2 border-background",
                        depth === 0 ? "h-6 w-6" : "h-5 w-5"
                      )}
                    >
                      <AvatarFallback className="text-xs bg-muted">
                        +{task.assignedUsers.length - 2}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ) : (
                <span
                  className={cn(
                    "text-xs text-muted-foreground text-center",
                    depth === 0 ? "w-6" : "w-5"
                  )}
                >
                  —
                </span>
              )}
            </div>
          )}

          {/* Due Date */}
          {onUpdateTaskDueDate ? (
            <DueDatePopover task={task} />
          ) : (
            <div className="text-xs text-muted-foreground min-w-16 text-right">
              {task.dueDate
                ? format(getSafeDate(task.dueDate) || new Date(), "MMM d")
                : depth === 0
                  ? "No due date"
                  : "—"}
            </div>
          )}

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("p-0", depth === 0 ? "h-8 w-8" : "h-6 w-6")}
                >
                  <MoreHorizontal
                    className={cn(depth === 0 ? "h-4 w-4" : "h-3 w-3")}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onEditTask(task.id)}>
                  <Edit3 className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {onCreateSubtask && (
                  <DropdownMenuItem onClick={() => onCreateSubtask(task)}>
                    <ListPlus className="mr-2 h-4 w-4" />
                    Create Subtask
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteTask(task.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Recursively render subtasks when expanded */}
        {hasSubtasks && isTaskExpanded && (
          <div className="space-y-0.5 mt-1">
            {task.subtasks.map((subtask) =>
              renderTask(
                subtask as Task & { subtasks: Task[]; level: number },
                depth + 1
              )
            )}
          </div>
        )}
      </React.Fragment>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ListPlus className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">
          No tasks yet
        </h3>
        <p className="text-sm text-muted-foreground">
          Create your first task to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Input
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Circle className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <Select
            value={filterPriority}
            onValueChange={setFilterPriority as any}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <SortAsc className="h-4 w-4 mr-2" />
            Display
          </Button>
        </div>
      </div>

      {/* Task Groups */}
      <div className="space-y-1">
        {Object.entries(groupedTasks).map(([status, statusTasks]) => {
          const config = statusConfig[status as keyof typeof statusConfig];
          const Icon = config.icon;
          const isExpanded = expandedGroups.has(status);

          return (
            <div key={status} className="space-y-1">
              {/* Group Header */}
              <button
                onClick={() => toggleGroupExpanded(status)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 text-sm font-medium text-left rounded-md transition-colors group",
                  config.backgroundColor,
                  "hover:opacity-80"
                )}
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform",
                    isExpanded && "transform rotate-90",
                    config.color
                  )}
                />
                <Icon className={cn("h-4 w-4", config.iconColor)} />
                <span className={config.color}>{status}</span>
                <span className="text-muted-foreground text-xs ml-1">
                  {statusTasks?.length || 0}
                </span>
                <div className="ml-auto">
                  {onCreateTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateTask(status as Task["status"]);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20 dark:hover:bg-black/20 p-1 rounded-sm"
                      title={`Create new task in ${status}`}
                    >
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </button>

              {/* Tasks in Group */}
              {isExpanded && statusTasks && (
                <div className="space-y-0.5">
                  {statusTasks.map((task) => renderTask(task, 0))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ListView;
