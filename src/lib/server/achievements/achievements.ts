export type AchievementGroup =
  'participation' | 'exploration' | 'contribution_quality' | 'longevity';

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

// Deliberately excludes any count, ratio, or partial-progress figure - the Member view renders
// exactly three states per catalogue entry: locked, earned, and newly earned.
export interface MyAchievement {
  key: string;
  group: AchievementGroup;
  displayOrder: number;
  nameIs: string;
  nameEn: string;
  descriptionIs: string;
  descriptionEn: string;
  earnedAt: string | null;
  isNew: boolean;
}

export interface MyAchievements {
  enabled: boolean;
  achievements: MyAchievement[];
}

export type AchievementCommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'forbidden' | 'invalid' | 'conflict' }
  | { status: 'infrastructure_error' };

// Reads the caller's private catalogue. The underlying RPC acknowledges every previously-unseen
// earned row in the same call, so is_new is true exactly once per unlock - the response consumes
// the "newly earned" indicator it reports.
export async function getMyAchievements(
  client: AchievementRpcClient
): Promise<AchievementCommandResult<MyAchievements>> {
  try {
    const { data, error } = await client.rpc('get_my_achievements');
    if (error) return { status: mapError(error.code) };
    if (!Array.isArray(data) || data.length === 0) return { status: 'infrastructure_error' };

    if (data.length === 1 && isRecord(data[0]) && data[0].enabled === false) {
      return { status: 'success', value: { enabled: false, achievements: [] } };
    }

    if (!data.every(isEnabledAchievementRow)) return { status: 'infrastructure_error' };

    return {
      status: 'success',
      value: {
        enabled: true,
        achievements: data.map((row) => ({
          key: row.achievement_key,
          group: row.achievement_group,
          displayOrder: row.display_order,
          nameIs: row.name_is,
          nameEn: row.name_en,
          descriptionIs: row.description_is,
          descriptionEn: row.description_en,
          earnedAt: row.earned_at,
          isNew: row.is_new
        }))
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapError(
  code: string | undefined
): Exclude<AchievementCommandResult<never>['status'], 'success'> {
  if (code === '55006' || code === '23505') return 'conflict';
  if (code === '42501') return 'forbidden';
  if (code === '22023') return 'invalid';
  return 'infrastructure_error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGroup(value: unknown): value is AchievementGroup {
  return (
    value === 'participation' ||
    value === 'exploration' ||
    value === 'contribution_quality' ||
    value === 'longevity'
  );
}

function isEnabledAchievementRow(value: unknown): value is Record<string, unknown> & {
  enabled: true;
  achievement_key: string;
  achievement_group: AchievementGroup;
  display_order: number;
  name_is: string;
  name_en: string;
  description_is: string;
  description_en: string;
  earned_at: string | null;
  is_new: boolean;
} {
  return (
    isRecord(value) &&
    value.enabled === true &&
    typeof value.achievement_key === 'string' &&
    isGroup(value.achievement_group) &&
    Number.isInteger(value.display_order) &&
    typeof value.name_is === 'string' &&
    typeof value.name_en === 'string' &&
    typeof value.description_is === 'string' &&
    typeof value.description_en === 'string' &&
    (typeof value.earned_at === 'string' || value.earned_at === null) &&
    typeof value.is_new === 'boolean'
  );
}
