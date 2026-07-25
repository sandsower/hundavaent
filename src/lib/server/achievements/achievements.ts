export type AchievementGroup =
  'participation' | 'exploration' | 'contribution_quality' | 'longevity';

export type AchievementMetric =
  | 'credited_places'
  | 'credited_categories'
  | 'credited_municipalities'
  | 'confirmed_contributions';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

interface RpcError {
  code?: string;
}

interface RpcResponse {
  data: unknown;
  error: RpcError | null;
}

export interface AchievementRpcClient {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<RpcResponse>;
}

interface AchievementBase {
  key: string;
  group: AchievementGroup;
  displayOrder: number;
}

// A bespoke Achievement carries its own copy. A tier carries none: it derives its display from its
// collection's name plus a tier label, which is why the two shapes are kept apart in the type rather
// than merged into one record with four nullable copy fields.
interface BespokeCopy {
  nameIs: string;
  nameEn: string;
  descriptionIs: string;
  descriptionEn: string;
}

interface CollectionCopy {
  collection: string;
  tier: AchievementTier;
  collectionNameIs: string;
  collectionNameEn: string;
  collectionDescriptionIs: string;
  collectionDescriptionEn: string;
}

export interface EarnedBespokeAchievement extends AchievementBase, BespokeCopy {
  kind: 'earned';
  entry: 'bespoke';
  earnedAt: string;
}

export interface EarnedTierAchievement extends AchievementBase, CollectionCopy {
  kind: 'earned';
  entry: 'tier';
  earnedAt: string;
}

export interface LockedTierAchievement extends AchievementBase, CollectionCopy {
  kind: 'locked';
  entry: 'tier';
  earnedAt: null;
  progress: {
    kind: AchievementMetric;
    current: number;
    target: number;
  };
}

export type EarnedAchievement = EarnedBespokeAchievement | EarnedTierAchievement;
export type MyAchievement = EarnedAchievement | LockedTierAchievement;

export interface MyAchievements {
  enabled: boolean;
  achievements: MyAchievement[];
}

export interface MyAchievementStatus {
  enabled: boolean;
  hasUnread: boolean;
}

export type ClaimedBespokeAchievement = EarnedBespokeAchievement;

export interface ClaimedTierAchievement extends AchievementBase {
  kind: 'earned';
  entry: 'tier';
  earnedAt: string;
  collection: string;
  tier: AchievementTier;
  collectionNameIs: string;
  collectionNameEn: string;
  progressKind: AchievementMetric;
  progressTarget: number;
}

export type ClaimedAchievement = ClaimedBespokeAchievement | ClaimedTierAchievement;

export type AchievementCommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'forbidden' | 'invalid' | 'conflict' }
  | { status: 'infrastructure_error' };

const catalogueKeys = [
  'enabled',
  'achievement_key',
  'achievement_group',
  'display_order',
  'collection',
  'tier',
  'collection_name_is',
  'collection_name_en',
  'collection_description_is',
  'collection_description_en',
  'name_is',
  'name_en',
  'description_is',
  'description_en',
  'earned_at',
  'is_new',
  'entry_kind',
  'progress_kind',
  'progress_current',
  'progress_target'
] as const;

const claimedKeys = [
  'achievement_key',
  'achievement_group',
  'display_order',
  'collection',
  'tier',
  'collection_name_is',
  'collection_name_en',
  'name_is',
  'name_en',
  'description_is',
  'description_en',
  'progress_kind',
  'progress_target',
  'earned_at'
] as const;

export async function getMyAchievements(
  client: AchievementRpcClient
): Promise<AchievementCommandResult<MyAchievements>> {
  try {
    const { data, error } = await client.rpc('get_my_achievements');
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length === 0) return { status: 'infrastructure_error' };

    if (data.length === 1 && isCatalogueSentinel(data[0])) {
      return {
        status: 'success',
        value: { enabled: data[0].enabled, achievements: [] }
      };
    }

    const achievements = data.map(parseCatalogueRow);
    if (achievements.some((achievement) => achievement === null)) {
      return { status: 'infrastructure_error' };
    }

    const parsed = achievements as MyAchievement[];
    if (new Set(parsed.map((achievement) => achievement.key)).size !== parsed.length) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: { enabled: true, achievements: parsed }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function getMyAchievementStatus(
  client: AchievementRpcClient
): Promise<AchievementCommandResult<MyAchievementStatus>> {
  try {
    const { data, error } = await client.rpc('get_my_achievement_status');
    if (error) return { status: mapError(error.code) };
    if (
      !Array.isArray(data) ||
      data.length !== 1 ||
      !isExactRecord(data[0], ['enabled', 'has_unread']) ||
      typeof data[0].enabled !== 'boolean' ||
      typeof data[0].has_unread !== 'boolean' ||
      (!data[0].enabled && data[0].has_unread)
    ) {
      return { status: 'infrastructure_error' };
    }

    return {
      status: 'success',
      value: { enabled: data[0].enabled, hasUnread: data[0].has_unread }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export async function claimMyAchievementCelebrations(
  client: AchievementRpcClient
): Promise<AchievementCommandResult<ClaimedAchievement[]>> {
  try {
    const { data, error } = await client.rpc('claim_my_achievement_celebrations');
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data)) return { status: 'infrastructure_error' };

    const claimed = data.map(parseClaimedRow);
    if (
      claimed.some((achievement) => achievement === null) ||
      new Set(claimed.map((achievement) => achievement?.key)).size !== claimed.length
    ) {
      return { status: 'infrastructure_error' };
    }

    return { status: 'success', value: claimed as ClaimedAchievement[] };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function parseCatalogueRow(value: unknown): MyAchievement | null {
  if (!isExactRecord(value, catalogueKeys) || value.enabled !== true || value.is_new !== false) {
    return null;
  }

  const base = parseBase(value);
  if (!base) return null;

  const isTier = value.collection !== null;
  const noProgress =
    value.progress_kind === null &&
    value.progress_current === null &&
    value.progress_target === null;

  if (value.entry_kind === 'earned') {
    if (!noProgress || typeof value.earned_at !== 'string' || !isTimestamp(value.earned_at)) {
      return null;
    }

    if (!isTier) {
      const copy = parseBespokeCopy(value);
      return copy ? { ...base, ...copy, kind: 'earned', entry: 'bespoke', earnedAt: value.earned_at } : null;
    }

    const collection = parseCollectionCopy(value);
    return collection
      ? { ...base, ...collection, kind: 'earned', entry: 'tier', earnedAt: value.earned_at }
      : null;
  }

  if (value.entry_kind !== 'locked' || !isTier || value.earned_at !== null) return null;

  const collection = parseCollectionCopy(value);
  if (
    !collection ||
    !isMetric(value.progress_kind) ||
    !Number.isInteger(value.progress_current) ||
    !Number.isInteger(value.progress_target) ||
    (value.progress_current as number) < 0 ||
    (value.progress_target as number) <= 0 ||
    (value.progress_current as number) > (value.progress_target as number)
  ) {
    return null;
  }

  return {
    ...base,
    ...collection,
    kind: 'locked',
    entry: 'tier',
    earnedAt: null,
    progress: {
      kind: value.progress_kind,
      current: value.progress_current as number,
      target: value.progress_target as number
    }
  };
}

function parseClaimedRow(value: unknown): ClaimedAchievement | null {
  if (!isExactRecord(value, claimedKeys)) return null;
  const base = parseBase(value);
  if (!base || typeof value.earned_at !== 'string' || !isTimestamp(value.earned_at)) return null;

  if (value.collection === null) {
    const copy = parseBespokeCopy(value);
    if (!copy || value.tier !== null || value.progress_kind !== null || value.progress_target !== null) {
      return null;
    }
    return { ...base, ...copy, kind: 'earned', entry: 'bespoke', earnedAt: value.earned_at };
  }

  if (
    typeof value.collection !== 'string' ||
    !isTier(value.tier) ||
    typeof value.collection_name_is !== 'string' ||
    typeof value.collection_name_en !== 'string' ||
    value.name_is !== null ||
    value.name_en !== null ||
    value.description_is !== null ||
    value.description_en !== null ||
    !isMetric(value.progress_kind) ||
    !Number.isInteger(value.progress_target) ||
    (value.progress_target as number) <= 0
  ) {
    return null;
  }

  return {
    ...base,
    kind: 'earned',
    entry: 'tier',
    earnedAt: value.earned_at,
    collection: value.collection,
    tier: value.tier,
    collectionNameIs: value.collection_name_is,
    collectionNameEn: value.collection_name_en,
    progressKind: value.progress_kind,
    progressTarget: value.progress_target as number
  };
}

function parseBase(value: Record<string, unknown>): AchievementBase | null {
  if (
    typeof value.achievement_key !== 'string' ||
    !isGroup(value.achievement_group) ||
    !Number.isInteger(value.display_order) ||
    (value.display_order as number) <= 0
  ) {
    return null;
  }
  return {
    key: value.achievement_key,
    group: value.achievement_group,
    displayOrder: value.display_order as number
  };
}

function parseBespokeCopy(value: Record<string, unknown>): BespokeCopy | null {
  if (
    value.tier !== null ||
    typeof value.name_is !== 'string' ||
    typeof value.name_en !== 'string' ||
    typeof value.description_is !== 'string' ||
    typeof value.description_en !== 'string'
  ) {
    return null;
  }
  return {
    nameIs: value.name_is,
    nameEn: value.name_en,
    descriptionIs: value.description_is,
    descriptionEn: value.description_en
  };
}

function parseCollectionCopy(value: Record<string, unknown>): CollectionCopy | null {
  if (
    typeof value.collection !== 'string' ||
    !isTier(value.tier) ||
    typeof value.collection_name_is !== 'string' ||
    typeof value.collection_name_en !== 'string' ||
    typeof value.collection_description_is !== 'string' ||
    typeof value.collection_description_en !== 'string' ||
    value.name_is !== null ||
    value.name_en !== null ||
    value.description_is !== null ||
    value.description_en !== null
  ) {
    return null;
  }
  return {
    collection: value.collection,
    tier: value.tier,
    collectionNameIs: value.collection_name_is,
    collectionNameEn: value.collection_name_en,
    collectionDescriptionIs: value.collection_description_is,
    collectionDescriptionEn: value.collection_description_en
  };
}

function isCatalogueSentinel(
  value: unknown
): value is Record<(typeof catalogueKeys)[number], null | boolean> & { enabled: boolean } {
  return (
    isExactRecord(value, catalogueKeys) &&
    typeof value.enabled === 'boolean' &&
    value.is_new === false &&
    catalogueKeys
      .filter((key) => key !== 'enabled' && key !== 'is_new')
      .every((key) => value[key] === null)
  );
}

function isExactRecord<K extends string>(
  value: unknown,
  expectedKeys: readonly K[]
): value is Record<K, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isGroup(value: unknown): value is AchievementGroup {
  return (
    value === 'participation' ||
    value === 'exploration' ||
    value === 'contribution_quality' ||
    value === 'longevity'
  );
}

function isTier(value: unknown): value is AchievementTier {
  return value === 'bronze' || value === 'silver' || value === 'gold';
}

function isMetric(value: unknown): value is AchievementMetric {
  return (
    value === 'credited_places' ||
    value === 'credited_categories' ||
    value === 'credited_municipalities' ||
    value === 'confirmed_contributions'
  );
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function mapError(
  code: string | undefined
): Exclude<AchievementCommandResult<never>['status'], 'success'> {
  if (code === '55006' || code === '23505') return 'conflict';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}
