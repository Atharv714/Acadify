from __future__ import annotations
import base64
import io
import logging
import re
import time
from dataclasses import dataclass
import threading
import os
from typing import Any, Dict, List, Optional

import requests
from flask import Flask, jsonify, request, session, redirect
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import service_account, credentials as oauth_credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from openai import OpenAI
from pypdf import PdfReader
from config import settings


FLASK_SECRET_KEY = settings.flask_secret_key or os.environ.get("FLASK_SECRET_KEY")

# Service account info (optional) - assemble if available
GOOGLE_SERVICE_ACCOUNT = None
if settings.google_project_id and settings.google_private_key:
  GOOGLE_SERVICE_ACCOUNT = {
    "type": "service_account",
    "project_id": settings.google_project_id,
    "private_key_id": settings.google_private_key_id,
    "private_key": settings.google_private_key,
    "client_email": settings.google_client_email,
    "client_id": settings.google_client_id,
    "auth_uri": settings.google_auth_uri,
    "token_uri": settings.google_token_uri,
    "auth_provider_x509_cert_url": settings.google_auth_provider_cert_url,
    "client_x509_cert_url": settings.google_client_cert_url,
  }

GMAIL_DELEGATED_USER = settings.gmail_delegated_user

GOOGLE_SCOPES = (settings.google_scopes.split(",") if getattr(settings, "google_scopes", None) else ["https://www.googleapis.com/auth/gmail.readonly"])

# OAuth (user consent)
OAUTH_CLIENT_ID = settings.oauth_client_id
OAUTH_CLIENT_SECRET = settings.oauth_client_secret
OAUTH_REDIRECT_URI = settings.oauth_redirect_uri

# OpenAI
OPENAI_API_KEY = settings.openai_api_key
OPENAI_MODEL = settings.openai_model

# Telegram Bot
TELEGRAM_BOT_TOKEN = settings.telegram_bot_token
TELEGRAM_API_BASE = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}" if TELEGRAM_BOT_TOKEN else None

TELEGRAM_CHAT_TOKENS: dict[int, dict] = {}
TOKENS_LOCK = threading.Lock()

NOTIFIED_EMAILS: dict[int, set[str]] = {}
NOTIFY_LOCK = threading.Lock()


app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
logger = logging.getLogger(__name__)


def build_gmail_service_from_oauth():
  tokens = session.get("gmail_oauth_tokens")
  if not tokens:
    return None
  creds = oauth_credentials.Credentials(
    token=tokens.get("access_token"),
    refresh_token=tokens.get("refresh_token"),
    token_uri="https://oauth2.googleapis.com/token",
    client_id=OAUTH_CLIENT_ID,
    client_secret=OAUTH_CLIENT_SECRET,
    scopes=GOOGLE_SCOPES,
  )
  try:
    if not creds.valid and creds.refresh_token:
      creds.refresh(GoogleRequest())
  except Exception:
    return None
  return build("gmail", "v1", credentials=creds, cache_discovery=False)


def build_gmail_service_from_tokens_dict(tokens: Dict[str, Any]):
  if not tokens:
    return None
  creds = oauth_credentials.Credentials(
    token=tokens.get("access_token"),
    refresh_token=tokens.get("refresh_token"),
    token_uri="https://oauth2.googleapis.com/token",
    client_id=OAUTH_CLIENT_ID,
    client_secret=OAUTH_CLIENT_SECRET,
    scopes=GOOGLE_SCOPES,
  )
  try:
    if not creds.valid and creds.refresh_token:
      creds.refresh(GoogleRequest())
  except Exception:
    return None
  return build("gmail", "v1", credentials=creds, cache_discovery=False)


def build_gmail_service_service_account():
  credentials = service_account.Credentials.from_service_account_info(
    GOOGLE_SERVICE_ACCOUNT, scopes=GOOGLE_SCOPES
  )
  if GMAIL_DELEGATED_USER:
    credentials = credentials.with_subject(GMAIL_DELEGATED_USER)
  return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def get_gmail_service():
  svc = build_gmail_service_from_oauth()
  if svc is not None:
    return svc
  return build_gmail_service_service_account()


@dataclass
class GmailMessage:
  id: str
  thread_id: str
  snippet: str
  internal_date: int
  headers: Dict[str, str]
  body_text: Optional[str] = None
  attachments: Optional[List[Dict[str, Any]]] = None


def list_messages(query: Optional[str] = None, max_results: int = 50, svc=None) -> List[str]:
  try:
    svc = svc or get_gmail_service()
    resp = (
      svc.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
    )
    return [m["id"] for m in resp.get("messages", [])]
  except HttpError as e:
    logger.error("Error listing messages: %s", e)
    return []


def _extract_body_text(payload: Dict[str, Any]) -> Optional[str]:
  parts = payload.get("parts") or []
  if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
    return base64.urlsafe_b64decode(payload["body"]["data"]).decode(errors="ignore")
  for p in parts:
    if p.get("mimeType") == "text/plain" and p.get("body", {}).get("data"):
      return base64.urlsafe_b64decode(p["body"]["data"]).decode(errors="ignore")
  for p in parts:
    if p.get("mimeType") == "text/html" and p.get("body", {}).get("data"):
      html = base64.urlsafe_b64decode(p["body"]["data"]).decode(errors="ignore")
      return re.sub(r"<[^>]+>", " ", html)
  return None


def _extract_attachments_meta(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
  out: List[Dict[str, Any]] = []
  parts = payload.get("parts") or []
  for p in parts:
    filename = p.get("filename")
    att_id = (p.get("body") or {}).get("attachmentId")
    if filename and att_id:
      out.append({"id": att_id, "filename": filename, "mimeType": p.get("mimeType")})
    for sp in (p.get("parts") or []):
      fname = sp.get("filename")
      att_id2 = (sp.get("body") or {}).get("attachmentId")
      if fname and att_id2:
        out.append({"id": att_id2, "filename": fname, "mimeType": sp.get("mimeType")})
  return out


def get_message(email_id: str, svc=None) -> Optional[GmailMessage]:
  try:
    svc = svc or get_gmail_service()
    raw = svc.users().messages().get(userId="me", id=email_id, format="full").execute()
    payload = raw.get("payload", {})
    headers = {h.get("name"): h.get("value") for h in payload.get("headers", [])}
    return GmailMessage(
      id=raw.get("id"),
      thread_id=raw.get("threadId"),
      snippet=raw.get("snippet", ""),
      internal_date=int(raw.get("internalDate", 0)),
      headers=headers,
      body_text=_extract_body_text(payload),
      attachments=_extract_attachments_meta(payload),
    )
  except HttpError as e:
    logger.error("Error getting message %s: %s", email_id, e)
    return None


def get_attachment_bytes(email_id: str, attachment_id: str, svc=None) -> Optional[bytes]:
  try:
    svc = svc or get_gmail_service()
    att = (
      svc.users().messages().attachments().get(userId="me", messageId=email_id, id=attachment_id).execute()
    )
    data = att.get("data")
    if not data:
      return None
    return base64.urlsafe_b64decode(data.encode("utf-8"))
  except HttpError as e:
    logger.error("Error getting attachment %s for message %s: %s", attachment_id, email_id, e)
    return None


# Simple parser
KEYWORDS = {
  "quiz": [r"\bquiz\b", r"\btest\b"],
  "assignment": [r"\bassignment\b", r"\bhw\b", r"\bhomework\b"],
  "event": [r"\bevent\b", r"\btalk\b", r"\bseminar\b"],
  "exam": [r"\bexam\b", r"\bmidterm\b", r"\bfinal\b"],
}

def parse_items(subject: str, body: Optional[str]) -> List[Dict[str, Any]]:
  text = f"{subject}\n{body or ''}".lower()
  def detect_type() -> str:
    for t, patterns in KEYWORDS.items():
      for pat in patterns:
        if re.search(pat, text):
          return t
    return "other"
  item = {
    "title": subject.strip(),
    "type": detect_type(),
    "source": "gmail",
  }
  return [item]


# Summarizer
_openai_client: Optional[OpenAI] = None
SYSTEM_PROMPT = (
  "You are a concise academic assistant. Summarize documents focusing on deadlines, "
  "requirements, topics. Keep it factual and compact."
)

def summarize_text(text: str, max_lines: int = 3) -> str:
  global _openai_client
  if _openai_client is None:
    _openai_client = OpenAI(api_key=OPENAI_API_KEY)
  resp = _openai_client.chat.completions.create(
    model=OPENAI_MODEL,
    messages=[
      {"role": "system", "content": SYSTEM_PROMPT},
      {"role": "user", "content": (
        f"Summarize the following email/content in at most {max_lines} lines. "
        "Emphasize dates/deadlines, tasks/requirements, and key topics.\n\n"
        f"Content:\n{text}"
      )},
    ],
  )
  return resp.choices[0].message.content.strip()


# =====================
# Routes
# =====================

@app.get("/")
def index():
  clickable = []
  parameterized = []
  for rule in app.url_map.iter_rules():
    methods = rule.methods or set()
    if "GET" not in methods:
      continue
    if rule.rule.startswith("/static"):
      continue
    if not rule.arguments:
      clickable.append(f'<li><a href="{rule.rule}">{rule.rule}</a></li>')
    else:
      params = ", ".join(sorted(rule.arguments))
      parameterized.append(f'<li>{rule.rule} <code>params: {params}</code></li>')
  clickable.sort(); parameterized.sort()
  html = f"""<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\">
  <title>API Index</title>
  <style>
  body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }}
  h1 {{ margin: 0 0 12px; }}
  .section {{ margin-top: 20px; }}
  code {{ background: #f6f8fa; padding: 2px 6px; border-radius: 4px; }}
  .btn {{ display: inline-block; background:#0b63d6; color:#fff; padding:8px 12px; border-radius:6px; text-decoration:none; margin-bottom:12px; }}
  </style>
  </head>
  <body>
  <h1>API routes</h1>
  <p><a class=\"btn\" href=\"/summarize\">Summarize latest 5 emails</a></p>
  <div class=\"section\">
    <h2>Clickable</h2>
    <ul>{''.join(clickable) or '<li>(none)</li>'}</ul>
  </div>
  <div class=\"section\">
    <h2>Parameterized</h2>
    <ul>{''.join(parameterized) or '<li>(none)</li>'}</ul>
  </div>
  </body>
</html>"""
  return html


##teelgram ke liye webhook oaur helper 

def _tg_send(chat_id: int, text: str):
  try:
    requests.post(f"{TELEGRAM_API_BASE}/sendMessage", json={"chat_id": chat_id, "text": text}, timeout=10)
  except Exception as e:
    logger.error("Telegram send failed: %s", e)


@app.post("/telegram/webhook")
def telegram_webhook():
  body = request.get_json(silent=True) or {}
  message = body.get("message") or {}
  chat = message.get("chat") or {}
  chat_id = chat.get("id")
  text = (message.get("text") or "").strip()
  if not chat_id:
    return jsonify({"status": "ignored"})

  
  tokens = TELEGRAM_CHAT_TOKENS.get(chat_id)
  svc = build_gmail_service_from_tokens_dict(tokens) if tokens else None

  def need_login():
    if svc is None:
      _tg_send(chat_id, "Not linked yet. Use /login first.")
      return True
    return False

  if text.startswith("/start"):
    _tg_send(chat_id, "Welcome! Commands:\n/login\n/summarize\n/sync\n/upcoming\n/search <term>\n/email <id>\n/attach <emailId> <attachmentId>\n/pdfsum <emailId> <attachmentId>\n/help")
  elif text.startswith("/help"):
    _tg_send(chat_id, "Help:\n/login link Gmail\n/summarize latest 5 summarized\n/sync list 10 detected items\n/upcoming list 10 upcoming items\n/search <term> search subjects\n/email <id> detail\n/attach <emailId> <attId> size\n/pdfsum <emailId> <attId> summarize PDF")
  elif text.startswith("/login"):
    login_url = "https://qmmd92p8-5000.inc1.devtunnels.ms/" + f"auth/google?tg_id={chat_id}"
    _tg_send(chat_id, f"Open to login: {login_url}\nAfter login use /summarize or /sync.")
  elif text.startswith("/summarize"):
    if need_login():
      return jsonify({"status": "ok"})
    ids = list_messages(max_results=5, svc=svc)
    if not ids:
      _tg_send(chat_id, "No emails fetched.")
    else:
      lines = []
      for mid in ids:
        msg = get_message(mid, svc=svc)
        if not msg:
          continue
        subj = (msg.headers.get("Subject") or "(no subject)").strip()
        body = (msg.body_text or "").strip()
        snippet = body[:120].replace("\n", " ") + ("…" if len(body) > 120 else "")
        lines.append(f"• {subj}: {snippet}")
        if len(lines) >= 5:
          break
      _tg_send(chat_id, "Latest emails:\n" + ("\n".join(lines) or "(none)"))
  elif text.startswith("/sync"):
    if need_login():
      return jsonify({"status": "ok"})
    ids = list_messages(max_results=15, svc=svc)
    items_lines = []
    for mid in ids[:10]:
      msg = get_message(mid, svc=svc)
      if not msg: continue
      subject = (msg.headers.get("Subject") or "(no subject)")
      parsed = parse_items(subject, msg.body_text)
      typ = parsed[0]["type"] if parsed else "other"
      items_lines.append(f"• {typ}: {subject[:60]} ({msg.id[:8]})")
    _tg_send(chat_id, "Synced items:\n" + ("\n".join(items_lines) or "(none)"))
  elif text.startswith("/upcoming"):
    if need_login():
      return jsonify({"status": "ok"})
    ids = list_messages(max_results=50, svc=svc)
    upcoming = []
    for mid in ids:
      msg = get_message(mid, svc=svc)
      if not msg: continue
      subject = msg.headers.get("Subject", "")
      parsed = parse_items(subject, msg.body_text)
      for it in parsed:
        if it["type"] in ("assignment", "quiz", "exam", "event"):
          upcoming.append((it["type"], subject, msg.id))
      if len(upcoming) >= 10:
        break
    lines = [f"• {t}: {s[:55]} ({mid[:8]})" for t,s,mid in upcoming]
    _tg_send(chat_id, "Upcoming:\n" + ("\n".join(lines) or "(none)"))
  elif text.startswith("/search"):
    if need_login():
      return jsonify({"status": "ok"})
    parts = text.split(maxsplit=1)
    if len(parts) < 2 or len(parts[1]) < 2:
      _tg_send(chat_id, "Usage: /search <term>")
    else:
      term = parts[1]
      ids = list_messages(query=term, max_results=20, svc=svc)
      found = []
      for mid in ids:
        msg = get_message(mid, svc=svc)
        if not msg: continue
        subj = msg.headers.get("Subject", "")
        if term.lower() in subj.lower():
          found.append(f"• {subj[:70]} ({mid[:8]})")
        if len(found) >= 8:
          break
      _tg_send(chat_id, "Search results:\n" + ("\n".join(found) or "(none)"))
  elif text.startswith("/email"):
    if need_login():
      return jsonify({"status": "ok"})
    parts = text.split(maxsplit=1)
    if len(parts) < 2:
      _tg_send(chat_id, "Usage: /email <id>")
    else:
      mid = parts[1].strip()
      msg = get_message(mid, svc=svc)
      if not msg:
        _tg_send(chat_id, "Email not found")
      else:
        subj = msg.headers.get("Subject", "(no subject)")
        frm = msg.headers.get("From", "?")
        att_line = f"Attachments: {len(msg.attachments or [])}" if msg.attachments else "No attachments"
        body_preview = (msg.body_text or "").replace("\n", " ")[:200]
        _tg_send(chat_id, f"Subject: {subj}\nFrom: {frm}\n{att_line}\nBody: {body_preview}{'…' if len(body_preview)==200 else ''}")
  elif text.startswith("/attach"):
    if need_login():
      return jsonify({"status": "ok"})
    parts = text.split()
    if len(parts) != 3:
      _tg_send(chat_id, "Usage: /attach <emailId> <attachmentId>")
    else:
      email_id, att_id = parts[1], parts[2]
      blob = get_attachment_bytes(email_id, att_id, svc=svc)
      if blob is None:
        _tg_send(chat_id, "Attachment not found")
      else:
        _tg_send(chat_id, f"Attachment size: {len(blob)} bytes")
  elif text.startswith("/pdfsum"):
    if need_login():
      return jsonify({"status": "ok"})
    parts = text.split()
    if len(parts) == 1:
      # Auto: latest email, summarize all PDFs
      ids = list_messages(max_results=1, svc=svc)
      if not ids:
        _tg_send(chat_id, "No emails found")
        return jsonify({"status": "ok"})
      msg = get_message(ids[0], svc=svc)
      if not msg:
        _tg_send(chat_id, "Failed to load latest email")
        return jsonify({"status": "ok"})
      pdfs = []
      for a in (msg.attachments or []):
        fname = (a.get("filename") or "").lower()
        mtype = (a.get("mimeType") or "").lower()
        if mtype == "application/pdf" or fname.endswith(".pdf"):
          pdfs.append(a)
      if not pdfs:
        _tg_send(chat_id, "No PDF attachments in the latest email")
        return jsonify({"status": "ok"})
      lines = [f"Subject: {msg.headers.get('Subject','(no subject)')}"]
      for a in pdfs[:3]:  # show up to 3 pdfs to keep message short
        att_id = a.get("id")
        fname = a.get("filename")
        blob = get_attachment_bytes(msg.id, att_id, svc=svc)
        if not blob:
          lines.append(f"• {fname}: (download failed)")
          continue
        try:
          reader = PdfReader(io.BytesIO(blob))
          pages = min(len(reader.pages), 5)
          text = "\n".join((reader.pages[i].extract_text() or "") for i in range(pages))
          clipped = text[:3500]
          summary = summarize_text(clipped, max_lines=4)
          short = summary.replace("\n", " ")
          if len(short) > 350:
            short = short[:350] + "…"
          lines.append(f"• {fname}: {short}")
        except Exception as e:
          lines.append(f"• {fname}: (failed to read PDF: {e})")
      _tg_send(chat_id, "PDF summaries (latest email):\n" + "\n".join(lines))
    elif len(parts) == 3:
      email_id, att_id = parts[1], parts[2]
      blob = get_attachment_bytes(email_id, att_id, svc=svc)
      if blob is None:
        _tg_send(chat_id, "Attachment not found")
      else:
        try:
          reader = PdfReader(io.BytesIO(blob))
          text_pages = []
          for page in reader.pages[:5]:  # limit pages for speed
            extracted = page.extract_text() or ""
            if extracted:
              text_pages.append(extracted)
          combined = "\n".join(text_pages)[:4000]  # cap length
          summary = summarize_text(combined, max_lines=4)
          _tg_send(chat_id, "PDF summary:\n" + summary)
        except Exception as e:
          _tg_send(chat_id, f"Failed to read PDF: {e}")
    else:
      _tg_send(chat_id, "Usage: /pdfsum OR /pdfsum <emailId> <attachmentId>")
  else:
    _tg_send(chat_id, "Unknown command. Use /help")
  return jsonify({"status": "ok"})


@app.get("/health")
def health():
  return jsonify({"status": "ok"})




@app.get("/auth/google")
def start_google_oauth():
  base = "https://accounts.google.com/o/oauth2/v2/auth"
  scope = requests.utils.quote(" ".join(GOOGLE_SCOPES))
  tg_id = request.args.get("tg_id")
  state = f"tg:{tg_id}" if tg_id else None
  url = (
    f"{base}?client_id={OAUTH_CLIENT_ID}&redirect_uri={requests.utils.quote(OAUTH_REDIRECT_URI)}"
    f"&response_type=code&access_type=offline&prompt=consent&scope={scope}"
  )
  if state:
    url += f"&state={requests.utils.quote(state)}"
  return redirect(url)


@app.get("/auth/google/callback")
def google_oauth_callback():
  code = request.args.get("code")
  error = request.args.get("error")
  state = request.args.get("state")
  if error:
    return jsonify({"error": error}), 400
  if not code:
    return jsonify({"error": "Missing code"}), 400
  token_url = "https://oauth2.googleapis.com/token"
  data = {
    "code": code,
    "client_id": OAUTH_CLIENT_ID,
    "client_secret": OAUTH_CLIENT_SECRET,
    "redirect_uri": OAUTH_REDIRECT_URI,
    "grant_type": "authorization_code",
  }
  resp = requests.post(token_url, data=data, timeout=20)
  if resp.status_code != 200:
    return jsonify({"error": "Token exchange failed", "details": resp.text}), 400
  tj = resp.json()
  token_obj = {
    "access_token": tj.get("access_token"),
    "refresh_token": tj.get("refresh_token"),
    "expires_at": int(time.time()) + int(tj.get("expires_in", 0)),
    "scope": tj.get("scope"),
    "token_type": tj.get("token_type"),
  }
  # Save in browser session
  session["gmail_oauth_tokens"] = token_obj
  # If linking from Telegram, capture chat id from state and persist
  linked_chat = None
  if state and state.startswith("tg:"):
    try:
      linked_chat = int(state.split(":", 1)[1])
      with TOKENS_LOCK:
        TELEGRAM_CHAT_TOKENS[linked_chat] = token_obj
      with NOTIFY_LOCK:
        NOTIFIED_EMAILS.setdefault(linked_chat, set())
      _tg_send(linked_chat, "✅ Linked Gmail successfully. Send /summarize here to see your latest emails.")
    except Exception:
      pass
  return jsonify({"status": "oauth_success", "have_refresh": bool(tj.get("refresh_token")), "linked_chat": linked_chat})


@app.get("/oauth2/callback")
def oauth2_callback_alias():
  return google_oauth_callback()


@app.get("/auth/google/tokens")
def show_tokens():
  tokens = session.get("gmail_oauth_tokens")
  if not tokens:
    return jsonify({"authenticated": False})
  safe = {k: v for k, v in tokens.items() if k != "access_token"}
  return jsonify({"authenticated": True, "meta": safe})


@app.get("/telegram/set_webhook")
def telegram_set_webhook():
  url = request.args.get("url")
  if not url:
    return jsonify({"error": "Provide ?url=https://your.domain/telegram/webhook"}), 400
  r = requests.get(f"{TELEGRAM_API_BASE}/setWebhook", params={"url": url}, timeout=15)
  try:
    return jsonify(r.json())
  except Exception:
    return jsonify({"status": r.status_code, "text": r.text})


@app.get("/telegram/delete_webhook")
def telegram_delete_webhook():
  r = requests.get(f"{TELEGRAM_API_BASE}/deleteWebhook", timeout=15)
  try:
    return jsonify(r.json())
  except Exception:
    return jsonify({"status": r.status_code, "text": r.text})


@app.get("/telegram/webhook_info")
def telegram_webhook_info():
  r = requests.get(f"{TELEGRAM_API_BASE}/getWebhookInfo", timeout=15)
  try:
    return jsonify(r.json())
  except Exception:
    return jsonify({"status": r.status_code, "text": r.text})


@app.get("/telegram/test_send")
def telegram_test_send():
  try:
    chat_id = int(request.args.get("chat_id", "0"))
  except Exception:
    return jsonify({"error": "Provide numeric chat_id"}), 400
  text = request.args.get("text") or "Hello from backend"
  _tg_send(chat_id, text)
  return jsonify({"sent": True, "chat_id": chat_id, "text": text})




IMPORTANT_KEYWORDS = [
  "assignment", "deadline", "due", "exam", "quiz", "test", "submission", "project",
  "midterm", "final", "schedule change", "rescheduled", "venue", "room", "cancellation",
  "postponed", "reschedule", "class cancelled", "marks", "grades"
]

def is_important_email(subject: str, snippet: str) -> bool:
  text = f"{subject}\n{snippet}".lower()
  return any(k in text for k in IMPORTANT_KEYWORDS)


def _polling_loop(interval_seconds: int = 15):
  print("[poller] started")
  while True:
    try:
      with TOKENS_LOCK:
        entries = list(TELEGRAM_CHAT_TOKENS.items())
      for chat_id, tokens in entries:
        try:
          svc = build_gmail_service_from_tokens_dict(tokens)
        except Exception as e:
          print(f"[poller] build service failed for chat {chat_id}: {e}")
          continue
        if not svc:
          continue
        try:
          ids = list_messages(max_results=10, svc=svc)
        except Exception as e:
          print(f"[poller] list_messages failed for chat {chat_id}: {e}")
          continue
        if not ids:
          continue
        with NOTIFY_LOCK:
          seen = NOTIFIED_EMAILS.setdefault(chat_id, set())
        for mid in ids:
          if mid in seen:
            continue
          msg = get_message(mid, svc=svc)
          if not msg:
            with NOTIFY_LOCK:
              seen.add(mid)
            continue
          subject = msg.headers.get("Subject", "(no subject)")
          snippet = msg.snippet or (msg.body_text or "")[:140]
          important = is_important_email(subject, snippet)
          with NOTIFY_LOCK:
            seen.add(mid)
          if important:
            text = (
              "📣 Important academic email detected\n"
              f"Subject: {subject}\n"
              f"Snippet: {snippet}\n"
              f"ID: {mid}\n"
              f"Use /email {mid} to view details."
            )
            try:
              _tg_send(chat_id, text)
            except Exception as e:
              print(f"[poller] telegram send failed chat {chat_id} mid {mid}: {e}")
    except Exception as e:
      print(f"[poller] unexpected error: {e}")
    time.sleep(interval_seconds)


_poller_started = False

def ensure_poller_thread():
  global _poller_started
  if _poller_started:
    return
  
  if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
    t = threading.Thread(target=_polling_loop, kwargs={"interval_seconds": 15}, daemon=True)
    t.start()
    _poller_started = True
    print("[poller] background thread launched")


@app.post("/auth/google/refresh")
def refresh_tokens():
  tokens = session.get("gmail_oauth_tokens")
  if not tokens or not tokens.get("refresh_token"):
    return jsonify({"error": "No refresh token"}), 400
  token_url = "https://oauth2.googleapis.com/token"
  data = {
    "client_id": OAUTH_CLIENT_ID,
    "client_secret": OAUTH_CLIENT_SECRET,
    "refresh_token": tokens["refresh_token"],
    "grant_type": "refresh_token",
  }
  resp = requests.post(token_url, data=data, timeout=20)
  if resp.status_code != 200:
    return jsonify({"error": "Refresh failed", "details": resp.text}), 400
  nj = resp.json()
  tokens["access_token"] = nj.get("access_token")
  tokens["expires_at"] = int(time.time()) + int(nj.get("expires_in", 0))
  session["gmail_oauth_tokens"] = tokens
  return jsonify({"status": "refreshed", "expires_at": tokens["expires_at"]})


# mail nd attachment

@app.get("/emails/sync")
def emails_sync():
  ids = list_messages(max_results=25)
  parsed = []
  for mid in ids:
    msg = get_message(mid)
    if not msg:
      continue
    items = parse_items(msg.headers.get("Subject", "(no subject)"), msg.body_text)
    for it in items:
      it["emailId"] = msg.id
    parsed.extend(items)
  return jsonify({"fetched": len(ids), "parsed": len(parsed), "items": parsed[:50]})


@app.get("/emails/upcoming")
def emails_upcoming():
  ids = list_messages(max_results=100)
  out = []
  for mid in ids:
    msg = get_message(mid)
    if not msg:
      continue
    subject = msg.headers.get("Subject", "")
    items = parse_items(subject, msg.body_text)
    for it in items:
      it["emailId"] = msg.id
      out.append(it)
  return jsonify({"upcoming": out[:50]})


@app.get("/emails/search")
def emails_search():
  query = request.args.get("query")
  if not query or len(query) < 2:
    return jsonify({"error": "query parameter required (>=2 chars)"}), 400
  ids = list_messages(query=query, max_results=30)
  if not ids:
    return jsonify({"result": None})
  for mid in ids:
    msg = get_message(mid)
    if not msg:
      continue
    subject = msg.headers.get("Subject", "")
    if query.lower() in subject.lower():
      items = parse_items(subject, msg.body_text)
      first = items[0] if items else {"title": subject}
      first["emailId"] = msg.id
      first["attachments"] = [att.get("filename") for att in (msg.attachments or [])]
      return jsonify({"result": first})
  return jsonify({"result": None})


@app.get("/emails/<email_id>")
def email_detail(email_id: str):
  msg = get_message(email_id)
  if not msg:
    return jsonify({"error": "Email not found"}), 404
  items = parse_items(msg.headers.get("Subject", "(no subject)"), msg.body_text)
  summary = items[0] if items else None
  return jsonify({
    "id": msg.id,
    "subject": msg.headers.get("Subject"),
    "from": msg.headers.get("From"),
    "date": msg.headers.get("Date"),
    "attachments": msg.attachments or [],
    "parsed": summary,
  })


@app.get("/attachments/<email_id>/<attachment_id>")
def download_attachment(email_id: str, attachment_id: str):
  blob = get_attachment_bytes(email_id, attachment_id)
  if blob is None:
    return jsonify({"error": "Attachment not found"}), 404
  return jsonify({"emailId": email_id, "attachmentId": attachment_id, "size": len(blob)})


@app.post("/attachments/summarize/pdf")
def summarize_pdf():
  data = request.get_json(silent=True) or {}
  email_id = data.get("email_id")
  attachment_id = data.get("attachment_id")
  if not email_id or not attachment_id:
    return jsonify({"error": "email_id and attachment_id required"}), 400
  blob = get_attachment_bytes(email_id, attachment_id)
  if blob is None:
    return jsonify({"error": "Attachment not found"}), 404
  try:
    reader = PdfReader(io.BytesIO(blob))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
  except Exception as e:
    return jsonify({"error": f"Failed to read PDF: {e}"}), 400
  summary = summarize_text(text, max_lines=3)
  return jsonify({"summary": summary, "chars": len(text)})


# pdf summareize krna hai

@app.get("/pdfsum")
def pdfsum_latest_email():
  try:
    svc = get_gmail_service()
    ids = list_messages(max_results=1, svc=svc)
    if not ids:
      return jsonify({"error": "No emails found"}), 404
    email_id = ids[0]
    msg = get_message(email_id, svc=svc)
    if not msg:
      return jsonify({"error": "Failed to load latest email"}), 404
    subject = msg.headers.get("Subject", "(no subject)")
    # Filter PDF attachments
    atts = msg.attachments or []
    pdf_atts = []
    for a in atts:
      fname = (a.get("filename") or "").lower()
      mtype = (a.get("mimeType") or "").lower()
      if mtype == "application/pdf" or fname.endswith(".pdf"):
        pdf_atts.append(a)
    if not pdf_atts:
      return jsonify({
        "emailId": msg.id,
        "subject": subject,
        "count": 0,
        "items": [],
        "combined_summary": None
      })
    items = []
    combined_texts = []
    for a in pdf_atts:
      att_id = a.get("id")
      fname = a.get("filename")
      blob = get_attachment_bytes(msg.id, att_id, svc=svc)
      if not blob:
        items.append({"filename": fname, "attachmentId": att_id, "error": "download_failed"})
        continue
      try:
        reader = PdfReader(io.BytesIO(blob))
        pages = min(len(reader.pages), 10)
        text = "\n".join((reader.pages[i].extract_text() or "") for i in range(pages))
      except Exception as e:
        items.append({"filename": fname, "attachmentId": att_id, "error": f"pdf_read_failed: {e}"})
        continue
      clipped = text[:8000]  # safety cap
      try:
        summary = summarize_text(clipped, max_lines=3)
      except Exception as e:
        summary = f"(summarization failed: {e})"
      items.append({
        "filename": fname,
        "attachmentId": att_id,
        "chars": len(text),
        "pages_used": pages,
        "summary": summary,
      })
      combined_texts.append(clipped)
    combined_summary = None
    try:
      if combined_texts:
        joined = "\n\n---\n\n".join(combined_texts)[:12000]
        combined_summary = summarize_text(joined, max_lines=5)
    except Exception as e:
      combined_summary = f"(combined summarization failed: {e})"
    return jsonify({
      "emailId": msg.id,
      "subject": subject,
      "count": len(items),
      "items": items,
      "combined_summary": combined_summary,
    })
  except Exception as e:
    return jsonify({"error": str(e)}), 500




@app.post("/summarize")
def summarize_post():
  data = request.get_json(silent=True) or {}
  email_id = data.get("email_id")
  text = data.get("text")
  try:
    max_lines = int(data.get("max_lines", 3))
  except (TypeError, ValueError):
    max_lines = 3
  if not text and not email_id:
    return jsonify({"error": "Provide either 'email_id' or 'text'"}), 400
  if not text and email_id:
    msg = get_message(email_id)
    if not msg:
      return jsonify({"error": "Email not found"}), 404
    subject = msg.headers.get("Subject", "") or ""
    body = msg.body_text or ""
    text = (subject + "\n\n" + body).strip()
  try:
    summary = summarize_text(text, max_lines=max_lines)
  except Exception as e:
    return jsonify({"error": f"Summarization failed: {e}"}), 500
  return jsonify({
    "summary": summary,
    "lines": max_lines,
    "source": "email" if email_id else "text",
    "emailId": email_id,
    "chars": len(text or ""),
  })


@app.get("/summarize")
def summarize_latest():
  if not session.get("gmail_oauth_tokens"):
    return jsonify({"error": "Not authenticated", "next": "/auth/google"}), 401
  ids = list_messages(max_results=5)
  out = []
  for mid in ids:
    msg = get_message(mid)
    if not msg:
      continue
    subject = (msg.headers.get("Subject") or "").strip()
    body = (msg.body_text or "").strip()
    text = (subject + "\n\n" + body).strip()
    if len(text) > 600:
      try:
        s = summarize_text(text, max_lines=3)
      except Exception as e:
        s = f"(summarization failed: {e})"
    else:
      content = body if body else subject
      s = (content[:240] + ("…" if len(content) > 240 else "")).strip()
    out.append({
      "emailId": msg.id,
      "subject": subject,
      "date": msg.headers.get("Date"),
      "summary": s,
      "length": len(text),
      "hasAttachments": bool(msg.attachments),
    })
  return jsonify({"count": len(out), "items": out})


if __name__ == "__main__":
  ensure_poller_thread()
  app.run(host="0.0.0.0", port=5000, debug=True)
