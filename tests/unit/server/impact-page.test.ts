import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import { load } from '../../../src/routes/[lang=lang]/account/impact/+page.server';

const impactRow = {
  member_since: '2026-01-02T12:00:00Z',
  active_weeks: 8,
  active_months: 3,
  credited_places: 14,
  credited_category_groups: 5,
  credited_municipalities: 4,
  valid_ratings: 7,
  submissions_total: 6,
  pending_submissions: 1,
  rejected_submissions: 1,
  resolved_without_contribution: 2,
  confirmed_contributions: 3,
  revoked_contributions: 1,
  recent_outcomes: []
};

const achievementSentinel = {
  enabled: true,
  achievement_key: null,
  achievement_group: null,
  display_order: null,
  name_is: null,
  name_en: null,
  description_is: null,
  description_en: null,
  earned_at: null,
  is_new: false,
  entry_kind: null,
  progress_kind: null,
  progress_current: null,
  progress_target: null
};

describe('private impact page boundary', () => {
  it('loads the permanent record and composes existing private recognition reads', async () => {
    const rpc = impactRpc();

    await expect(load(eventWith(rpc) as never)).resolves.toMatchObject({
      impact: {
        activeWeeks: 8,
        creditedPlaces: 14,
        confirmedContributions: 3
      },
      rhythm: { status: 'available' },
      contributor: {
        status: 'available',
        value: { status: 'contributor' }
      },
      achievements: {
        status: 'available',
        value: { enabled: true, achievements: [] }
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_my_impact_record', { requested_locale: 'en' });
    expect(rpc).toHaveBeenCalledWith('list_current_member_weekly_rhythm');
    expect(rpc).toHaveBeenCalledWith('get_my_contributor_status');
    expect(rpc).toHaveBeenCalledWith('get_my_achievements');
    expect(rpc).not.toHaveBeenCalledWith(expect.stringMatching(/claim|record|activate|save/));
  });

  it('keeps the durable impact record available when a recognition seam is temporarily down', async () => {
    const rpc = impactRpc({ achievementsUnavailable: true, rhythmUnavailable: true });

    await expect(load(eventWith(rpc) as never)).resolves.toMatchObject({
      impact: { activeWeeks: 8 },
      rhythm: { status: 'unavailable' },
      achievements: { status: 'unavailable' },
      contributor: { status: 'available' }
    });
  });
});

function impactRpc({
  achievementsUnavailable = false,
  rhythmUnavailable = false
}: { achievementsUnavailable?: boolean; rhythmUnavailable?: boolean } = {}) {
  return vi.fn(async (name: string) => {
    if (name === 'has_current_user_role') return { data: true, error: null };
    if (name === 'get_my_impact_record') return { data: [impactRow], error: null };
    if (name === 'list_current_member_weekly_rhythm') {
      return rhythmUnavailable
        ? { data: null, error: { code: 'offline' } }
        : { data: weeklyRhythmRows(), error: null };
    }
    if (name === 'get_my_contributor_status') {
      return {
        data: [
          {
            status: 'contributor',
            policy_version: 'v1',
            status_since: '2026-06-01T12:00:00Z'
          }
        ],
        error: null
      };
    }
    if (name === 'get_my_achievements') {
      return achievementsUnavailable
        ? { data: null, error: { code: 'offline' } }
        : { data: [achievementSentinel], error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
}

function weeklyRhythmRows() {
  return Array.from({ length: 8 }, (_, index) => {
    const startsAt = new Date('2026-06-01T00:00:00Z');
    startsAt.setUTCDate(startsAt.getUTCDate() + index * 7);
    const endsAt = new Date(startsAt);
    endsAt.setUTCDate(endsAt.getUTCDate() + 6);
    return {
      starts_on: startsAt.toISOString().slice(0, 10),
      ends_on: endsAt.toISOString().slice(0, 10),
      current: index === 7,
      active: index % 2 === 0
    };
  });
}

function eventWith(rpc: ReturnType<typeof vi.fn>) {
  return {
    locals: {
      requestId: 'request-impact',
      copy: catalogues.en,
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: 'member-1' } },
            error: null
          }))
        },
        rpc
      }
    },
    params: { lang: 'en' },
    url: new URL('https://hundavaent.test/en/account/impact')
  };
}
