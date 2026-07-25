import { describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import { actions, load } from '../../../src/routes/[lang=lang]/account/achievements/+page.server';

const emptyCatalogue = {
  enabled: true,
  achievement_key: null,
  achievement_group: null,
  display_order: null,
  collection: null,
  tier: null,
  collection_name_is: null,
  collection_name_en: null,
  collection_description_is: null,
  collection_description_en: null,
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

const claimedAchievement = {
  achievement_key: 'first_favourite',
  achievement_group: 'participation',
  display_order: 1,
  collection: null,
  tier: null,
  collection_name_is: null,
  collection_name_en: null,
  progress_kind: null,
  progress_target: null,
  name_is: 'Fyrsta uppáhaldið',
  name_en: 'First Favourite',
  description_is: 'Þú vistaðir þinn fyrsta stað sem uppáhald.',
  description_en: 'You saved your first Place as a Favourite.',
  earned_at: '2026-07-23T12:00:00Z'
};

describe('Achievements page boundary', () => {
  it('keeps the GET load pure so hover preloading cannot acknowledge an unlock', async () => {
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === 'has_current_user_role') return { data: true, error: null };
      if (functionName === 'get_my_achievements') {
        return { data: [emptyCatalogue], error: null };
      }
      throw new Error(`Unexpected RPC ${functionName}`);
    });

    const result = await load(
      eventWith({
        authUser: { id: 'member-1' },
        rpc
      }) as never
    );

    expect(result).toEqual({
      achievements: { enabled: true, achievements: [] }
    });
    expect(rpc).toHaveBeenCalledWith('get_my_achievements');
    expect(rpc).not.toHaveBeenCalledWith('claim_my_achievement_celebrations');
  });

  it('claims celebrations only through the authenticated named POST action', async () => {
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === 'has_current_user_role') return { data: true, error: null };
      if (functionName === 'claim_my_achievement_celebrations') {
        return { data: [claimedAchievement], error: null };
      }
      throw new Error(`Unexpected RPC ${functionName}`);
    });
    const action = actions.claimAchievements;

    expect(action).toBeTypeOf('function');
    await expect(
      action?.(
        eventWith({
          authUser: { id: 'member-1' },
          rpc
        }) as never
      )
    ).resolves.toEqual({
      action: 'claimAchievements',
      claimed: [
        {
          key: 'first_favourite',
          group: 'participation',
          displayOrder: 1,
          nameIs: 'Fyrsta uppáhaldið',
          nameEn: 'First Favourite',
          descriptionIs: 'Þú vistaðir þinn fyrsta stað sem uppáhald.',
          descriptionEn: 'You saved your first Place as a Favourite.',
          earnedAt: '2026-07-23T12:00:00Z',
          kind: 'earned',
          entry: 'bespoke'
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('claim_my_achievement_celebrations');
  });

  it('rejects an anonymous claim without invoking the consuming RPC', async () => {
    const rpc = vi.fn();
    const action = actions.claimAchievements;
    const result = await action?.(
      eventWith({
        authUser: null,
        rpc
      }) as never
    );

    expect(result).toMatchObject({
      status: 401,
      data: { action: 'claimAchievements', error: 'authentication_required' }
    });
    expect(rpc).not.toHaveBeenCalledWith('claim_my_achievement_celebrations');
  });
});

function eventWith({
  authUser,
  rpc
}: {
  authUser: { id: string } | null;
  rpc: ReturnType<typeof vi.fn>;
}) {
  return {
    locals: {
      requestId: 'request-achievements',
      copy: catalogues.en,
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: authUser },
            error: null
          }))
        },
        rpc
      }
    },
    params: { lang: 'en' },
    url: new URL('https://hundavaent.test/en/account/achievements')
  };
}
