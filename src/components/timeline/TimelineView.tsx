"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { Task, DisplayUser } from "@/lib/types";
import {
  format,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  isToday,
  isSameDay,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
  addWeeks,
  addMonths,
  addYears,
} from "date-fns";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MoreHorizontal,
  Eye,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  Clock,
  AlertCircle,
  Search,
  Circle,
  RefreshCw,
  Info,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuPortal,
} from "@/components/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ZoomLevel = "day" | "week" | "month" | "year";

interface TimelineViewProps {
  tasks: Task[];
  allOrgUsers: DisplayUser[];
  onUpdateTaskDates?: (
    taskId: string,
    startDate: Date,
    endDate: Date
  ) => Promise<void>;
  onTaskClick?: (taskId: string) => void;
  onCreateSubtask?: (parentTaskId: string) => void;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTaskStatus?: (taskId: string, status: string) => void;
  isLoading?: boolean;
}

interface ProcessedTask extends Task {
  startDateDay: Date;
  dueDateDay: Date;
  duration: number;
  statusClass: string;
  priorityColor: string;
  isOverdue: boolean;
  delayEndDate: Date;
  delayDuration: number;
  hasDelaySegment: boolean;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  tasks,
  allOrgUsers,
  onUpdateTaskDates,
  onTaskClick,
  onCreateSubtask,
  onEditTask,
  onDeleteTask,
  onUpdateTaskStatus,
  isLoading = false,
}) => {
  // Zoom and navigation state
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Dragging and scrolling state
  const [dragState, setDragState] = useState<{
    taskId: string;
    type: "move" | "resize-start" | "resize-end";
    startX: number;
    originalStart: Date;
    originalEnd: Date;
    currentDelta: number;
    pixelDelta: number; // Add pixel-based delta for smooth dragging
  } | null>(null);

  // Linear.app style hover + keyboard shortcuts
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [justFinishedDragging, setJustFinishedDragging] = useState(false);
  const [dragTooltip, setDragTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    date: string;
    delta: string;
  }>({ visible: false, x: 0, y: 0, date: "", delta: "" });

  // Drill-down navigation state
  const [focusedTaskStack, setFocusedTaskStack] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Initialize with centered scroll position
  const centerOffset = -(12 / 2) * 120; // Center the viewport
  const [scrollOffset, setScrollOffset] = useState(centerOffset);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, scrollLeft: 0 });

  // Scroll detection for smooth transitions
  const [isScrolling, setIsScrolling] = useState(false);
  const [isMouseDragging, setIsMouseDragging] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const scrollEndTimeout = useRef<NodeJS.Timeout | null>(null);

  // Fixed viewport configuration for beautiful UI
  const COLUMN_WIDTH = 120; // Fixed column width for perfect spacing
  const VISIBLE_COLUMNS = 12; // Always show 12 columns like in the dribbble design
  const VIEWPORT_WIDTH = COLUMN_WIDTH * VISIBLE_COLUMNS;

  // Status options for context menu
  const statusOptions = [
    { label: "To Do", value: "To Do", icon: Circle },
    { label: "In Progress", value: "In Progress", icon: Clock },
    { label: "In Review", value: "In Review", icon: Search },
    { label: "Blocked", value: "Blocked", icon: AlertCircle },
    { label: "Completed", value: "Completed", icon: CheckCircle },
  ];

  // Handle status update
  const handleUpdateTaskStatus = useCallback(
    (taskId: string, status: string) => {
      console.log("Updating task status:", { taskId, status });
      onUpdateTaskStatus?.(taskId, status);
    },
    [onUpdateTaskStatus]
  );

  // Container refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(VIEWPORT_WIDTH);

  // Dynamic date generation based on scroll position
  const generateTimeUnits = useCallback(() => {
    const startIndex = Math.floor(scrollOffset / COLUMN_WIDTH);
    const buffer = 10; // Generate extra columns for smooth scrolling

    const units = [];
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
      units.push({ date, index: i });
    }
    return units;
  }, [scrollOffset, currentDate, zoomLevel]);

  const timeUnits = useMemo(() => generateTimeUnits(), [generateTimeUnits]);

  // Memoized month headers for smooth hardware-accelerated scrolling in day view
  const monthHeaders = useMemo(() => {
    if (zoomLevel !== "day") return [];

    const headers: Array<{
      monthKey: string;
      left: number;
      width: number;
      date: Date;
    }> = [];
    const processedMonths = new Set<string>();

    // Use a rounded scroll offset to reduce unnecessary recalculations
    const roundedScrollOffset =
      Math.floor(scrollOffset / (COLUMN_WIDTH / 4)) * (COLUMN_WIDTH / 4);
    const startIndex = Math.floor(roundedScrollOffset / COLUMN_WIDTH);
    const buffer = 30; // Larger buffer for month calculations

    // Create a map to track month boundaries
    const monthData: {
      [key: string]: { start: number; end: number; date: Date };
    } = {};

    // First pass: identify all month boundaries
    for (
      let i = startIndex - buffer;
      i < startIndex + VISIBLE_COLUMNS + buffer;
      i++
    ) {
      const date = addDays(currentDate, i);
      const absoluteLeft = i * COLUMN_WIDTH;
      const monthKey = format(date, "MMM-yyyy");

      if (!monthData[monthKey]) {
        monthData[monthKey] = {
          start: absoluteLeft,
          end: absoluteLeft + COLUMN_WIDTH,
          date,
        };
      } else {
        monthData[monthKey].end = absoluteLeft + COLUMN_WIDTH;
      }
    }

    // Second pass: create headers from month data
    Object.entries(monthData).forEach(([monthKey, data]) => {
      const width = data.end - data.start;

      // Only include months that have reasonable width
      if (width >= COLUMN_WIDTH) {
        headers.push({
          monthKey,
          left: data.start,
          width,
          date: data.date,
        });
      }
    });

    // Sort headers by left position to ensure proper rendering order
    return headers.sort((a, b) => a.left - b.left);
  }, [
    currentDate,
    zoomLevel,
    Math.floor(scrollOffset / (COLUMN_WIDTH / 4)),
    containerWidth,
  ]);

  // Calculate date range for task filtering
  const visibleDateRange = useMemo(() => {
    const firstVisibleIndex = Math.floor(scrollOffset / COLUMN_WIDTH);
    const lastVisibleIndex = firstVisibleIndex + VISIBLE_COLUMNS;

    let start: Date, end: Date;
    switch (zoomLevel) {
      case "day":
        start = addDays(currentDate, firstVisibleIndex - 5);
        end = addDays(currentDate, lastVisibleIndex + 5);
        break;
      case "week":
        start = startOfWeek(addWeeks(currentDate, firstVisibleIndex - 5), {
          weekStartsOn: 1,
        });
        end = endOfWeek(addWeeks(currentDate, lastVisibleIndex + 5), {
          weekStartsOn: 1,
        });
        break;
      case "month":
        start = startOfMonth(addMonths(currentDate, firstVisibleIndex - 5));
        end = endOfMonth(addMonths(currentDate, lastVisibleIndex + 5));
        break;
      case "year":
        start = startOfYear(addYears(currentDate, firstVisibleIndex - 5));
        end = endOfYear(addYears(currentDate, lastVisibleIndex + 5));
        break;
    }
    return { start, end };
  }, [scrollOffset, currentDate, zoomLevel]);

  // Process tasks for timeline display
  const processedTasks = useMemo(() => {
    if (!tasks?.length) return [];

    let tasksToShow: Task[];

    // If we're in drill-down mode, show only subtasks of the focused task
    if (focusedTaskStack.length > 0) {
      const currentFocusedTaskId =
        focusedTaskStack[focusedTaskStack.length - 1].id;
      tasksToShow = tasks.filter(
        (task) => task.parentTaskId === currentFocusedTaskId
      );
    } else {
      // Normal mode: show only parent tasks (no parentTaskId)
      tasksToShow = tasks.filter((task) => !task.parentTaskId);
    }

    return tasksToShow
      .filter((task) => {
        // Filter tasks that are visible in current viewport
        const taskStart =
          task.createdAt instanceof Date
            ? task.createdAt
            : (task.createdAt as any)?.toDate?.() || new Date();
        const taskEnd =
          task.dueDate instanceof Date
            ? task.dueDate
            : (task.dueDate as any)?.toDate?.() || addDays(taskStart, 7);

        return (
          taskStart <= visibleDateRange.end && taskEnd >= visibleDateRange.start
        );
      })
      .map((task) => {
        const startDateTime =
          task.createdAt instanceof Date
            ? task.createdAt
            : (task.createdAt as any)?.toDate?.() || new Date();

        const dueDateTime =
          task.dueDate instanceof Date
            ? task.dueDate
            : (task.dueDate as any)?.toDate?.() || addDays(startDateTime, 7);

        const startDateDay = startOfDay(startDateTime);
        const dueDateDay = endOfDay(dueDateTime);

        // Status colors with beautiful gradients
        const statusClass =
          {
            Completed: "dark:bg-green-400/10 bg-green-600/10 border-0",
            "In Progress": "dark:bg-blue-400/10 bg-blue-600/10 border-0",
            Blocked: "dark:bg-red-400/10 bg-red-600/10 border-0",
            "In Review": "dark:bg-yellow-400/10 bg-yellow-600/10 border-0",
            "To Do": "dark:bg-zinc-400/10 bg-zinc-600/10 border-0",
          }[task.status] ||
          "bg-gradient-to-r from-zinc-400/20 to-zinc-500/30 border-0";

        // Priority colors
        const priorityColor =
          {
            High: "bg-red-500",
            Medium: "bg-yellow-500",
            Low: "bg-green-500",
          }[task.priority || "Low"] || "bg-zinc-400";

        // Delay calculation logic
        const today = new Date();
        const isOverdue = today > dueDateTime;

        let delayEndDate: Date;
        let delayDuration: number;
        let hasDelaySegment: boolean;

        if (task.status === "Completed") {
          // For completed tasks, use updatedAt as completion date
          const completedAt = task.updatedAt
            ? task.updatedAt instanceof Date
              ? task.updatedAt
              : (task.updatedAt as any)?.toDate?.()
            : null;

          if (completedAt && completedAt > dueDateTime) {
            // Check if completed on the same day as due date (to avoid timezone/time precision issues)
            const completedDay = startOfDay(completedAt);
            const dueDateOnlyDay = startOfDay(dueDateTime);

            if (completedDay.getTime() === dueDateOnlyDay.getTime()) {
              // Completed on the same day - consider it on time
              delayEndDate = dueDateDay;
              delayDuration = 0;
              hasDelaySegment = false;
            } else {
              // Task was completed late (different day) - show delay from due date to completion date
              delayEndDate = endOfDay(completedAt);
              delayDuration = differenceInDays(completedAt, dueDateTime);
              hasDelaySegment = true;
            }
          } else {
            // Task was completed on time
            delayEndDate = dueDateDay;
            delayDuration = 0;
            hasDelaySegment = false;
          }
        } else {
          // For ongoing tasks, check if they're past deadline
          if (isOverdue) {
            // Task is currently overdue - show delay from due date to today
            delayEndDate = endOfDay(today);
            delayDuration = differenceInDays(today, dueDateTime);
            hasDelaySegment = true;
          } else {
            // Task is not yet overdue
            delayEndDate = dueDateDay;
            delayDuration = 0;
            hasDelaySegment = false;
          }
        }

        return {
          ...task,
          startDateDay,
          dueDateDay,
          statusClass,
          priorityColor,
          isOverdue,
          delayEndDate,
          delayDuration,
          hasDelaySegment,
        } as ProcessedTask;
      });
  }, [tasks, visibleDateRange, focusedTaskStack]);

  // Linear.app style keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hoveredTaskId) return;

      const task = processedTasks.find((t) => t.id === hoveredTaskId);
      if (!task) return;

      // Prevent default for our shortcuts
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
      if (shortcuts.includes(e.key.toLowerCase())) {
        e.preventDefault();
      }

      switch (e.key.toLowerCase()) {
        case "enter":
          onTaskClick?.(hoveredTaskId);
          break;
        case "r":
          // Open context menu programmatically at 70% of task block width
          const taskElement = document.querySelector(
            `[data-task-id="${hoveredTaskId}"]`
          );
          if (taskElement) {
            const rect = taskElement.getBoundingClientRect();
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
        case "e":
          onEditTask?.(hoveredTaskId);
          break;
        case "c":
          onCreateSubtask?.(hoveredTaskId);
          break;
        case "s":
          const hasSubtasks = tasks.some(
            (t) => t.parentTaskId === hoveredTaskId
          );
          if (hasSubtasks) {
            // Handle show subtasks
            setFocusedTaskStack((prev) => [
              ...prev,
              { id: hoveredTaskId, name: task.name },
            ]);
          }
          break;
        case "d":
          // Small delay to ensure any open menus close before dialog opens
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
    processedTasks,
    onEditTask,
    onCreateSubtask,
    onDeleteTask,
    handleUpdateTaskStatus,
    tasks,
    setFocusedTaskStack,
  ]);

  // Calculate task position based on scroll offset
  const getTaskPosition = useCallback(
    (task: ProcessedTask) => {
      let startOffset: number;
      let duration: number;

      // ALWAYS use the original dueDateDay for the main task block position
      // The delay segment will be handled separately as an overlay
      const endDate = task.dueDateDay;

      switch (zoomLevel) {
        case "day":
          startOffset = differenceInDays(task.startDateDay, currentDate);
          duration = differenceInDays(endDate, task.startDateDay) + 1;
          break;
        case "week":
          // Calculate precise position within weeks
          const currentWeekStart = startOfWeek(currentDate, {
            weekStartsOn: 1,
          });
          const taskWeekStart = startOfWeek(task.startDateDay, {
            weekStartsOn: 1,
          });

          // Base week offset
          const weekOffset = differenceInWeeks(taskWeekStart, currentWeekStart);

          // Position within the start week (0-1 where 0 = Monday start, 1 = Sunday end)
          const dayInStartWeek = differenceInDays(
            task.startDateDay,
            taskWeekStart
          );
          const startPositionInWeek = dayInStartWeek / 7;

          // Calculate end position - add 1 day to include the due date visually
          const taskWeekEnd = startOfWeek(addDays(endDate, 1), {
            weekStartsOn: 1,
          });
          const endWeekOffset = differenceInWeeks(
            taskWeekEnd,
            currentWeekStart
          );
          const dayInEndWeek = differenceInDays(
            addDays(endDate, 1),
            taskWeekEnd
          );
          const endPositionInWeek = dayInEndWeek / 7;

          startOffset = weekOffset + startPositionInWeek;
          duration =
            endWeekOffset +
            endPositionInWeek -
            (weekOffset + startPositionInWeek);
          break;
        case "month":
          // Calculate precise position within months
          const currentMonthStart = startOfMonth(currentDate);
          const taskMonthStart = startOfMonth(task.startDateDay);

          // Base month offset
          const monthOffset = differenceInMonths(
            taskMonthStart,
            currentMonthStart
          );

          // Position within the start month (0-1)
          const dayInStartMonth = task.startDateDay.getDate() - 1; // 0-indexed
          const daysInStartMonth = new Date(
            task.startDateDay.getFullYear(),
            task.startDateDay.getMonth() + 1,
            0
          ).getDate();
          const startPositionInMonth = dayInStartMonth / daysInStartMonth;

          // Calculate end position - add 1 day to include the due date visually
          const dueDatePlusOne = addDays(endDate, 1);
          const taskMonthEnd = startOfMonth(dueDatePlusOne);
          const endMonthOffset = differenceInMonths(
            taskMonthEnd,
            currentMonthStart
          );
          const dayInEndMonth = dueDatePlusOne.getDate() - 1;
          const daysInEndMonth = new Date(
            dueDatePlusOne.getFullYear(),
            dueDatePlusOne.getMonth() + 1,
            0
          ).getDate();
          const endPositionInMonth = dayInEndMonth / daysInEndMonth;

          startOffset = monthOffset + startPositionInMonth;
          duration =
            endMonthOffset +
            endPositionInMonth -
            (monthOffset + startPositionInMonth);
          break;
        case "year":
          startOffset = differenceInYears(task.startDateDay, currentDate);
          duration = differenceInYears(endDate, task.startDateDay) + 1;
          break;
      }

      const left = startOffset * COLUMN_WIDTH - scrollOffset;
      const width = Math.max(duration * COLUMN_WIDTH, COLUMN_WIDTH * 0.1); // Smaller minimum for precise positioning

      return { left, width };
    },
    [currentDate, zoomLevel, scrollOffset]
  );

  // Calculate delayed segment position for overdue tasks
  const getDelayedSegmentPosition = useCallback(
    (task: ProcessedTask) => {
      if (!task.hasDelaySegment) return null;

      // Get the main task position first
      const mainTaskPosition = getTaskPosition(task);

      // The delay segment should start exactly where the main task ends
      const delayLeft = mainTaskPosition.left + mainTaskPosition.width;

      // Calculate delay width based on the actual time difference and zoom level
      let delayWidth: number;

      switch (zoomLevel) {
        case "day":
          // For day view, each day gets a full column
          const daysDiff = differenceInDays(task.delayEndDate, task.dueDateDay);
          delayWidth = daysDiff * COLUMN_WIDTH;
          break;
        case "week":
          // For week view, calculate fractional weeks
          const totalDaysInWeek = differenceInDays(
            task.delayEndDate,
            task.dueDateDay
          );
          delayWidth = (totalDaysInWeek / 7) * COLUMN_WIDTH;
          break;
        case "month":
          // For month view, calculate fractional months
          const totalDaysInMonth = differenceInDays(
            task.delayEndDate,
            task.dueDateDay
          );
          const avgDaysInMonth = 30.44; // Average days in a month
          delayWidth = (totalDaysInMonth / avgDaysInMonth) * COLUMN_WIDTH;
          break;
        case "year":
          // For year view, calculate fractional years
          const totalDaysInYear = differenceInDays(
            task.delayEndDate,
            task.dueDateDay
          );
          delayWidth = (totalDaysInYear / 365.25) * COLUMN_WIDTH;
          break;
        default:
          delayWidth = COLUMN_WIDTH * 0.1;
      }

      // Ensure minimum width
      delayWidth = Math.max(delayWidth, COLUMN_WIDTH * 0.1);

      return { left: delayLeft, width: delayWidth };
    },
    [currentDate, zoomLevel, scrollOffset, getTaskPosition]
  );

  // Refs for smooth scrolling optimization
  const scrollRef = useRef<number>(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateTimeRef = useRef<number>(0);

  // Smooth scrolling with mouse/touch - optimized with throttling
  const handleWheel = useCallback((e: WheelEvent) => {
    const { deltaX, deltaY, shiftKey } = e;

    // Smart gesture detection for butter smooth horizontal scrolling
    const isHorizontalIntent =
      shiftKey || // Shift + wheel = always horizontal
      Math.abs(deltaX) > Math.abs(deltaY) || // Trackpad horizontal swipe
      (Math.abs(deltaX) > 0 && Math.abs(deltaY) < 5); // Primarily horizontal movement

    if (isHorizontalIntent) {
      // Handle horizontal timeline scrolling with butter smooth performance
      e.preventDefault();

      // Mark scrolling started - debounce to detect when scrolling ends
      setIsScrolling(true);
      if (scrollEndTimeout.current) clearTimeout(scrollEndTimeout.current);
      scrollEndTimeout.current = setTimeout(() => setIsScrolling(false), 150);

      const delta = deltaX || deltaY;
      scrollRef.current += delta;

      const now = performance.now();
      // Throttle updates to ~60fps max for buttery smooth scrolling
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
    }
    // If it's primarily vertical scrolling, let the browser handle it naturally
    // This allows scrolling through tasks and content below the timeline
  }, []);

  // Touch/mouse drag scrolling - optimized
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return; // Don't interfere with task dragging
      setIsDragging(true);
      setIsMouseDragging(true);
      setDragStart({
        x: e.clientX,
        scrollLeft: scrollRef.current || scrollOffset,
      });
    },
    [scrollOffset]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const x = e.clientX;
      const walk = (x - dragStart.x) * 2; // Scroll speed multiplier

      scrollRef.current = dragStart.scrollLeft - walk;

      const now = performance.now();
      // Throttle updates to ~60fps max
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
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsMouseDragging(false);
  }, []);

  // Navigation functions - optimized with requestAnimationFrame
  const handlePrevious = () => {
    scrollRef.current = (scrollRef.current || scrollOffset) - COLUMN_WIDTH * 3;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      setScrollOffset(scrollRef.current);
      animationFrameRef.current = undefined;
    });
  };

  const handleNext = () => {
    scrollRef.current = (scrollRef.current || scrollOffset) + COLUMN_WIDTH * 3;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      setScrollOffset(scrollRef.current);
      animationFrameRef.current = undefined;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    // Center today in the viewport instead of starting from left
    const centerOffset = -(VISIBLE_COLUMNS / 2) * COLUMN_WIDTH;
    scrollRef.current = centerOffset;
    setScrollOffset(centerOffset);
  };

  // Load user preference on mount
  useEffect(() => {
    const savedZoomLevel = localStorage.getItem(
      "timeline-zoom-level"
    ) as ZoomLevel;
    if (
      savedZoomLevel &&
      ["day", "week", "month", "year"].includes(savedZoomLevel)
    ) {
      setZoomLevel(savedZoomLevel);
    }

    // Initialize scrollRef to match the centered scrollOffset
    scrollRef.current = centerOffset;
  }, []);

  // Update checkbox state when zoom level changes
  useEffect(() => {
    const savedZoomLevel = localStorage.getItem(
      "timeline-zoom-level"
    ) as ZoomLevel;
    setSaveAsDefault(savedZoomLevel === zoomLevel);
  }, [zoomLevel]);

  // Handle task click - distinguish between title click and block click
  const handleTaskBlockClick = useCallback(
    (task: ProcessedTask, event: React.MouseEvent) => {
      // Don't navigate if we just finished dragging
      if (justFinishedDragging) {
        setJustFinishedDragging(false);
        return;
      }

      // Block click should NOT navigate to task page
      // Only title click should navigate
    },
    [justFinishedDragging]
  );

  // Handle task resizing
  const handleTaskResizeStart = useCallback(
    (
      taskId: string,
      type: "resize-start" | "resize-end",
      event: React.MouseEvent
    ) => {
      event.stopPropagation();
      const task = processedTasks.find((t) => t.id === taskId);
      if (!task) return;

      setDragState({
        taskId,
        type,
        startX: event.clientX,
        originalStart: task.startDateDay,
        originalEnd: task.dueDateDay,
        currentDelta: 0,
        pixelDelta: 0,
      });
    },
    [processedTasks]
  );

  // Helper function to calculate precise date from pixel position
  const getDateFromPixelPosition = useCallback(
    (pixelX: number, baseDate: Date) => {
      const columnIndex = Math.floor(pixelX / COLUMN_WIDTH);
      const pixelWithinColumn = pixelX % COLUMN_WIDTH;
      const fractionWithinColumn = pixelWithinColumn / COLUMN_WIDTH;

      switch (zoomLevel) {
        case "day":
          // Each column is 1 day, fraction represents hours
          const hours = Math.round(fractionWithinColumn * 24);
          return addDays(addDays(baseDate, columnIndex), hours / 24);

        case "week":
          // Each column is 1 week, fraction represents days within week
          const daysInWeek = Math.round(fractionWithinColumn * 7);
          const weekStart = startOfWeek(addWeeks(baseDate, columnIndex), {
            weekStartsOn: 1,
          });
          return addDays(weekStart, daysInWeek);

        case "month":
          // Each column is 1 month, fraction represents days within month
          const monthDate = addMonths(baseDate, columnIndex);
          const daysInMonth = new Date(
            monthDate.getFullYear(),
            monthDate.getMonth() + 1,
            0
          ).getDate();
          const dayInMonth = Math.round(fractionWithinColumn * daysInMonth);
          return addDays(startOfMonth(monthDate), dayInMonth);

        case "year":
          // Each column is 1 year, fraction represents days within year
          const yearDate = addYears(baseDate, columnIndex);
          const daysInYear =
            new Date(yearDate.getFullYear(), 11, 31).getDate() === 31
              ? 366
              : 365;
          const dayInYear = Math.round(fractionWithinColumn * daysInYear);
          return addDays(startOfYear(yearDate), dayInYear);

        default:
          return addDays(baseDate, columnIndex + fractionWithinColumn);
      }
    },
    [zoomLevel, COLUMN_WIDTH]
  );

  const handleTaskResizeMove = useCallback(
    (event: MouseEvent) => {
      if (!dragState) return;

      event.preventDefault();
      const deltaX = event.clientX - dragState.startX;

      // Calculate precise fractional days for different zoom levels
      let fractionalDays: number;

      switch (zoomLevel) {
        case "day":
          fractionalDays = deltaX / COLUMN_WIDTH;
          break;
        case "week":
          // For week view: each pixel = 7 days / COLUMN_WIDTH
          fractionalDays = (deltaX / COLUMN_WIDTH) * 7;
          break;
        case "month":
          // For month view: each pixel = ~30 days / COLUMN_WIDTH
          fractionalDays = (deltaX / COLUMN_WIDTH) * 30;
          break;
        case "year":
          // For year view: each pixel = ~365 days / COLUMN_WIDTH
          fractionalDays = (deltaX / COLUMN_WIDTH) * 365;
          break;
        default:
          fractionalDays = deltaX / COLUMN_WIDTH;
      }

      // Use fractional days for smooth calculation, round only for final day count
      const deltaDays = Math.round(fractionalDays);

      // Auto-scroll when near viewport edges during drag
      const viewportPadding = 100;
      const scrollSpeed = 10;

      if (event.clientX < viewportPadding) {
        scrollRef.current -= scrollSpeed;
        setScrollOffset(scrollRef.current);
      } else if (event.clientX > containerWidth - viewportPadding) {
        scrollRef.current += scrollSpeed;
        setScrollOffset(scrollRef.current);
      }

      // Calculate the new date for tooltip using fractional positioning
      let newDate: Date;
      let deltaText: string;

      if (dragState.type === "resize-start") {
        // Use fractional days for precise positioning
        const exactDays = Math.floor(fractionalDays);
        const fractionalPart = fractionalDays - exactDays;
        newDate = addDays(dragState.originalStart, exactDays);
        if (fractionalPart > 0.5) {
          newDate = addDays(newDate, 1); // Round up if more than halfway through the day
        }
        deltaText =
          deltaDays > 0
            ? `(+${deltaDays} days)`
            : deltaDays < 0
              ? `(${deltaDays} days)`
              : "";
      } else {
        const exactDays = Math.floor(fractionalDays);
        const fractionalPart = fractionalDays - exactDays;
        newDate = addDays(dragState.originalEnd, exactDays);
        if (fractionalPart > 0.5) {
          newDate = addDays(newDate, 1);
        }
        deltaText =
          deltaDays > 0
            ? `(+${deltaDays} days)`
            : deltaDays < 0
              ? `(${deltaDays} days)`
              : "";
      }

      // Update drag tooltip
      setDragTooltip({
        visible: true,
        x: event.clientX + 10,
        y: event.clientY - 40,
        date: format(newDate, "MMM d, yyyy"),
        delta: deltaText,
      });

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentDelta: deltaDays,
              pixelDelta: deltaX,
            }
          : null
      );
    },
    [dragState, COLUMN_WIDTH, containerWidth, zoomLevel]
  );

  const handleTaskResizeEnd = useCallback(() => {
    if (!dragState) return;

    const task = processedTasks.find((t) => t.id === dragState.taskId);
    if (!task || dragState.currentDelta === 0) {
      setDragState(null);
      setDragTooltip({ visible: false, x: 0, y: 0, date: "", delta: "" });
      return;
    }

    let newStart = dragState.originalStart;
    let newEnd = dragState.originalEnd;

    if (dragState.type === "resize-start") {
      newStart = addDays(dragState.originalStart, dragState.currentDelta);
      // Ensure start doesn't go past end
      if (newStart >= newEnd) {
        newStart = addDays(newEnd, -1);
      }
    } else if (dragState.type === "resize-end") {
      newEnd = addDays(dragState.originalEnd, dragState.currentDelta);
      // Ensure end doesn't go before start
      if (newEnd <= newStart) {
        newEnd = addDays(newStart, 1);
      }
    }

    onUpdateTaskDates?.(dragState.taskId, newStart, newEnd);
    setDragState(null);
    setDragTooltip({ visible: false, x: 0, y: 0, date: "", delta: "" });
    setJustFinishedDragging(true);

    // Reset the flag after a short delay
    setTimeout(() => setJustFinishedDragging(false), 100);
  }, [dragState, processedTasks, onUpdateTaskDates]);

  // Context menu handlers
  const handleShowSubtasks = useCallback(
    (task: ProcessedTask) => {
      const hasSubtasks = tasks.some((t) => t.parentTaskId === task.id);
      if (hasSubtasks) {
        setFocusedTaskStack((prev) => [
          ...prev,
          { id: task.id, name: task.name },
        ]);
      }
    },
    [tasks]
  );

  const handleCreateSubtask = useCallback(
    (taskId: string) => {
      onCreateSubtask?.(taskId);
    },
    [onCreateSubtask]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      onDeleteTask?.(taskId);
    },
    [onDeleteTask]
  );

  // Ensure Radix context menus are closed before opening any modal/dialog to avoid aria-hidden/focus trap conflicts
  const closeContextMenuThen = useCallback((action: () => void) => {
    // Close any open context or dropdown menu by simulating Escape
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    } catch {}
    // Small delay lets Radix unmount the menu before opening another layer
    setTimeout(() => {
      action();
    }, 50);
  }, []);

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = useCallback((index: number) => {
    if (index === -1) {
      // Return to main view
      setFocusedTaskStack([]);
    } else {
      // Navigate to specific level
      setFocusedTaskStack((prev) => prev.slice(0, index + 1));
    }
  }, []);

  // Handle zoom level change with optional save to localStorage
  const handleZoomLevelChange = (newZoomLevel: ZoomLevel) => {
    // Clear all scroll states to ensure transitions work during zoom
    setIsScrolling(false);
    setIsMouseDragging(false);
    setIsZooming(true);
    if (scrollEndTimeout.current) {
      clearTimeout(scrollEndTimeout.current);
    }

    setZoomLevel(newZoomLevel);

    // Clear zoom state after transition completes
    setTimeout(() => setIsZooming(false), 300);
    // Don't automatically save here - let the checkbox state handle it
  };
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Aggressive event capture for smooth timeline scrolling - prevents event bubbling
    container.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove, {
        passive: false,
      });
      document.addEventListener("mouseup", handleMouseUp, { passive: false });
    }

    if (dragState) {
      document.addEventListener("mousemove", handleTaskResizeMove, {
        passive: false,
      });
      document.addEventListener("mouseup", handleTaskResizeEnd, {
        passive: false,
      });
    }

    return () => {
      container.removeEventListener("wheel", handleWheel, true);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousemove", handleTaskResizeMove);
      document.removeEventListener("mouseup", handleTaskResizeEnd);

      // Cleanup animation frame and scroll timeout on unmount
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (scrollEndTimeout.current) {
        clearTimeout(scrollEndTimeout.current);
      }
    };
  }, [
    handleWheel,
    handleMouseMove,
    handleMouseUp,
    handleTaskResizeMove,
    handleTaskResizeEnd,
    isDragging,
    dragState,
  ]);

  // Sync scrollRef with scrollOffset state
  useEffect(() => {
    scrollRef.current = scrollOffset;
  }, [scrollOffset]);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (timelineRef.current) {
        setContainerWidth(timelineRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    switch (zoomLevel) {
      case "day":
        return format(date, "EEE d");
      case "week":
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
        return `${format(weekStart, "MMM d")}-${format(weekEnd, "d")}`;
      case "month":
        return format(date, "MMM");
      case "year":
        return format(date, "yyyy");
    }
  };

  return (
    <div style={{ margin: "-24px", height: "100vh" }}>
      <style jsx>{`
        .timeline-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .timeline-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .timeline-scrollbar::-webkit-scrollbar-thumb {
          background: rgb(148 163 184 / 0.3);
          border-radius: 3px;
          border: none;
        }
        .timeline-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgb(148 163 184 / 0.5);
        }
        .timeline-scrollbar::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>
      <TooltipProvider>
        <div
          className="gantt-timeline bg-background border-t rounded-none overflow-hidden w-full h-full flex flex-col"
          ref={timelineRef}
        >
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 border-b bg-muted/20">
            {/* Navigation breadcrumb */}
            <div className="flex items-center gap-2">
              {focusedTaskStack.length > 0 ? (
                <div className="flex items-center gap-2">
                  {/* Back to main button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBreadcrumbClick(-1)}
                    className="text-xs"
                  >
                    ← All Tasks
                  </Button>

                  {/* Breadcrumb trail */}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    {focusedTaskStack.map((task, index) => (
                      <div key={task.id} className="flex items-center gap-1">
                        <span>/</span>
                        <button
                          onClick={() => handleBreadcrumbClick(index)}
                          className="hover:text-foreground underline"
                        >
                          {task.name}
                        </button>
                      </div>
                    ))}
                  </div>

                  <Badge variant="secondary" className="ml-2">
                    Level {focusedTaskStack.length}
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleToday}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Today
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Select value={zoomLevel} onValueChange={handleZoomLevelChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day View</SelectItem>
                  <SelectItem value="week">Week View</SelectItem>
                  <SelectItem value="month">Month View</SelectItem>
                  <SelectItem value="year">Year View</SelectItem>
                  <Separator className="my-2" />
                  <div
                    className="flex items-center space-x-2 px-2 py-1.5"
                    onClick={(e) => e.stopPropagation()} // Prevent Select from closing
                  >
                    <Checkbox
                      id="save-default"
                      checked={saveAsDefault}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // Save current zoom level as default
                          localStorage.setItem(
                            "timeline-zoom-level",
                            zoomLevel
                          );
                          setSaveAsDefault(true);
                        } else {
                          // Remove saved default
                          localStorage.removeItem("timeline-zoom-level");
                          setSaveAsDefault(false);
                        }
                      }}
                    />
                    <label
                      htmlFor="save-default"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Save as my default
                    </label>
                  </div>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleZoomLevelChange(
                    zoomLevel === "year"
                      ? "year"
                      : zoomLevel === "month"
                        ? "year"
                        : zoomLevel === "week"
                          ? "month"
                          : "week"
                  )
                }
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleZoomLevelChange(
                    zoomLevel === "day"
                      ? "day"
                      : zoomLevel === "week"
                        ? "day"
                        : zoomLevel === "month"
                          ? "week"
                          : "month"
                  )
                }
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Timeline Viewport - PERFECTLY CONTAINED */}
          <div
            ref={scrollContainerRef}
            className="relative flex-1 w-full overflow-auto cursor-grab active:cursor-grabbing timeline-scrollbar"
            onMouseDown={handleMouseDown}
            style={{
              userSelect: "none",
              // Minimalist scrollbar styling
              scrollbarWidth: "thin",
              scrollbarColor: "rgb(148 163 184 / 0.3) transparent",
            }}
          >
            {/* Time Header - Fixed Position */}
            <div className="absolute top-0 left-0 right-0 z-30 bg-background border-b">
              {/* Month header for day view - Hardware Accelerated */}
              {zoomLevel === "day" && (
                <div className="h-8 border-b border-border/30 bg-muted/10">
                  <div className="relative h-full overflow-hidden">
                    {monthHeaders.map((header, index) => {
                      // Calculate the visible position by subtracting scroll offset
                      const visibleLeft = header.left - scrollOffset;
                      const visibleRight = visibleLeft + header.width;

                      // Only render if any part of the month header is visible
                      if (
                        visibleRight < -COLUMN_WIDTH ||
                        visibleLeft > containerWidth + COLUMN_WIDTH
                      ) {
                        return null;
                      }

                      // Calculate the visible portion of the header
                      const clampedLeft = Math.max(0, visibleLeft);
                      const clampedRight = Math.min(
                        containerWidth,
                        visibleRight
                      );
                      const clampedWidth = clampedRight - clampedLeft;

                      // Don't render if the clamped width is too small to be useful
                      if (clampedWidth < 40) return null;

                      return (
                        <div
                          key={`${header.monthKey}-${index}`}
                          className="absolute top-0 flex items-center justify-center h-8 text-xs font-medium text-muted-foreground bg-muted/5 border-r border-border/20"
                          style={{
                            transform: `translateX(${clampedLeft}px)`,
                            width: `${clampedWidth}px`,
                            willChange: "transform",
                          }}
                        >
                          <span className="truncate px-2">
                            {format(header.date, "MMMM yyyy")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Day/Week/Month/Year headers - Hardware Accelerated */}
              <div
                className={cn(
                  "relative",
                  zoomLevel === "day" ? "h-12" : "h-16"
                )}
              >
                {timeUnits.map((unit) => {
                  const left = unit.index * COLUMN_WIDTH - scrollOffset;
                  if (
                    left < -COLUMN_WIDTH ||
                    left > containerWidth + COLUMN_WIDTH
                  )
                    return null;

                  const today = new Date();

                  return (
                    <div
                      key={unit.index}
                      className={cn(
                        "absolute top-0 flex items-center justify-center border-r border-border/20 text-sm font-medium",
                        zoomLevel === "day" ? "h-12" : "h-16",
                        // Highlight current time period
                        (zoomLevel === "day" && isToday(unit.date)) ||
                          (zoomLevel === "week" &&
                            startOfWeek(today, {
                              weekStartsOn: 1,
                            }).getTime() ===
                              startOfWeek(unit.date, {
                                weekStartsOn: 1,
                              }).getTime()) ||
                          (zoomLevel === "month" &&
                            format(today, "MMM yyyy") ===
                              format(unit.date, "MMM yyyy")) ||
                          (zoomLevel === "year" &&
                            today.getFullYear() === unit.date.getFullYear())
                          ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                          : ""
                      )}
                      style={{
                        transform: `translateX(${left}px)`,
                        width: `${COLUMN_WIDTH}px`,
                        willChange: "transform", // GPU acceleration hint
                      }}
                    >
                      {formatDate(unit.date)}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Today Indicator */}
            {(() => {
              const today = new Date();
              let todayOffset: number;

              switch (zoomLevel) {
                case "day":
                  // For day view, include time of day for precise positioning
                  const todayStartOfDay = startOfDay(today);
                  const currentDateStartOfDay = startOfDay(currentDate);
                  const dayOffset = differenceInDays(
                    todayStartOfDay,
                    currentDateStartOfDay
                  );

                  // Calculate time within the day (0-1 fraction)
                  const timeWithinDay =
                    (today.getHours() * 60 + today.getMinutes()) / (24 * 60);
                  todayOffset = dayOffset + timeWithinDay;
                  break;
                case "week":
                  // For week view, we need to find which column (week) today belongs to
                  // Each column represents a week starting from currentDate's week + i
                  const currentDateWeekStart = startOfWeek(currentDate, {
                    weekStartsOn: 1,
                  });
                  const todayWeekStart = startOfWeek(today, {
                    weekStartsOn: 1,
                  });

                  // Find which week column today belongs to
                  const weekDifference = differenceInWeeks(
                    todayWeekStart,
                    currentDateWeekStart
                  );

                  // Calculate position within that week (0-1 where 0 = Monday, 1 = Sunday)
                  const dayOfWeek = (today.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
                  const positionInWeek = dayOfWeek / 7;

                  // Add small offset to include today visually (similar to task blocks)
                  const todayPlusOne = addDays(today, 1);
                  const todayPlusOneWeekStart = startOfWeek(todayPlusOne, {
                    weekStartsOn: 1,
                  });
                  const adjustedWeekDifference = differenceInWeeks(
                    todayPlusOneWeekStart,
                    currentDateWeekStart
                  );
                  const adjustedDayOfWeek = (todayPlusOne.getDay() + 6) % 7;
                  const adjustedPositionInWeek = adjustedDayOfWeek / 7;

                  todayOffset = adjustedWeekDifference + adjustedPositionInWeek;
                  break;
                case "month":
                  // For month view, add 1 day to include today visually (similar to task blocks)
                  const todayPlusOneForMonth = addDays(today, 1);
                  todayOffset = differenceInMonths(
                    todayPlusOneForMonth,
                    currentDate
                  );
                  break;
                case "year":
                  todayOffset = differenceInYears(today, currentDate);
                  break;
              }

              const todayPosition =
                todayOffset * COLUMN_WIDTH - scrollOffset + 1; // Add 1px offset

              // Only show today indicator if it's within the visible area
              if (
                todayPosition < -COLUMN_WIDTH ||
                todayPosition > containerWidth + COLUMN_WIDTH
              ) {
                return null;
              }

              return (
                <div
                  className={cn(
                    "absolute w-px bg-blue-500 z-20 pointer-events-none",
                    zoomLevel === "day" ? "top-20" : "top-16"
                  )}
                  style={{
                    left: `${todayPosition}px`,
                    minHeight: `${Math.max(processedTasks.length * 70 + 80, 600)}px`, // Same as grid lines
                  }}
                />
              );
            })()}{" "}
            {/* Grid Lines - Hardware Accelerated */}
            <div
              className={cn(
                "absolute left-0 right-0 bottom-0",
                zoomLevel === "day" ? "top-20" : "top-16"
              )}
              style={{
                minHeight: `${Math.max(processedTasks.length * 70 + 80, 600)}px`, // Ensure coverage of both viewport AND tasks
              }}
            >
              {timeUnits.map((unit) => {
                const left = unit.index * COLUMN_WIDTH - scrollOffset;
                if (
                  left < -COLUMN_WIDTH ||
                  left > containerWidth + COLUMN_WIDTH
                )
                  return null;

                return (
                  <div
                    key={`grid-${unit.index}`}
                    className="absolute top-0 bottom-0 w-px bg-transparent border-r border-dashed border-border/75"
                    style={{
                      transform: `translateX(${left + COLUMN_WIDTH}px)`,
                      willChange: "transform", // GPU acceleration hint
                    }}
                  />
                );
              })}
            </div>
            {/* Task Bars */}
            <div
              className={cn(
                "absolute left-0 right-0 pb-8",
                zoomLevel === "day" ? "top-24" : "top-20"
              )}
              style={{
                minHeight: `${Math.max(processedTasks.length * 64 + 16, 200)}px`, // Dynamic height based on task count
              }}
            >
              {processedTasks.map((task, index) => {
                const { left, width } = getTaskPosition(task);
                const hasSubtasks = tasks.some(
                  (t) => t.parentTaskId === task.id
                );

                // Calculate drag preview dimensions with smooth pixel-based movement
                let previewLeft = left;
                let previewWidth = width;

                if (dragState && dragState.taskId === task.id) {
                  // Use pixelDelta for smooth real-time preview with zoom-level scaling
                  let scaledPixelDelta = dragState.pixelDelta;

                  // Scale the pixel delta based on zoom level for accurate preview
                  switch (zoomLevel) {
                    case "week":
                      scaledPixelDelta = dragState.pixelDelta; // 1:1 for week view
                      break;
                    case "month":
                      scaledPixelDelta = dragState.pixelDelta; // 1:1 for month view
                      break;
                    case "year":
                      scaledPixelDelta = dragState.pixelDelta; // 1:1 for year view
                      break;
                    default:
                      scaledPixelDelta = dragState.pixelDelta;
                  }

                  if (dragState.type === "resize-start") {
                    previewLeft = left + scaledPixelDelta;
                    previewWidth = width - scaledPixelDelta;
                  } else if (dragState.type === "resize-end") {
                    previewWidth = width + scaledPixelDelta;
                  }
                }

                return (
                  <ContextMenu key={task.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "absolute h-14 border cursor-default group hover:shadow-lg backdrop-blur-[5px] z-30",
                          // Conditional border radius for seamless connection with delay segments
                          task.hasDelaySegment ? "rounded-l-xl" : "rounded-xl",
                          // Smart transitions: FORCE during zoom, disable during scrolling/dragging
                          (isZooming ||
                            (!isMouseDragging &&
                              !isScrolling &&
                              dragState?.taskId !== task.id)) &&
                            "transition-all duration-200",
                          task.statusClass,
                          dragState?.taskId === task.id &&
                            "ring-2 ring-blue-500 ring-opacity-50"
                        )}
                        style={{
                          left: `${previewLeft}px`,
                          width: `${Math.max(previewWidth, zoomLevel === "year" ? COLUMN_WIDTH * 0.3 : COLUMN_WIDTH * 0.1)}px`, // Different minimum width based on zoom
                          top: `${index * 70 + 8}px`,
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1' numOctaves='1' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.03'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                          backgroundBlendMode: "overlay",
                        }}
                        data-task-id={task.id}
                        onMouseEnter={() => setHoveredTaskId(task.id)}
                        onMouseLeave={() => setHoveredTaskId(null)}
                        onClick={(e) => handleTaskBlockClick(task, e)}
                      >
                        {/* Task Content */}
                        <div className="flex items-center h-full px-3 gap-2 relative">
                          {/* Left resize handle - Hidden in year view */}
                          {zoomLevel !== "year" && (
                            <div
                              className="absolute left-0 top-1 bottom-1 w-1.5 cursor-ew-resize bg-transparent hover:bg-blue-500/20 transition-colors z-40 group rounded-l"
                              onMouseDown={(e) =>
                                handleTaskResizeStart(
                                  task.id,
                                  "resize-start",
                                  e
                                )
                              }
                            >
                              <div className="w-0.5 h-full bg-transparent group-hover:bg-blue-500 transition-colors" />
                            </div>
                          )}

                          <div
                            className={cn(
                              "w-1 h-8 rounded-full ml-1",
                              task.priorityColor
                            )}
                          />
                          <span className="text-sm font-medium truncate flex-1">
                            {task.name}
                          </span>

                          {task.assignedUsers &&
                            task.assignedUsers.length > 0 && (
                              <div className="flex -space-x-1">
                                {task.assignedUsers.slice(0, 2).map((user) => (
                                  <Avatar
                                    key={user.id}
                                    className="h-6 w-6 border border-background"
                                  >
                                    <AvatarImage
                                      src={user.avatarUrl ?? undefined}
                                    />
                                    <AvatarFallback className="text-xs">
                                      {user.name?.[0]?.toUpperCase() ?? "U"}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                                {task.assignedUsers.length > 2 && (
                                  <div className="h-6 w-6 bg-muted border border-background rounded-full flex items-center justify-center text-xs">
                                    +{task.assignedUsers.length - 2}
                                  </div>
                                )}
                              </div>
                            )}

                          {/* Right resize handle - Hidden in year view */}
                          {zoomLevel !== "year" && (
                            <div
                              className="absolute right-0 top-1 bottom-1 w-1.5 cursor-ew-resize bg-transparent hover:bg-blue-500/20 transition-colors z-40 group rounded-r"
                              onMouseDown={(e) =>
                                handleTaskResizeStart(task.id, "resize-end", e)
                              }
                            >
                              <div className="w-0.5 h-full bg-transparent group-hover:bg-blue-500 transition-colors ml-1" />
                            </div>
                          )}
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent
                      className="w-48 z-50 backdrop-blur-[5px] dark:bg-black/10"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1' numOctaves='1' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.03'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        backgroundBlendMode: "overlay",
                      }}
                      onKeyDown={(e) => {
                        // Handle keyboard shortcuts when context menu is open
                        const key = e.key.toLowerCase();

                        // Prevent default behavior and close menu after action
                        const executeAndClose = (action: () => void) => {
                          e.preventDefault();
                          action();
                          // Close the context menu
                          document.dispatchEvent(
                            new KeyboardEvent("keydown", { key: "Escape" })
                          );
                        };

                        switch (key) {
                          case "enter":
                            executeAndClose(() => {
                              onTaskClick?.(task.id);
                            });
                            break;
                          case "s":
                            const hasSubtasks = tasks.some(
                              (t) => t.parentTaskId === task.id
                            );
                            if (hasSubtasks) {
                              executeAndClose(() => {
                                setFocusedTaskStack((prev) => [
                                  ...prev,
                                  { id: task.id, name: task.name },
                                ]);
                              });
                            }
                            break;
                          case "c":
                            executeAndClose(() =>
                              closeContextMenuThen(() =>
                                onCreateSubtask?.(task.id)
                              )
                            );
                            break;
                          case "e":
                            executeAndClose(() =>
                              closeContextMenuThen(() => onEditTask?.(task.id))
                            );
                            break;
                          case "d":
                            executeAndClose(() =>
                              closeContextMenuThen(() =>
                                onDeleteTask?.(task.id)
                              )
                            );
                            break;
                          case "1":
                            executeAndClose(() =>
                              handleUpdateTaskStatus(task.id, "To Do")
                            );
                            break;
                          case "2":
                            executeAndClose(() =>
                              handleUpdateTaskStatus(task.id, "In Progress")
                            );
                            break;
                          case "3":
                            executeAndClose(() =>
                              handleUpdateTaskStatus(task.id, "In Review")
                            );
                            break;
                          case "4":
                            executeAndClose(() =>
                              handleUpdateTaskStatus(task.id, "Blocked")
                            );
                            break;
                          case "5":
                            executeAndClose(() =>
                              handleUpdateTaskStatus(task.id, "Completed")
                            );
                            break;
                        }
                      }}
                    >
                      <ContextMenuItem onClick={() => onTaskClick?.(task.id)}>
                        <Info className="mr-2 h-3 w-4" />
                        Show Details
                        <span className="ml-auto text-xs text-muted-foreground">
                          Enter
                        </span>
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      {hasSubtasks && (
                        <>
                          <ContextMenuItem
                            onClick={() => handleShowSubtasks(task)}
                          >
                            <Eye className="mr-2 h-3 w-4" />
                            Show Subtasks
                            <span className="ml-auto text-xs text-muted-foreground">
                              S
                            </span>
                          </ContextMenuItem>
                        </>
                      )}
                      <ContextMenuItem
                        onClick={() =>
                          closeContextMenuThen(() =>
                            handleCreateSubtask(task.id)
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
                          closeContextMenuThen(() => onEditTask?.(task.id))
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
                          <RefreshCw className="mr-4 h-3 w-4 text-muted-foreground" />
                          Change Status
                        </ContextMenuSubTrigger>
                        <ContextMenuPortal>
                          <ContextMenuSubContent className="w-44 z-[100]">
                            {statusOptions.map((status) => {
                              const IconComponent = status.icon;
                              const isCurrentStatus =
                                task.status === status.value;

                              // Get proper color for each status
                              const getStatusColor = (statusValue: string) => {
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

                              const statusColor = getStatusColor(status.value);

                              return (
                                <ContextMenuItem
                                  key={status.value}
                                  onClick={() =>
                                    handleUpdateTaskStatus(
                                      task.id,
                                      status.value
                                    )
                                  }
                                  className={
                                    isCurrentStatus
                                      ? "bg-accent text-accent-foreground font-medium"
                                      : "hover:bg-accent/50"
                                  }
                                >
                                  <IconComponent
                                    className={`mr-2 h-3 w-4 ${statusColor}`}
                                  />
                                  {status.label}
                                  {isCurrentStatus ? (
                                    <span
                                      className={`ml-auto text-xs font-bold ${statusColor}`}
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {status.value === "To Do"
                                        ? "1"
                                        : status.value === "In Progress"
                                          ? "2"
                                          : status.value === "In Review"
                                            ? "3"
                                            : status.value === "Blocked"
                                              ? "4"
                                              : status.value === "Completed"
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
                          closeContextMenuThen(() => handleDeleteTask(task.id))
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

              {/* Delay Segments Layer - Separate from task blocks for proper scrolling */}
              {processedTasks.map((task, index) => {
                if (!task.hasDelaySegment) return null;

                const delayPosition = getDelayedSegmentPosition(task);
                if (!delayPosition) return null;

                const { left, width } = getTaskPosition(task);

                return (
                  <React.Fragment key={`delay-${task.id}`}>
                    {/* Delayed segment - starts right after main task with seamless connection */}
                    <div
                      className="absolute h-14 border-0 bg-orange-400/10 backdrop-blur-[5px] z-20 flex items-center justify-center"
                      style={{
                        left: `${delayPosition.left}px`,
                        width: `${Math.max(delayPosition.width, COLUMN_WIDTH * 0.1)}px`,
                        top: `${index * 70 + 8}px`,
                        borderRadius: "0 0.75rem 0.75rem 0", // rounded-r-xl only (0 for left corners)
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1' numOctaves='1' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.03'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        backgroundBlendMode: "overlay",
                      }}
                    >
                      {delayPosition.width > 80 && (
                        <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 px-2 py-1 rounded-md">
                          Delayed ({task.delayDuration}{" "}
                          {task.delayDuration === 1 ? "day" : "days"})
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            {/* Empty state */}
            {processedTasks.length === 0 && (
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center text-muted-foreground",
                  zoomLevel === "day" ? "top-24" : "top-20"
                )}
              >
                <div className="text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {focusedTaskStack.length > 0 ? (
                    <>
                      <p className="text-lg font-medium">No subtasks found</p>
                      <p className="text-sm">
                        This task doesn't have any subtasks yet
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-medium">No tasks to display</p>
                      <p className="text-sm">
                        Tasks will appear here when you create them
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag Tooltip - Floating date indicator like Jira */}
        {dragTooltip.visible && (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: dragTooltip.x,
              top: dragTooltip.y,
            }}
          >
            <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg border whitespace-nowrap">
              {dragTooltip.date} {dragTooltip.delta}
            </div>
          </div>
        )}
      </TooltipProvider>
    </div>
  );
};
