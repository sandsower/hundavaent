import { describe, expect, it, vi } from 'vitest';

import type { RequestSupabaseClient } from '$server/db/clients';
import {
  getWeeklyRhythm,
  getWeeklyRhythmHistory,
  mapFavouriteRecognition
} from '$server/member-activity/weekly-rhythm';

function clientWith(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as unknown as RequestSupabaseClient, rpc };
}

describe('Weekly rhythm server boundary', () => {
  it('maps one caller-owned current week without exposing event timestamps', async () => {
    const { client, rpc } = clientWith([
      { starts_on: '2026-07-20', ends_on: '2026-07-26', active: true }
    ]);

    await expect(getWeeklyRhythm(client)).resolves.toEqual({
      status: 'available',
      currentWeek: {
        startsOn: '2026-07-20',
        endsOn: '2026-07-26',
        active: true
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_current_member_weekly_rhythm');
  });

  it('maps exactly eight contiguous weeks from oldest to current', async () => {
    const weeks = Array.from({ length: 8 }, (_, index) => {
      const startsAt = new Date(Date.UTC(2026, 5, 1 + index * 7));
      const endsAt = new Date(startsAt.getTime() + 6 * 24 * 60 * 60 * 1000);
      return {
        starts_on: startsAt.toISOString().slice(0, 10),
        ends_on: endsAt.toISOString().slice(0, 10),
        current: index === 7,
        active: index === 2 || index === 7
      };
    });
    const { client, rpc } = clientWith(weeks);

    const result = await getWeeklyRhythmHistory(client);
    expect(result).toEqual({
      status: 'available',
      weeks: weeks.map((week) => ({
        startsOn: week.starts_on,
        endsOn: week.ends_on,
        current: week.current,
        active: week.active
      }))
    });
    expect(rpc).toHaveBeenCalledWith('list_current_member_weekly_rhythm');
  });

  it('fails closed for malformed or incomplete weekly data', async () => {
    const malformedValues: unknown[] = [
      [{ starts_on: '2026-07-20', ends_on: '2026-07-25', active: true }],
      Array.from({ length: 7 }, (_, index) => ({
        starts_on: `2026-07-${String(1 + index).padStart(2, '0')}`,
        ends_on: `2026-07-${String(7 + index).padStart(2, '0')}`,
        current: index === 6,
        active: false
      })),
      [{ starts_on: 'private timestamp', ends_on: '2026-07-26', active: true }]
    ];

    for (const data of malformedValues) {
      const { client } = clientWith(data);
      await expect(getWeeklyRhythm(client)).resolves.toEqual({ status: 'unavailable' });
      await expect(getWeeklyRhythmHistory(client)).resolves.toEqual({ status: 'unavailable' });
    }
  });

  it('fails closed when the private RPC fails or throws', async () => {
    const failed = clientWith(null, { code: 'private_failure' }).client;
    const thrown = {
      rpc: vi.fn(async () => {
        throw new Error('private failure');
      })
    } as unknown as RequestSupabaseClient;

    await expect(getWeeklyRhythm(failed)).resolves.toEqual({ status: 'unavailable' });
    await expect(getWeeklyRhythmHistory(thrown)).resolves.toEqual({ status: 'unavailable' });
  });

  it('maps only complete authoritative favourite recognition', () => {
    expect(
      mapFavouriteRecognition({
        first_time_for_place: true,
        activated_current_week: true,
        current_week_starts_on: '2026-07-20',
        current_week_ends_on: '2026-07-26',
        current_week_active: true,
        first_saved_at: 'must not be mapped'
      })
    ).toEqual({
      firstTimeForPlace: true,
      activatedCurrentWeek: true,
      currentWeek: {
        startsOn: '2026-07-20',
        endsOn: '2026-07-26',
        active: true
      }
    });
    expect(mapFavouriteRecognition({ first_time_for_place: true })).toBeNull();
  });
});
