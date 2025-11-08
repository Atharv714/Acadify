"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  // Optional hook to run before opening (e.g., close other popovers/menus)
  onBeforeOpen?: () => void;
  // Allow custom content className since some existing dialogs use specific styles
  contentClassName?: string;
}

/**
 * DialogShell centralizes our dialog scaffolding so we avoid duplicating structure and
 * can consistently fix aria-hidden layering by closing other popovers before opening.
 */
export default function DialogShell({ open, onOpenChange, title, description, children, footer, onBeforeOpen, contentClassName }: DialogShellProps) {
  useEffect(() => {
    if (open) {
      // Proactively close any open popovers/menus/modals to prevent aria-hidden stacking issues
      try {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      } catch {}
      onBeforeOpen?.();
    }
  }, [open, onBeforeOpen]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName ?? "sm:max-w-[600px] max-h-[90vh] flex flex-col dark:bg-black/50 backdrop-blur-[10px]"}>
        <DialogHeader>
          <DialogTitle className="spacegrot">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter className="pt-4 border-t">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
