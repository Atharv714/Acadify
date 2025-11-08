"use client"

import React, { useEffect, useRef } from "react";
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
import { Kbd } from "@/components/ui/kbd";
import { Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName?: string | null;
  title?: string;
  description?: React.ReactNode;
  hasSubtasksWarning?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
};

export default function DeleteConfirmation({
  open,
  onOpenChange,
  itemName,
  title = "Delete Task",
  description,
  hasSubtasksWarning,
  confirmLabel = "Delete Task",
  cancelLabel = "Cancel",
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onConfirm();
        onOpenChange(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, onConfirm]);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      const el = contentRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && !el.contains(target)) {
        onOpenChange(false);
      }
    }

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        ref={contentRef}
        className="backdrop-blur-[10px] dark:bg-black/20 bg-white/80 border dark:border-white/10 border-black/10"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-black dark:text-white">
            <Trash2 className="h-5 w-5 text-destructive" /> {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            {description ?? (
              <>
                <span className="block">
                  Are you sure you want to delete {" "}
                  <strong>"{itemName}"</strong>?
                </span>
                <span className="block text-sm text-muted-foreground">
                  This action cannot be undone.
                </span>
              </>
            )}
            {hasSubtasksWarning && (
              <span className="block text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ This task has subtasks. All subtasks will also be permanently deleted.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            autoFocus={false}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {cancelLabel}
            <div className="hidden sm:inline-flex">
              <Kbd>Esc</Kbd>
            </div>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="bg-red-600/20 hover:bg-red-500/20 text-red-700 dark:bg-red-600/20 dark:hover:bg-red-500/20 dark:text-white"
          >
            {confirmLabel}
            <div className="hidden sm:flex items-center gap-1">
              {typeof navigator !== "undefined" &&
              navigator?.platform?.toLowerCase().includes("mac") ? (
                <>
                  <Kbd className="key-icon dark:bg-red-800/20 bg-white text-red-500 dark:text-white">⌘</Kbd>
                  <Kbd className="key-icon dark:bg-red-800/20 text-red-500 dark:text-white">&#x23CE;</Kbd>
                </>
              ) : (
                <>
                  <Kbd className="key-icon dark:bg-red-800/20 bg-white text-red-500 dark:text-white">Ctrl</Kbd>
                  <Kbd className="key-icon dark:bg-red-800/20 bg-white text-red-500 dark:text-white"><span className="sr-only">Enter</span>&#x23CE;</Kbd>
                </>
              )}
            </div>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
