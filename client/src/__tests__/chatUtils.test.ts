import { describe, it, expect } from 'vitest';
import { mergeMessages, dayLabel, clockLabel, listTimeLabel, startsNewDay, initials, linkify, closedMessage, type ChatMessage } from '../chat/chatUtils';

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  _id: 'id', text: 'hi', createdAt: '2026-10-20T10:00:00.000Z', senderId: 'me', isSentByMe: true, ...over,
});

describe('merging messages into a thread', () => {
  it('keeps one copy of each, oldest first', () => {
    const a = msg({ _id: 'a', createdAt: '2026-10-20T10:00:00Z' });
    const b = msg({ _id: 'b', createdAt: '2026-10-20T10:01:00Z' });
    expect(mergeMessages([b], [a, b]).map((m) => m._id)).toEqual(['a', 'b']);
  });

  it('the stored message replaces its "sending…" bubble (matched by clientMsgId, not text)', () => {
    const bubble = msg({ _id: 'local-x1', clientMsgId: 'x1', text: 'same', status: 'sending' });
    const other = msg({ _id: 'local-x2', clientMsgId: 'x2', text: 'same', status: 'sending' });
    const stored = msg({ _id: 's1', clientMsgId: 'x1', text: 'same' });
    const out = mergeMessages([bubble, other], [stored]);
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.clientMsgId === 'x1')).toMatchObject({ _id: 's1' });
    expect(out.find((m) => m.clientMsgId === 'x1')?.status).toBeUndefined();
    expect(out.find((m) => m.clientMsgId === 'x2')?.status).toBe('sending');
  });

  it('the same stored message from two sources (socket echo and HTTP reply) appears once', () => {
    const viaSocket = msg({ _id: 's1', clientMsgId: 'x1' });
    const viaHttp = msg({ _id: 's1', clientMsgId: 'x1' });
    expect(mergeMessages([viaSocket], [viaHttp])).toHaveLength(1);
  });

  it('an older payload without clientMsgId does not duplicate a stored message', () => {
    const stored = msg({ _id: 's1', clientMsgId: 'x1' });
    const bare = msg({ _id: 's1' });
    expect(mergeMessages([stored], [bare])).toHaveLength(1);
  });

  it('equal times are ordered by id, stably', () => {
    const t = '2026-10-20T10:00:00Z';
    expect(mergeMessages([], [msg({ _id: 'b', createdAt: t }), msg({ _id: 'a', createdAt: t })]).map((m) => m._id)).toEqual(['a', 'b']);
  });
});

describe('times, in India time', () => {
  const now = new Date('2026-10-20T12:00:00Z'); // 5:30 pm IST, 20 Oct
  it('day labels: Today, Yesterday, then the date', () => {
    expect(dayLabel('2026-10-20T03:00:00Z', now)).toBe('Today');
    expect(dayLabel('2026-10-19T03:00:00Z', now)).toBe('Yesterday');
    expect(dayLabel('2026-10-15T03:00:00Z', now)).toBe('Thu, 15 Oct');
    expect(dayLabel('2025-10-15T03:00:00Z', now)).toBe('Wed, 15 Oct 2025');
  });
  it('a time just after midnight IST is "today" in India, not yesterday in UTC', () => {
    expect(dayLabel('2026-10-19T19:00:00Z', now)).toBe('Today'); // 00:30 IST on the 20th
  });
  it('clock and list labels', () => {
    expect(clockLabel('2026-10-20T10:15:00Z')).toMatch(/3:45\s?pm/i);
    expect(listTimeLabel('2026-10-20T10:15:00Z', now)).toMatch(/3:45\s?pm/i);
    expect(listTimeLabel('2026-10-19T10:15:00Z', now)).toBe('Yesterday');
    expect(listTimeLabel(null, now)).toBe('');
  });
  it('a day separator wherever the IST day changes', () => {
    const list = [msg({ createdAt: '2026-10-19T18:00:00Z' }), msg({ createdAt: '2026-10-19T18:20:00Z' }), msg({ createdAt: '2026-10-19T18:40:00Z' })];
    // 23:30, 23:50 on the 19th; 00:10 on the 20th (IST)
    expect([0, 1, 2].map((i) => startsNewDay(list, i))).toEqual([true, false, true]);
  });
});

describe('initials', () => {
  it('skip the "Dr." title (every doctor used to show "D")', () => {
    expect(initials('Dr. Chetareejee Pal')).toBe('CP');
    expect(initials('Abhigyan Raj')).toBe('AR');
    expect(initials('Asha')).toBe('A');
    expect(initials('')).toBe('?');
  });
});

describe('links in messages', () => {
  it('http(s) and www links become links; trailing punctuation stays text', () => {
    expect(linkify('see https://veraawell.com/x, then www.example.org.')).toEqual([
      { kind: 'text', value: 'see ' },
      { kind: 'link', value: 'https://veraawell.com/x', href: 'https://veraawell.com/x' },
      { kind: 'text', value: ', then ' },
      { kind: 'link', value: 'www.example.org', href: 'https://www.example.org' },
      { kind: 'text', value: '.' },
    ]);
  });
  it('never makes javascript: or data: links, and leaves HTML as text', () => {
    const parts = linkify('javascript:alert(1) data:text/html,<b>x</b> <script>bad()</script>');
    expect(parts.every((p) => p.kind === 'text')).toBe(true);
    expect(parts.map((p) => p.value).join('')).toContain('<script>');
  });
});

describe('why a chat is read-only', () => {
  it('says why, in plain words', () => {
    expect(closedMessage('closed', 'Dr. Pal')).toMatch(/30 days after your last session/);
    expect(closedMessage('unavailable', 'Dr. Pal')).toMatch(/Dr. Pal can't receive messages/);
    expect(closedMessage('not-booked', 'x')).toMatch(/booked and paid/);
  });
});
