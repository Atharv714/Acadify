"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Image as ImageIcon, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { listOrgMembersLight } from "@/lib/memberships";
import type { OrgMembership } from "@/lib/types";

/**
 * Robust CommentComposer with caret-accurate mention popover.
 * Uses a mirror div to compute caret position in page coords,
 * then converts to wrapper-relative coordinates and clamps position.
 */
export function CommentComposer({
  avatarUrl,
  displayName,
  placeholder = "Add comment...",
  onSubmit,
  autoFocus,
  onCancel,
}: {
  avatarUrl?: string | null;
  displayName?: string | null;
  placeholder?: string;
  onSubmit: (text: string) => Promise<void> | void;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();

  // mentions state
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  // popover coords relative to wrapper (px)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user?.organizationId) return;
      try {
        const list = await listOrgMembersLight(user.organizationId);
        setMembers(list || []);
      } catch (e) {
        console.warn("Failed to load members for mentions", e);
      }
    };
    load();
  }, [user?.organizationId]);

  const filteredMembers = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const arr = members || [];
    if (!q) return arr.slice(0, 8);
    return arr
      .filter((m) => {
        const name = (m.displayName || "").toLowerCase();
        const email = (m.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 8);
  }, [members, mentionQuery]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await onSubmit(text.trim());
      setText("");
      taRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  // ---------- MIRROR-BASED CARET POSITION (robust) ----------
  // returns { top, left, height } relative to wrapper
  const computeCaretRelativeToWrapper = (el: HTMLTextAreaElement, position: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return { top: 0, left: 0, height: 16 };

    // Get computed styles we need to copy to mirror
    const style = window.getComputedStyle(el);
    const elRect = el.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();

    // Build mirror div
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    // copy essential styles to make text layout identical
    const propertiesToCopy = [
      "direction", "boxSizing", "width", "height", "overflowX", "overflowY",
      "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
      "paddingTop","paddingRight","paddingBottom","paddingLeft",
      "fontStyle","fontVariant","fontWeight","fontStretch","fontSize","fontSizeAdjust",
      "lineHeight","fontFamily","textAlign","textTransform","textIndent",
      "letterSpacing","wordSpacing","tabSize","MozTabSize"
    ];
    const mirrorStyle: Partial<CSSStyleDeclaration> = {
      position: "absolute",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      visibility: "hidden",
      top: `${elRect.top + window.scrollY}px`,   // place mirror exactly over textarea (page coords)
      left: `${elRect.left + window.scrollX}px`,
      // ensure same width in px (clientWidth avoids scrollbar width issues)
      width: `${el.clientWidth}px`,
    };
    Object.assign(mirror.style, mirrorStyle);

    // apply copied computed styles
    propertiesToCopy.forEach((p) => {
      // @ts-ignore
      const v = style.getPropertyValue(p) || (style as any)[p];
      if (v) (mirror.style as any)[p] = v;
    });

    // Split text up to caret; replace trailing spaces with NBSP to preserve width
    const value = el.value || "";
    const before = value.substring(0, position);
    // Replace newlines with <br> and spaces with &nbsp; where needed
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Convert text preserving spaces/newlines layout
    const htmlBefore = escapeHtml(before)
      .replace(/\n/g, "<br/>")
      .replace(/ {2}/g, " &nbsp;"); // preserve double spaces
    // Insert a span to mark caret position
    const span = document.createElement("span");
    span.textContent = "\u200b"; // zero-width marker
    // Set mirror innerHTML then append the marker span
    mirror.innerHTML = htmlBefore;
    mirror.appendChild(span);

    document.body.appendChild(mirror);

    // Measure marker span (returns page coords)
    const spanRect = span.getBoundingClientRect();

    // cleanup mirror immediately
    document.body.removeChild(mirror);

    // Compute relative to wrapper (convert page coords to wrapper-local)
    const caretAbsTop = spanRect.top + window.scrollY;   // page top (including scrollY)
    const caretAbsLeft = spanRect.left + window.scrollX; // page left (including scrollX)

    const wrapperAbsTop = wrapperRect.top + window.scrollY;
    const wrapperAbsLeft = wrapperRect.left + window.scrollX;

    // Account for textarea internal scroll - when user scrolled inside textarea, caret moves up visually
    // The mirror is full un-scrolled content so we subtract el.scrollTop
    const topRel = caretAbsTop - wrapperAbsTop - (el.scrollTop || 0);
    const leftRel = caretAbsLeft - wrapperAbsLeft;

    // height guess (line height) — use computed lineHeight fallback if not numeric
    const lh = parseFloat(style.lineHeight || "") || parseFloat(style.fontSize || "14") || 16;

    return { top: Math.max(0, topRel), left: Math.max(0, leftRel), height: lh };
  };

  // ---------- MENTION DETECTION ----------
  const tryDetectMention = (currentText?: string, caretPos?: number) => {
    const ta = taRef.current;
    if (!ta || !wrapperRef.current) return;
    const value = typeof currentText === "string" ? currentText : ta.value;
    const pos = typeof caretPos === "number" ? caretPos : ta.selectionStart ?? 0;
    const upto = value.slice(0, pos);
    const m = upto.match(/(^|\s)@([^\s@]*)$/);
    if (m) {
      const atIndex = pos - (m[2]?.length || 0) - 1;
      const newQuery = m[2] || "";
      const shouldResetActive =
        !mentionOpen || mentionStart !== atIndex || newQuery !== mentionQuery;

      setMentionStart(atIndex);
      setMentionQuery(newQuery);
      setMentionOpen(true);
      if (shouldResetActive) setActiveIdx(0);

      // compute caret position relative to wrapper using mirror
      const coords = computeCaretRelativeToWrapper(ta, pos);
      const offsetY = (coords.height || 16) + 6; // drop popover slightly below caret
      let left = coords.left;
      let top = coords.top + offsetY;

      // clamp popover inside wrapper width
      const wrapper = wrapperRef.current;
      const pop = popoverRef.current;
      if (wrapper && pop) {
        const wrapperW = wrapper.clientWidth;
        const popW = pop.offsetWidth || 280;
        if (left + popW > wrapperW - 8) left = Math.max(8, wrapperW - popW - 8);
      }

      setPopoverPos({ top, left });
    } else {
      if (mentionOpen) closeMention();
    }
  };

  const openMentionAt = (startIndex: number, fromButton = false) => {
    setMentionStart(startIndex);
    setMentionQuery("");
    setMentionOpen(true);
    setActiveIdx(0);

    const ta = taRef.current;
    if (!ta) return;

    if (fromButton) {
      const pos = ta.selectionStart ?? 0;
      const before = text.slice(0, pos);
      const after = text.slice(pos);
      const next = `${before}@${after}`;
      setText(next);
      requestAnimationFrame(() => {
        if (!taRef.current) return;
        const newPos = pos + 1;
        taRef.current.focus();
        taRef.current.selectionStart = newPos;
        taRef.current.selectionEnd = newPos;
        tryDetectMention(next, newPos);
      });
    } else {
      tryDetectMention();
    }
  };

  const closeMention = () => {
    setMentionOpen(false);
    setMentionStart(null);
    setMentionQuery("");
    setActiveIdx(0);
    setPopoverPos(null);
  };

  const insertMention = (name: string) => {
    if (mentionStart == null || !taRef.current) return;
    const pos = taRef.current.selectionStart ?? 0;
    const before = text.slice(0, mentionStart);
    const after = text.slice(pos);
    const insertion = `@${name}`;
    const next = `${before}${insertion} ${after}`;
    const newCaret = (before + insertion + " ").length;
    setText(next);
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.selectionStart = newCaret;
        taRef.current.selectionEnd = newCaret;
      }
      closeMention();
    });
  };

  const getCaretPos = () => (taRef.current ? taRef.current.selectionStart ?? 0 : 0);

  // ---------- RENDER ----------
  return (
    <div className="bg-background border-1 rounded-lg p-4">
      <div className="flex gap-3">
        <Avatar className="h-9 w-9 flex-shrink-0">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback className="text-xs bg-muted">
            {(displayName?.[0] || "U").toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1">
          {/* wrapper MUST be relative so popover can be absolutely positioned inside it */}
          <div ref={wrapperRef} className="relative">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => {
                const v = e.target.value;
                const pos = e.target.selectionStart ?? 0;
                setText(v);
                // detect mention on fresh DOM value (no stale-state)
                requestAnimationFrame(() => tryDetectMention(v, pos));
              }}
              onKeyUp={(e) => {
                // Don't re-run detection on navigation/selection keys to avoid resetting activeIdx
                if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
                tryDetectMention();
              }}
              onClick={() => tryDetectMention()}
              placeholder={placeholder}
              className={cn(
                "w-full min-h-[80px] resize-none bg-muted/50 outline-none border-0 ring-0 rounded-md",
                "placeholder:text-muted-foreground text-foreground",
                "px-3 py-2 text-sm"
              )}
              autoFocus={autoFocus}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
                if (mentionOpen) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(i + 1, filteredMembers.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const m = filteredMembers[activeIdx];
                    if (m) insertMention(m.displayName || m.email || "Member");
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeMention();
                  }
                }
              }}
            />

            {mentionOpen && popoverPos && (
              <div
                ref={popoverRef}
                className="absolute z-50 w-72 p-2 backdrop-blur-[8px] dark:bg-black/10 bg-white/10 border rounded-lg"
                style={{
                  top: `${popoverPos.top}px`,
                  left: `${popoverPos.left}px`,
                }}
              >
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground px-2">
                    {mentionQuery ? `Searching "${mentionQuery}"...` : "Type to filter"}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredMembers.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">No matches</div>
                    ) : (
                      filteredMembers.map((m, idx) => (
                        <div
                          key={(m as any).userId || idx}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md cursor-pointer",
                            idx === activeIdx ? "bg-muted" : "hover:bg-muted/50"
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(m.displayName || m.email || "Member");
                          }}
                          onMouseEnter={() => setActiveIdx(idx)}
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={(m.photoURL as any) ?? undefined} />
                            <AvatarFallback className="text-xs">
                              {(m.displayName || m.email || "M").slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{m.displayName || "Member"}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.email || ""}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" title="Attach image"><ImageIcon className="h-4 w-4" /></button>
              <button
                className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                title="Mention"
                onClick={() => {
                  const pos = getCaretPos();
                  openMentionAt(pos, true);
                }}
              >
                <AtSign className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {onCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => {
                    setText("");
                    onCancel?.();
                  }}
                  disabled={sending}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 px-4 bg-foreground hover:bg-foreground/90 text-background"
                onClick={handleSend}
                disabled={!text.trim() || sending}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
