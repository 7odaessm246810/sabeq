import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDailyProvider, createFakeVideoProvider } from './video.js';

const cfg = { provider: 'daily' as const, apiBase: 'https://api.daily.test/v1', apiKey: 'key' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('Daily rooms', () => {
  it('creates a private two-person room that closes itself, and reuses an existing one', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ name: 'sabeq-b1', url: 'https://x.daily.co/sabeq-b1' }));
    vi.stubGlobal('fetch', fetch);
    const daily = createDailyProvider(cfg);
    const opensAt = new Date('2026-10-12T16:50:00Z');
    const closesAt = new Date('2026-10-12T17:00:00Z');
    const room = await daily.createRoom({ bookingId: 'b1', opensAt, closesAt, audioOnly: true });
    expect(room).toEqual({ roomId: 'sabeq-b1', roomUrl: 'https://x.daily.co/sabeq-b1' });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.daily.test/v1/rooms');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'sabeq-b1',
      privacy: 'private',
      properties: {
        nbf: opensAt.getTime() / 1000,
        exp: closesAt.getTime() / 1000,
        eject_at_room_exp: true,
        max_participants: 2,
        enable_prejoin_ui: true,
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: true,
      },
    });

    fetch
      .mockResolvedValueOnce(
        json({ error: 'invalid-request-error', info: 'a room named sabeq-b1 already exists' }, 400),
      )
      .mockResolvedValueOnce(json({ name: 'sabeq-b1', url: 'https://x.daily.co/sabeq-b1' }));
    const again = await daily.createRoom({ bookingId: 'b1', opensAt, closesAt, audioOnly: false });
    expect(again.roomId).toBe('sabeq-b1');
    expect(fetch.mock.calls[2]?.[0]).toBe('https://api.daily.test/v1/rooms/sabeq-b1');
  });

  it('gives each person their own token, and reads who the room saw', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'tok/en' }))
      .mockResolvedValueOnce(
        json({
          data: [
            {
              participants: [
                { user_id: 'mentor-1', join_time: 1_800_000_100 },
                { user_id: null, join_time: 1_800_000_050 },
              ],
            },
            { participants: [{ user_id: 'mentor-1', join_time: 1_800_000_000 }] },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const daily = createDailyProvider(cfg);
    const url = await daily.joinUrl({
      roomId: 'sabeq-b1',
      roomUrl: 'https://x.daily.co/sabeq-b1',
      userId: 'mentor-1',
      name: 'نادر',
      isMentor: true,
      expiresAt: new Date(1_800_003_600_000),
      audioOnly: false,
    });
    expect(url).toBe('https://x.daily.co/sabeq-b1?t=tok%2Fen');
    expect(JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      properties: {
        room_name: 'sabeq-b1',
        user_id: 'mentor-1',
        user_name: 'نادر',
        is_owner: true,
        exp: 1_800_003_600,
        eject_at_token_exp: true,
        start_video_off: false,
      },
    });

    const seen = await daily.attendance('sabeq-b1');
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'https://api.daily.test/v1/meetings?room=sabeq-b1&limit=20',
    );
    expect(seen).toEqual(new Map([['mentor-1', new Date(1_800_000_000_000)]]));
  });

  it('the test room calls nothing', async () => {
    const fake = createFakeVideoProvider();
    expect(await fake.attendance('x')).toBeNull();
    expect(await fake.joinUrl({} as never)).toBeNull();
  });
});
