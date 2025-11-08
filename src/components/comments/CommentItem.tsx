"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThumbsUp, ThumbsDown, Reply, MoreVertical, Smile, Save, X } from "lucide-react";
import type { CommentDoc } from "@/lib/comments";
import { EmojiPicker } from "./EmojiPicker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAvatarRegistry } from "./AvatarRegistry";
import { useAuth } from "@/contexts/AuthContext";
import { listOrgMembersLight } from "@/lib/memberships";
import type { OrgMembership } from "@/lib/types";

export type CommentItemProps = {
  comment: CommentDoc;
  currentUserId?: string;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
  onReply?: (id: string) => void;
  onEdit?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  isOwn?: boolean;
  className?: string;
};

export function CommentItem({
  comment,
  currentUserId,
  onLike,
  onDislike,
  onReact,
  onReply,
  onEdit,
  onDelete,
  isOwn,
  className,
}: CommentItemProps) {
  const initials = useMemo(
    () => (comment.authorName?.[0] || "U").toUpperCase(),
    [comment.authorName]
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const handleLike = () => onLike?.(comment.id);
  const handleDislike = () => onDislike?.(comment.id);
  const userVote = useMemo(() => (comment.voters || {})[currentUserId || ""], [comment.voters, currentUserId]);
  const timeLabel = useMemo(() => {
    if ((comment as any).createdAt?.toDate) return (comment as any).createdAt.toDate().toLocaleString();
    if (comment.createdAtMs) return new Date(comment.createdAtMs).toLocaleString();
    return "";
  }, [comment.createdAt, comment.createdAtMs]);

  // Load org members to highlight exact mention names only
  const { user } = useAuth();
  const [members, setMembers] = useState<OrgMembership[]>([]);
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        if (!user?.organizationId) return;
        const list = await listOrgMembersLight(user.organizationId);
        if (mounted) setMembers(list || []);
      } catch {
        // ignore
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [user?.organizationId]);

  const contentWithMentions = useMemo(() => {
    const txt = comment.text || "";
    const parts: React.ReactNode[] = [];

    // Build exact-name regex when members are available; fall back to a conservative generic pattern otherwise.
    const displayNames = (members || [])
      .map((m) => (m.displayName || m.email || "").trim())
      .filter(Boolean);

    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Sort by length desc to prefer the longest names first (avoid partial matches)
    const alternation = displayNames
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join("|");

    // If we have names, match exactly one of them after @, case-insensitive, and stop at boundary (end/space/punct)
    // m[1] = leading space or start, m[2] = matched display name with user-typed casing preserved by regex.
    const exactRe = alternation
      ? new RegExp(`(^|\\s)@(${alternation})(?=$|\\s|[.,;:!?])`, "gi")
      : null;

    // Conservative fallback: match '@' + up to 3 tokens (letters/digits/._-), avoids over-capturing long sentences
    const fallbackRe = /(^|\s)@([A-Za-z0-9][A-Za-z0-9._-]*(?:\s+[A-Za-z0-9][A-Za-z0-9._-]*){0,2})/g;

    const re = exactRe || fallbackRe;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const start = m.index;
      // push text before match
      parts.push(txt.slice(lastIndex, start));
      // preserve leading whitespace if any
      if (m[1]) parts.push(m[1]);
      const mentionText = `@${m[2]}`;
      parts.push(
        <span key={`${start}-${mentionText}`} className="px-1 rounded bg-blue-500/15 text-blue-400">
          {mentionText}
        </span>
      );
      lastIndex = start + m[0].length;
    }
    parts.push(txt.slice(lastIndex));
    return parts;
  }, [comment.text, members]);

  // Register avatar in registry for thread connectors
  const avatarRef = useRef<HTMLDivElement | null>(null);
  const registry = useAvatarRegistry();

  useEffect(() => {
    registry.register(comment.id, avatarRef.current);
    return () => registry.register(comment.id, null);
  }, [comment.id, registry]);

  return (
    <div className={cn("flex gap-3 items-start", className)}>
      <div ref={avatarRef}>
        <Avatar className="h-9 w-9 flex-shrink-0 self-start">
          <AvatarImage src={comment.authorAvatar ?? undefined} />
          <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 h-9">
          <span className="font-semibold text-foreground text-sm">{comment.authorName || "Unknown"}</span>
          <span className="text-muted-foreground text-xs">{timeLabel}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {!isEditing ? (
              <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">{contentWithMentions}</div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e)=> setDraft(e.target.value)}
                  className="w-full min-h-[80px] bg-muted/50 border rounded-md p-2 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={()=> { setIsEditing(false); setDraft(comment.text); }}>
                    Cancel
                  </Button>
                  <Button size="sm" className="bg-foreground hover:bg-foreground/90 text-background" onClick={()=> { onEdit?.(comment.id, draft.trim()); setIsEditing(false); }} disabled={!draft.trim()}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
          {isOwn ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors" title="More">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete?.(comment.id)}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        
        {!isEditing && (
          <div className="mt-2 flex items-center gap-3 px-1">
            <button 
              onClick={handleLike} 
              className={cn(
                "inline-flex items-center gap-1.5 text-sm transition-colors",
                userVote===1 ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            > 
              <ThumbsUp className={cn("h-4 w-4", userVote===1 && "fill-current")} />
              <span>{comment.likeCount || 0}</span>
            </button>
            
            <button 
              onClick={handleDislike} 
              className={cn(
                "inline-flex items-center gap-1.5 text-sm transition-colors",
                userVote===-1 ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ThumbsDown className={cn("h-4 w-4", userVote===-1 && "fill-current")} />
              <span>{comment.dislikeCount || 0}</span>
            </button>
            
            {comment.reactionCounts && Object.entries(comment.reactionCounts)
              .filter(([_, count]) => (count || 0) > 0)
              .map(([emoji, count]) => {
                const hasReacted = (comment as any).reactionUsers?.[emoji]?.[currentUserId || ""];
                return (
                  <button
                    key={emoji}
                    onClick={() => onReact?.(comment.id, emoji)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors",
                      hasReacted 
                        ? "bg-foreground/10 text-foreground ring-1 ring-foreground/20" 
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                    title={`React with ${emoji}`}
                  >
                    <span>{emoji}</span>
                    <span className="text-[11px] font-medium">{count}</span>
                  </button>
                );
              })}
            
            <EmojiPicker onSelect={(e)=> onReact?.(comment.id, e)} />
            
            <button 
              onClick={() => onReply?.(comment.id)} 
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              <Reply className="h-4 w-4" />
              <span>Reply</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
