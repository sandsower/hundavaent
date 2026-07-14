import { describe, expect, it, vi } from 'vitest';

import { getMyAchievements, type AchievementRpcClient } from '$server/achievements/achievements';

const earnedRow = {
  enabled: true,
  achievement_key: 'first_favourite',
  achievement_group: 'participation',
  display_order: 1,
  name_is: 'Fyrsti vistaði staðurinn',
  name_en: 'First Favourite',
  description_is: 'Þú vistaðir stað í fyrsta sinn.',
  description_en: 'You saved a place for the first time.',
  earned_at: '2026-07-01T12:00:00Z',
  is_new: true
};

const lockedRow = {
  enabled: true,
  achievement_key: 'one_year_member',
  achievement_group: 'longevity',
  display_order: 10,
  name_is: 'Ár með Hundavænt',
  name_en: 'A year with Hundavænt',
  description_is: 'Virk þátttaka í heilt ár.',
  description_en: 'Active for a whole year.',
  earned_at: null,
  is_new: false
};

describe('Achievements RPC adapter', () => {
  it('maps locked, earned, and newly-earned rows without any numeric progress field', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [earnedRow, lockedRow], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({
      status: 'success',
      value: {
        enabled: true,
        achievements: [
          {
            key: 'first_favourite',
            group: 'participation',
            displayOrder: 1,
            nameIs: 'Fyrsti vistaði staðurinn',
            nameEn: 'First Favourite',
            descriptionIs: 'Þú vistaðir stað í fyrsta sinn.',
            descriptionEn: 'You saved a place for the first time.',
            earnedAt: '2026-07-01T12:00:00Z',
            isNew: true
          },
          {
            key: 'one_year_member',
            group: 'longevity',
            displayOrder: 10,
            nameIs: 'Ár með Hundavænt',
            nameEn: 'A year with Hundavænt',
            descriptionIs: 'Virk þátttaka í heilt ár.',
            descriptionEn: 'Active for a whole year.',
            earnedAt: null,
            isNew: false
          }
        ]
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_my_achievements');
  });

  it('maps the fail-closed disabled response to an empty catalogue', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          enabled: false,
          achievement_key: null,
          achievement_group: null,
          display_order: null,
          name_is: null,
          name_en: null,
          description_is: null,
          description_en: null,
          earned_at: null,
          is_new: false
        }
      ],
      error: null
    });

    await expect(getMyAchievements({ rpc } satisfies AchievementRpcClient)).resolves.toEqual({
      status: 'success',
      value: { enabled: false, achievements: [] }
    });
  });

  it.each([
    ['a non-array payload', { data: { enabled: true }, error: null }],
    ['an empty array', { data: [], error: null }],
    ['a malformed group', { data: [{ ...earnedRow, achievement_group: 'bragging' }], error: null }],
    ['a missing earned_at field', { data: [{ ...earnedRow, earned_at: 7 }], error: null }],
    [
      'a mixed enabled/disabled payload',
      { data: [earnedRow, { ...lockedRow, enabled: false }], error: null }
    ]
  ] as const)('fails safely on %s', async (_label, response) => {
    const rpc = vi.fn().mockResolvedValue(response);

    await expect(getMyAchievements({ rpc } satisfies AchievementRpcClient)).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });

  it.each([
    ['42501', 'forbidden'],
    ['22023', 'invalid'],
    ['55006', 'conflict'],
    ['23505', 'conflict'],
    ['99999', 'infrastructure_error']
  ] as const)('maps database code %s to %s', async (code, status) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });

    await expect(getMyAchievements({ rpc } satisfies AchievementRpcClient)).resolves.toEqual({
      status
    });
  });

  it('fails safely when the RPC transport itself throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(getMyAchievements({ rpc } satisfies AchievementRpcClient)).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });
});
