export type AchievementGroup =
  'participation' | 'exploration' | 'contribution_quality' | 'longevity';

export type AchievementProgressKind =
  'credited_places' | 'credited_categories' | 'credited_municipalities';

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
  nameIs: string;
  nameEn: string;
  descriptionIs: string;
  descriptionEn: string;
}

export interface EarnedAchievement extends AchievementBase {
  kind: 'earned';
  earnedAt: string;
}

export interface AchievementMilestone extends AchievementBase {
  kind: 'milestone';
  earnedAt: null;
  progress: {
    kind: AchievementProgressKind;
    current: number;
    target: number;
  };
}

export type MyAchievement = EarnedAchievement | AchievementMilestone;

export interface MyAchievements {
  enabled: boolean;
  achievements: MyAchievement[];
}

export interface MyAchievementStatus {
  enabled: boolean;
  hasUnread: boolean;
}

export type AchievementCommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'forbidden' | 'invalid' | 'conflict' }
  | { status: 'infrastructure_error' };

const catalogueKeys = [
  'enabled',
  'achievement_key',
  'achievement_group',
  'display_order',
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
  'name_is',
  'name_en',
  'description_is',
  'description_en',
  'earned_at'
] as const;

const milestoneProgress = {
  explorer_ten_places: 'credited_places',
  category_curious: 'credited_categories',
  capital_region_wanderer: 'credited_municipalities'
} as const satisfies Record<string, AchievementProgressKind>;

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
    const milestoneCount = parsed.filter((achievement) => achievement.kind === 'milestone').length;
    if (
      milestoneCount > 2 ||
      new Set(parsed.map((achievement) => achievement.key)).size !== parsed.length
    ) {
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
): Promise<AchievementCommandResult<EarnedAchievement[]>> {
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

    return { status: 'success', value: claimed as EarnedAchievement[] };
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

  if (
    value.entry_kind === 'earned' &&
    typeof value.earned_at === 'string' &&
    Number.isFinite(Date.parse(value.earned_at)) &&
    value.progress_kind === null &&
    value.progress_current === null &&
    value.progress_target === null
  ) {
    return { ...base, kind: 'earned', earnedAt: value.earned_at };
  }

  if (
    value.entry_kind !== 'milestone' ||
    value.achievement_group !== 'exploration' ||
    value.earned_at !== null ||
    typeof value.achievement_key !== 'string' ||
    !isMilestoneKey(value.achievement_key) ||
    value.progress_kind !== milestoneProgress[value.achievement_key] ||
    !Number.isInteger(value.progress_current) ||
    !Number.isInteger(value.progress_target) ||
    (value.progress_current as number) <= 0 ||
    (value.progress_target as number) <= (value.progress_current as number)
  ) {
    return null;
  }

  return {
    ...base,
    kind: 'milestone',
    earnedAt: null,
    progress: {
      kind: milestoneProgress[value.achievement_key],
      current: value.progress_current as number,
      target: value.progress_target as number
    }
  };
}

function parseClaimedRow(value: unknown): EarnedAchievement | null {
  if (!isExactRecord(value, claimedKeys)) return null;
  const base = parseBase(value);
  if (
    !base ||
    typeof value.earned_at !== 'string' ||
    !Number.isFinite(Date.parse(value.earned_at))
  ) {
    return null;
  }
  return { ...base, kind: 'earned', earnedAt: value.earned_at };
}

function parseBase(value: Record<string, unknown>): AchievementBase | null {
  if (
    typeof value.achievement_key !== 'string' ||
    !isGroup(value.achievement_group) ||
    !Number.isInteger(value.display_order) ||
    (value.display_order as number) <= 0 ||
    typeof value.name_is !== 'string' ||
    typeof value.name_en !== 'string' ||
    typeof value.description_is !== 'string' ||
    typeof value.description_en !== 'string'
  ) {
    return null;
  }
  return {
    key: value.achievement_key,
    group: value.achievement_group,
    displayOrder: value.display_order as number,
    nameIs: value.name_is,
    nameEn: value.name_en,
    descriptionIs: value.description_is,
    descriptionEn: value.description_en
  };
}

function isCatalogueSentinel(
  value: unknown
): value is Record<(typeof catalogueKeys)[number], null | boolean> & { enabled: boolean } {
  return (
    isExactRecord(value, catalogueKeys) &&
    typeof value.enabled === 'boolean' &&
    value.achievement_key === null &&
    value.achievement_group === null &&
    value.display_order === null &&
    value.name_is === null &&
    value.name_en === null &&
    value.description_is === null &&
    value.description_en === null &&
    value.earned_at === null &&
    value.is_new === false &&
    value.entry_kind === null &&
    value.progress_kind === null &&
    value.progress_current === null &&
    value.progress_target === null
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

function isMilestoneKey(value: string): value is keyof typeof milestoneProgress {
  return Object.hasOwn(milestoneProgress, value);
}

function mapError(
  code: string | undefined
): Exclude<AchievementCommandResult<never>['status'], 'success'> {
  if (code === '55006' || code === '23505') return 'conflict';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}
