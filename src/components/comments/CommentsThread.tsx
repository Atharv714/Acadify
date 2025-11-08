"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import {
  createComment,
  fetchMoreTopLevel,
  toggleEmojiReaction,
  updateComment,
  deleteComment,
  toggleVote,
  watchReplies,
  watchTopLevelComments,
  type CommentDoc,
} from "@/lib/comments";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AvatarRegistryProvider } from "./AvatarRegistry";
import { ThreadConnector } from "./ThreadConnector";

export function CommentsThread({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const olderPagesRef = useRef<CommentDoc[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;
    unsubRef.current?.();
    olderPagesRef.current = [];
    const unsub = watchTopLevelComments(taskId, 25, (list) => {
      // Merge live page with any older pages loaded
      const map = new Map<string, CommentDoc>();
      [...list, ...olderPagesRef.current].forEach((c) => map.set(c.id, c));
      const merged = Array.from(map.values());
      setComments(merged);
      setHasMore(list.length >= 25);
      setIsInitialLoading(false);
    });
    unsubRef.current = unsub;
    return () => unsub();
  }, [taskId]);

  const handleSubmitTopLevel = async (text: string) => {
    if (!user) return;
    const createdId = await createComment({
      taskId,
      authorId: user.uid,
      authorName: user.displayName || user.email || "User",
      authorAvatar: user.photoURL || undefined,
      text,
    });
    // Optimistically ensure immediate visibility
    setComments((prev) => {
      if (prev.some((c) => c.id === createdId)) return prev;
      const now = Date.now();
      const newDoc: CommentDoc = {
        id: createdId,
        taskId,
        parentId: null,
        authorId: user.uid,
        authorName: user.displayName || user.email || "User",
        authorAvatar: user.photoURL || undefined,
        text,
        createdAt: null as any,
        updatedAt: null as any,
        createdAtMs: now,
        updatedAtMs: now,
        likeCount: 0,
        dislikeCount: 0,
        replyCount: 0,
        reactionCounts: {},
        voters: {},
      };
      return [newDoc, ...prev].sort((a,b)=> (b.createdAtMs||0)-(a.createdAtMs||0));
    });
  };

  const handleLike = async (id: string) => {
    if (!user) return;
  await toggleVote(id, user.uid!, 1);
  };

  const handleDislike = async (id: string) => {
    if (!user) return;
  await toggleVote(id, user.uid!, -1);
  };

  const handleReact = async (id: string, emoji: string) => {
    if (!user) return;
    await toggleEmojiReaction(id, user.uid!, emoji);
  };

  const handleEdit = async (id: string, text: string) => {
    await updateComment(id, text);
  };
  const handleDelete = async (id: string, parentId?: string | null) => {
    await deleteComment(id, parentId);
  };

  return (
    <AvatarRegistryProvider>
      <div className="space-y-4 ">
        <CommentComposer
          avatarUrl={user?.photoURL}
          displayName={user?.displayName || user?.email}
          onSubmit={handleSubmitTopLevel}
        />
      
      <div className="bg-background p-4 -mt-1">
        <div className="flex items-center justify-between mb-4 pb-3">
          <div className="text-sm font-semibold text-foreground">
            Comments {comments.length > 0 && <span className="ml-1 text-muted-foreground">({comments.length})</span>}
          </div>
          <div className="flex items-center gap-2">
            <button 
              className={cn(
                "spacemono px-2.5 py-1 rounded text-xs font-medium transition-colors",
                sort==="newest" ? "dark:bg-white bg-dark dark:text-black text-white bg-black" : "text-muted-foreground hover:text-foreground"
              )} 
              onClick={()=> setSort("newest")}
            >
              Most recent
            </button>
            <button 
              className={cn(
                "spacemono px-2.5 py-1 rounded text-xs font-medium transition-colors",
                sort==="oldest" ? "dark:bg-white bg-dark dark:text-black text-white bg-black" : "text-muted-foreground hover:text-foreground"
              )} 
              onClick={()=> setSort("oldest")}
            >
              Oldest
            </button>
          </div>
        </div>

        {isInitialLoading ? (
          <div className="space-y-4">
            {Array.from({length:3}).map((_,i)=> (
              <div key={i} className="flex gap-3">
                <div className="h-9 w-9 rounded-full bg-muted animate-pulse flex-shrink-0" />
                <div className="flex-1">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                    <div className="mt-2 h-4 w-full bg-muted rounded animate-pulse" />
                    <div className="mt-1.5 h-4 w-3/5 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {[...comments]
              .sort((a,b)=> sort==="newest" ? (b.createdAtMs||0)-(a.createdAtMs||0) : (a.createdAtMs||0)-(b.createdAtMs||0))
              .map((c) => (
                <div key={c.id}>
                  <CommentItem
                    comment={c}
                    currentUserId={user?.uid || undefined}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onReact={handleReact}
                    onReply={(id) => setReplyingTo(id)}
                    onEdit={handleEdit}
                    onDelete={(id) => handleDelete(id, c.parentId)}
                    isOwn={c.authorId === user?.uid}
                  />
                  {replyingTo === c.id && (
                    <div className="ml-12 mt-3">
                      <CommentComposer
                        avatarUrl={user?.photoURL}
                        displayName={user?.displayName || user?.email}
                        placeholder="Write a reply..."
                        onSubmit={async (text) => {
                          if (!user) return;
                          const createdId = await createComment({
                            taskId,
                            authorId: user.uid,
                            authorName: user.displayName || user.email || "User",
                            authorAvatar: user.photoURL || undefined,
                            text,
                            parentId: c.id,
                          });
                          // Optimistic reply insert handled inside RepliesList via snapshot; optional immediate UX could push here if we tracked replies state locally
                          setReplyingTo(null);
                        }}
                        autoFocus
                        onCancel={() => setReplyingTo(null)}
                      />
                    </div>
                  )}
                  <RepliesSection
                    taskId={taskId}
                    parentId={c.id}
                    replyCount={c.replyCount || 0}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onReact={handleReact}
                    currentUserId={user?.uid || undefined}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoadingMore}
              onClick={async () => {
                if (!comments.length) return;
                setIsLoadingMore(true);
                try {
                  const last = [...comments]
                    .sort((a,b)=> (a.createdAtMs||0)-(b.createdAtMs||0))
                    [0];
                  const more = await fetchMoreTopLevel(taskId, last.createdAtMs || 0, 25);
                  if (more.length === 0) {
                    setHasMore(false);
                    return;
                  }
                  // Append to older pages and recompute merged
                  olderPagesRef.current = [...olderPagesRef.current, ...more];
                  const map = new Map<string, CommentDoc>();
                  [...comments, ...more].forEach((c) => map.set(c.id, c));
                  setComments(Array.from(map.values()));
                } finally {
                  setIsLoadingMore(false);
                }
              }}
              className="text-foreground hover:text-foreground/80"
            >
              {isLoadingMore ? "Loading…" : "Show more"}
            </Button>
          </div>
        )}
      </div>
    </div>
    </AvatarRegistryProvider>
  );
}

function RepliesSection({
  taskId,
  parentId,
  replyCount,
  onLike,
  onDislike,
  onReact,
  currentUserId,
  onEdit,
  onDelete,
}: {
  taskId: string;
  parentId: string;
  replyCount: number;
  onLike: (id: string) => void | Promise<void>;
  onDislike: (id: string) => void | Promise<void>;
  onReact: (id: string, emoji: string) => void | Promise<void>;
  currentUserId?: string;
  onEdit: (id: string, text: string) => void | Promise<void>;
  onDelete: (id: string, parentId: string) => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<CommentDoc[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const unsubRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (!expanded) return;
    unsubRef.current?.();
    const unsub = watchReplies(parentId, (list) => setReplies(list));
    unsubRef.current = unsub;
    return () => unsub();
  }, [expanded, parentId]);

  if (replyCount === 0) return null;

  // Build links for thread connector
  const links = expanded ? replies.map((r) => ({ fromId: parentId, toId: r.id })) : [];

  return (
    <div className="relative ml-12 mt-2">
      {/* SVG thread connector - draws Bézier curves between avatars */}
      {expanded && <ThreadConnector links={links} />}

      <button
        className={cn(
          "text-sm font-semibold inline-flex items-center gap-2 transition-colors",
          expanded ? "text-foreground" : "text-foreground hover:text-foreground/70"
        )}
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? (
          <>
            <ChevronUp className="h-4 w-4" />
            <span>Hide replies</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" />
            <span>
              Show {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
          </>
        )}
      </button>
      {expanded && (
        <div className="mt-3 space-y-6">
          {replies.length === 0 ? (
            <div className="text-xs text-muted-foreground">No replies yet</div>
          ) : (
            replies.map((r) => (
              <div key={r.id} className="relative z-10">
                <CommentItem
                  comment={r}
                  currentUserId={currentUserId}
                  onLike={onLike}
                  onDislike={onDislike}
                  onReact={onReact}
                  onReply={(id) => setReplyingTo(id)}
                  onEdit={onEdit}
                  onDelete={(id) => onDelete(id, parentId)}
                  isOwn={r.authorId === currentUserId}
                />

                {replyingTo === r.id && (
                  <div className="ml-12 mt-3">
                    <CommentComposer
                      avatarUrl={user?.photoURL}
                      displayName={user?.displayName || user?.email}
                      placeholder="Write a reply..."
                      onSubmit={async (text) => {
                        if (!user) return;
                        await createComment({
                          taskId,
                          authorId: user.uid,
                          authorName: user.displayName || user.email || "User",
                          authorAvatar: user.photoURL || undefined,
                          text,
                          parentId: r.id,
                        });
                        setReplyingTo(null);
                      }}
                      autoFocus
                      onCancel={() => setReplyingTo(null)}
                    />
                  </div>
                )}

                {/* Recursive replies */}
                <RepliesSection
                  taskId={taskId}
                  parentId={r.id}
                  replyCount={r.replyCount || 0}
                  onLike={onLike}
                  onDislike={onDislike}
                  onReact={onReact}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
