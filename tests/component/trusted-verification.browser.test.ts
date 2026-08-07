import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import '../../src/app.css';
import { catalogues } from '$i18n';
import TrustedVerificationPage from '../../src/routes/[lang=lang]/account/keep-current/+page.svelte';

const task = {
  taskId: 'access_freshness:condition-1:verification-1',
  taskKind: 'access_freshness' as const,
  placeId: 'place-1',
  placeName: 'Warm Cafe',
  municipality: 'reykjavik',
  category: 'cafe',
  currentValue: {
    access_area: 'indoors',
    restraint_condition: 'leash_required',
    permission_requirement: 'standing_permission'
  },
  freshnessUntil: '2026-08-01T00:00:00Z'
};

describe('Trusted Verification member surface', () => {
  it('presents a focused noncompetitive task with evidence and private outcome history', () => {
    const { container } = render(TrustedVerificationPage, {
      data: {
        lang: 'en',
        copy: catalogues.en,
        tasks: [task],
        taskRequestIds: { [task.taskId]: 'request-1' },
        history: [
          {
            submissionId: 'submission-1',
            taskId: task.taskId,
            taskKind: task.taskKind,
            flagId: 'flag-1',
            placeId: task.placeId,
            placeName: task.placeName,
            outcome: 'accepted',
            memberReason: 'Confirmed by a Moderator.',
            submittedAt: '2026-07-24T00:00:00Z',
            confirmedAt: '2026-07-24T12:00:00Z'
          }
        ]
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Help keep Hundavænt current' })).toBeTruthy();
    expect(
      screen.getByText('There are no claims, ranks, or races.', { exact: false })
    ).toBeTruthy();
    expect(screen.getAllByText('Warm Cafe')).toHaveLength(2);
    expect(screen.getByText('Confirmed contribution')).toBeTruthy();
    expect(container.querySelector('form [name="commandId"]')?.getAttribute('value')).toBe(
      'request-1'
    );
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('announces submission and weekly activation with a motion-safe celebration hook', () => {
    const { container } = render(TrustedVerificationPage, {
      data: {
        lang: 'is',
        copy: catalogues.is,
        tasks: [],
        taskRequestIds: {},
        history: []
      },
      form: {
        success: 'submitted',
        taskId: task.taskId,
        weeklyActivated: true
      }
    } as never);

    const celebration = screen.getByTestId('trusted-submission-success');
    expect(celebration.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Með þessu gagnlega skrefi telst vikan þín nú virk.')).toBeTruthy();
    expect(container.querySelector('.celebration-icon')).toBeTruthy();
  });
});
