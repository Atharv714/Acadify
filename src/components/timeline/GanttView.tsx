"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Task, DisplayUser } from "@/lib/types";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInWeeks,
  differenceInYears,
  endOfDay,
  format,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuPortal,
} from "@/components/ui/context-menu";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Info,
  Clock,
  Search,
  AlertCircle,
  CheckCircle,
  Circle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Pin,
  AlertTriangle,
  FileText,
} from "lucide-react";

type ZoomLevel = "day" | "week" | "month" | "year";

export interface GanttViewProps {
  tasks: Task[];
  allOrgUsers?: DisplayUser[];
  isLoading?: boolean;
  onTaskClick?: (taskId: string) => void;
  onUpdateTaskDates?: (
    taskId: string,
    startDate: Date,
    endDate: Date
  ) => Promise<void> | void;
  onCreateSubtask?: (parentTaskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTaskStatus?: (taskId: string, status: Task["status"]) => void;
  // Force a specific height (px) so canvas fills viewport when task count is low
  forcedHeight?: number;
}

interface GanttTask extends Task {
  startDateDay: Date;
  endDateDay: Date;
  dueDateDay: Date; // Add this to match TimelineView
  statusClass: string;
  priorityColor: string;
  // Delay tracking (parity with TimelineView)
  isOverdue?: boolean;
  delayEndDate?: Date;
  delayDuration?: number;
  hasDelaySegment?: boolean;
}

const COLUMN_WIDTH = 120; // visual grid column width
const VISIBLE_COLUMNS = 12; // viewport columns

export const GanttView: React.FC<GanttViewProps> = ({
  tasks,
  allOrgUsers,
  isLoading = false,
  onTaskClick,
  onUpdateTaskDates,
  onCreateSubtask,
  onEditTask,
  onDeleteTask,
  onUpdateTaskStatus,
  forcedHeight,
}) => {
  // Zoom + navigation
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Horizontal scroll state
  const [scrollOffset, setScrollOffset] = useState<number>(
    -(VISIBLE_COLUMNS / 2) * COLUMN_WIDTH
  );
  const scrollRef = useRef<number>(-(VISIBLE_COLUMNS / 2) * COLUMN_WIDTH);
  const lastUpdateTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  // Breadcrumb horizontal scroll helpers
  const breadcrumbScrollRef = useRef<HTMLDivElement | null>(null);
  const [breadcrumbShadowLeft, setBreadcrumbShadowLeft] = useState(false);
  const [breadcrumbShadowRight, setBreadcrumbShadowRight] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(
    VISIBLE_COLUMNS * COLUMN_WIDTH
  );

  // Drill-down: mirror TimelineView's focusedTaskStack for subtasks view
  const [focusedTaskStack, setFocusedTaskStack] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Drag state for resizing
  const [dragState, setDragState] = useState<{
    taskId: string;
    type: "resize-start" | "resize-end" | "move";
    startX: number;
    startScrollOffset: number;
    originalStart: Date;
    originalEnd: Date;
    currentDelta: number; // days
    pixelDelta: number; // px
  } | null>(null);

  // Hover + keyboard shortcuts parity with TimelineView
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  // Optimistic date overrides to prevent a flicker between drop and upstream data update
  const [pendingDateOverrides, setPendingDateOverrides] = useState<
    Record<string, { startDateDay: Date; endDateDay: Date; createdAt: number }>
  >({});

  // Animate smooth transitions when switching zoom levels
  const [isZoomAnimating, setIsZoomAnimating] = useState(false);
  const ZOOM_ANIM_MS = 300;
  const zoomAnimTimeoutRef = useRef<number | null>(null);
  const startZoomAnimation = useCallback(() => {
    if (zoomAnimTimeoutRef.current) {
      clearTimeout(zoomAnimTimeoutRef.current);
      zoomAnimTimeoutRef.current = null;
    }
    setIsZoomAnimating(true);
    zoomAnimTimeoutRef.current = window.setTimeout(() => {
      setIsZoomAnimating(false);
      zoomAnimTimeoutRef.current = null;
    }, ZOOM_ANIM_MS);
  }, []);

  // View filters and presets
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [hideOldCompletedDays, setHideOldCompletedDays] = useState<number>(14);
  const [focusTodo, setFocusTodo] = useState<boolean>(false);
  const [focusOverdue, setFocusOverdue] = useState<boolean>(false);
  const [focusBlocked, setFocusBlocked] = useState<boolean>(false);
  const [focusInProgress, setFocusInProgress] = useState<boolean>(false);
  const [focusInReview, setFocusInReview] = useState<boolean>(false);

  // Toolbar: per-button hover label expansion; can be pinned to show all labels
  const [toolbarPinned, setToolbarPinned] = useState<boolean>(false);
  const [hoveredToolbarKey, setHoveredToolbarKey] = useState<string | null>(
    null
  );
  const [delayedHoveredKey, setDelayedHoveredKey] = useState<string | null>(
    null
  );
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleToolbarMouseEnter = useCallback((key: string) => {
    // Clear any pending timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredToolbarKey(key);
    setDelayedHoveredKey(key);
  }, []);

  const handleToolbarMouseLeave = useCallback(() => {
    setHoveredToolbarKey(null);
    // Add delay before collapsing to allow smooth movement between buttons
    hoverTimeoutRef.current = setTimeout(() => {
      setDelayedHoveredKey(null);
    }, 150); // 150ms delay
  }, []);

  const showLabelFor = useCallback(
    (key: string) => {
      // Always show label if toolbar is pinned or if hovering
      if (toolbarPinned || delayedHoveredKey === key) return true;

      // Show label if the chip is active/selected
      switch (key) {
        case "todo":
          return focusTodo;
        case "overdue":
          return focusOverdue;
        case "blocked":
          return focusBlocked;
        case "inprogress":
          return focusInProgress;
        case "inreview":
          return focusInReview;
        case "completed":
          return showCompleted;
        default:
          return false;
      }
    },
    [
      toolbarPinned,
      delayedHoveredKey,
      focusTodo,
      focusOverdue,
      focusBlocked,
      focusInProgress,
      focusInReview,
      showCompleted,
    ]
  );

  // Smooth pill animation support: measure label widths and animate button width
  const CIRCLE_SIZE = 32; // px
  const ICON_PADDING = 4; // px padding around icon in collapsed state
  const LABEL_GAP = 8; // px between icon and label
  const SIDE_PADDING = 8; // px padding on each side when expanded
  const refToday = useRef<HTMLSpanElement | null>(null);
  const refTodo = useRef<HTMLSpanElement | null>(null);
  const refOverdue = useRef<HTMLSpanElement | null>(null);
  const refBlocked = useRef<HTMLSpanElement | null>(null);
  const refInProgress = useRef<HTMLSpanElement | null>(null);
  const refInReview = useRef<HTMLSpanElement | null>(null);
  const refCompleted = useRef<HTMLSpanElement | null>(null);
  const refReset = useRef<HTMLSpanElement | null>(null);
  const refPin = useRef<HTMLSpanElement | null>(null);

  // Keep breadcrumb fade shadows in sync with scroll/resize
  useEffect(() => {
    const el = breadcrumbScrollRef.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, clientWidth, scrollWidth } = el;
      setBreadcrumbShadowLeft(scrollLeft > 0);
      setBreadcrumbShadowRight(scrollLeft + clientWidth < scrollWidth - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true } as any);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update as any);
      window.removeEventListener("resize", update);
    };
  }, [focusedTaskStack]);

  // Intercept wheel on breadcrumb to translate vertical wheel into horizontal scroll
  // and prevent page/container vertical scrolling while scrubbing.
  useEffect(() => {
    const el = breadcrumbScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const canScroll = el.scrollWidth > el.clientWidth;
      if (!canScroll) return; // allow normal page scroll if no overflow
      const absY = Math.abs(e.deltaY);
      const absX = Math.abs(e.deltaX);
      // Only hijack when user's intent is vertical scrolling (mouse wheel)
      if (absY <= absX) return;
      const prev = el.scrollLeft;
      const max = el.scrollWidth - el.clientWidth;
      const next = Math.max(0, Math.min(max, prev + e.deltaY));
      if (next !== prev) {
        el.scrollLeft = next;
        // Block vertical scroll on ancestors and the page
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, [focusedTaskStack.length]);
  const chipWidth = useCallback(
    (expanded: boolean, ref: React.RefObject<HTMLElement | null>) => {
      const w = ref.current?.scrollWidth || 0;
      return expanded
        ? 32 + LABEL_GAP + w + SIDE_PADDING // icon space + gap + text + right padding
        : CIRCLE_SIZE;
    },
    []
  );

  const applyExecutivePreset = useCallback(() => {
    setShowCompleted(false);
    setHideOldCompletedDays(14);
    setFocusOverdue(true);
    setFocusBlocked(false);
    setFocusInProgress(false);
    setFocusInReview(false);
  }, []);

  const resetViewPreset = useCallback(() => {
    setShowCompleted(false);
    setHideOldCompletedDays(14);
    setFocusOverdue(false);
    setFocusBlocked(false);
    setFocusInProgress(false);
    setFocusInReview(false);
  }, []);

  const handleUpdateTaskStatus = useCallback(
    (taskId: string, status: Task["status"]) => {
      onUpdateTaskStatus?.(taskId, status);
    },
    [onUpdateTaskStatus]
  );

  // Derived processed tasks
  const processed: GanttTask[] = useMemo(() => {
    if (!tasks?.length) return [];

    // Choose which tasks to show based on drill-down state
    const tasksToShow =
      focusedTaskStack.length > 0
        ? tasks.filter(
            (t) =>
              t.parentTaskId ===
              focusedTaskStack[focusedTaskStack.length - 1].id
          )
        : tasks.filter((t) => !t.parentTaskId);

    return tasksToShow.map((t) => {
      const rawStart =
        t.createdAt instanceof Date
          ? t.createdAt
          : (t.createdAt as any)?.toDate?.() || new Date();
      const rawDue =
        t.dueDate instanceof Date
          ? t.dueDate
          : (t.dueDate as any)?.toDate?.() || addDays(rawStart, 7);
      const startDateDay = startOfDay(rawStart);
      const endDateDay = endOfDay(rawDue);
      const dueDateDay = endOfDay(rawDue); // Match TimelineView's dueDateDay

      const statusClass =
        {
          Completed: "dark:bg-green-400/10 bg-green-600/10 border-0",
          "In Progress": "dark:bg-blue-400/10 bg-blue-600/10 border-0",
          Blocked: "dark:bg-red-400/10 bg-red-600/10 border-0",
          "In Review": "dark:bg-yellow-400/10 bg-yellow-600/10 border-0",
          "To Do": "dark:bg-zinc-400/10 bg-zinc-600/10 border-0",
        }[t.status] || "dark:bg-zinc-400/10 bg-zinc-600/10 border-0";

      const priorityColor =
        {
          High: "bg-red-500",
          Medium: "bg-yellow-500",
          Low: "bg-green-500",
        }[t.priority || "Low"] || "bg-zinc-400";

      // Delay calculation logic (mirrors TimelineView)
      const today = new Date();
      const dueDateTime = rawDue; // Use original due date for calculations
      const isOverdue = today > dueDateTime;

      let delayEndDate: Date = endDateDay;
      let delayDuration = 0;
      let hasDelaySegment = false;

      if (t.status === "Completed") {
        const completedAt = t.updatedAt
          ? t.updatedAt instanceof Date
            ? t.updatedAt
            : (t.updatedAt as any)?.toDate?.()
          : null;

        if (completedAt && completedAt > dueDateTime) {
          const completedDay = startOfDay(completedAt);
          const dueDateOnlyDay = startOfDay(dueDateTime);
          if (completedDay.getTime() !== dueDateOnlyDay.getTime()) {
            delayEndDate = endOfDay(completedAt);
            delayDuration = differenceInDays(completedAt, dueDateTime);
            hasDelaySegment = true;
          }
        }
      } else if (isOverdue) {
        // For ongoing tasks, delay only goes from due date to today (not beyond)
        delayEndDate = endOfDay(today);
        delayDuration = differenceInDays(today, dueDateTime);
        hasDelaySegment = true;
      }

      // Apply optimistic override if present
      const override = pendingDateOverrides[t.id];
      const startDateDayApplied =
        override?.startDateDay || startOfDay(rawStart);
      const endDateDayApplied = override?.endDateDay || endOfDay(rawDue);
      const dueDateApplied = endDateDayApplied;

      return {
        ...t,
        startDateDay: startDateDayApplied,
        endDateDay: endDateDayApplied,
        dueDateDay: dueDateApplied,
        statusClass,
        priorityColor,
        isOverdue,
        delayEndDate,
        delayDuration,
        hasDelaySegment,
      } as GanttTask;
    });
  }, [tasks, focusedTaskStack, pendingDateOverrides]);

  // Garbage-collect stale optimistic overrides after a short TTL to mask update latency
  useEffect(() => {
    if (!Object.keys(pendingDateOverrides).length) return;
    const TTL = 2000; // ms
    const i = window.setInterval(() => {
      const now = Date.now();
      setPendingDateOverrides((prev) => {
        const next: typeof prev = {} as any;
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.createdAt < TTL) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 500);
    return () => window.clearInterval(i);
  }, [pendingDateOverrides]);

  // Apply filters to processed tasks for rendering
  const visible: GanttTask[] = useMemo(() => {
    if (!processed.length) return [];
    const today = new Date();
    let list = processed.filter((t) => {
      // Show all completed tasks when showCompleted is true, regardless of age
      if (!showCompleted && t.status === "Completed") return false;
      return true;
    });
    const useFocus =
      focusTodo ||
      focusOverdue ||
      focusBlocked ||
      focusInProgress ||
      focusInReview;
    if (useFocus) {
      list = list.filter((t) => {
        const mTodo = focusTodo ? t.status === "To Do" : false;
        const mOverdue = focusOverdue ? !!t.hasDelaySegment : false;
        const mBlocked = focusBlocked ? t.status === "Blocked" : false;
        const mProg = focusInProgress ? t.status === "In Progress" : false;
        const mReview = focusInReview ? t.status === "In Review" : false;
        return mTodo || mOverdue || mBlocked || mProg || mReview;
      });
    }
    return list;
  }, [
    processed,
    showCompleted,
    focusTodo,
    focusOverdue,
    focusBlocked,
    focusInProgress,
    focusInReview,
  ]);

  // Layout constants for perfect alignment and breathing space
  const ROW_HEIGHT = zoomLevel === "month" ? 64 : 70; // px
  const BAR_HEIGHT = zoomLevel === "month" ? 40 : 48; // px
  const HEADER_HEIGHT = zoomLevel === "day" ? 64 : 32; // Right header height
  const BAR_TOP_OFFSET = Math.round((ROW_HEIGHT - BAR_HEIGHT) / 2);
  // Number of visual rows that fit in the viewport (to render filler rows on the left)
  const [visualRowCount, setVisualRowCount] = useState(0);

  // Stable viewport-derived row count to avoid measurement -> resize feedback loops
  const [viewportRowCount, setViewportRowCount] = useState(() => {
    if (typeof window === "undefined") return 6;
    const headerH = HEADER_HEIGHT; // initial assumption; refined in effect
    const toolbarAllowance = 80; // approximate toolbar height + padding
    const available =
      (window.innerHeight || 800) - (headerH + toolbarAllowance);
    return Math.max(3, Math.ceil(available / ROW_HEIGHT));
  });

  useEffect(() => {
    const onResize = () => {
      const hdr = headerRef.current?.clientHeight || HEADER_HEIGHT;
      const toolbarAllowance = 80; // tweak if toolbar height changes
      const available = (window.innerHeight || 800) - (hdr + toolbarAllowance);
      setViewportRowCount(Math.max(3, Math.floor(available / ROW_HEIGHT)));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ROW_HEIGHT, HEADER_HEIGHT]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      // Use forcedHeight if provided, otherwise measure the actual container
      const ch = forcedHeight || el.clientHeight || 400;
      // Get actual header height (day view has 2 rows: h-8 + h-6 = 56px, others have h-6 = 32px)
      const actualHeaderHeight =
        headerRef.current?.clientHeight || (zoomLevel === "day" ? 64 : 32);
      const contentHeight = Math.max(0, ch - actualHeaderHeight);
      const num = Math.ceil(contentHeight / ROW_HEIGHT);
      setVisualRowCount(num);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ROW_HEIGHT, zoomLevel, forcedHeight]);

  // Wheel horizontal scroll with buttery feel
  const onWheel = useCallback(
    (e: WheelEvent) => {
      // While dragging a resize handle, suppress wheel panning to avoid accidental canvas moves
      if (dragState) {
        e.preventDefault();
        return;
      }
      const { deltaX, deltaY, shiftKey } = e;
      const isHorizontal =
        shiftKey ||
        Math.abs(deltaX) > Math.abs(deltaY) ||
        (Math.abs(deltaX) > 0 && Math.abs(deltaY) < 5);
      if (!isHorizontal) return;
      e.preventDefault();
      const delta = deltaX || deltaY;
      scrollRef.current += delta;
      const now = performance.now();
      if (now - lastUpdateTimeRef.current < 16) {
        if (animationFrameRef.current) return;
        animationFrameRef.current = requestAnimationFrame(() => {
          setScrollOffset(scrollRef.current);
          lastUpdateTimeRef.current = performance.now();
          animationFrameRef.current = undefined;
        });
      } else {
        setScrollOffset(scrollRef.current);
        lastUpdateTimeRef.current = now;
      }
    },
    [dragState]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, [onWheel]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Linear.app style keyboard shortcuts (copied from TimelineView) + Shift+S to go back one level
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Ignore when focused in editable fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          (target as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // Shift+S: navigate back one breadcrumb level (works even without a hovered task)
      if (key === "s" && e.shiftKey) {
        if (focusedTaskStack.length > 0) {
          e.preventDefault();
          setFocusedTaskStack((prev) => prev.slice(0, -1));
        }
        return;
      }

      // All other shortcuts require a hovered task
      if (!hoveredTaskId) return;

      const task = visible.find((t) => t.id === hoveredTaskId);
      if (!task) return;

      const shortcuts = [
        "r",
        "e",
        "c",
        "s",
        "d",
        "1",
        "2",
        "3",
        "4",
        "5",
        "enter",
      ];
      if (shortcuts.includes(key)) {
        e.preventDefault();
      }

      switch (key) {
        case "enter":
          onTaskClick?.(hoveredTaskId);
          break;
        case "r": {
          const taskElement = document.querySelector(
            `[data-task-id="${hoveredTaskId}"]`
          );
          if (taskElement) {
            const rect = (taskElement as HTMLElement).getBoundingClientRect();
            const contextMenuX = rect.left + rect.width * 0.7;
            const contextMenuY = rect.top + rect.height * 0.5;
            taskElement.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: contextMenuX,
                clientY: contextMenuY,
              })
            );
          }
          break;
        }
        case "e":
          onEditTask?.(hoveredTaskId);
          break;
        case "c":
          onCreateSubtask?.(hoveredTaskId);
          break;
        case "s": {
          // Drill into subtasks for the hovered task
          const hasSubtasks = tasks.some(
            (t) => t.parentTaskId === hoveredTaskId
          );
          if (hasSubtasks) {
            setFocusedTaskStack((prev) => [
              ...prev,
              { id: hoveredTaskId, name: task.name },
            ]);
          }
          break;
        }
        case "d":
          setTimeout(() => {
            onDeleteTask?.(hoveredTaskId);
          }, 50);
          break;
        case "1":
          handleUpdateTaskStatus(hoveredTaskId, "To Do");
          break;
        case "2":
          handleUpdateTaskStatus(hoveredTaskId, "In Progress");
          break;
        case "3":
          handleUpdateTaskStatus(hoveredTaskId, "In Review");
          break;
        case "4":
          handleUpdateTaskStatus(hoveredTaskId, "Blocked");
          break;
        case "5":
          handleUpdateTaskStatus(hoveredTaskId, "Completed");
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    hoveredTaskId,
    visible,
    onEditTask,
    onCreateSubtask,
    onDeleteTask,
    onTaskClick,
    tasks,
    handleUpdateTaskStatus,
    focusedTaskStack.length,
  ]);

  // Sync container width on resize
  useEffect(() => {
    const update = () =>
      setContainerWidth(
        containerRef.current?.clientWidth || VISIBLE_COLUMNS * COLUMN_WIDTH
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Helper: convert pixels to fractional days based on zoom level
  const pixelsToFractionalDays = useCallback(
    (deltaX: number) => {
      switch (zoomLevel) {
        case "day":
          return deltaX / COLUMN_WIDTH;
        case "week":
          return (deltaX / COLUMN_WIDTH) * 7;
        case "month":
          return (deltaX / COLUMN_WIDTH) * 30; // approx
        case "year":
          return (deltaX / COLUMN_WIDTH) * 365; // approx
        default:
          return deltaX / COLUMN_WIDTH;
      }
    },
    [zoomLevel]
  );

  // Pixels represented by one day at current zoom (used to snap preview)
  const pixelsPerDay = useCallback(() => {
    switch (zoomLevel) {
      case "day":
        return COLUMN_WIDTH;
      case "week":
        return COLUMN_WIDTH / 7;
      case "month":
        return COLUMN_WIDTH / 30; // approx
      case "year":
        return COLUMN_WIDTH / 365; // approx
      default:
        return COLUMN_WIDTH;
    }
  }, [zoomLevel]);

  // Begin resize
  const handleTaskResizeStart = useCallback(
    (
      task: GanttTask,
      type: "resize-start" | "resize-end",
      e: React.MouseEvent
    ) => {
      e.stopPropagation();
      // Stronger feedback: show resize cursor and disable text selection globally while dragging
      try {
        document.body.style.cursor = "ew-resize";
        (document.body.style as any).userSelect = "none";
        (document.body.style as any).webkitUserSelect = "none";
      } catch {}
      setDragState({
        taskId: task.id,
        type,
        startX: e.clientX,
        startScrollOffset: scrollRef.current,
        originalStart: task.startDateDay,
        originalEnd: task.endDateDay,
        currentDelta: 0,
        pixelDelta: 0,
      });
    },
    []
  );

  // Begin move (drag entire bar)
  const handleTaskMoveStart = useCallback(
    (task: GanttTask, e: React.MouseEvent) => {
      if (e.button !== 0) return; // left button only
      e.stopPropagation();
      try {
        document.body.style.cursor = "grabbing";
        (document.body.style as any).userSelect = "none";
        (document.body.style as any).webkitUserSelect = "none";
      } catch {}
      setDragState({
        taskId: task.id,
        type: "move",
        startX: e.clientX,
        startScrollOffset: scrollRef.current,
        originalStart: task.startDateDay,
        originalEnd: task.endDateDay,
        currentDelta: 0,
        pixelDelta: 0,
      });
    },
    []
  );

  // On move while resizing
  const handleTaskResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState) return;
      e.preventDefault();
      // Compensate for canvas auto-scroll so the bar stays under the cursor
      const deltaXRaw = e.clientX - dragState.startX;
      const scrollDelta = scrollRef.current - dragState.startScrollOffset;
      const deltaX = deltaXRaw + scrollDelta;
      const fractionalDays = pixelsToFractionalDays(deltaX);
      const deltaDays = Math.round(fractionalDays);

      // Auto-scroll near the actual container edges during drag (proportional speed)
      const el = containerRef.current;
      const padding = 64; // px
      const maxSpeed = 10; // px per event
      if (el) {
        const rect = el.getBoundingClientRect();
        if (e.clientX < rect.left + padding) {
          const dist = Math.max(1, e.clientX - rect.left);
          const ratio = Math.min(1, (padding - dist) / padding);
          const speed = Math.max(2, Math.round(maxSpeed * ratio));
          scrollRef.current -= speed;
          setScrollOffset(scrollRef.current);
        } else if (e.clientX > rect.right - padding) {
          const dist = Math.max(1, rect.right - e.clientX);
          const ratio = Math.min(1, (padding - dist) / padding);
          const speed = Math.max(2, Math.round(maxSpeed * ratio));
          scrollRef.current += speed;
          setScrollOffset(scrollRef.current);
        }
      }

      // Use continuous pixel preview for natural feel (snap only on commit)
      setDragState((prev) =>
        prev ? { ...prev, currentDelta: deltaDays, pixelDelta: deltaX } : prev
      );
    },
    [dragState, pixelsToFractionalDays]
  );

  // End resize
  const handleTaskResizeEnd = useCallback(() => {
    if (!dragState) return;
    const task = processed.find((t) => t.id === dragState.taskId);
    if (!task || dragState.currentDelta === 0) {
      setDragState(null);
      try {
        document.body.style.cursor = "";
        (document.body.style as any).userSelect = "";
        (document.body.style as any).webkitUserSelect = "";
      } catch {}
      return;
    }
    let newStart = dragState.originalStart;
    let newEnd = dragState.originalEnd;
    if (dragState.type === "resize-start") {
      newStart = addDays(dragState.originalStart, dragState.currentDelta);
      if (newStart >= newEnd) newStart = addDays(newEnd, -1);
    } else if (dragState.type === "resize-end") {
      newEnd = addDays(dragState.originalEnd, dragState.currentDelta);
      if (newEnd <= newStart) newEnd = addDays(newStart, 1);
    } else if (dragState.type === "move") {
      // Shift the entire window by delta days
      newStart = addDays(dragState.originalStart, dragState.currentDelta);
      newEnd = addDays(dragState.originalEnd, dragState.currentDelta);
    }

    // Apply optimistic override immediately to avoid a visual flash
    setPendingDateOverrides((prev) => ({
      ...prev,
      [dragState.taskId]: {
        startDateDay: startOfDay(newStart),
        endDateDay: endOfDay(newEnd),
        createdAt: Date.now(),
      },
    }));

    onUpdateTaskDates?.(dragState.taskId, newStart, newEnd);
    setDragState(null);
    try {
      document.body.style.cursor = "";
      (document.body.style as any).userSelect = "";
      (document.body.style as any).webkitUserSelect = "";
    } catch {}
  }, [dragState, processed, onUpdateTaskDates]);

  // Attach listeners while dragging
  useEffect(() => {
    if (!dragState) return;
    document.addEventListener("mousemove", handleTaskResizeMove, {
      passive: false,
    });
    document.addEventListener("mouseup", handleTaskResizeEnd, {
      passive: false,
    });
    return () => {
      document.removeEventListener("mousemove", handleTaskResizeMove as any);
      document.removeEventListener("mouseup", handleTaskResizeEnd as any);
    };
  }, [dragState, handleTaskResizeMove, handleTaskResizeEnd]);

  // Time units for headers and grid
  const timeUnits = useMemo(() => {
    const startIndex = Math.floor(scrollOffset / COLUMN_WIDTH);
    const buffer = 10;
    const arr: Array<{ index: number; date: Date }> = [];
    for (
      let i = startIndex - buffer;
      i < startIndex + VISIBLE_COLUMNS + buffer;
      i++
    ) {
      let date: Date;
      switch (zoomLevel) {
        case "day":
          date = addDays(currentDate, i);
          break;
        case "week":
          date = startOfWeek(addWeeks(currentDate, i), { weekStartsOn: 1 });
          break;
        case "month":
          date = addMonths(currentDate, i);
          break;
        case "year":
          date = addYears(currentDate, i);
          break;
      }
      arr.push({ index: i, date });
    }
    return arr;
  }, [scrollOffset, currentDate, zoomLevel]);

  const formatHeader = (date: Date) => {
    switch (zoomLevel) {
      case "day":
        return format(date, "EEE d");
      case "week":
        return `${format(startOfWeek(date, { weekStartsOn: 1 }), "MMM d")}-${format(endOfDay(addDays(startOfWeek(date, { weekStartsOn: 1 }), 6)), "d")}`;
      case "month":
        return format(date, "MMM");
      case "year":
        return format(date, "yyyy");
    }
  };

  // Month header for day zoom
  const monthHeaders = useMemo(() => {
    if (zoomLevel !== "day")
      return [] as Array<{
        left: number;
        width: number;
        date: Date;
        key: string;
      }>;
    const headers: Array<{
      left: number;
      width: number;
      date: Date;
      key: string;
    }> = [];
    const startIndex = Math.floor(scrollOffset / COLUMN_WIDTH);
    const buffer = 30;
    const monthMap: Record<string, { start: number; end: number; date: Date }> =
      {};
    for (
      let i = startIndex - buffer;
      i < startIndex + VISIBLE_COLUMNS + buffer;
      i++
    ) {
      const date = addDays(currentDate, i);
      const absLeft = i * COLUMN_WIDTH;
      const key = format(date, "MMM-yyyy");
      if (!monthMap[key])
        monthMap[key] = { start: absLeft, end: absLeft + COLUMN_WIDTH, date };
      else monthMap[key].end = absLeft + COLUMN_WIDTH;
    }
    Object.entries(monthMap).forEach(([key, v]) =>
      headers.push({ left: v.start, width: v.end - v.start, date: v.date, key })
    );
    return headers.sort((a, b) => a.left - b.left);
  }, [scrollOffset, currentDate, zoomLevel]);

  // Positioning
  const getBarPosition = useCallback(
    (t: GanttTask) => {
      let startOffset = 0;
      let duration = 0;
      const end = t.endDateDay;
      switch (zoomLevel) {
        case "day":
          startOffset = differenceInDays(t.startDateDay, currentDate);
          duration = differenceInDays(end, t.startDateDay) + 1;
          break;
        case "week":
          const currW = startOfWeek(currentDate, { weekStartsOn: 1 });
          const taskW = startOfWeek(t.startDateDay, { weekStartsOn: 1 });
          const weekOffset = differenceInWeeks(taskW, currW);
          const dayInStart = differenceInDays(t.startDateDay, taskW);
          const startWithin = dayInStart / 7;
          const endWeek = startOfWeek(addDays(end, 1), { weekStartsOn: 1 });
          const endWeekOffset = differenceInWeeks(endWeek, currW);
          const dayInEnd = differenceInDays(addDays(end, 1), endWeek);
          const endWithin = dayInEnd / 7;
          startOffset = weekOffset + startWithin;
          duration = endWeekOffset + endWithin - (weekOffset + startWithin);
          break;
        case "month":
          const currM = startOfMonth(currentDate);
          const taskM = startOfMonth(t.startDateDay);
          const monthOffset = differenceInMonths(taskM, currM);
          const dayInM = t.startDateDay.getDate() - 1;
          const daysInStart = new Date(
            t.startDateDay.getFullYear(),
            t.startDateDay.getMonth() + 1,
            0
          ).getDate();
          const startInM = dayInM / daysInStart;
          const endPlus = addDays(end, 1);
          const endMStart = startOfMonth(endPlus);
          const endMOffset = differenceInMonths(endMStart, currM);
          const dayInEndM = endPlus.getDate() - 1;
          const daysInEndM = new Date(
            endPlus.getFullYear(),
            endPlus.getMonth() + 1,
            0
          ).getDate();
          const endInM = dayInEndM / daysInEndM;
          startOffset = monthOffset + startInM;
          duration = endMOffset + endInM - (monthOffset + startInM);
          break;
        case "year":
          startOffset = differenceInYears(t.startDateDay, currentDate);
          duration = differenceInYears(end, t.startDateDay) + 1;
          break;
      }
      const left = startOffset * COLUMN_WIDTH - scrollOffset;
      const width = Math.max(duration * COLUMN_WIDTH, COLUMN_WIDTH * 0.25);
      return { left, width };
    },
    [currentDate, zoomLevel, scrollOffset]
  );

  // Calculate delayed segment position/width for overdue/late-completed tasks
  const getDelayedSegmentPosition = useCallback(
    (t: GanttTask) => {
      if (!t.hasDelaySegment || !t.delayEndDate) return null;
      const main = getBarPosition(t);
      const delayLeft = main.left + main.width;
      let delayWidth = COLUMN_WIDTH * 0.1;
      switch (zoomLevel) {
        case "day": {
          const days = differenceInDays(t.delayEndDate, t.dueDateDay);
          delayWidth = days * COLUMN_WIDTH;
          break;
        }
        case "week": {
          const days = differenceInDays(t.delayEndDate, t.dueDateDay);
          delayWidth = (days / 7) * COLUMN_WIDTH;
          break;
        }
        case "month": {
          const days = differenceInDays(t.delayEndDate, t.dueDateDay);
          const avgDaysInMonth = 30.44;
          delayWidth = (days / avgDaysInMonth) * COLUMN_WIDTH;
          break;
        }
        case "year": {
          const days = differenceInDays(t.delayEndDate, t.dueDateDay);
          delayWidth = (days / 365.25) * COLUMN_WIDTH;
          break;
        }
      }
      // Clamp to the Today line so the delayed segment never extends past it
      const getXForDate = (date: Date) => {
        let offset = 0;
        switch (zoomLevel) {
          case "day":
            offset = differenceInDays(startOfDay(date), currentDate);
            break;
          case "week": {
            const currW = startOfWeek(currentDate, { weekStartsOn: 1 });
            const dateW = startOfWeek(startOfDay(date), { weekStartsOn: 1 });
            const weekOffset = differenceInWeeks(dateW, currW);
            const dayInWeek = differenceInDays(startOfDay(date), dateW);
            const within = dayInWeek / 7;
            offset = weekOffset + within;
            break;
          }
          case "month": {
            const currM = startOfMonth(currentDate);
            const dateMStart = startOfMonth(startOfDay(date));
            const monthOffset = differenceInMonths(dateMStart, currM);
            const daysInM = new Date(
              dateMStart.getFullYear(),
              dateMStart.getMonth() + 1,
              0
            ).getDate();
            const within = (startOfDay(date).getDate() - 1) / daysInM;
            offset = monthOffset + within;
            break;
          }
          case "year":
            offset = differenceInYears(startOfDay(date), currentDate);
            break;
        }
        return offset * COLUMN_WIDTH - scrollOffset;
      };

      // Only clamp for ongoing tasks; completed tasks already have a fixed completion date
      const todayX = getXForDate(new Date());
      const maxWidth = todayX - delayLeft;
      let clamped = delayWidth;
      if (maxWidth < clamped) clamped = maxWidth;
      // If clamped goes negative or zero, don't render a segment
      if (clamped <= 0) return null;
      return { left: delayLeft, width: clamped };
    },
    [zoomLevel, getBarPosition, currentDate, scrollOffset]
  );

  const handlePrev = () =>
    setScrollOffset((v) => (scrollRef.current = v - COLUMN_WIDTH * 3));
  const handleNext = () =>
    setScrollOffset((v) => (scrollRef.current = v + COLUMN_WIDTH * 3));
  const handleToday = () => {
    setCurrentDate(new Date());
    const center = -(VISIBLE_COLUMNS / 2) * COLUMN_WIDTH;
    setScrollOffset((scrollRef.current = center));
  };
  const handleZoomOut = () => {
    startZoomAnimation();
    requestAnimationFrame(() => {
      setZoomLevel((z) =>
        z === "year"
          ? "year"
          : z === "month"
            ? "year"
            : z === "week"
              ? "month"
              : "week"
      );
    });
  };
  const handleZoomIn = () => {
    startZoomAnimation();
    requestAnimationFrame(() => {
      setZoomLevel((z) =>
        z === "day"
          ? "day"
          : z === "week"
            ? "day"
            : z === "month"
              ? "week"
              : "month"
      );
    });
  };

  // Global keyboard shortcuts for zooming: '+' to zoom in, '-' to zoom out
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when focused in editable fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          (target as HTMLElement).isContentEditable)
      ) {
        return;
      }
      // Ignore with meta/ctrl/alt to not clash with browser shortcuts
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key;
      const isPlus = k === "+" || k === "="; //added '=' so that it remain consistent with - icon
      const isMinus = k === "-" || k === "_";
      if (isPlus) {
        e.preventDefault();
        handleZoomIn();
      } else if (isMinus) {
        e.preventDefault();
        handleZoomOut();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleZoomIn, handleZoomOut]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Status options for context menu
  const statusOptions = [
    { label: "To Do", value: "To Do" as Task["status"], icon: Circle },
    {
      label: "In Progress",
      value: "In Progress" as Task["status"],
      icon: Clock,
    },
    { label: "In Review", value: "In Review" as Task["status"], icon: Search },
    { label: "Blocked", value: "Blocked" as Task["status"], icon: AlertCircle },
    {
      label: "Completed",
      value: "Completed" as Task["status"],
      icon: CheckCircle,
    },
  ];

  // Close any open Radix context menu before opening dialogs to avoid aria-hidden conflicts
  const closeContextMenuThen = useCallback((action: () => void) => {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    } catch {}
    setTimeout(() => action(), 50);
  }, []);

  return (
    <div
      className="h-full min-h-0 overflow-hidden flex flex-col -m-6"
      style={forcedHeight ? { height: forcedHeight } : undefined}
    >
      <style jsx>{`
        /* Hide native scrollbars but keep scrolling */
        .hide-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
      `}</style>
      {/* Toolbar (icon-first; each button expands on hover; can be pinned) */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size={showLabelFor("prev") ? "sm" : "icon"}
            onClick={handlePrev}
            title="Previous"
            onMouseEnter={() => setHoveredToolbarKey("prev")}
            onMouseLeave={() => setHoveredToolbarKey(null)}
            className="h-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            title="Today"
            className="h-8 rounded-md"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Today
          </Button>
          <Button
            variant="outline"
            size={showLabelFor("next") ? "sm" : "icon"}
            onClick={handleNext}
            title="Next"
            onMouseEnter={() => setHoveredToolbarKey("next")}
            onMouseLeave={() => setHoveredToolbarKey(null)}
            className="h-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="hidden md:block w-px h-6 bg-border/60 mx-2" />
          {/* Status chips: colored, borderless */}
          {(() => {
            const expanded = showLabelFor("overdue");
            const w = chipWidth(expanded, refOverdue);
            return (
              <Button
                variant="ghost"
                onClick={() => setFocusOverdue((v) => !v)}
                title="Overdue"
                onMouseEnter={() => handleToolbarMouseEnter("overdue")}
                onMouseLeave={handleToolbarMouseLeave}
                className={cn(
                  "h-8 rounded-full overflow-hidden transition-colors duration-200 ease-in-out flex items-center relative",
                  focusOverdue
                    ? "bg-orange-200 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200"
                    : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50"
                )}
                style={{
                  width: w,
                  transition: "width 220ms ease",
                }}
              >
                {/* Icon container - always centered in 32px space */}
                <div className="absolute left-0 w-8 h-8 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                {/* Text - appears with padding from left */}
                <span
                  ref={refOverdue}
                  className="text-sm whitespace-nowrap"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transition: "opacity 180ms ease",
                    marginLeft: 32 + 8, // icon width + gap
                    marginRight: 8, // right padding
                  }}
                >
                  Overdue
                </span>
              </Button>
            );
          })()}
          {(() => {
            const expanded = showLabelFor("todo");
            const w = chipWidth(expanded, refTodo);
            return (
              <Button
                variant="ghost"
                onClick={() => setFocusTodo((v) => !v)}
                title="To Do"
                onMouseEnter={() => handleToolbarMouseEnter("todo")}
                onMouseLeave={handleToolbarMouseLeave}
                className={cn(
                  "h-8 rounded-full overflow-hidden transition-colors duration-200 ease-in-out flex items-center relative",
                  focusTodo
                    ? "bg-purple-200 text-purple-900 dark:bg-purple-500/20 dark:text-purple-200"
                    : "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50"
                )}
                style={{
                  width: w,
                  transition: "width 220ms ease",
                }}
              >
                {/* Icon container - always centered in 32px space */}
                <div className="absolute left-0 w-8 h-8 flex items-center justify-center">
                  <FileText className="h-4 w-4" />
                </div>
                {/* Text - appears with padding from left */}
                <span
                  ref={refTodo}
                  className="text-sm whitespace-nowrap"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transition: "opacity 180ms ease",
                    marginLeft: 32 + 8, // icon width + gap
                    marginRight: 8, // right padding
                  }}
                >
                  To Do
                </span>
              </Button>
            );
          })()}
          {(() => {
            const expanded = showLabelFor("inprogress");
            const w = chipWidth(expanded, refInProgress);
            return (
              <Button
                variant="ghost"
                onClick={() => setFocusInProgress((v) => !v)}
                title="In Progress"
                onMouseEnter={() => handleToolbarMouseEnter("inprogress")}
                onMouseLeave={handleToolbarMouseLeave}
                className={cn(
                  "h-8 rounded-full overflow-hidden transition-colors duration-200 ease-in-out flex items-center relative",
                  focusInProgress
                    ? "bg-blue-200 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                )}
                style={{
                  width: w,
                  transition: "width 220ms ease",
                }}
              >
                {/* Icon container - always centered in 32px space */}
                <div className="absolute left-0 w-8 h-8 flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
                {/* Text - appears with padding from left */}
                <span
                  ref={refInProgress}
                  className="text-sm whitespace-nowrap"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transition: "opacity 180ms ease",
                    marginLeft: 32 + 8, // icon width + gap
                    marginRight: 8, // right padding
                  }}
                >
                  In Progress
                </span>
              </Button>
            );
          })()}
          {(() => {
            const expanded = showLabelFor("inreview");
            const w = chipWidth(expanded, refInReview);
            return (
              <Button
                variant="ghost"
                onClick={() => setFocusInReview((v) => !v)}
                title="In Review"
                onMouseEnter={() => handleToolbarMouseEnter("inreview")}
                onMouseLeave={handleToolbarMouseLeave}
                className={cn(
                  "h-8 rounded-full overflow-hidden transition-colors duration-200 ease-in-out flex items-center relative",
                  focusInReview
                    ? "bg-yellow-200 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-200"
                    : "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                )}
                style={{
                  width: w,
                  transition: "width 220ms ease",
                }}
              >
                {/* Icon container - always centered in 32px space */}
                <div className="absolute left-0 w-8 h-8 flex items-center justify-center">
                  <Search className="h-4 w-4" />
                </div>
                {/* Text - appears with padding from left */}
                <span
                  ref={refInReview}
                  className="text-sm whitespace-nowrap"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transition: "opacity 180ms ease",
                    marginLeft: 32 + 8, // icon width + gap
                    marginRight: 8, // right padding
                  }}
                >
                  In Review
                </span>
              </Button>
            );
          })()}
          {(() => {
            const expanded = showLabelFor("blocked");
            const w = chipWidth(expanded, refBlocked);
            return (
              <Button
                variant="ghost"
                onClick={() => setFocusBlocked((v) => !v)}
                title="Blocked"
                onMouseEnter={() => handleToolbarMouseEnter("blocked")}
                onMouseLeave={handleToolbarMouseLeave}
                className={cn(
                  "h-8 rounded-full overflow-hidden transition-colors duration-200 ease-in-out flex items-center relative",
                  focusBlocked
                    ? "bg-red-200 text-red-900 dark:bg-red-500/20 dark:text-red-200"
                    : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
                )}
                style={{
                  width: w,
                  transition: "width 220ms ease",
                }}
              >
                {/* Icon container - always centered in 32px space */}
                <div className="absolute left-0 w-8 h-8 flex items-center justify-center">
                  <AlertCircle className="h-4 w-4" />
                </div>
                {/* Text - appears with padding from left */}
                <span
                  ref={refBlocked}
                  className="text-sm whitespace-nowrap"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transition: "opacity 180ms ease",
                    marginLeft: 32 + 8, // icon width + gap
                    marginRight: 8, // right padding
                  }}
                >
                  Blocked
                </span>
              </Button>
            );
          })()}
          <div className="hidden md:block w-px h-6 bg-border/60 mx-2" />
          {(() => {
            const expanded = showLabelFor("completed");
            const w = chipWidth(expanded, refCompleted);
            return (
              <Button
                variant="ghost"
                onClick={() => setShowCompleted((v) => !v)}
                title="Completed"
                onMouseEnter={() => handleToolbarMouseEnter("completed")}
                onMouseLeave={handleToolbarMouseLeave}
                className={cn(
                  "h-8 rounded-full overflow-hidden transition-colors duration-200 ease-in-out flex items-center relative",
                  showCompleted
                    ? "bg-green-200 text-green-900 dark:bg-green-500/20 dark:text-green-200"
                    : "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50"
                )}
                style={{
                  width: w,
                  transition: "width 220ms ease",
                }}
              >
                {/* Icon container - always centered in 32px space */}
                <div className="absolute left-0 w-8 h-8 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4" />
                </div>
                {/* Text - appears with padding from left */}
                <span
                  ref={refCompleted}
                  className="text-sm whitespace-nowrap"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transition: "opacity 180ms ease",
                    marginLeft: 32 + 8, // icon width + gap
                    marginRight: 8, // right padding
                  }}
                >
                  Completed
                </span>
              </Button>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size={showLabelFor("zoomout") ? "sm" : "icon"}
            onClick={handleZoomOut}
            title="Zoom out (-)"
            onMouseEnter={() => setHoveredToolbarKey("zoomout")}
            onMouseLeave={() => setHoveredToolbarKey(null)}
            className="h-8"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size={showLabelFor("zoomin") ? "sm" : "icon"}
            onClick={handleZoomIn}
            title="Zoom in (+)"
            onMouseEnter={() => setHoveredToolbarKey("zoomin")}
            onMouseLeave={() => setHoveredToolbarKey(null)}
            className="h-8"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="hidden md:block w-px h-6 bg-border/60 mx-2" />
          <Button
            variant="outline"
            size="sm"
            onClick={resetViewPreset}
            title="Reset filters"
            className="h-8 rounded-md"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <div className="hidden md:block w-px h-6 bg-border/60 mx-2" />
          <Button
            variant={toolbarPinned ? "default" : "outline"}
            size="sm"
            onClick={() => setToolbarPinned((v) => !v)}
            title={toolbarPinned ? "Unpin toolbar" : "Pin toolbar"}
            className="h-8 rounded-md"
          >
            <Pin className="h-4 w-4 mr-2" />
            {toolbarPinned ? "Pinned" : "Pin"}
          </Button>
        </div>
      </div>

      {/* Body: sticky left rail + scrollable right canvas */}
      <div
        className="flex-1 grid min-h-0"
        style={{ gridTemplateColumns: "320px 1fr" }}
      >
        {/* Left rail */}
        <div className="relative border-r bg-background flex flex-col min-h-0">
          {/* Left header spacer for alignment */}
          <div
            className="sticky top-0 z-20 border-b bg-muted/10 px-3 text-sm flex items-center gap-2 overflow-hidden"
            style={{ height: HEADER_HEIGHT }}
          >
            <div className="font-medium mr-1 shrink-0">Tasks</div>
            {focusedTaskStack.length > 0 && (
              <div
                className="flex-1 min-w-0 overflow-x-auto hide-scrollbar overscroll-x-contain overscroll-y-none"
                ref={breadcrumbScrollRef}
              >
                <Breadcrumb>
                  <BreadcrumbList className="flex items-center whitespace-nowrap gap-1 w-max">
                    <BreadcrumbItem className="shrink-0 text-muted-foreground">
                      <BreadcrumbLink
                        className="text-xs hover:text-foreground cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          setFocusedTaskStack([]);
                        }}
                      >
                        All
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {focusedTaskStack.map((item, idx) => (
                      <React.Fragment key={item.id}>
                        <BreadcrumbSeparator className="px-1 text-muted-foreground/60">
                          ›
                        </BreadcrumbSeparator>
                        <BreadcrumbItem className="min-w-0 text-muted-foreground">
                          {idx < focusedTaskStack.length - 1 ? (
                            <BreadcrumbLink
                              className="text-xs hover:text-foreground cursor-pointer block truncate max-w-[150px]"
                              title={item.name}
                              onClick={(e) => {
                                e.preventDefault();
                                setFocusedTaskStack((prev) =>
                                  prev.slice(0, idx + 1)
                                );
                              }}
                            >
                              {item.name}
                            </BreadcrumbLink>
                          ) : (
                            <BreadcrumbPage
                              className="text-xs block truncate max-w-[200px]"
                              title={item.name}
                            >
                              {item.name}
                            </BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </React.Fragment>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            )}
            {/* Fade edges as a visual affordance when breadcrumb overflows */}
            {breadcrumbShadowLeft && (
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent" />
            )}
            {breadcrumbShadowRight && (
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent" />
            )}
          </div>
          {/* Rows (conditional scroll: inner scroll when viewport-constrained, natural growth when tasks exceed viewport) */}
          <div className="relative flex-1 overflow-auto">
            {visible.map((t, i) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-4 border-b"
                style={{ height: ROW_HEIGHT }}
                data-task-id={t.id}
                onMouseEnter={() => setHoveredTaskId(t.id)}
                onMouseLeave={() => setHoveredTaskId(null)}
              >
                <div className={cn("w-0 h-6 rounded-full", t.priorityColor)} />
                {/* Inline status icon dropdown (before title) */}
                {(() => {
                  const current = t.status;
                  const Icon =
                    current === "In Progress"
                      ? Clock
                      : current === "In Review"
                        ? Search
                        : current === "Blocked"
                          ? AlertCircle
                          : current === "Completed"
                            ? CheckCircle
                            : Circle; // To Do
                  const color =
                    current === "To Do"
                      ? "text-gray-500"
                      : current === "In Progress"
                        ? "text-blue-500"
                        : current === "In Review"
                          ? "text-yellow-500"
                          : current === "Blocked"
                            ? "text-red-500"
                            : "text-green-500";
                  return (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="shrink-0 h-5 w-5 rounded-full hover:bg-muted inline-flex items-center justify-center focus:outline-none"
                          title={`${t.status}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon className={cn("h-3.5 w-3.5", color)} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        sideOffset={6}
                        className="w-48 z-50"
                      >
                        {statusOptions.map((s) => {
                          const SIcon = s.icon;
                          const isCurrent = t.status === s.value;
                          const itemColor =
                            s.value === "To Do"
                              ? "text-gray-600"
                              : s.value === "In Progress"
                                ? "text-blue-600"
                                : s.value === "In Review"
                                  ? "text-yellow-600"
                                  : s.value === "Blocked"
                                    ? "text-red-600"
                                    : "text-green-600";
                          return (
                            <DropdownMenuItem
                              key={s.value}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateTaskStatus(t.id, s.value);
                              }}
                              className={cn(
                                "flex items-center gap-2",
                                isCurrent && "bg-accent text-accent-foreground"
                              )}
                            >
                              <SIcon className={cn("h-4 w-4", itemColor)} />
                              <span>{s.label}</span>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })()}
                <span
                  className="text-sm font-medium truncate text-left flex-1"
                  title={t.name}
                >
                  {t.name}
                </span>
                {t.assignedUsers && t.assignedUsers.length > 0 && (
                  <div className="flex -space-x-1 ml-auto">
                    {t.assignedUsers.slice(0, 2).map((u) => (
                      <Avatar key={u.id} className="h-6 w-6 border">
                        <AvatarImage src={u.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {u.name?.[0]?.toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {t.assignedUsers.length > 2 && (
                      <div className="h-6 w-6 bg-muted border rounded-full flex items-center justify-center text-xs">
                        +{t.assignedUsers.length - 2}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {/* Filler rows to visually fill the viewport height so the Gantt doesn't look truncated when there are few tasks */}
            {(() => {
              const fillers = Math.max(0, visualRowCount - visible.length);
              if (!fillers) return null;
              return Array.from({ length: fillers }, (_, idx) => (
                <div
                  key={`filler-${idx}`}
                  className="flex items-center px-4 border-b"
                  style={{ height: ROW_HEIGHT }}
                />
              ));
            })()}
          </div>
        </div>

        {/* Right canvas */}
        <div
          ref={containerRef}
          className="relative overflow-auto hide-scrollbar flex flex-col min-h-0"
          style={
            forcedHeight
              ? { height: forcedHeight, minHeight: forcedHeight }
              : {
                  minHeight: Math.max(
                    visible.length * ROW_HEIGHT + HEADER_HEIGHT,
                    400
                  ),
                }
          }
        >
          {/* Header (two rows when day view, otherwise single) */}
          <div
            ref={headerRef}
            className="sticky top-0 z-20 bg-background border-b"
          >
            {zoomLevel === "day" && (
              <div className="h-8 border-b border-border/30 bg-muted/10 relative">
                {monthHeaders.map((h, idx) => {
                  const left = h.left - scrollOffset;
                  const right = left + h.width;
                  if (
                    right < -COLUMN_WIDTH ||
                    left > containerWidth + COLUMN_WIDTH
                  )
                    return null;
                  const clampedLeft = Math.max(0, left);
                  const clampedRight = Math.min(containerWidth, right);
                  const width = clampedRight - clampedLeft;
                  if (width < 40) return null;
                  return (
                    <div
                      key={`${h.key}-${idx}`}
                      className="absolute inset-y-0 flex items-center justify-center text-xs font-medium text-muted-foreground bg-muted/5 border-r border-border/20"
                      style={{
                        transform: `translateX(${clampedLeft}px)`,
                        width,
                      }}
                    >
                      {format(h.date, "MMM yyyy")}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="h-8 relative">
              {timeUnits.map((u) => {
                const left = u.index * COLUMN_WIDTH - scrollOffset;
                if (
                  left < -COLUMN_WIDTH ||
                  left > containerWidth + COLUMN_WIDTH
                )
                  return null;
                return (
                  <div
                    key={`hdr-${u.index}`}
                    className={cn(
                      "absolute inset-y-0 w-[120px] flex items-center justify-center text-[11px] text-muted-foreground border-r",
                      isZoomAnimating &&
                        "transition-all duration-[400ms] ease-in-out"
                    )}
                    style={{ transform: `translateX(${left}px)` }}
                  >
                    {formatHeader(u.date)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content area: grid, today marker, and bars */}
          <div
            className={cn(
              "relative flex-1 gantt-grid-bg",
              isZoomAnimating && "transition-all duration-[400ms] ease-in-out"
            )}
            style={{
              minHeight: forcedHeight
                ? forcedHeight -
                  (headerRef.current?.clientHeight || HEADER_HEIGHT)
                : Math.max(visible.length, viewportRowCount) * ROW_HEIGHT,
            }}
          >
            {/* Today marker */}
            {(() => {
              const today = new Date();
              let offset = 0;
              switch (zoomLevel) {
                case "day": {
                  const todayStart = startOfDay(today);
                  const currentStart = startOfDay(currentDate);
                  const d = differenceInDays(todayStart, currentStart);
                  const timeWithin =
                    (today.getHours() * 60 + today.getMinutes()) / (24 * 60);
                  offset = d + timeWithin;
                  break;
                }
                case "week": {
                  const currW = startOfWeek(currentDate, { weekStartsOn: 1 });
                  const todayW = startOfWeek(today, { weekStartsOn: 1 });
                  const weekDiff = differenceInWeeks(todayW, currW);
                  const dow = (today.getDay() + 6) % 7; // 0=Mon
                  offset = weekDiff + dow / 7;
                  break;
                }
                case "month": {
                  const monthDiff = differenceInMonths(
                    startOfMonth(today),
                    startOfMonth(currentDate)
                  );
                  const daysInMonth = new Date(
                    today.getFullYear(),
                    today.getMonth() + 1,
                    0
                  ).getDate();
                  const within = (today.getDate() - 1) / daysInMonth;
                  offset = monthDiff + within;
                  break;
                }
                case "year": {
                  const yearDiff = differenceInYears(today, currentDate);
                  offset = yearDiff;
                  break;
                }
              }
              const x = offset * COLUMN_WIDTH - scrollOffset + 1;
              if (x < -COLUMN_WIDTH || x > containerWidth + COLUMN_WIDTH)
                return null;
              return (
                <div
                  className={cn(
                    "absolute top-0 bottom-0 w-px bg-blue-500/70 z-20",
                    isZoomAnimating &&
                      "transition-all duration-[400ms] ease-in-out"
                  )}
                  style={{ left: x, width: 2 }}
                />
              );
            })()}

            {/* Alternating bands for week/month (behind grid and bars) */}
            {(zoomLevel === "week" || zoomLevel === "month") && (
              <div
                className="absolute inset-0 pointer-events-none z-0"
                style={forcedHeight ? { height: forcedHeight } : undefined}
              >
                {timeUnits.map((u) => {
                  const left = u.index * COLUMN_WIDTH - scrollOffset;
                  if (
                    left < -COLUMN_WIDTH ||
                    left > containerWidth + COLUMN_WIDTH
                  )
                    return null;
                  // Alternate every other band
                  if (u.index % 2 !== 0) return null;
                  return (
                    <div
                      key={`band-${u.index}`}
                      className="absolute top-0 bottom-0 dark:bg-[#070709]/40 bg-[#F3F3F1]/20"
                      style={{ left, width: COLUMN_WIDTH }}
                    />
                  );
                })}
              </div>
            )}

            {/* Grid lines */}
            <div
              className="absolute left-0 right-0 bottom-0 top-0 z-0"
              style={forcedHeight ? { height: forcedHeight } : undefined}
            >
              {/* Vertical grid lines */}
              {timeUnits.map((u) => {
                const left = u.index * COLUMN_WIDTH - scrollOffset;
                if (
                  left < -COLUMN_WIDTH ||
                  left > containerWidth + COLUMN_WIDTH
                )
                  return null;
                return (
                  <div
                    key={`grid-${u.index}`}
                    className={cn(
                      "absolute top-0 bottom-0 w-px border-r border-dashed border-border/60",
                      isZoomAnimating &&
                        "transition-transform duration-[400ms] ease-in-out"
                    )}
                    style={{
                      transform: `translateX(${left + COLUMN_WIDTH}px)`,
                    }}
                  />
                );
              })}

              {/* Horizontal grid lines - lighter styling */}
              {(() => {
                const containerHeight = forcedHeight
                  ? forcedHeight
                  : containerRef.current?.clientHeight || 400;
                // Use consistent header height calculation
                const headerHeight =
                  headerRef.current?.clientHeight ||
                  (zoomLevel === "day" ? 64 : 32);
                const contentHeight = containerHeight - headerHeight;
                // Always ensure we render enough rows to fill the space
                const contentRows = Math.max(visualRowCount, visible.length);
                const minRows = forcedHeight
                  ? Math.ceil((forcedHeight - headerHeight) / ROW_HEIGHT)
                  : contentRows;
                const calculatedRows = Math.ceil(contentHeight / ROW_HEIGHT);
                const numRows = Math.max(minRows, calculatedRows, contentRows);

                return Array.from({ length: numRows }, (_, i) => (
                  <div
                    key={`row-grid-${i}`}
                    className="absolute left-0 right-0 border-b !border-border/20"
                    style={{
                      top: i * ROW_HEIGHT,
                      height: 1,
                    }}
                  />
                ));
              })()}
            </div>

            {/* Month sub-grid (quarters of month) for visual rhythm without clutter */}
            {zoomLevel === "month" && (
              <div
                className="absolute left-0 right-0 bottom-0 top-0 pointer-events-none"
                style={forcedHeight ? { height: forcedHeight } : undefined}
              >
                {timeUnits.map((u) => {
                  const left = u.index * COLUMN_WIDTH - scrollOffset;
                  return [1, 2, 3].map((q) => {
                    const ml = left + (q * COLUMN_WIDTH) / 4;
                    if (
                      ml < -COLUMN_WIDTH ||
                      ml > containerWidth + COLUMN_WIDTH
                    )
                      return null;
                    return (
                      <div
                        key={`grid-month-${u.index}-${q}`}
                        className="absolute top-0 bottom-0 w-px border-r border-dashed border-border/20"
                        style={{ transform: `translateX(${ml}px)` }}
                      />
                    );
                  });
                })}
              </div>
            )}

            {/* Bars layer with resize handles and preview */}
            {visible.map((t, i) => {
              const { left, width } = getBarPosition(t);
              // Preview while dragging
              let previewLeft = left;
              let previewWidth = width;
              // Live computed dates for drag preview labels
              let previewStartDate: Date | null = null;
              let previewEndDate: Date | null = null;
              const BADGE_OUTSET = 40; // px from the bar edge, outward
              if (dragState && dragState.taskId === t.id) {
                const dx = dragState.pixelDelta;
                if (dragState.type === "resize-start") {
                  previewLeft = left + dx;
                  previewWidth = width - dx;
                  // compute start preview date
                  const deltaDays = dragState.currentDelta;
                  const newStart = addDays(t.startDateDay, deltaDays);
                  const newEnd = t.endDateDay;
                  // clamp to at least 1 day visually
                  if (newStart >= newEnd) {
                    previewStartDate = addDays(newEnd, -1);
                    previewEndDate = newEnd;
                  } else {
                    previewStartDate = newStart;
                    previewEndDate = newEnd;
                  }
                } else if (dragState.type === "resize-end") {
                  previewWidth = width + dx;
                  const deltaDays = dragState.currentDelta;
                  const newEnd = addDays(t.endDateDay, deltaDays);
                  const newStart = t.startDateDay;
                  if (newEnd <= newStart) {
                    previewStartDate = newStart;
                    previewEndDate = addDays(newStart, 1);
                  } else {
                    previewStartDate = newStart;
                    previewEndDate = newEnd;
                  }
                } else if (dragState.type === "move") {
                  previewLeft = left + dx;
                  previewWidth = width;
                  const deltaDays = dragState.currentDelta;
                  previewStartDate = addDays(t.startDateDay, deltaDays);
                  previewEndDate = addDays(t.endDateDay, deltaDays);
                }
              }
              const clampedWidth = Math.max(previewWidth, COLUMN_WIDTH * 0.25);
              return (
                <ContextMenu key={t.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        "absolute z-20",
                        isZoomAnimating &&
                          !dragState &&
                          "transition-all duration-[400ms] ease-in-out"
                      )}
                      data-task-id={t.id}
                      onMouseEnter={() => setHoveredTaskId(t.id)}
                      onMouseLeave={() => setHoveredTaskId(null)}
                      onMouseDown={(e) => {
                        // Ignore when pressing on the resize handles (2px each side)
                        const rect = (
                          e.currentTarget as HTMLDivElement
                        ).getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const nearLeft = x <= 6;
                        const nearRight = x >= rect.width - 6;
                        if (!nearLeft && !nearRight) {
                          handleTaskMoveStart(t, e);
                        }
                      }}
                      style={{
                        transform: `translateX(${previewLeft}px)`,
                        width: clampedWidth,
                        top: i * ROW_HEIGHT + BAR_TOP_OFFSET,
                        minWidth: 12,
                        transition:
                          isZoomAnimating && !dragState
                            ? "transform 300ms ease, width 300ms ease"
                            : undefined,
                        willChange: isZoomAnimating
                          ? ("transform, width" as any)
                          : undefined,
                      }}
                    >
                      <div
                        className={cn(
                          "relative h-12 border cursor-default group hover:shadow-xl backdrop-blur-[2px]",
                          t.hasDelaySegment
                            ? "rounded-l-xl rounded-r-none"
                            : "rounded-xl",
                          t.statusClass,
                          dragState?.taskId === t.id &&
                            "ring-2 ring-blue-500/60"
                        )}
                        title={t.name}
                        style={{}}
                      >
                        {/* no partial progress fill: use pure status color like TimelineView */}

                        {/* content overlay with priority, title (truncated), and assignees */}
                        <div className="absolute inset-0 flex items-center px-3 gap-2 min-w-0">
                          <div
                            className={cn(
                              "w-0.75 h-7 rounded-full",
                              t.priorityColor
                            )}
                          />
                          {/* Title inside the bar; will truncate with ellipsis based on available width */}
                          <span
                            className="text-sm font-medium truncate min-w-0 flex-1"
                            title={t.name}
                          >
                            {t.name}
                          </span>
                          {(() => {
                            // Hide avatars for narrow bars depending on zoom for cleaner visuals
                            const minWidth =
                              zoomLevel === "week"
                                ? 140
                                : zoomLevel === "month"
                                  ? 140
                                  : zoomLevel === "year"
                                    ? 180
                                    : 100; // day
                            return clampedWidth >= minWidth;
                          })() && (
                            <div className="ml-auto flex -space-x-1">
                              {t.assignedUsers?.slice(0, 2).map((u) => (
                                <Avatar key={u.id} className="h-5 w-5 border">
                                  <AvatarImage
                                    src={u.avatarUrl ?? undefined}
                                    draggable={false}
                                  />
                                  <AvatarFallback className="text-[10px]">
                                    {u.name?.[0]?.toUpperCase() ?? "U"}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {t.assignedUsers &&
                                t.assignedUsers.length > 2 && (
                                  <div className="h-5 w-5 bg-muted border rounded-full flex items-center justify-center text-[10px]">
                                    +{t.assignedUsers.length - 2}
                                  </div>
                                )}
                            </div>
                          )}
                        </div>

                        {/* Resize handles */}
                        <div
                          className="absolute left-0 top-1 bottom-1 w-2 cursor-ew-resize bg-transparent hover:bg-blue-500/20 rounded-l select-none"
                          onMouseDown={(e) =>
                            handleTaskResizeStart(t, "resize-start", e)
                          }
                          title="Resize start"
                        >
                          <div className="w-0.5 h-full bg-transparent group-hover:bg-blue-500" />
                        </div>
                        <div
                          className="absolute right-0 top-1 bottom-1 w-2 cursor-ew-resize bg-transparent hover:bg-blue-500/20 rounded-r select-none"
                          onMouseDown={(e) =>
                            handleTaskResizeStart(t, "resize-end", e)
                          }
                          title="Resize end"
                        >
                          <div className="w-0.5 h-full bg-transparent group-hover:bg-blue-500 ml-1" />
                        </div>
                      </div>
                    </div>
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
                      const executeAndClose = (action: () => void) => {
                        e.preventDefault();
                        closeContextMenuThen(action);
                      };
                      switch (key) {
                        case "enter":
                          executeAndClose(() => onTaskClick?.(t.id));
                          break;
                        case "s": {
                          const hasSubtasks = tasks.some(
                            (x) => x.parentTaskId === t.id
                          );
                          if (hasSubtasks) {
                            executeAndClose(() =>
                              setFocusedTaskStack((prev) => [
                                ...prev,
                                { id: t.id, name: t.name },
                              ])
                            );
                          }
                          break;
                        }
                        case "c":
                          executeAndClose(() => onCreateSubtask?.(t.id));
                          break;
                        case "e":
                          executeAndClose(() => onEditTask?.(t.id));
                          break;
                        case "d":
                          executeAndClose(() => onDeleteTask?.(t.id));
                          break;
                        case "1":
                          executeAndClose(() =>
                            onUpdateTaskStatus?.(t.id, "To Do")
                          );
                          break;
                        case "2":
                          executeAndClose(() =>
                            onUpdateTaskStatus?.(t.id, "In Progress")
                          );
                          break;
                        case "3":
                          executeAndClose(() =>
                            onUpdateTaskStatus?.(t.id, "In Review")
                          );
                          break;
                        case "4":
                          executeAndClose(() =>
                            onUpdateTaskStatus?.(t.id, "Blocked")
                          );
                          break;
                        case "5":
                          executeAndClose(() =>
                            onUpdateTaskStatus?.(t.id, "Completed")
                          );
                          break;
                      }
                    }}
                  >
                    <ContextMenuItem onClick={() => onTaskClick?.(t.id)}>
                      <Info className="mr-2 h-3 w-4" />
                      Show Details
                      <span className="ml-auto text-xs text-muted-foreground">
                        Enter
                      </span>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {tasks.some((x) => x.parentTaskId === t.id) && (
                      <ContextMenuItem
                        onClick={() =>
                          closeContextMenuThen(() =>
                            setFocusedTaskStack((prev) => [
                              ...prev,
                              { id: t.id, name: t.name },
                            ])
                          )
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
                        closeContextMenuThen(() => onCreateSubtask?.(t.id))
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
                        closeContextMenuThen(() => onEditTask?.(t.id))
                      }
                    >
                      <Edit className="mr-2 h-3 w-4" />
                      Edit Task
                      <span className="ml-auto text-xs text-muted-foreground">
                        E
                      </span>
                    </ContextMenuItem>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <RefreshCw className="mr-2 h-3 w-4 text-muted-foreground" />
                        Change Status
                      </ContextMenuSubTrigger>
                      <ContextMenuPortal>
                        <ContextMenuSubContent className="w-44 z-[100]">
                          {statusOptions.map((s) => {
                            const Icon = s.icon;
                            const isCurrent = t.status === s.value;
                            const color =
                              s.value === "To Do"
                                ? "text-gray-600 dark:text-gray-600"
                                : s.value === "In Progress"
                                  ? "text-blue-600 dark:text-blue-600"
                                  : s.value === "In Review"
                                    ? "text-yellow-600 dark:text-yellow-600"
                                    : s.value === "Blocked"
                                      ? "text-red-600 dark:text-red-600"
                                      : "text-green-600 dark:text-green-600";
                            const numberHint =
                              s.value === "To Do"
                                ? "1"
                                : s.value === "In Progress"
                                  ? "2"
                                  : s.value === "In Review"
                                    ? "3"
                                    : s.value === "Blocked"
                                      ? "4"
                                      : "5";
                            return (
                              <ContextMenuItem
                                key={s.value}
                                onClick={() =>
                                  closeContextMenuThen(() =>
                                    onUpdateTaskStatus?.(t.id, s.value)
                                  )
                                }
                                className={
                                  isCurrent
                                    ? "bg-accent text-accent-foreground font-medium"
                                    : "hover:bg-accent/50"
                                }
                              >
                                <Icon className={`mr-2 h-3 w-4 ${color}`} />
                                {s.label}
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {numberHint}
                                </span>
                              </ContextMenuItem>
                            );
                          })}
                        </ContextMenuSubContent>
                      </ContextMenuPortal>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() =>
                        closeContextMenuThen(() => onDeleteTask?.(t.id))
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
                </ContextMenu>
              );
            })}

            {/* Live date badges while dragging/moving (positioned outside bar containers) */}
            {visible.map((t, i) => {
              if (!dragState || dragState.taskId !== t.id) return null;

              const { left, width } = getBarPosition(t);
              let previewLeft = left;
              let previewWidth = width;
              let previewStartDate: Date | null = null;
              let previewEndDate: Date | null = null;
              const BADGE_OUTSET = 12;

              if (dragState.taskId === t.id) {
                const dx = dragState.pixelDelta;
                if (dragState.type === "resize-start") {
                  previewLeft = left + dx;
                  previewWidth = width - dx;
                  const deltaDays = dragState.currentDelta;
                  const newStart = addDays(t.startDateDay, deltaDays);
                  const newEnd = t.endDateDay;
                  if (newStart >= newEnd) {
                    previewStartDate = addDays(newEnd, -1);
                    previewEndDate = newEnd;
                  } else {
                    previewStartDate = newStart;
                    previewEndDate = newEnd;
                  }
                } else if (dragState.type === "resize-end") {
                  previewWidth = width + dx;
                  const deltaDays = dragState.currentDelta;
                  const newEnd = addDays(t.endDateDay, deltaDays);
                  const newStart = t.startDateDay;
                  if (newEnd <= newStart) {
                    previewStartDate = newStart;
                    previewEndDate = addDays(newStart, 1);
                  } else {
                    previewStartDate = newStart;
                    previewEndDate = newEnd;
                  }
                } else if (dragState.type === "move") {
                  previewLeft = left + dx;
                  previewWidth = width;
                  const deltaDays = dragState.currentDelta;
                  previewStartDate = addDays(t.startDateDay, deltaDays);
                  previewEndDate = addDays(t.endDateDay, deltaDays);
                }
              }

              const clampedWidth = Math.max(previewWidth, COLUMN_WIDTH * 0.25);
              const barTop = i * ROW_HEIGHT + BAR_TOP_OFFSET;
              const barCenterY = barTop + 24; // 48px bar height / 2 = 24px

              return (
                <React.Fragment key={`badges-${t.id}`}>
                  {/* Left/start badge */}
                  <div
                    className="absolute pointer-events-none z-40"
                    style={{
                      left: previewLeft - BADGE_OUTSET,
                      top: barCenterY,
                      transform: "translate(-100%, -50%)",
                    }}
                  >
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium border border-border/50 shadow-sm whitespace-nowrap">
                      {previewStartDate &&
                        format(previewStartDate, "MMM d, yyyy")}
                    </span>
                  </div>
                  {/* Right/end badge */}
                  <div
                    className="absolute pointer-events-none z-40"
                    style={{
                      left: previewLeft + clampedWidth + BADGE_OUTSET,
                      top: barCenterY,
                      transform: "translate(0%, -50%)",
                    }}
                  >
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium border border-border/50 shadow-sm whitespace-nowrap">
                      {previewStartDate &&
                        previewEndDate &&
                        `${format(previewEndDate, "MMM d, yyyy")} (${Math.max(1, differenceInDays(previewEndDate, previewStartDate) + 1)} days)`}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}

            {/* Delay Segments Layer - separate pass for correct positioning */}
            {visible.map((t, i) => {
              if (!t.hasDelaySegment) return null;
              const pos = getDelayedSegmentPosition(t);
              if (!pos) return null;
              return (
                <div
                  key={`delay-${t.id}`}
                  className={cn(
                    "absolute h-12 z-30 flex items-center justify-center bg-orange-400/10 border-0 pointer-events-none",
                    isZoomAnimating &&
                      "transition-all duration-[400ms] ease-in-out"
                  )}
                  style={{
                    transform: `translateX(${pos.left}px)`,
                    width: Math.max(pos.width, COLUMN_WIDTH * 0.1),
                    top: i * ROW_HEIGHT + BAR_TOP_OFFSET,
                    borderRadius: "0 0.75rem 0.75rem 0",
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1' numOctaves='1' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.03'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
                    backgroundBlendMode: "overlay",
                    transition: isZoomAnimating
                      ? "transform 300ms ease, width 300ms ease"
                      : undefined,
                    willChange: isZoomAnimating
                      ? ("transform, width" as any)
                      : undefined,
                  }}
                >
                  {pos.width > 80 && (
                    <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 px-2 py-1 rounded-md">
                      Delayed ({t.delayDuration}{" "}
                      {t.delayDuration === 1 ? "day" : "days"})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttView;
