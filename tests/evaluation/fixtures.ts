export {
  EVALUATION_FIXTURE_VERSION,
  evaluationFixtureIds,
  evaluationFixturePlaces,
  evaluationFixtureTimes,
  evaluationModerator,
  evaluationPublisher
} from '$server/evaluation/fixtures';

export const evaluationCandidateInput = {
  operatorName: 'Hundavænt browser operator',
  category: 'cafe',
  nameIs: 'Vafratillaga',
  descriptionIs: 'Tillaga búin til í raunverulegum vafra.',
  nameEn: 'Browser Candidate',
  descriptionEn: 'A Candidate created through the real browser journey.',
  addressLine: 'Vafragata 23',
  locality: 'Reykjavík',
  postalCode: '101',
  municipality: 'reykjavik',
  latitude: '64.1466',
  longitude: '-21.9426',
  evidenceUrl: 'https://example.invalid/browser-candidate/dog-access',
  evidenceSourceLabel: 'Official browser Candidate website',
  evidenceObservedAt: '2026-07-09T10:00'
} as const;

export const evaluationPublicationCandidateInput = {
  ...evaluationCandidateInput,
  operatorName: 'Hundavænt publication operator',
  nameIs: 'Birtingartillaga',
  nameEn: 'Publication Candidate',
  addressLine: 'Vafragata 28',
  latitude: '64.1467',
  evidenceUrl: 'https://example.invalid/publication-candidate/dog-access',
  evidenceSourceLabel: 'Official publication Candidate website'
} as const;
