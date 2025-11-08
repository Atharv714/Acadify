"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Mail, Filter, RefreshCw, Search as SearchIcon, EyeOff } from "lucide-react";
import { getCachedMessages, saveMessages } from "@/lib/gmailCache";
import { collection, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { parse, isValid, addHours } from "date-fns";

interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet?: string;
  headers?: Record<string, string>;
  internalDate?: string;
  labelIds?: string[];
}

const KEYWORDS = [
  "assignment",
  "quiz",
  "exam",
  "test",
  "project",
  "homework",
  "deadline",
  "due",
  "submission",
  "syllabus",
  "lab",
  "lecture",
  "class",
  "course",
  "schedule",
];

const InboxDashboardPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [messages, setMessages] = useState<GmailMessageMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showFilteredOnly, setShowFilteredOnly] = useState(false);
  const [hidePromotions, setHidePromotions] = useState(true);
  const [query, setQuery] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [calendarSyncCount, setCalendarSyncCount] = useState(0);
  const [calendarErrors, setCalendarErrors] = useState<string[]>([]);
  const [llmUsedCount, setLlmUsedCount] = useState(0);
  const llmUsedCountRef = useRef(0);
  const llmTriedIdsRef = useRef<Set<string>>(new Set());

  const LLM_MODEL = process.env.NEXT_PUBLIC_OLLAMA_MODEL || "ollama gpt-oss20B";
  const LLM_ENDPOINT = process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT || "http://172.168.168.148:5000";
  const GMAIL_API_BASE = process.env.NEXT_PUBLIC_GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1";
  const CALENDAR_API_BASE = process.env.NEXT_PUBLIC_CALENDAR_API_BASE || "https://www.googleapis.com/calendar/v3";
  const [apiKey, setApiKey] = useState<string>("");
  
  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("ollama_api_key") : null;
      setApiKey(saved || "");
    } catch {}
  }, []);
  
  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem("ollama_api_key", apiKey);
    } catch {}
  }, [apiKey]);


  useEffect(() => {
    const uTok = sessionStorage.getItem("unified_access_token");
    const uExp = Number(sessionStorage.getItem("unified_token_expires_at") || 0);
    if (uTok && uExp && Date.now() < uExp) {
      setAccessToken(uTok);
      return;
    }
    const token = sessionStorage.getItem("gmail_access_token");
    const exp = Number(sessionStorage.getItem("gmail_token_expires_at") || 0);
    if (token && exp && Date.now() < exp) {
      setAccessToken(token);
    }
  }, []);


  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getCachedMessages(uid, 50).then((cached) => {
      if (cached.length > 0) {
        setMessages(
          cached.map((c) => ({
            id: c.id,
            threadId: c.threadId || "",
            snippet: c.snippet,
            headers: { Subject: c.subject || "", From: c.from || "", Date: c.date || "" },
            internalDate: c.internalDate ? String(c.internalDate) : undefined,
            labelIds: c.labelIds,
          }))
        );
      }
    });
  }, []);

  const signInForGmail = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    provider.addScope("https://www.googleapis.com/auth/calendar.events");
    provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
    provider.setCustomParameters({ include_granted_scopes: "true", prompt: "consent" });
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setAccessToken(token);
        const exp = Date.now() + 55 * 60 * 1000;
        sessionStorage.setItem("gmail_access_token", token);
        sessionStorage.setItem("gmail_token_expires_at", String(exp));
      }
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
    }
  };

  const buildListUrl = (pageToken?: string) => {
    const params = new URLSearchParams();
    params.set("maxResults", "25");
    if (query.trim()) params.set("q", query.trim());
    if (pageToken) params.set("pageToken", pageToken);
    return `${GMAIL_API_BASE}/users/me/messages?${params.toString()}`;
  };

  // Attempt to parse an event date from subject/snippet
  const tryParseDateFromText = (text: string): Date | null => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return null;
    // ISO 2025-11-04 or 2025-11-04 14:30
    const iso = t.match(/(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
    if (iso) {
      const dt = iso[1] + (iso[2] ? " " + iso[2] : " 09:00");
      const d = parse(dt, "yyyy-MM-dd HH:mm", new Date());
      return isValid(d) ? d : null;
    }
    // Month name patterns: Nov 4, 2025 14:00 / November 4 2025
    const monthName = t.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?/i);
    if (monthName) {
      const d1 = parse(monthName[0], "MMM d, yyyy h:mm a", new Date());
      if (isValid(d1)) return d1;
      const d2 = parse(monthName[0], "MMMM d, yyyy h:mm a", new Date());
      if (isValid(d2)) return d2;
      const d3 = parse(monthName[0], "MMM d, yyyy", new Date());
      if (isValid(d3)) return d3;
      const d4 = parse(monthName[0], "MMMM d yyyy", new Date());
      if (isValid(d4)) return d4;
    }
    // dd/MM/yyyy or MM/dd/yyyy with optional time HH:mm
    const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (slash) {
      const [_, a, b, y, hh, mm] = slash;
      // Heuristic: if first > 12, treat as dd/MM
      const first = Number(a), second = Number(b);
      const fmt = first > 12 ? "dd/MM/yyyy HH:mm" : "MM/dd/yyyy HH:mm";
      const dt = `${a}/${b}/${y} ${hh ?? "09"}:${mm ?? "00"}`;
      const d = parse(dt, fmt, new Date());
      return isValid(d) ? d : null;
    }
    return null;
  };

  // Decode base64url Gmail bodies
  const decodeBase64Url = (data: string): string => {
    try {
      const b64 = data.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(data.length / 4) * 4, "=");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  };
  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ");
  const collectTextFromPayload = (payload: any): string => {
    if (!payload) return "";
    let textPlain = "";
    let textHtml = "";
    const dive = (p: any) => {
      if (!p) return;
      if (p.mimeType === "text/plain" && p.body?.data) textPlain += " " + decodeBase64Url(p.body.data);
      else if (p.mimeType === "text/html" && p.body?.data) textHtml += " " + stripHtml(decodeBase64Url(p.body.data));
      if (p.parts) p.parts.forEach(dive);
    };
    dive(payload);
    if (!textPlain && payload.body?.data) {
      const decoded = decodeBase64Url(payload.body.data);
      if (payload.mimeType === "text/plain") textPlain = decoded; else textHtml = stripHtml(decoded);
    }
    return (textPlain || textHtml || "").replace(/\s+/g, " ").trim();
  };

  const extractDateWithLLM = async (apiKey: string, text: string): Promise<Date | null> => {
    try {
      const cleaned = text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
      const res = await fetch(`${LLM_ENDPOINT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{
            role: "user",
            content: `Extract a single ISO 8601 datetime (RFC3339) in the user's local timezone for the exam/quiz/class/assignment time if present in this email. If a time like "11 pm" appears, assume minutes :00. If date exists without time, assume 09:00. If none exists, return "null". Only return the ISO string or "null". Now is ${new Date().toString()}.\n\nEmail:\n${cleaned.slice(0, 8000)}`
          }],
        }),
      });
      if (!res.ok) {
        console.log(`LLM fetch failed: ${res.status} ${res.statusText}`);
        return null;
      }
      const data = await res.json();
      const out: string = (data.choices?.[0]?.message?.content || "").toString().trim();
      console.log(`LLM response for message: "${out}"`);
      const val = out.replace(/^"+|"+$/g, "");
      if (!val || val.toLowerCase() === "null") return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    } catch (err) {
      console.log(`LLM error: ${err}`);
      return null;
    }
  };

  const ensureCalendarEventForMessage = async (token: string, msg: GmailMessageMeta, subject: string, snippet: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref = doc(collection(db, "users", uid, "gmailEvents"), msg.id);
    const exists = await getDoc(ref);
    if (exists.exists()) {
      console.log(`Calendar event already exists for message ${msg.id}, skipping.`);
      return; // already created
    }

    // No heuristics: only use LLM and only for the first 3 emails total
    let when: Date | null = null;
    const shouldUseLLM = !!apiKey && llmUsedCountRef.current < 3 && !llmTriedIdsRef.current.has(msg.id);

    if (shouldUseLLM) {
      try {
        const fullRes = await fetch(
          `${GMAIL_API_BASE}/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          const bodyText = collectTextFromPayload(fullData.payload);
          const merged = `${subject}\n${snippet || ""}\n${bodyText}`;
          llmTriedIdsRef.current.add(msg.id);
          const nextCount = llmUsedCountRef.current + 1;
          when = await extractDateWithLLM(apiKey, merged);
          setLlmUsedCount(nextCount);
          llmUsedCountRef.current = nextCount;
          console.log(`LLM parsed date for ${msg.id}: ${when ? when.toISOString() : 'null'} (usage ${nextCount}/3)`);
        } else {
          console.log(`Failed to fetch full body for ${msg.id}: ${fullRes.status}`);
        }
      } catch (err) {
        console.log(`Error fetching full body for ${msg.id}: ${err}`);
      }
    }

    if (!when || when.getTime() < Date.now() - 60 * 60 * 1000) {
      console.log(`No valid future date for ${msg.id}, skipping calendar add.`);
      return; // ignore past or no date
    }

    try {
      const end = addHours(when, 1);
      const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: subject || "Academic item",
          description: snippet || "Added from Inbox Academic filter",
          start: { dateTime: when.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      });
      if (!res.ok) {
        console.log(`Calendar create failed for ${msg.id}: ${res.status} ${res.statusText}`);
        throw new Error(`Calendar create failed ${res.status}`);
      }
      const data = await res.json();
      await setDoc(ref, { eventId: data.id, createdAt: serverTimestamp(), start: when.toISOString() });
      console.log(`Calendar event added for ${msg.id}: true`);
      setCalendarSyncCount((c) => c + 1);
    } catch (err: any) {
      console.log(`Calendar add failed for ${msg.id}: false - ${err.message || "calendar error"}`);
      setCalendarErrors((e) => [...e, err.message || "calendar error"]);
    }
  };

  const fetchMessages = async (reset = false) => {
    if (!accessToken) return;
    reset ? setLoading(true) : setLoadingMore(true);
    setError(null);
    try {
      const listRes = await fetch(buildListUrl(reset ? undefined : nextPageToken || undefined), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`);
      const listData = await listRes.json();
      setNextPageToken(listData.nextPageToken || null);
      const ids: { id: string; threadId: string }[] = listData.messages || [];

      const detailed: GmailMessageMeta[] = await Promise.all(
        ids.map(async (m) => {
          const detailRes = await fetch(
            `${GMAIL_API_BASE}/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!detailRes.ok) return { id: m.id, threadId: m.threadId } as GmailMessageMeta;
          const detailData = await detailRes.json();
          const headersArray: { name: string; value: string }[] = detailData.payload?.headers || [];
          const headers: Record<string, string> = {};
          headersArray.forEach((h) => (headers[h.name] = h.value));
          return {
            id: m.id,
            threadId: m.threadId,
            snippet: detailData.snippet,
            headers,
            internalDate: detailData.internalDate,
            labelIds: detailData.labelIds,
          } as GmailMessageMeta;
        })
      );
      setMessages((prev) => (reset ? detailed : [...prev, ...detailed]));

      // Save to cache
      const uid = auth.currentUser?.uid;
      if (uid) {
        const toCache = detailed.map((d) => ({
          id: d.id,
          threadId: d.threadId,
          subject: d.headers?.Subject,
          from: d.headers?.From,
          date: d.headers?.Date,
          snippet: d.snippet,
          internalDate: d.internalDate ? Number(d.internalDate) : undefined,
          labelIds: d.labelIds,
          isAcademic: KEYWORDS.some((kw) => (d.headers?.Subject || "").toLowerCase().includes(kw) || (d.snippet || "").toLowerCase().includes(kw)),
        }));
        saveMessages(uid, toCache);
      }

      // Auto-create calendar events from academic emails with dates
      await Promise.all(
        detailed.map(async (d) => {
          const subject = d.headers?.Subject || "";
          const snippet = d.snippet || "";
          const isAcademic = KEYWORDS.some((kw) => subject.toLowerCase().includes(kw) || snippet.toLowerCase().includes(kw));
          if (!isAcademic) return;
          await ensureCalendarEventForMessage(accessToken, d, subject, snippet);
        })
      );
    } catch (e: any) {
      setError(e.message || "Failed to load messages");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Heuristic filter
  const filteredMessages = useMemo(() => {
    let list = messages;
    if (hidePromotions) {
      list = list.filter((m) => !m.labelIds?.some((l) => l === "CATEGORY_PROMOTIONS" || l === "CATEGORY_SOCIAL"));
    }
    if (!showFilteredOnly) return list;
    return list.filter((m) => {
      const subject = m.headers?.Subject?.toLowerCase() || "";
      const snippet = m.snippet?.toLowerCase() || "";
      return KEYWORDS.some((kw) => subject.includes(kw) || snippet.includes(kw));
    });
  }, [messages, showFilteredOnly, hidePromotions]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" /> Inbox
        </h1>
        <div className="flex items-center gap-3">
          {accessToken && (
            <>

              {/* Calendar sync status */}
              {calendarSyncCount > 0 && (
                <span className="text-xs px-2 py-1 rounded-md bg-green-500/20 text-green-600">
                  Added {calendarSyncCount} event{calendarSyncCount>1?'s':''}
                </span>
              )}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchMessages(true)}
                    placeholder="Search mail (e.g., subject:assignment newer_than:7d)"
                    className="rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white pr-8 min-w-[280px]"
                  />
                  <SearchIcon className="h-4 w-4 absolute right-2 top-2.5 opacity-60" />
                </div>
                <button
                  onClick={() => fetchMessages(true)}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
                >
                  Search
                </button>
              </div>
              <button
                onClick={() => setShowFilteredOnly((v) => !v)}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
              >
                <Filter className="h-4 w-4" /> {showFilteredOnly ? "Show All" : "Smart Filter"}
              </button>
              <button
                onClick={() => setHidePromotions((v) => !v)}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
                title="Hide Promotions & Social"
              >
                <EyeOff className="h-4 w-4" /> {hidePromotions ? "Hiding Promos" : "Show Promos"}
              </button>
              <button
                onClick={() => { setNextPageToken(null); fetchMessages(true); }}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </>
          )}
          {!accessToken && (
            <button
              onClick={signInForGmail}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
            >
              Sign in to Gmail
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-sm opacity-70">Loading messages...</p>}

      {!loading && accessToken && filteredMessages.length === 0 && (
        <p className="text-sm opacity-70">No messages.</p>
      )}

      <div className="space-y-2">
        {filteredMessages.map((m) => {
          const subject = m.headers?.Subject || "(no subject)";
          const from = m.headers?.From || "(unknown sender)";
          const date = m.headers?.Date
            ? new Date(m.headers.Date).toLocaleString()
            : m.internalDate
            ? new Date(Number(m.internalDate)).toLocaleString()
            : "";
          const unread = m.labelIds?.includes("UNREAD");
          const isAcademic = subject && [
            "assignment","quiz","exam","test","project","homework","deadline","due","submission","syllabus","lab","lecture","class","course","schedule"
          ].some((kw)=>subject.toLowerCase().includes(kw));
          return (
            <Link key={m.id} href={`/dashboard/inbox/${m.id}`} className="block">
              <div className={`group border dark:border-white/10 border-zinc-200 rounded-lg p-3 flex flex-col gap-1 hover:shadow-sm transition relative overflow-hidden dark:bg-black bg-white hover:dark:bg-white/5 hover:bg-zinc-50`}>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className={`text-sm truncate ${unread ? "font-semibold" : "font-medium"}`}>
                      {subject}
                    </span>
                    <span className="text-xs opacity-70 truncate">{from}</span>
                  </div>
                  <span className="text-xs opacity-60 ml-4 whitespace-nowrap">
                    {date}
                  </span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-white/70 line-clamp-2">
                  {m.snippet}
                </div>
                {isAcademic && (
                  <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-md bg-blue-600/70 dark:bg-blue-600/30 text-black dark:text-white">
                    Academic
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {calendarErrors.length > 0 && (
        <p className="text-xs text-red-500 mb-2">Calendar sync errors: {calendarErrors.slice(-1)[0]}</p>
      )}

      {nextPageToken && (
        <div className="flex justify-center mt-4">
          <button
            disabled={loadingMore}
            onClick={() => fetchMessages(false)}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100 disabled:opacity-60"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
};

export default InboxDashboardPage;
