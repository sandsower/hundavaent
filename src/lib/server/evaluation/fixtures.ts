export const EVALUATION_FIXTURE_VERSION = 'evaluation-fixtures/v1' as const;

export const evaluationFixtureIds = {
  operator: '10000000-0000-4000-8000-000000000001',
  locations: {
    candidate: '20000000-0000-4000-8000-000000000001',
    unverified: '20000000-0000-4000-8000-000000000002',
    published: '20000000-0000-4000-8000-000000000003'
  },
  places: {
    candidate: '30000000-0000-4000-8000-000000000001',
    unverified: '30000000-0000-4000-8000-000000000002',
    published: '30000000-0000-4000-8000-000000000003'
  },
  publishedAccessCondition: '40000000-0000-4000-8000-000000000003',
  publishedEvidence: '50000000-0000-4000-8000-000000000003',
  publishedVerification: '60000000-0000-4000-8000-000000000003'
} as const;

export const evaluationFixtureTimes = {
  createdAt: '2026-07-09T09:00:00.000Z',
  observedAt: '2026-07-09T10:00:00.000Z',
  publishedAt: '2026-07-09T11:00:00.000Z',
  verifiedAt: '2026-07-09T11:00:00.000Z',
  freshnessUntil: '2099-01-01T00:00:00.000Z'
} as const;

export const evaluationFixturePlaces = {
  candidate: {
    id: evaluationFixtureIds.places.candidate,
    names: { is: 'Tillaga að stað', en: 'Candidate Place' }
  },
  unverified: {
    id: evaluationFixtureIds.places.unverified,
    names: { is: 'Óstaðfestur staður', en: 'Unverified Place' }
  },
  published: {
    id: evaluationFixtureIds.places.published,
    names: { is: 'Birtur staður', en: 'Published Place' }
  }
} as const;

export const evaluationModerator = {
  email: 'moderator@example.invalid'
} as const;

export const evaluationPublisher = {
  email: 'publisher@example.invalid'
} as const;
