import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENT_SHARE_HEIGHT,
  ACHIEVEMENT_SHARE_WIDTH,
  renderAchievementSharePng
} from '$lib/achievements/share-card';

describe('Achievement share card PNG export', () => {
  it('encodes the privacy-first card as a usable 1200 by 630 PNG file', async () => {
    const file = await renderAchievementSharePng({
      achievementKey: 'place_categories_platinum',
      collection: 'place_categories',
      group: 'exploration',
      tier: 'platinum',
      name: 'Mixing It Up - Platinum',
      description: 'Visited every kind of place.',
      brand: 'Hundavænt',
      eyebrow: 'Achievement earned'
    });

    expect(file.type).toBe('image/png');
    expect(file.name).toBe('hundavaent-mixing-it-up-platinum.png');
    expect(file.size).toBeGreaterThan(20_000);

    const bitmap = await createImageBitmap(file);
    try {
      expect(bitmap.width).toBe(ACHIEVEMENT_SHARE_WIDTH);
      expect(bitmap.height).toBe(ACHIEVEMENT_SHARE_HEIGHT);
    } finally {
      bitmap.close();
    }
  });
});
