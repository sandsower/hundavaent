import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';
import type { QualifyingAction } from '$lib/member-activity/types';

describe('WeeklyRhythmAcknowledgement', () => {
  it.each([
    ['favourite', 'Place saved to your trail'],
    ['check_in', 'Check-in added to your trail'],
    ['rating', 'Rating added to your trail'],
    ['suggestion', 'Suggestion added to your trail'],
    ['correction', 'Correction added to your trail'],
    ['report', 'Report added to your trail']
  ] as const)('uses action-specific iconography and copy for %s', (action, title) => {
    const view = render(WeeklyRhythmAcknowledgement, {
      recognition: recognition(action),
      subjectName: 'Brikk',
      copy: catalogues.en
    });

    const acknowledgement = view.container.querySelector('[data-weekly-rhythm-acknowledgement]');
    expect(acknowledgement?.getAttribute('data-recognition-action')).toBe(action);
    expect(acknowledgement?.getAttribute('data-activated-week')).toBe('false');
    expect(screen.getByText(title)).toBeTruthy();
    expect(acknowledgement?.querySelector('.action-icon')).toBeTruthy();
  });

  it('lets the first action of a week celebrate the trail without exposing action payloads', () => {
    const view = render(WeeklyRhythmAcknowledgement, {
      recognition: { ...recognition('suggestion'), activatedCurrentWeek: true },
      copy: catalogues.is
    });
    expect(screen.getByText('Slóð vikunnar er hafin')).toBeTruthy();
    expect(view.container.textContent).not.toContain('request');
    expect(view.container.textContent).not.toContain('payload');
  });
});

function recognition(action: QualifyingAction) {
  return {
    action,
    recognized: true,
    activatedCurrentWeek: false,
    currentWeek: { startsOn: '2026-07-20', endsOn: '2026-07-26', active: true }
  };
}
