import { describe, expect, it } from 'vitest';

import { parseFavouriteMutationPayload } from '$lib/member-activity/types';

const placeId = '30000000-0000-4000-8000-000000000003';

describe('Favorite recognition payload', () => {
  it('accepts the complete server-authoritative contract', () => {
    expect(
      parseFavouriteMutationPayload(
        {
          placeId,
          isFavourite: true,
          changedAt: '2026-07-13T12:00:00.000Z',
          recognition: {
            firstTimeForPlace: true,
            activatedCurrentWeek: true,
            currentWeek: {
              startsOn: '2026-07-13',
              endsOn: '2026-07-19',
              active: true
            }
          }
        },
        placeId,
        true
      )
    ).toEqual({
      placeId,
      isFavourite: true,
      changedAt: '2026-07-13T12:00:00.000Z',
      recognition: {
        firstTimeForPlace: true,
        activatedCurrentWeek: true,
        currentWeek: {
          startsOn: '2026-07-13',
          endsOn: '2026-07-19',
          active: true
        }
      }
    });
  });

  it.each([
    ['missing recognition', { placeId, isFavourite: true, changedAt: '2026-07-13T12:00:00.000Z' }],
    [
      'mismatched state',
      {
        placeId,
        isFavourite: false,
        changedAt: '2026-07-13T12:00:00.000Z',
        recognition: {
          firstTimeForPlace: false,
          activatedCurrentWeek: false,
          currentWeek: { startsOn: '2026-07-13', endsOn: '2026-07-19', active: true }
        }
      }
    ],
    [
      'invalid week',
      {
        placeId,
        isFavourite: true,
        changedAt: '2026-07-13T12:00:00.000Z',
        recognition: {
          firstTimeForPlace: true,
          activatedCurrentWeek: true,
          currentWeek: { startsOn: 'Monday', endsOn: 'Sunday', active: true }
        }
      }
    ],
    [
      'an impossible activation',
      {
        placeId,
        isFavourite: true,
        changedAt: '2026-07-13T12:00:00.000Z',
        recognition: {
          firstTimeForPlace: false,
          activatedCurrentWeek: true,
          currentWeek: { startsOn: '2026-07-13', endsOn: '2026-07-19', active: true }
        }
      }
    ]
  ])('rejects %s rather than inventing client-side recognition', (_, payload) => {
    expect(parseFavouriteMutationPayload(payload, placeId, true)).toBeNull();
  });
});
