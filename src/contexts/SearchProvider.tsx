"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import type { Department, Project, Task } from "@/lib/types";
import { useRouter } from "next/navigation";
import FlexSearch from "flexsearch";

// -----------------------------
// Types
// -----------------------------

export type SearchDoc = {
  id: string;
  type: "mail" | "course" | "coursework"; // added course
  title: string;
  subtitle?: string;
  description?: string;
  tags?: string[];
  path: string;
  updatedAt?: number; // epoch ms
  // Additional metadata
  fromEmail?: string;
  courseId?: string;
  courseName?: string;
  dueDate?: string; // ISO
};

export type SearchResult = SearchDoc & { score?: number; breadcrumb?: string[] };

interface SearchContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  ready: boolean;
  indexing: boolean;
  search: (q: string, limit?: number) => Promise<SearchResult[]>;
  goTo: (doc: SearchDoc) => void;
}

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

// v1.2 approach: in-memory only, departments + projects + tasks

// -----------------------------
// Provider
// -----------------------------

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const flexRef = useRef<any | null>(null); // FlexSearch.Index
  const storeRef = useRef<Map<string, SearchDoc>>(new Map()); // id -> doc
  // Current user id
  const uid = user?.uid;

  // Build a flat index (mail + coursework)
  const buildIndex = useCallback(() => {
    const options = {
      preset: "match",
      cache: 512,
      tokenize: "forward",
    } as const;
    const idx = new (FlexSearch as any).Index(options);
    return idx as any;
  }, [uid]);

  const toIndexString = useCallback((d: SearchDoc) => {
    const tags = Array.isArray(d.tags) ? d.tags.join(" ") : "";
    return [d.title, d.subtitle, d.description, tags, d.fromEmail, d.courseName, d.dueDate].filter(Boolean).join(" \n ");
  }, []);

  const addToIndex = useCallback((idx: any, doc: SearchDoc) => {
    if (!doc?.id) return;
    try {
      storeRef.current.set(doc.id, doc);
      idx.add(doc.id, toIndexString(doc));
    } catch (err) {
      console.error("[Spotlight] addToIndex failed", doc, err);
    }
  }, [toIndexString]);

  const updateIndex = useCallback((idx: any, doc: SearchDoc) => {
    if (!doc?.id) return;
    try {
      storeRef.current.set(doc.id, doc);
      idx.update(doc.id, toIndexString(doc));
    } catch (err) {
      console.error("[Spotlight] updateIndex failed", doc, err);
    }
  }, [toIndexString]);

  // Timestamp helper retained
  const tsToMillis = useCallback((v: any | undefined | null): number | undefined => {
    if (!v) return undefined;
    if (v instanceof Date) return v.getTime();
    if (typeof v?.toMillis === "function") return v.toMillis();
    if (typeof v === "number") return v;
    return undefined;
  }, []);

  // Subscribe to Firestore and (re)build/maintain index (gmail messages + classroom coursework meta)
  useEffect(() => {
    let unsubscribers: Array<() => void> = [];
    let cancelled = false;
    async function hydrate() {
      if (!uid) return;
      setReady(false);
      setIndexing(true);
      const idx = buildIndex();
      flexRef.current = idx as any;

      // Gmail messages list collection: users/{uid}/gmail/messages/list
      try {
        const { collection, onSnapshot } = await import("firebase/firestore");
        const col = collection(db, "users", uid, "gmail", "messages", "list");
        const unsub = onSnapshot(col, (snap: any) => {
          snap.docChanges().forEach((chg: any) => {
            const raw = chg.doc.data();
            const mailDoc: SearchDoc = {
              id: `mail:${chg.doc.id}`,
              type: "mail",
              title: raw.subject || raw.snippet || "(no subject)",
              subtitle: raw.from || "Mail",
              description: raw.snippet || "",
              fromEmail: raw.from || undefined,
              path: `/dashboard/inbox/${chg.doc.id}`,
              updatedAt: tsToMillis(raw.internalDate) || Date.now(),
              tags: raw.isAcademic ? ["academic"] : [],
            };
            if (chg.type === "removed") {
              storeRef.current.delete(mailDoc.id);
              (idx as any).remove(mailDoc.id);
              return;
            }
            if (chg.type === "added") addToIndex(idx, mailDoc); else updateIndex(idx, mailDoc);
          });
        });
        unsubscribers.push(unsub);
      } catch (e) {
        console.error("[Spotlight] gmail subscribe error", e);
      }

      // Classroom coursework meta via collectionGroup 'courseWorkMeta'
      try {
        const { collectionGroup, onSnapshot, where, query } = await import("firebase/firestore");
        const cg = collectionGroup(db, "courseWorkMeta");
        // We stored uid field; filter to current user
        const q = query(cg, where("uid", "==", uid));
        const unsubCw = onSnapshot(q, (snap: any) => {
          snap.docChanges().forEach((chg: any) => {
            const raw = chg.doc.data();
            const cwDoc: SearchDoc = {
              id: `coursework:${chg.doc.id}`,
              type: "coursework",
              title: raw.title || "(untitled)",
              subtitle: raw.courseName || raw.workType || "Coursework",
              description: raw.description || "",
              courseId: raw.courseId,
              courseName: raw.courseName,
              dueDate: raw.dueDate || undefined,
              tags: raw.workType ? [raw.workType] : [],
              path: `/dashboard/classroom/${raw.courseId}`,
              updatedAt: tsToMillis(raw.updatedAt) || Date.now(),
            };
            if (chg.type === "removed") {
              storeRef.current.delete(cwDoc.id);
              (idx as any).remove(cwDoc.id);
              return;
            }
            if (chg.type === "added") addToIndex(idx, cwDoc); else updateIndex(idx, cwDoc);
          });
        });
        unsubscribers.push(unsubCw);
      } catch (e) {
        console.error("[Spotlight] coursework subscribe error", e);
      }

      // Classroom COURSE meta via collectionGroup 'classroomCourseMeta'
      try {
        const { collectionGroup, onSnapshot, where, query } = await import("firebase/firestore");
        const cg = collectionGroup(db, "classroomCourseMeta");
        const q = query(cg, where("uid", "==", uid));
        const unsubCourse = onSnapshot(q, (snap: any) => {
          snap.docChanges().forEach((chg: any) => {
            const raw = chg.doc.data();
            const courseDoc: SearchDoc = {
              id: `course:${raw.courseId || chg.doc.id}`,
              type: "course",
              title: raw.courseName || raw.title || "Course",
              subtitle: raw.section || "Course",
              description: raw.description || "",
              courseId: raw.courseId || chg.doc.id,
              courseName: raw.courseName || raw.title || "Course",
              tags: ["classroom"],
              path: `/dashboard/classroom/${raw.courseId || chg.doc.id}`,
              updatedAt: tsToMillis(raw.updatedAt) || Date.now(),
            };
            if (chg.type === "removed") {
              storeRef.current.delete(courseDoc.id);
              (idx as any).remove(courseDoc.id);
              return;
            }
            if (chg.type === "added") addToIndex(idx, courseDoc); else updateIndex(idx, courseDoc);
          });
        });
        unsubscribers.push(unsubCourse);
      } catch (e) {
        console.error("[Spotlight] course meta subscribe error", e);
      }

      if (!cancelled) {
        setReady(true);
        setIndexing(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
      unsubscribers.forEach((u) => u?.());
      unsubscribers = [];
    };
  }, [uid, buildIndex, addToIndex, updateIndex, tsToMillis]);

  // Keyboard shortcut unchanged
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "K" || e.key === "k")) {
        // Avoid triggering from inside inputs
        const ae = document.activeElement as HTMLElement | null;
        const isTyping = !!(ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable));
        if (isTyping) return;
        e.preventDefault();
        setOpen((v) => {
          const nv = !v;
          return nv;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search API
  const search = useCallback(async (q: string, limit = 50): Promise<SearchResult[]> => {
    const idx = flexRef.current as any;
    if (!idx || !q?.trim()) return [];
    try {
      const ids: Array<string> = await idx.search(q, { limit, suggest: true });
      const results: SearchResult[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const doc = storeRef.current.get(id);
        if (doc) {
          results.push({ ...doc, score: undefined });
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  }, []);

  const goTo = useCallback((doc: SearchDoc) => {
    setOpen(false);
    if (doc?.path) router.push(doc.path);
  }, [router]);

  const value = useMemo<SearchContextValue>(() => ({ open, setOpen, toggle: () => setOpen((v) => !v), ready, indexing, search, goTo }), [open, ready, indexing, search, goTo]);

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within <SearchProvider>");
  return ctx;
}
