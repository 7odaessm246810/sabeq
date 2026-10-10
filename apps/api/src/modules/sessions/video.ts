/**
 * Video rooms behind one interface (Phase 17, decision 2026-10-10: Daily.co).
 *
 * - `daily`: one private room per booking (2 people, open only around the session, everyone ejected
 *   when it expires); each person joins with their own short-lived meeting token, so the room link
 *   alone lets nobody in. Attendance comes from Daily's meeting log — what the room saw, not what a
 *   browser claims.
 * - `fake`: local development and tests. No video; the website shows a test room, and attendance is
 *   what Sabeq recorded when each side opened it. Refused in production by the config.
 */
import type { Config } from '../../config/env.js';

export interface RoomInput {
  bookingId: string;
  /** Joining is possible from… */
  opensAt: Date;
  /** …until; the room ejects everyone then. */
  closesAt: Date;
  /** Audio sessions start with cameras off. */
  audioOnly: boolean;
}

export interface VideoProvider {
  readonly name: 'daily' | 'fake';
  createRoom(input: RoomInput): Promise<{ roomId: string; roomUrl: string | null }>;
  /** The address one person opens to join, valid until `expiresAt`. Null for the test room. */
  joinUrl(input: {
    roomId: string;
    roomUrl: string | null;
    userId: string;
    name: string;
    isMentor: boolean;
    expiresAt: Date;
    audioOnly: boolean;
  }): Promise<string | null>;
  /**
   * Who the room saw join (by user id, earliest join). Null when the provider can't tell — then
   * Sabeq's own record of who opened the room is used.
   */
  attendance(roomId: string): Promise<Map<string, Date> | null>;
}

export class VideoError extends Error {
  override name = 'VideoError';
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

export function createDailyProvider(cfg: Config['video']): VideoProvider {
  const { apiBase, apiKey } = cfg;
  if (!apiKey) throw new Error('DAILY_API_KEY is missing');

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) throw new VideoError(`Daily ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  return {
    name: 'daily',

    async createRoom({ bookingId, opensAt, closesAt, audioOnly }) {
      const name = `sabeq-${bookingId}`;
      const properties = {
        nbf: unix(opensAt),
        exp: unix(closesAt),
        eject_at_room_exp: true,
        max_participants: 2,
        enable_prejoin_ui: true,
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: audioOnly,
      };
      try {
        const room = await call<{ name: string; url: string }>('POST', '/rooms', {
          name,
          privacy: 'private',
          properties,
        });
        return { roomId: room.name, roomUrl: room.url };
      } catch (err) {
        // Created by an earlier attempt that didn't get saved: reuse it.
        if (!(err instanceof VideoError) || !/already exists/i.test(err.message)) throw err;
        const room = await call<{ name: string; url: string }>('GET', `/rooms/${name}`);
        return { roomId: room.name, roomUrl: room.url };
      }
    },

    async joinUrl({ roomId, roomUrl, userId, name, isMentor, expiresAt, audioOnly }) {
      if (!roomUrl) throw new VideoError(`room ${roomId} has no url`);
      const { token } = await call<{ token: string }>('POST', '/meeting-tokens', {
        properties: {
          room_name: roomId,
          user_id: userId,
          user_name: name,
          is_owner: isMentor,
          exp: unix(expiresAt),
          eject_at_token_exp: true,
          start_video_off: audioOnly,
        },
      });
      return `${roomUrl}?t=${encodeURIComponent(token)}`;
    },

    async attendance(roomId) {
      const res = await call<{
        data: { participants?: { user_id: string | null; join_time: number }[] }[];
      }>('GET', `/meetings?room=${encodeURIComponent(roomId)}&limit=20`);
      const seen = new Map<string, Date>();
      for (const meeting of res.data)
        for (const p of meeting.participants ?? []) {
          if (!p.user_id) continue;
          const at = new Date(p.join_time * 1000);
          const before = seen.get(p.user_id);
          if (!before || at < before) seen.set(p.user_id, at);
        }
      return seen;
    },
  };
}

/** Local / test rooms: nothing to call. */
export function createFakeVideoProvider(): VideoProvider {
  return {
    name: 'fake',
    createRoom: ({ bookingId }) => Promise.resolve({ roomId: `fake-${bookingId}`, roomUrl: null }),
    joinUrl: () => Promise.resolve(null),
    attendance: () => Promise.resolve(null),
  };
}
