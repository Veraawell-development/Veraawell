/**
 * Chat helpers with no React and no network, so they can be unit tested
 * (src/__tests__/chatUtils.test.ts).
 */

export type MessageStatus = 'sent' | 'sending' | 'failed';

export interface ChatMessage {
  _id: string;
  conversationId?: string;
  clientMsgId?: string | null;
  text: string;
  createdAt: string;
  senderId: string;
  senderName?: string;
  isSentByMe: boolean;
  isRead?: boolean;
  /** Client-side only: a message on its way, or one that didn't go. */
  status?: MessageStatus;
  error?: string;
}

const time = (m: ChatMessage) => new Date(m.createdAt).getTime() || 0;

/**
 * Merge messages into a thread: one copy each (by server id, or by the
 * sender's clientMsgId for a message still on its way), oldest first. A
 * stored message replaces its "sending…" bubble. The bubble used to be
 * matched by its text, so two identical messages in flight could swap.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();
  const keyOf = (m: ChatMessage) => (m.clientMsgId ? `c:${m.clientMsgId}` : `s:${m._id}`);
  for (const m of current) byKey.set(keyOf(m), m);
  for (const m of incoming) {
    // A stored message with a clientMsgId supersedes the local bubble.
    if (m.clientMsgId && byKey.has(`c:${m.clientMsgId}`)) {
      const prev = byKey.get(`c:${m.clientMsgId}`)!;
      byKey.set(`c:${m.clientMsgId}`, prev.status && !m.status ? { ...m } : { ...prev, ...m });
      continue;
    }
    // The same stored message seen without its clientMsgId (an older payload).
    const sameId = [...byKey.entries()].find(([, v]) => v._id === m._id && !v._id.startsWith('local-'));
    if (sameId) { byKey.set(sameId[0], { ...sameId[1], ...m }); continue; }
    byKey.set(keyOf(m), m);
  }
  return [...byKey.values()].sort((a, b) => time(a) - time(b) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
}

/** A new id for a message this browser is about to send. */
export function newClientMsgId(): string {
  try { return crypto.randomUUID().replace(/-/g, ''); } catch { return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
}

const ZONE = 'Asia/Kolkata';
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** "Today", "Yesterday", or "Mon, 3 Nov" (with the year when it isn't this year) — India time. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (dayKey(d) === dayKey(now)) return 'Today';
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  const sameYear = dayKey(d).slice(0, 4) === dayKey(now).slice(0, 4);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.day} ${p.month}${sameYear ? '' : ` ${p.year}`}`;
}

/** "3:45 pm", India time. */
export function clockLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true });
}

/** For the conversation list: the time today, "Yesterday", or the date. */
export function listTimeLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const label = dayLabel(iso, now);
  return label === 'Today' ? clockLabel(iso) : label;
}

/** Day separators: true where a message starts a new day. */
export function startsNewDay(messages: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const a = new Date(messages[index - 1].createdAt);
  const b = new Date(messages[index].createdAt);
  return dayKey(a) !== dayKey(b);
}

/** Initials, ignoring a "Dr." title (every doctor's avatar used to read "D"). */
export function initials(name: string | null | undefined): string {
  const words = String(name || '').replace(/^dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

export type TextPart = { kind: 'text'; value: string } | { kind: 'link'; value: string; href: string };

/**
 * Split text into plain parts and web links, so links can be made clickable
 * without ever rendering the message as HTML. Only http(s) links (and bare
 * "www." ones) — never javascript: or data:.
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let url = m[0];
    // Trailing punctuation belongs to the sentence, not the link.
    const trail = /[.,!?;:)\]]+$/.exec(url);
    if (trail) url = url.slice(0, -trail[0].length);
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    parts.push({ kind: 'link', value: url, href: url.startsWith('www.') ? `https://${url}` : url });
    last = m.index + url.length;
    re.lastIndex = last;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

/** Why a chat can't be written in, as the screen says it. */
export function closedMessage(reason: string | null | undefined, otherName: string): string {
  switch (reason) {
    case 'closed': return 'This chat closed 30 days after your last session. Book a new session to message again.';
    case 'unavailable': return `${otherName} can't receive messages right now.`;
    case 'not-booked': return 'Chat opens once a session is booked and paid.';
    default: return "You can't send messages in this chat right now.";
  }
}

export const MAX_MESSAGE = 5000;
