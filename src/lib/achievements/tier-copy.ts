import type { Catalogue, Locale, MessageKey } from '$i18n';
import type { AchievementMetric, AchievementTier } from '$server/achievements/achievements';

// A tier carries no copy of its own. Its display is derived here, in one place, so the grid, the
// cell and the celebration card cannot drift apart in how they name the same rung.

export function tierLabel(tier: AchievementTier, copy: Catalogue): string {
  return copy[`achievements.tier.${tier}` as MessageKey];
}

export function tierDisplayName(
  collectionName: string,
  tier: AchievementTier,
  copy: Catalogue
): string {
  return copy['achievements.tierName']
    .replace('{collection}', collectionName)
    .replace('{tier}', tierLabel(tier, copy));
}

export function tierDescription(
  metric: AchievementMetric,
  target: number,
  copy: Catalogue
): string {
  return copy[`achievements.tierDescription.${metric}` as MessageKey].replace(
    '{target}',
    String(target)
  );
}

export function progressLabel(
  metric: AchievementMetric,
  current: number,
  target: number,
  copy: Catalogue
): string {
  return copy[`achievements.progress.${metric}` as MessageKey]
    .replace('{current}', String(current))
    .replace('{target}', String(target));
}

export function targetLabel(metric: AchievementMetric, target: number, copy: Catalogue): string {
  return copy[`achievements.target.${metric}` as MessageKey].replace('{target}', String(target));
}

export function collectionName(
  entry: { collectionNameIs: string; collectionNameEn: string },
  lang: Locale
): string {
  return lang === 'is' ? entry.collectionNameIs : entry.collectionNameEn;
}
