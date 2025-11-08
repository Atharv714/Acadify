"use client";

import { useMemo, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DisplayUser } from "@/lib/types";

export interface AssigneeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: DisplayUser[];
  selectedIds: string[];
  onToggle: (userId: string) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  buttonLabel?: ReactNode;
  buttonClassName?: string; // optional class override for trigger button
}

export default function AssigneeSelector({ open, onOpenChange, users, selectedIds, onToggle, searchTerm, onSearchTermChange, buttonLabel = "Select assignees", buttonClassName }: AssigneeSelectorProps) {
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  }, [users, searchTerm]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start font-normal h-auto py-2", buttonClassName)}>
          {selectedIds.length > 0 ? `${selectedIds.length} user(s) selected` : buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 backdrop-blur-[10px] dark:bg-black/20 bg-white/20 border dark:border-white/10 border-black/10" align="start">
        <div className="space-y-2 p-2">
          <Input placeholder="Search people..." value={searchTerm} onChange={(e) => onSearchTermChange(e.target.value)} className="h-8 text-xs" />
          <div className="max-h-48 overflow-y-auto space-y-1 assignee-selector-scroll">
            {filtered.length > 0 ? (
              filtered.map((user) => (
                <div key={user.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md cursor-pointer" onClick={() => onToggle(user.id)}>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? "User"} />
                    <AvatarFallback className="text-xs">{user.name ? user.name[0].toUpperCase() : "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || "Unknown User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email || "No email"}</p>
                  </div>
                  {selectedIds.includes(user.id) && <CircleCheck className="h-4 w-4 text-primary" />}
                </div>
              ))
            ) : (
              <p className="p-4 text-xs text-center text-muted-foreground">{searchTerm ? "No matching project members found." : "No members."}</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
