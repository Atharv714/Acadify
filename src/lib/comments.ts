import { db } from "@/lib/firebase";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  runTransaction,
} from "firebase/firestore";

export type CommentDoc = {
  id: string;
  taskId: string;
  parentId?: string | null;
  authorId: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  text: string;
  createdAt: any;
  updatedAt: any;
  createdAtMs?: number;
  updatedAtMs?: number;
  likeCount: number;
  dislikeCount: number;
  replyCount: number;
  reactionCounts?: Record<string, number>; // emoji -> count
  reactionUsers?: Record<string, Record<string, true>>; // emoji -> { userId: true }
  voters?: Record<string, 1 | -1>; // userId -> 1 (like) | -1 (dislike)
};

export const commentsCollection = () => collection(db, "comments");

export async function createComment(input: {
  taskId: string;
  text: string;
  authorId: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  parentId?: string | null;
}) {
  const docRef = await addDoc(commentsCollection(), {
    taskId: input.taskId,
    parentId: input.parentId ?? null,
    authorId: input.authorId,
    authorName: input.authorName ?? null,
    authorAvatar: input.authorAvatar ?? null,
    text: input.text,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    likeCount: 0,
    dislikeCount: 0,
    replyCount: 0,
    reactionCounts: {},
    reactionUsers: {},
    voters: {},
  } as any);

  // If it's a reply, bump replyCount on parent
  if (input.parentId) {
    await updateDoc(doc(db, "comments", input.parentId), {
      replyCount: increment(1),
      updatedAt: serverTimestamp(),
    } as any);
  }

  return docRef.id;
}

export async function deleteComment(id: string, parentId?: string | null) {
  await deleteDoc(doc(db, "comments", id));
  if (parentId) {
    await updateDoc(doc(db, "comments", parentId), {
      replyCount: increment(-1),
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    } as any);
  }
}

export async function updateComment(id: string, text: string) {
  const ref = doc(db, "comments", id);
  await updateDoc(ref, {
    text,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  } as any);
}

export async function toggleVote(id: string, userId: string, dir: 1 | -1) {
  const ref = doc(db, "comments", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const current = (data.voters ?? {})[userId] as 1 | -1 | undefined;
    let likeDelta = 0,
      dislikeDelta = 0;
    const next: Record<string, 1 | -1> = { ...(data.voters ?? {}) };

    if (current === dir) {
      // remove
      if (dir === 1) likeDelta = -1; else dislikeDelta = -1;
      delete next[userId];
    } else if (current && current !== dir) {
      // switch
      if (dir === 1) {
        likeDelta = 1; dislikeDelta = -1;
      } else {
        likeDelta = -1; dislikeDelta = 1;
      }
      next[userId] = dir;
    } else {
      // add
      if (dir === 1) likeDelta = 1; else dislikeDelta = 1;
      next[userId] = dir;
    }

    tx.update(ref, {
      voters: next,
      likeCount: increment(likeDelta),
      dislikeCount: increment(dislikeDelta),
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    } as any);
  });
}

export async function toggleEmojiReaction(id: string, userId: string, emoji: string) {
  const ref = doc(db, "comments", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const counts = { ...(data.reactionCounts ?? {}) } as Record<string, number>;
    const users = { ...(data.reactionUsers ?? {}) } as Record<string, Record<string, true>>;
    const emojiUsers = { ...(users[emoji] ?? {}) } as Record<string, true>;
    const hasReacted = Boolean(emojiUsers[userId]);

    if (hasReacted) {
      delete emojiUsers[userId];
      counts[emoji] = Math.max(0, (counts[emoji] ?? 0) - 1);
    } else {
      emojiUsers[userId] = true as const;
      counts[emoji] = (counts[emoji] ?? 0) + 1;
    }
    users[emoji] = emojiUsers;

    tx.update(ref, {
      reactionCounts: counts,
      reactionUsers: users,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    } as any);
  });
}

export function watchTopLevelComments(taskId: string, pageSize = 10, cb: (docs: CommentDoc[]) => void) {
  const q = query(
    commentsCollection(),
    where("taskId", "==", taskId),
    orderBy("createdAtMs", "desc"),
    limit(pageSize)
  );
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CommentDoc[];
    const topLevel = rows.filter((r) => !r.parentId);
    cb(topLevel);
  });
}

export async function fetchMoreTopLevel(taskId: string, after: number, pageSize = 10) {
  const q = query(
    commentsCollection(),
    where("taskId", "==", taskId),
    orderBy("createdAtMs", "desc"),
    startAfter(after),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CommentDoc[];
  return rows.filter((r) => !r.parentId);
}

export function watchReplies(parentId: string, cb: (docs: CommentDoc[]) => void) {
  const q = query(
    commentsCollection(),
    where("parentId", "==", parentId),
    orderBy("createdAtMs", "asc")
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CommentDoc[];
    cb(rows);
  });
}
