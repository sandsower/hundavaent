import { describe, expect, it, vi } from 'vitest';

import {
  claimMyAchievementCelebrations,
  getMyAchievements,
  getMyAchievementStatus,
  type AchievementRpcClient
} from '$server/achievements/achievements';

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
  is_new: false,
  entry_kind: 'earned',
  progress_kind: null,
  progress_current: null,
  progress_target: null
};

const milestoneRow = {
  enabled: true,
  achievement_key: 'category_curious',
  achievement_group: 'exploration',
  display_order: 5,
  name_is: 'Forvitinn um flokka',
  name_en: 'Category Curious',
  description_is: 'Þú kannar mismunandi flokka.',
  description_en: 'You explore different categories.',
  earned_at: null,
  is_new: false,
  entry_kind: 'milestone',
  progress_kind: 'credited_categories',
  progress_current: 2,
  progress_target: 4
};

const claimedRow = {
  achievement_key: 'first_favourite',
  achievement_group: 'participation',
  display_order: 1,
  name_is: 'Fyrsti vistaði staðurinn',
  name_en: 'First Favourite',
  description_is: 'Þú vistaðir stað í fyrsta sinn.',
  description_en: 'You saved a place for the first time.',
  earned_at: '2026-07-01T12:00:00Z'
};

describe('Achievements RPC adapter', () => {
  it('maps earned entries and a selected milestone with understandable progress', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [earnedRow, milestoneRow], error: null });

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
            kind: 'earned'
          },
          {
            key: 'category_curious',
            group: 'exploration',
            displayOrder: 5,
            nameIs: 'Forvitinn um flokka',
            nameEn: 'Category Curious',
            descriptionIs: 'Þú kannar mismunandi flokka.',
            descriptionEn: 'You explore different categories.',
            earnedAt: null,
            kind: 'milestone',
            progress: {
              kind: 'credited_categories',
              current: 2,
              target: 4
            }
          }
        ]
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_my_achievements');
  });

  it.each([
    [
      false,
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
        is_new: false,
        entry_kind: null,
        progress_kind: null,
        progress_current: null,
        progress_target: null
      }
    ],
    [
      true,
      {
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
      }
    ]
  ] as const)(
    'maps the enabled=%s sentinel to an empty non-leaking catalogue',
    async (enabled, row) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [row],
        error: null
      });

      await expect(getMyAchievements({ rpc } satisfies AchievementRpcClient)).resolves.toEqual({
        status: 'success',
        value: { enabled, achievements: [] }
      });
    }
  );

  it.each([
    ['a non-array payload', { data: { enabled: true }, error: null }],
    ['an empty array', { data: [], error: null }],
    ['a malformed group', { data: [{ ...earnedRow, achievement_group: 'bragging' }], error: null }],
    ['a missing earned_at field', { data: [{ ...earnedRow, earned_at: 7 }], error: null }],
    ['a consuming catalogue row', { data: [{ ...earnedRow, is_new: true }], error: null }],
    [
      'a mixed enabled/disabled payload',
      { data: [earnedRow, { ...milestoneRow, enabled: false }], error: null }
    ],
    [
      'Trusted Contributor progress',
      {
        data: [
          {
            ...milestoneRow,
            achievement_key: 'sustained_quality_contributor',
            progress_kind: 'credited_categories'
          }
        ],
        error: null
      }
    ],
    [
      'a mismatched progress kind',
      { data: [{ ...milestoneRow, progress_kind: 'credited_places' }], error: null }
    ],
    [
      'three milestone rows',
      {
        data: [
          milestoneRow,
          {
            ...milestoneRow,
            achievement_key: 'capital_region_wanderer',
            progress_kind: 'credited_municipalities'
          },
          {
            ...milestoneRow,
            achievement_key: 'explorer_ten_places',
            progress_kind: 'credited_places'
          }
        ],
        error: null
      }
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

  it('reads the private unread status without invoking the consuming claim', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ enabled: true, has_unread: true }],
      error: null
    });

    await expect(getMyAchievementStatus({ rpc } satisfies AchievementRpcClient)).resolves.toEqual({
      status: 'success',
      value: { enabled: true, hasUnread: true }
    });
    expect(rpc).toHaveBeenCalledWith('get_my_achievement_status');
  });

  it.each([
    [{ enabled: false, has_unread: true }] as unknown[],
    [{ enabled: true, has_unread: false, achievement_key: 'first_favourite' }] as unknown[],
    [] as unknown[],
    [
      { enabled: true, has_unread: true },
      { enabled: true, has_unread: false }
    ] as unknown[]
  ])('fails closed on malformed unread status %#', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });

    await expect(getMyAchievementStatus({ rpc } satisfies AchievementRpcClient)).resolves.toEqual({
      status: 'infrastructure_error'
    });
  });

  it('claims newly earned celebrations through the separate atomic RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [claimedRow], error: null });

    await expect(
      claimMyAchievementCelebrations({ rpc } satisfies AchievementRpcClient)
    ).resolves.toEqual({
      status: 'success',
      value: [
        {
          key: 'first_favourite',
          group: 'participation',
          displayOrder: 1,
          nameIs: 'Fyrsti vistaði staðurinn',
          nameEn: 'First Favourite',
          descriptionIs: 'Þú vistaðir stað í fyrsta sinn.',
          descriptionEn: 'You saved a place for the first time.',
          earnedAt: '2026-07-01T12:00:00Z',
          kind: 'earned'
        }
      ]
    });
    expect(rpc).toHaveBeenCalledWith('claim_my_achievement_celebrations');
  });

  it('accepts an empty atomic claim as an acknowledged experience with nothing new', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    await expect(
      claimMyAchievementCelebrations({ rpc } satisfies AchievementRpcClient)
    ).resolves.toEqual({
      status: 'success',
      value: []
    });
  });
});
