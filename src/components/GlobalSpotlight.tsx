"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useSearch } from "@/contexts/SearchProvider";
import { SearchResult } from "@/contexts/SearchProvider";
import { useEffect, useMemo, useRef, useState } from "react";
import { DialogTitle, DialogDescription } from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { Kbd } from "./ui/kbd";

// Minimal styles leveraging Tailwind utility classes
// You can refine visuals later or swap to shadcn/ui Command wrapper

export function GlobalSpotlight() {
  const { open, setOpen, search, ready, indexing, goTo } = useSearch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const log = (...args: any[]) => {
    // mirror SearchProvider debug flag if available
    const dbg = (typeof window !== 'undefined' && (window as any).SPOTLIGHT_DEBUG?.value) || process.env.NODE_ENV !== 'production';
    if (dbg) {
      // eslint-disable-next-line no-console
      console.log('[Spotlight:UI]', ...args);
    }
  };

  // Debounced search
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      log('query', query);
      const res = await search(query, 50);
      if (!active) return;
      setResults(res);
      setLoading(false);
      log('results', res.length, res.slice(0, 5).map(r => ({ id: r.id, title: r.title, type: r.type })));
    };
    const t = setTimeout(run, 120);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, search]);

  // Group results by type (mail, course, coursework)
  const groups = useMemo(() => {
    const map: Record<string, SearchResult[]> = { mail: [], course: [], coursework: [] };
    for (const r of results) {
      (map[r.type] ||= []).push(r);
    }
    return map;
  }, [results]);

  // Clear query when closing
  useEffect(() => {
    if (!open) setQuery("");
    log('dialog', open ? 'open' : 'close');
  }, [open]);

  // Close spotlight when clicking outside the panel
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const t = e.target as Node | null;
      if (t && !panel.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, setOpen]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global Spotlight"
      aria-describedby={undefined}
      className="proximavara fixed inset-0 z-50 flex items-start justify-center dark:bg-black/30 p-4 backdrop-blur-[10px] rounded-lg"
    >
      {/* Accessible title/description for screen readers (hidden visually) */}
      <DialogTitle className="sr-only">Global Spotlight</DialogTitle>
      <DialogDescription className="sr-only">Search your inbox mails and classroom assignments.</DialogDescription>
  <div ref={panelRef} className="spotlight-panel w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-200 bg-white/80 dark:border-neutral-900 dark:bg-black/65 bg-backdrop-blur-[10px] p-2 mt-[10vh]">
        <div className="flex rounded-sm items-center gap-2 px-3 dark:bg-neutral-900/50">
          <Search className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={ready ? "Search mails, coursework…" : "Preparing search index…"}
            className="h-12 w-full bg-transparent px-2 text-base outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
          />
        </div>

        <Command.List className="max-h-[60vh] overflow-auto p-2">
          {!ready && (
            <div className="p-4 text-sm text-neutral-500">Initializing search…</div>
          )}
          {ready && !query && (
            <div className="p-4 text-sm text-neutral-500">Type to search mails and coursework.</div>
          )}
          {ready && query && loading && (
            <Command.Loading>
              <div className="p-4 text-sm text-neutral-500">Searching…</div>
            </Command.Loading>
          )}

          {ready && query && !loading && results.length === 0 && (
            <div className="p-4 text-sm text-neutral-500">No results.</div>
          )}

          {groups.mail.length > 0 && (
            <Command.Group heading="Mail" className="mb-2">
              {groups.mail.map((r) => (
                <Command.Item
                  key={r.id}
                  value={`${r.title} ${r.subtitle || ''} ${r.id}`}
                  onSelect={() => goTo(r)}
                  className="mt-2 flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm aria-selected:bg-neutral-300 dark:aria-selected:bg-neutral-800/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium mt-1">{r.title}</div>
                    <div className="truncate text-xs text-neutral-500">{r.subtitle || "Mail"}</div>
                  </div>
                  <div className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">Mail</div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {groups.coursework.length > 0 && (
            <Command.Group heading="Coursework" className="mb-2">
              {groups.coursework.map((r) => (
                <Command.Item
                  key={r.id}
                  value={`${r.title} ${r.courseName || ''} ${r.subtitle || ''} ${r.id}`}
                  onSelect={() => goTo(r)}
                  className="mt-2 flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm aria-selected:bg-neutral-300 dark:aria-selected:bg-neutral-800/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="truncate text-xs text-neutral-500">{r.courseName || r.subtitle || "Coursework"}</div>
                  </div>
                  <div className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">CW</div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {groups.course?.length > 0 && (
            <Command.Group heading="Courses" className="mb-2">
              {groups.course.map((r) => (
                <Command.Item
                  key={r.id}
                  value={`${r.title} ${r.subtitle || ''} ${r.id}`}
                  onSelect={() => goTo(r)}
                  className="mt-2 flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm aria-selected:bg-neutral-300 dark:aria-selected:bg-neutral-800/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium mt-1">{r.title}</div>
                    <div className="truncate text-xs text-neutral-500">{r.subtitle || "Course"}</div>
                  </div>
                  <div className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-neutral-400">Course</div>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>

        <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800">
          <div>Navigate with <Kbd className="key-icon">↑</Kbd> <Kbd className="key-icon">↓</Kbd>, open with <Kbd className="key-icon">Enter</Kbd></div>
          <div className="hidden items-center gap-1 md:flex">
            <span>Close</span>
            <Kbd className="key-icon">Esc</Kbd>
          </div>
        </div>
      </div>
    </Command.Dialog>
  );
}
