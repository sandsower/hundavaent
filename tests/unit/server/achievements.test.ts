import { describe, expect, it, vi } from 'vitest';

import {
  claimMyAchievementCelebrations,
  getMyAchievements,
  getMyAchievementStatus,
  type AchievementRpcClient
} from '$server/achievements/achievements';

const earnedBespokeRow = {
  enabled: true,
  achievement_key: 'first_favourite',
  achievement_group: 'participation',
  display_order: 1,
  collection: null,
  tier: null,
  collection_name_is: null,
  collection_name_en: null,
  collection_description_is: null,
  collection_description_en: null,
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

const earnedTierRow = {
  ...earnedBespokeRow,
  achievement_key: 'place_categories_bronze',
  achievement_group: 'exploration',
  display_order: 14,
  collection: 'place_categories',
  tier: 'bronze',
  collection_name_is: 'Flokkar',
  collection_name_en: 'Categories',
  collection_description_is: 'Flokkar staða sem þú hefur innritað þig á.',
  collection_description_en: 'Categories of Place you have checked in at.',
  name_is: null,
  name_en: null,
  description_is: null,
  description_en: null
};

const lockedTierRow = {
  ...earnedTierRow,
  achievement_key: 'place_categories_silver',
  display_order: 15,
  tier: 'silver',
  earned_at: null,
  entry_kind: 'locked',
  progress_kind: 'credited_categories',
  progress_current: 2,
  progress_target: 3
};

const lockedPlatinumTierRow = {
  ...lockedTierRow,
  achievement_key: 'place_categories_platinum',
  display_order: 17,
  tier: 'platinum',
  progress_current: 4,
  progress_target: 5
};

const sentinelRow = Object.fromEntries(
  Object.keys(earnedBespokeRow).map((key) => [
    key,
    key === 'enabled' ? false : key === 'is_new' ? false : null
  ])
);

const claimedBespokeRow = {
  achievement_key: 'first_favourite',
  achievement_group: 'participation',
  display_order: 1,
  collection: null,
  tier: null,
  collection_name_is: null,
  collection_name_en: null,
  name_is: 'Fyrsti vistaði staðurinn',
  name_en: 'First Favourite',
  description_is: 'Þú vistaðir stað í fyrsta sinn.',
  description_en: 'You saved a place for the first time.',
  progress_kind: null,
  progress_target: null,
  earned_at: '2026-07-01T12:00:00Z'
};

const claimedTierRow = {
  ...claimedBespokeRow,
  achievement_key: 'place_categories_bronze',
  achievement_group: 'exploration',
  display_order: 14,
  collection: 'place_categories',
  tier: 'bronze',
  collection_name_is: 'Flokkar',
  collection_name_en: 'Categories',
  name_is: null,
  name_en: null,
  description_is: null,
  description_en: null,
  progress_kind: 'credited_categories',
  progress_target: 2
};

describe('Achievements RPC adapter', () => {
  it('discriminates bespoke Achievements, earned tiers and locked tiers', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [earnedBespokeRow, earnedTierRow, lockedTierRow], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({
      status: 'success',
      value: {
        enabled: true,
        achievements: [
          {
            kind: 'earned',
            entry: 'bespoke',
            key: 'first_favourite',
            group: 'participation',
            displayOrder: 1,
            nameIs: 'Fyrsti vistaði staðurinn',
            nameEn: 'First Favourite',
            descriptionIs: 'Þú vistaðir stað í fyrsta sinn.',
            descriptionEn: 'You saved a place for the first time.',
            earnedAt: '2026-07-01T12:00:00Z'
          },
          {
            kind: 'earned',
            entry: 'tier',
            key: 'place_categories_bronze',
            group: 'exploration',
            displayOrder: 14,
            collection: 'place_categories',
            tier: 'bronze',
            collectionNameIs: 'Flokkar',
            collectionNameEn: 'Categories',
            collectionDescriptionIs: 'Flokkar staða sem þú hefur innritað þig á.',
            collectionDescriptionEn: 'Categories of Place you have checked in at.',
            earnedAt: '2026-07-01T12:00:00Z'
          },
          {
            kind: 'locked',
            entry: 'tier',
            key: 'place_categories_silver',
            group: 'exploration',
            displayOrder: 15,
            collection: 'place_categories',
            tier: 'silver',
            collectionNameIs: 'Flokkar',
            collectionNameEn: 'Categories',
            collectionDescriptionIs: 'Flokkar staða sem þú hefur innritað þig á.',
            collectionDescriptionEn: 'Categories of Place you have checked in at.',
            earnedAt: null,
            progress: { kind: 'credited_categories', current: 2, target: 3 }
          }
        ]
      }
    });
  });

  it('accepts a locked tier the Member has not started, which the old two-milestone cap hid', async () => {
    const unstarted = { ...lockedTierRow, progress_current: 0 };
    const rpc = vi.fn().mockResolvedValue({ data: [unstarted], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.value.achievements[0]).toMatchObject({
      kind: 'locked',
      progress: { current: 0, target: 3 }
    });
  });

  it('accepts a full sixteen-slot grid rather than rejecting more than two locked entries', async () => {
    const rows = Array.from({ length: 16 }, (_, index) => ({
      ...lockedTierRow,
      achievement_key: `tier_${index}`,
      display_order: index + 1
    }));
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.value.achievements).toHaveLength(16);
  });

  it('accepts Platinum as the fourth collection tier', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [lockedPlatinumTierRow], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.value.achievements[0]).toMatchObject({
      key: 'place_categories_platinum',
      tier: 'platinum',
      progress: { current: 4, target: 5 }
    });
  });

  it('rejects a row that mixes the tier and bespoke shapes', async () => {
    const contradictory = { ...lockedTierRow, name_en: 'A tier must not carry its own copy' };
    const rpc = vi.fn().mockResolvedValue({ data: [contradictory], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({ status: 'infrastructure_error' });
  });

  it('rejects a locked tier whose progress exceeds its own threshold', async () => {
    const impossible = { ...lockedTierRow, progress_current: 4, progress_target: 3 };
    const rpc = vi.fn().mockResolvedValue({ data: [impossible], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({ status: 'infrastructure_error' });
  });

  it('rejects a bespoke definition that leaks while still locked', async () => {
    const leaked = { ...earnedBespokeRow, entry_kind: 'locked', earned_at: null };
    const rpc = vi.fn().mockResolvedValue({ data: [leaked], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({ status: 'infrastructure_error' });
  });

  it('reports the feature as disabled from the sentinel row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [sentinelRow], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({
      status: 'success',
      value: { enabled: false, achievements: [] }
    });
  });

  it('rejects a duplicated key', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [earnedTierRow, earnedTierRow], error: null });

    const result = await getMyAchievements({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({ status: 'infrastructure_error' });
  });

  it('maps an empty response to an infrastructure error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    expect(await getMyAchievements({ rpc } satisfies AchievementRpcClient)).toEqual({
      status: 'infrastructure_error'
    });
  });

  it('maps a denied read to forbidden', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });

    expect(await getMyAchievements({ rpc } satisfies AchievementRpcClient)).toEqual({
      status: 'forbidden'
    });
  });

  it('reads the non-consuming unread status', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ enabled: true, has_unread: true }], error: null });

    expect(await getMyAchievementStatus({ rpc } satisfies AchievementRpcClient)).toEqual({
      status: 'success',
      value: { enabled: true, hasUnread: true }
    });
  });

  it('rejects an unread status that claims unread while disabled', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ enabled: false, has_unread: true }], error: null });

    expect(await getMyAchievementStatus({ rpc } satisfies AchievementRpcClient)).toEqual({
      status: 'infrastructure_error'
    });
  });

  it('claims a tier celebration with everything needed to derive its copy', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [claimedTierRow], error: null });

    const result = await claimMyAchievementCelebrations({ rpc } satisfies AchievementRpcClient);

    expect(result).toEqual({
      status: 'success',
      value: [
        {
          kind: 'earned',
          entry: 'tier',
          key: 'place_categories_bronze',
          group: 'exploration',
          displayOrder: 14,
          collection: 'place_categories',
          tier: 'bronze',
          collectionNameIs: 'Flokkar',
          collectionNameEn: 'Categories',
          progressKind: 'credited_categories',
          progressTarget: 2,
          earnedAt: '2026-07-01T12:00:00Z'
        }
      ]
    });
  });

  it('claims a bespoke celebration from its own copy', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [claimedBespokeRow], error: null });

    const result = await claimMyAchievementCelebrations({ rpc } satisfies AchievementRpcClient);

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.value[0]).toMatchObject({
      entry: 'bespoke',
      nameEn: 'First Favourite'
    });
  });

  it('rejects a claimed tier missing its threshold', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ ...claimedTierRow, progress_target: null }], error: null });

    expect(await claimMyAchievementCelebrations({ rpc } satisfies AchievementRpcClient)).toEqual({
      status: 'infrastructure_error'
    });
  });
});
