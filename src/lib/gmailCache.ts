import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

export interface CachedMessageMeta {
  id: string;
  threadId?: string;
  subject?: string;
  from?: string;
  date?: string;
  snippet?: string;
  internalDate?: number;
  labelIds?: string[];
  isAcademic?: boolean;
  updatedAt?: any;
}

export const getUserMessagesColRef = (uid: string) =>
  collection(db, "users", uid, "gmail", "messages", "list");

export async function saveMessages(uid: string, messages: CachedMessageMeta[]) {
  if (!uid || messages.length === 0) return;
  const batch = writeBatch(db);
  const col = getUserMessagesColRef(uid);
  messages.forEach((m) => {
    const ref = doc(col, m.id);
    batch.set(
      ref,
      {
        id: m.id,
        threadId: m.threadId ?? null,
        subject: m.subject ?? null,
        from: m.from ?? null,
        date: m.date ?? null,
        snippet: m.snippet ?? null,
        internalDate: m.internalDate ?? null,
        labelIds: m.labelIds ?? [],
        isAcademic: m.isAcademic ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await batch.commit();
}

export async function getCachedMessages(uid: string, take: number = 50) {
  if (!uid) return [] as CachedMessageMeta[];
  const col = getUserMessagesColRef(uid);
  const q = query(col, orderBy("internalDate", "desc"), qLimit(take));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CachedMessageMeta);
}

export const getUserMessageDetailRef = (uid: string, id: string) =>
  doc(db, "users", uid, "gmail", "messages", "detail", id);

export async function saveMessageDetail(uid: string, id: string, data: any) {
  if (!uid || !id) return;
  const safe = JSON.parse(JSON.stringify(data, (_k, v) => (v === undefined ? null : v)));
  await setDoc(
    getUserMessageDetailRef(uid, id),
    { ...safe, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getCachedMessageDetail(uid: string, id: string) {
  if (!uid || !id) return null as any;
  const ref = getUserMessageDetailRef(uid, id);
  const snap = await import("firebase/firestore").then(({ getDoc }) => getDoc(ref));
  return snap.exists() ? snap.data() : null;
}
