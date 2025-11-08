"use client";
import React, { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

interface GmailMessageMeta {
  id: string;
  threadId: string;
  snippet?: string;
  headers?: Record<string, string>;
}

const InboxPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<GmailMessageMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load cached token on mount
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
        // Soft expiry ~55 minutes
        const exp = Date.now() + 55 * 60 * 1000;
        sessionStorage.setItem("gmail_access_token", token);
        sessionStorage.setItem("gmail_token_expires_at", String(exp));
      }
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
    }
  };

  useEffect(() => {
    const fetchMessages = async () => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        // List message IDs
        const listRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`);
        const listData = await listRes.json();
        const ids: { id: string; threadId: string }[] = listData.messages || [];

        // Fetch metadata for each message (Subject, From, Date)
        const detailed: GmailMessageMeta[] = await Promise.all(
          ids.map(async (m) => {
            const detailRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!detailRes.ok) return { id: m.id, threadId: m.threadId };
            const detailData = await detailRes.json();
            const headersArray: { name: string; value: string }[] = detailData.payload?.headers || [];
            const headers: Record<string, string> = {};
            headersArray.forEach((h) => (headers[h.name] = h.value));
            return {
              id: m.id,
              threadId: m.threadId,
              snippet: detailData.snippet,
              headers,
            };
          })
        );
        setMessages(detailed);
      } catch (e: any) {
        setError(e.message || "Failed to load messages");
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [accessToken]);

  return (
    <div style={{ padding: "1.5rem" }}>
      <h1>Inbox</h1>
      {!accessToken && (
        <button onClick={signInForGmail}>Sign in with Google & Load Gmail</button>
      )}
      {accessToken && <p>Access token acquired. Loading messages...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Loading...</p>}
      {!loading && messages.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {messages.map((m) => (
            <li key={m.id} style={{ borderBottom: "1px solid #ddd", marginBottom: "0.75rem", paddingBottom: "0.75rem" }}>
              <div><strong>Subject:</strong> {m.headers?.Subject || "(no subject)"}</div>
              <div><strong>From:</strong> {m.headers?.From || "(unknown)"}</div>
              <div><strong>Date:</strong> {m.headers?.Date || "(no date)"}</div>
              <div style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "#555" }}>{m.snippet}</div>
            </li>
          ))}
        </ul>
      )}
      {accessToken && !loading && messages.length === 0 && <p>No messages loaded.</p>}
      <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#666" }}>
        This uses Gmail Readonly scope. For more access (labels, body, send) add appropriate scopes and handle incremental auth.
      </p>
    </div>
  );
};

export default InboxPage;
