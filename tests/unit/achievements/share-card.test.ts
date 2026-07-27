import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENT_SHARE_HEIGHT,
  ACHIEVEMENT_SHARE_WIDTH,
  achievementShareFilename,
  createAchievementShareSvg,
  type AchievementShareCard
} from '$lib/achievements/share-card';

const card: AchievementShareCard = {
  achievementKey: 'place_categories_platinum',
  collection: 'place_categories',
  group: 'exploration',
  tier: 'platinum',
  name: 'Mixing It Up - Platinum',
  description: 'Visited every kind of place.',
  brand: 'Hundavænt',
  eyebrow: 'Achievement earned'
};

describe('Achievement share card', () => {
  it('renders the social image at 1200 by 630 with the woven Platinum rosette', () => {
    const svg = createAchievementShareSvg(card);

    expect(ACHIEVEMENT_SHARE_WIDTH).toBe(1200);
    expect(ACHIEVEMENT_SHARE_HEIGHT).toBe(630);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('Mixing It Up - Platinum');
    expect(svg).toContain('stroke-dasharray="2 3"');
  });

  it('contains only supplied achievement copy and no member or activity fields', () => {
    const svg = createAchievementShareSvg(card);

    expect(svg).not.toMatch(/member|email|check-in|place_id|contribution_id/i);
    expect(svg).not.toContain('href=');
  });

  it('escapes copy before placing it in the SVG', () => {
    const svg = createAchievementShareSvg({
      ...card,
      name: 'A <badge> & "more"',
      description: "It isn't public."
    });

    expect(svg).toContain('A &lt;badge&gt; &amp; &quot;more&quot;');
    expect(svg).toContain('It isn&apos;t public.');
    expect(svg).not.toContain('A <badge>');
  });

  it('creates a stable, portable PNG filename', () => {
    expect(achievementShareFilename(card)).toBe('hundavaent-mixing-it-up-platinum.png');
    expect(achievementShareFilename({ ...card, name: 'Þátttaka' })).toBe('hundavaent-atttaka.png');
  });
});
