"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { ArrowLeft, Mail, Loader2, Paperclip } from "lucide-react";
import DOMPurify from "dompurify";
import { getCachedMessageDetail, saveMessageDetail } from "@/lib/gmailCache";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface GmailMessageFull {
  id: string;
  threadId?: string;
  snippet?: string;
  payload?: any;
  internalDate?: string;
  labelIds?: string[];
  headers?: Record<string, string>;
  bodyHtml?: string;
  bodyText?: string;
}

const decodeBase64 = (b64: string) => {
  try {
    return decodeURIComponent(
      escape(
        atob(b64.replace(/-/g, "+").replace(/_/g, "/"))
      )
    );
  } catch {
    return atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  }
};

const extractBody = (payload: any): { html?: string; text?: string } => {
  if (!payload) return {};
  const traverse = (p: any, acc: { html?: string; text?: string }) => {
    if (!p) return acc;
    if (p.mimeType === "text/html" && p.body?.data && !acc.html) {
      acc.html = decodeBase64(p.body.data);
    }
    if (p.mimeType === "text/plain" && p.body?.data && !acc.text) {
      acc.text = decodeBase64(p.body.data);
    }
    if (p.parts) p.parts.forEach((part: any) => traverse(part, acc));
    return acc;
  };
  return traverse(payload, {});
};

const buildRFC2822 = ({ from, to, subject, inReplyTo, references, body }: { from: string; to: string; subject: string; inReplyTo?: string; references?: string; body: string; }) => {
  let headers = "";
  headers += `From: ${from}\r\n`;
  headers += `To: ${to}\r\n`;
  headers += `Subject: ${subject}\r\n`;
  headers += `Content-Type: text/plain; charset=UTF-8\r\n`;
  if (inReplyTo) headers += `In-Reply-To: ${inReplyTo}\r\n`;
  if (references) headers += `References: ${references}\r\n`;
  headers += `\r\n`;
  return headers + body;
};

const toBase64Url = (str: string) => {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const MessageDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [message, setMessage] = useState<GmailMessageFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<GmailMessageFull[]>([]);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  // summarization state
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const LLM_MODEL_SUMMARY = process.env.NEXT_PUBLIC_OLLAMA_MODEL || "ollama gpt-oss20B";
  const LLM_ENDPOINT = process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT || "http://172.168.168.148:5000";
  const GMAIL_API_BASE = process.env.NEXT_PUBLIC_GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1";
  
  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("ollama_api_key") : null;
      setApiKey(saved || "");
    } catch {}
  }, []);
  
  useEffect(() => {
    try { if (apiKey) localStorage.setItem("ollama_api_key", apiKey); } catch {}
  }, [apiKey]);

  // Load token
  useEffect(() => {
    const token = sessionStorage.getItem("gmail_access_token");
    const exp = Number(sessionStorage.getItem("gmail_token_expires_at") || 0);
    if (token && exp && Date.now() < exp) {
      setAccessToken(token);
    }
  }, []);

  const signInForGmail = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    provider.setCustomParameters({ include_granted_scopes: "true" });
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

  // Try cache first
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !id) return;
    getCachedMessageDetail(uid, id).then((cached) => {
      if (cached) {
        setMessage(cached as any);
      }
    });
  }, [id]);

  const fetchMessage = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      const headersArray: { name: string; value: string }[] = data.payload?.headers || [];
      const headers: Record<string, string> = {};
      headersArray.forEach((h) => (headers[h.name] = h.value));
      const { html, text } = extractBody(data.payload);
      const enriched = { ...data, headers, bodyHtml: html ?? null, bodyText: text ?? null };
      setMessage(enriched);
      const uid = auth.currentUser?.uid;
      if (uid) await saveMessageDetail(uid, id, enriched);
    } catch (e: any) {
      setError(e.message || "Failed to load message");
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    fetchMessage();
  }, [fetchMessage]);

  const fetchThread = useCallback(async (threadId: string) => {
    if (!accessToken || !threadId) return;
    try {
      const res = await fetch(
        `${GMAIL_API_BASE}/users/me/threads/${threadId}?format=metadata`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const msgs = (data.messages || []).map((msg: any) => {
        const headersArray: { name: string; value: string }[] = msg.payload?.headers || [];
        const headers: Record<string, string> = {};
        headersArray.forEach((h) => (headers[h.name] = h.value));
        return { id: msg.id, headers, snippet: msg.snippet, internalDate: msg.internalDate } as GmailMessageFull;
      });
      setThreadMessages(msgs);
    } catch {}
  }, [accessToken]);

  useEffect(() => {
    if (message?.threadId) fetchThread(message.threadId);
  }, [message?.threadId, fetchThread]);

  const sanitize = (html?: string) => (html ? DOMPurify.sanitize(html) : "");

  // Extract attachments (metadata level: list parts with attachmentId)
  const listAttachments = (payload: any): Array<{ filename: string; id: string; mimeType?: string }> => {
    const acc: Array<{ filename: string; id: string; mimeType?: string }> = [];
    const walk = (p: any) => {
      if (!p) return;
      if (p.filename && p.body?.attachmentId) {
        acc.push({ filename: p.filename, id: p.body.attachmentId, mimeType: p.mimeType });
      }
      if (p.parts) p.parts.forEach(walk);
    };
    walk(payload);
    return acc;
  };
  const attachments = listAttachments(message?.payload);

  const downloadAttachment = async (attachmentId: string, filename: string) => {
    if (!accessToken || !message?.id) return;
    try {
      const res = await fetch(
        `${GMAIL_API_BASE}/users/me/messages/${message.id}/attachments/${attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch attachment");
      const data = await res.json();
      const bytes = atob(data.data.replace(/-/g, "+").replace(/_/g, "/"));
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const blob = new Blob([buf]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {}
  };

  const subject = message?.headers?.Subject || "(no subject)";
  const from = message?.headers?.From || "(unknown sender)";
  const to = message?.headers?.To || message?.headers?.DeliveredTo || "";
  const date = message?.headers?.Date
    ? new Date(message.headers.Date).toLocaleString()
    : message?.internalDate
    ? new Date(Number(message.internalDate)).toLocaleString()
    : "";

  const ensureSendScopes = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.modify");
    provider.addScope("https://www.googleapis.com/auth/gmail.send");
    provider.setCustomParameters({ include_granted_scopes: "true" });
    const result = await signInWithPopup(auth, provider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    return cred?.accessToken || accessToken;
  };

  const messageIdHeader = (message?.headers?.["Message-ID"]) || message?.headers?.["Message-Id"];

  const sendReply = async () => {
    try {
      setSending(true);
      let token = accessToken;
      if (!token) token = await ensureSendScopes();
      if (!token) throw new Error("No access token");
      const userEmail = auth.currentUser?.email || "";
      const raw = buildRFC2822({
        from: userEmail,
        to: replyTo,
        subject: replySubject,
        inReplyTo: messageIdHeader,
        references: messageIdHeader,
        body: replyBody,
      });
      const rawEncoded = toBase64Url(raw);
      const res = await fetch(`${GMAIL_API_BASE}/users/me/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: rawEncoded, threadId: message?.threadId }),
      });
      if (!res.ok) throw new Error(`Send failed: ${res.status}`);
      setReplyOpen(false);
      setReplyBody("");
    } catch (e: any) {
      alert(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ");

  const summarizeEmail = async () => {
    if (!message) return;
    if (!apiKey) { setSummaryError("No Ollama API key set"); return; }
    setSummarizing(true);
    setSummaryError(null);
    setSummary(null);
    const trySummarize = async (model: string) => {
      const subj = message.headers?.Subject || "(no subject)";
      const from = message.headers?.From || "";
      const body = message.bodyText || (message.bodyHtml ? stripHtml(message.bodyHtml) : message.snippet || "");
      const content = `${subj}\nFrom: ${from}\n\n${body}`.slice(0, 12000);
      const res = await fetch(`${LLM_ENDPOINT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: `Summarize the following email in 5 concise bullet points focusing on actionable items, deadlines, dates, required responses, and key decisions. If there is a due date or meeting time, include a line starting with Date:. Return plain text only.\n\nEmail:\n${content}`
          }],
        }),
      });
      if (!res.ok) {
        let detail = "";
        try { detail = await res.text(); } catch {}
        throw new Error(`LLM ${model} error ${res.status}: ${detail?.slice(0,200)}`);
      }
      const data = await res.json();
      const out: string = (data.choices?.[0]?.message?.content || "").toString().trim();
      return out;
    };
    try {
      let out = await trySummarize(LLM_MODEL_SUMMARY);
      if (!out) {
        out = await trySummarize("ollama gpt-oss20B");
      }
      if (!out) throw new Error("Model returned empty summary");
      setSummary(out);
    } catch (e: any) {
      setSummaryError(e.message || "Failed to summarize");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" /> {subject}
        </h1>
        {/* Summarize button */}
        <button
          disabled={summarizing || !message}
          onClick={summarizeEmail}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100 disabled:opacity-60"
        >
          {summarizing ? <><Loader2 className="h-4 w-4 animate-spin" /> Summarizing...</> : "Summarize"}
        </button>

      </div>

      {summaryError && <p className="text-red-500 text-sm mb-4">{summaryError}</p>}
      {summary && (
        <div className="border dark:border-white/10 border-zinc-200 rounded-lg p-4 mb-6 dark:bg-black bg-white">
          <div className="text-sm font-medium mb-2">Summary</div>
          <div className="prose dark:prose-invert max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {!accessToken && (
        <div className="mb-4">
          <button
            onClick={signInForGmail}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
          >
            Sign in to Gmail
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm opacity-70">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading message...
        </div>
      )}
      {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}

      {message && !loading && (
        <div className="space-y-6">
          <div className="border dark:border-white/10 border-zinc-200 rounded-lg p-4 dark:bg-black bg-white">
            <div className="text-sm flex flex-col gap-1">
              <div><span className="font-semibold">From:</span> {from}</div>
              {to && <div><span className="font-semibold">To:</span> {to}</div>}
              <div><span className="font-semibold">Date:</span> {date}</div>
              {message.headers?.Cc && (
                <div><span className="font-semibold">Cc:</span> {message.headers.Cc}</div>
              )}
              {message.headers?.Bcc && (
                <div><span className="font-semibold">Bcc:</span> {message.headers.Bcc}</div>
              )}
              <div><span className="font-semibold">Message ID:</span> {message.headers?.['Message-ID'] || message.id}</div>
            </div>
          </div>

          {/* attachments */}
          {attachments.length > 0 && (
            <div className="border dark:border-white/10 border-zinc-200 rounded-lg p-4 dark:bg-black bg-white">
              <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                <Paperclip className="h-4 w-4" /> Attachments ({attachments.length})
              </div>
              <ul className="text-sm space-y-1">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{a.filename || "attachment"}</span>
                    <button
                      onClick={() => downloadAttachment(a.id, a.filename)}
                      className="text-blue-600 hover:underline"
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* body card */}
          <div className="border dark:border-white/10 border-zinc-200 rounded-lg p-4 dark:bg-black bg-white">
            {message.bodyHtml ? (
              <div
                className="prose dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: sanitize(message.bodyHtml) }}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm opacity-80">{message.bodyText || message.snippet}</pre>
            )}
          </div>

          {/* thread preview */}
          {threadMessages.length > 1 && (
            <div className="border dark:border-white/10 border-zinc-200 rounded-lg p-4 dark:bg-black bg-white">
              <div className="text-sm font-medium mb-2">Thread</div>
              <ul className="space-y-2">
                {threadMessages.map((tm) => (
                  <li key={tm.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="truncate max-w-[70%]">{tm.headers?.Subject || "(no subject)"}</span>
                      <span className="text-xs opacity-60">
                        {tm.headers?.Date
                          ? new Date(tm.headers.Date).toLocaleString()
                          : tm.internalDate
                          ? new Date(Number(tm.internalDate)).toLocaleString()
                          : ""}
                      </span>
                    </div>
                    <div className="text-xs opacity-70 truncate">{tm.snippet}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reply box */}
          <div className="border dark:border-white/10 border-zinc-200 rounded-lg p-4 dark:bg-black bg-white">
            {!replyOpen ? (
              <button
                onClick={() => { setReplyOpen(true); setReplyTo(message?.headers?.From || ""); setReplySubject(`Re: ${subject}`); }}
                className="text-sm text-blue-600 hover:underline"
              >
                Reply
              </button>
            ) : (
              <div className="space-y-3">
                <div className="text-sm">To: {replyTo}</div>
                <input
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white"
                />
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={6}
                  placeholder="Write your reply..."
                  className="w-full rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white"
                />
                <div className="flex gap-2">
                  <button
                    disabled={sending}
                    onClick={sendReply}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100 disabled:opacity-60"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                  <button
                    onClick={() => setReplyOpen(false)}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm border dark:border-white/10 border-zinc-200 dark:bg-black bg-white dark:hover:bg-white/10 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageDetailPage;
