import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import CandidatePlacePage from '../../src/routes/[lang=lang]/moderation/places/new/+page.svelte';
import PublicationReviewPage from '../../src/routes/[lang=lang]/moderation/places/[id]/+page.svelte';
import ModeratorSignInPage from '../../src/routes/[lang=lang]/moderation/sign-in/+page.svelte';

describe('Moderator sign-in form', () => {
  it.each([
    ['is', 'Innskráning umsjónaraðila', 'Netfang', 'Senda innskráningartengil'],
    ['en', 'Moderator sign-in', 'Email address', 'Send sign-in link']
  ] as const)('renders the complete %s form', (lang, heading, emailLabel, submitLabel) => {
    render(ModeratorSignInPage, {
      params: { lang },
      data: {
        lang,
        copy: catalogues[lang],
        moderator: null,
        returnTo: `/${lang}/moderation`
      },
      form: null
    });

    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByLabelText(emailLabel).getAttribute('type')).toBe('email');
    expect(screen.getByRole('button', { name: submitLabel })).toBeTruthy();
  });

  it('focuses a server validation error and preserves the entered email', async () => {
    render(ModeratorSignInPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        moderator: null,
        returnTo: '/en/moderation/places/new'
      },
      form: {
        success: false,
        email: 'not-an-email',
        error: 'Enter a valid email address.',
        returnTo: '/en/moderation/places/new'
      }
    });

    const alert = screen.getByRole('alert');

    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('not-an-email');
    expect(screen.getByDisplayValue('/en/moderation/places/new').getAttribute('type')).toBe(
      'hidden'
    );
  });
});

describe('Candidate Place form', () => {
  it('renders bilingual identity, Location, Evidence, and Access Condition fields', () => {
    render(CandidatePlacePage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        moderator: { id: 'moderator-1' },
        defaultObservedAt: '2026-07-09T10:00'
      },
      form: null
    });

    expect(screen.getByRole('heading', { name: 'Add a Candidate Place' })).toBeTruthy();
    expect(screen.getByLabelText('Icelandic name')).toBeTruthy();
    expect(screen.getByLabelText('English name')).toBeTruthy();
    expect(screen.getByLabelText('Municipality')).toBeTruthy();
    expect(screen.getByLabelText('Postal code').getAttribute('pattern')).toBe('[0-9][0-9][0-9]');
    expect(screen.getByLabelText('Latitude').getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByLabelText('Geometry precision')).toBeTruthy();
    expect(screen.getByLabelText('Geometry source')).toBeTruthy();
    expect(screen.getByLabelText('Evidence URL').getAttribute('type')).toBe('url');
    expect(screen.getByLabelText('Evidence observed at').getAttribute('type')).toBe(
      'datetime-local'
    );
    expect(screen.getByLabelText('Where dogs are allowed')).toBeTruthy();
    expect(screen.getByLabelText('Leash and restraint')).toBeTruthy();
    expect(screen.getByLabelText('Permission')).toBeTruthy();
  });

  it('focuses a Candidate error and preserves submitted values', async () => {
    render(CandidatePlacePage, {
      params: { lang: 'is' },
      data: {
        lang: 'is',
        copy: catalogues.is,
        moderator: { id: 'moderator-1' },
        defaultObservedAt: '2026-07-09T10:00'
      },
      form: {
        success: false,
        error: 'Það vantar nauðsynlegar upplýsingar fyrir birtingu.',
        values: {
          operatorName: 'Varðveittur rekstraraðili',
          nameIs: 'Varðveitt heiti'
        }
      }
    });

    const alert = screen.getByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect((screen.getByLabelText('Rekstraraðili') as HTMLInputElement).value).toBe(
      'Varðveittur rekstraraðili'
    );
    expect((screen.getByLabelText('Heiti á íslensku') as HTMLInputElement).value).toBe(
      'Varðveitt heiti'
    );
  });
});

const completePublicationReview = {
  placeId: 'place-1',
  version: 1,
  lifecycle: 'candidate',
  candidateStatus: 'pending' as const,
  itemVersion: 1,
  draftVersion: 0,
  draftPayload: null,
  draftUpdatedBy: null,
  draftUpdatedAt: null,
  readinessState: 'ready' as const,
  readinessIssues: [],
  originatingSuggestionId: null,
  contributorId: null,
  operatorName: 'Candidate operator',
  category: 'restaurant',
  websiteUrl: null,
  phone: null,
  openingHours: {},
  dogAmenities: [],
  addressLine: 'Tillögugata 7',
  locality: 'Reykjavík',
  postalCode: '101',
  municipality: 'reykjavik',
  latitude: 64.1466,
  longitude: -21.9426,
  geometryPrecision: 'official_address_point' as const,
  geometrySource: 'HMS Staðfangaskrá coordinate 10000001',
  nameIs: 'Tillögustaður',
  descriptionIs: 'Íslensk lýsing.',
  nameEn: 'Candidate venue',
  descriptionEn: 'English description.',
  accessConditions: [
    {
      id: 'condition-1',
      accessArea: 'outdoors' as const,
      accessAreaNote: null,
      restraintCondition: 'leash_required' as const,
      restraintNote: null,
      dogEligibility: { scope: 'all_dogs' as const },
      availabilityWindow: {},
      permissionRequirement: 'standing_permission' as const
    }
  ],
  evidenceRecords: [
    {
      id: 'evidence-1',
      kind: 'official_website' as const,
      sourceUrl: 'https://example.invalid/source',
      sourceCitation: 'Section 4, patio rule',
      sourceLabel: 'Official website',
      observedAt: '2026-07-09T10:00:00.000Z'
    }
  ],
  checks: {
    candidate: true,
    operatorAndCategory: true,
    capitalRegionLocation: true,
    geometryQuality: true,
    icelandicTranslation: true,
    englishTranslation: true,
    accessCondition: true,
    evidence: true
  },
  ready: true
};

describe('Publication checklist', () => {
  it.each([
    ['is', 'Yfirfara stað', 'Atriði fyrir birtingu', 'Staðfesta og birta'],
    ['en', 'Review Place', 'Publication checklist', 'Verify and publish']
  ] as const)(
    'renders every publication invariant in %s',
    (lang, heading, checklistHeading, publishLabel) => {
      render(PublicationReviewPage, {
        params: { lang, id: 'place-1' },
        data: {
          lang,
          copy: catalogues[lang],
          moderator: { id: 'moderator-1' },
          review: completePublicationReview,
          defaultFreshnessUntil: '2099-01-01',
          mapStyleUrl: null,
          media: []
        },
        form: null
      });

      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      expect(screen.getByRole('heading', { name: checklistHeading })).toBeTruthy();
      expect(screen.getAllByText(dataReadyLabel(lang))).toHaveLength(1);
      expect(screen.getByText('64.146600, -21.942600')).toBeTruthy();
      expect(screen.getByText('HMS Staðfangaskrá coordinate 10000001')).toBeTruthy();
      expect(screen.getByRole('region', { name: lang === 'is' ? 'Kort' : 'Map' })).toBeTruthy();
      expect(
        screen.getByRole('button', {
          name: lang === 'is' ? 'Vista leiðrétta staðsetningu' : 'Save corrected location'
        })
      ).toBeTruthy();
      const mapping = screen.getByRole('group', {
        name: lang === 'is' ? 'Heimildir sem styðja skilyrði 1' : 'Evidence supporting condition 1'
      });
      expect(mapping.textContent).toContain(lang === 'is' ? 'utandyra' : 'outdoors');
      expect(mapping.textContent).toContain(lang === 'is' ? 'Opinber vefsíða' : 'Official website');
      expect(mapping.textContent).toContain('https://example.invalid/source');
      expect(mapping.textContent).toContain('Section 4, patio rule');
      expect(mapping.textContent).toContain(lang === 'is' ? '9. júlí 2026' : '9 July 2026');
      expect(mapping.textContent).not.toContain('official_website');
      expect(mapping.textContent).not.toContain('leash_required');
      expect(
        (
          screen.getByRole('button', {
            name: publishLabel
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false);
    }
  );

  it.each([
    [
      'en',
      'Dogs limited to 1 dog and matching this restriction: calm dogs only may be allowed after asking on arrival outdoors (rear patio only) on Monday from 10:00 to 12:00 when staff confirms the patio from 1 June 2026 through 31 August 2026 on a leash (short lead).',
      'Dogs weighing up to and including 10 kg may be allowed after asking on arrival outdoors (front patio only) before 17:00 on a leash (fixed lead).'
    ],
    [
      'is',
      'Hundar að hámarki 1 hundur og sem uppfylla skilyrðið: calm dogs only gætu fengið að vera eftir að spurt er við komu utandyra (rear patio only) á mánudögum frá kl. 10:00 til 12:00 þegar staff confirms the patio frá 1. júní 2026 til og með 31. ágúst 2026 í taumi (short lead).',
      'Hundar sem eru allt að og með 10 kg gætu fengið að vera eftir að spurt er við komu utandyra (front patio only) fyrir kl. 17:00 í taumi (fixed lead).'
    ]
  ] as const)(
    'keeps otherwise similar condition descriptions complete and unambiguous in %s',
    (lang, firstDescription, secondDescription) => {
      render(PublicationReviewPage, {
        params: { lang, id: 'place-1' },
        data: {
          lang,
          copy: catalogues[lang],
          moderator: { id: 'moderator-1' },
          review: {
            ...completePublicationReview,
            accessConditions: [
              {
                id: 'condition-1',
                accessArea: 'outdoors' as const,
                accessAreaNote: 'rear patio only',
                restraintCondition: 'leash_required' as const,
                restraintNote: 'short lead',
                dogEligibility: {
                  scope: 'restricted' as const,
                  maximumDogs: 1,
                  notes: 'calm dogs only'
                },
                availabilityWindow: {
                  days: [1],
                  startsAt: '10:00',
                  endsAt: '12:00',
                  startsOn: '2026-06-01',
                  endsOn: '2026-08-31',
                  notes: 'staff confirms the patio'
                },
                availabilityState: 'limited' as const,
                permissionRequirement: 'ask_on_arrival' as const
              },
              {
                id: 'condition-2',
                accessArea: 'outdoors' as const,
                accessAreaNote: 'front patio only',
                restraintCondition: 'leash_required' as const,
                restraintNote: 'fixed lead',
                dogEligibility: {
                  scope: 'restricted' as const,
                  maximumWeightKg: 10
                },
                availabilityWindow: { endsAt: '17:00' },
                availabilityState: 'limited' as const,
                permissionRequirement: 'ask_on_arrival' as const
              }
            ]
          },
          defaultFreshnessUntil: '2099-01-01',
          mapStyleUrl: null,
          media: []
        },
        form: null
      });

      expect(screen.getAllByText(firstDescription)).toHaveLength(2);
      expect(screen.getAllByText(secondDescription)).toHaveLength(2);
    }
  );

  it('links missing checks to their review fields and disables publication', () => {
    render(PublicationReviewPage, {
      params: { lang: 'en', id: 'place-1' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        moderator: { id: 'moderator-1' },
        review: {
          ...completePublicationReview,
          nameEn: null,
          descriptionEn: null,
          checks: {
            ...completePublicationReview.checks,
            englishTranslation: false
          },
          ready: false
        },
        defaultFreshnessUntil: '2099-01-01',
        mapStyleUrl: null,
        media: []
      },
      form: null
    });

    expect(screen.getByRole('link', { name: 'Add English translation' }).getAttribute('href')).toBe(
      '#translations'
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Verify and publish'
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('focuses a stale-version conflict and offers a reload recovery', async () => {
    render(PublicationReviewPage, {
      params: { lang: 'en', id: 'place-1' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        moderator: { id: 'moderator-1' },
        review: completePublicationReview,
        defaultFreshnessUntil: '2099-01-01',
        mapStyleUrl: null,
        media: []
      },
      form: {
        action: 'publish',
        success: false,
        error: 'The information changed while you were working.',
        conflict: true
      } as never
    });

    const alert = screen.getByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(
      screen.getByRole('link', { name: 'Reload current information' }).getAttribute('href')
    ).toBe('/en/moderation/places/place-1');
  });
});

const pendingPhoto = {
  mediaId: 'media-photo-pending',
  kind: 'photo' as const,
  storageBucket: 'place-photos',
  storageObjectPath: 'place-1/media-photo-pending.jpg',
  mimeType: 'image/jpeg',
  byteSize: 2048,
  widthPx: 1600,
  heightPx: 1200,
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pending_Photo.jpg',
  capturedAt: null,
  capturedBy: null,
  photographerOrUploader: 'Commons Photographer',
  sourceOrCaptureDate: '2026-06-01',
  licenseReference: 'CC BY 4.0',
  rightsBasis: 'cc_by' as const,
  rightsEvidenceReference: 'Wikimedia Commons page 123',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attributionText: 'Pending Photo by Commons Photographer, CC BY 4.0',
  attributionUrl: null,
  contentSha256: 'a'.repeat(64),
  peopleReview: 'unknown' as const,
  isPrimary: false,
  altTextIs: 'Ljósmynd í bið',
  altTextEn: 'Pending photo',
  approvalState: 'pending' as const,
  approvedBy: null,
  approvedAt: null,
  uploadedBy: 'moderator-1',
  uploadedAt: '2026-07-12T10:00:00.000Z',
  retiredAt: null,
  retiredBy: null,
  signedUrl: 'https://example.invalid/signed/photo-pending.jpg'
};

const approvedPhoto = {
  ...pendingPhoto,
  mediaId: 'media-photo-approved',
  storageObjectPath: 'place-1/media-photo-approved.jpg',
  photographerOrUploader: 'A. Photographer',
  sourceOrCaptureDate: '2026-06-01',
  licenseReference: 'Owner-supplied, permission on file',
  rightsBasis: 'explicit_permission' as const,
  rightsEvidenceReference: 'Permission email dated 2026-06-01',
  licenseUrl: null,
  attributionText: 'Photo by A. Photographer',
  attributionUrl: null,
  peopleReview: 'no_prominent_people' as const,
  isPrimary: true,
  altTextIs: 'Hundur liggur á gólfi kaffihúss',
  altTextEn: 'A dog lies on a cafe floor',
  approvalState: 'approved' as const,
  approvedBy: 'moderator-1',
  approvedAt: '2026-07-12T11:00:00.000Z',
  signedUrl: 'https://example.invalid/signed/photo-approved.jpg'
};

const evidenceItem = {
  mediaId: 'media-evidence-one',
  kind: 'evidence_screenshot' as const,
  storageBucket: 'place-evidence',
  storageObjectPath: 'place-1/media-evidence-one.png',
  mimeType: 'image/png',
  byteSize: 1024,
  widthPx: 400,
  heightPx: 300,
  sourceUrl: 'https://example.invalid/media-source',
  capturedAt: '2026-07-12T09:00:00.000Z',
  capturedBy: 'moderator-1',
  photographerOrUploader: null,
  sourceOrCaptureDate: null,
  licenseReference: null,
  rightsBasis: null,
  rightsEvidenceReference: null,
  licenseUrl: null,
  attributionText: null,
  attributionUrl: null,
  contentSha256: null,
  peopleReview: null,
  isPrimary: false,
  altTextIs: null,
  altTextEn: null,
  approvalState: 'pending' as const,
  approvedBy: null,
  approvedAt: null,
  uploadedBy: 'moderator-1',
  uploadedAt: '2026-07-12T09:00:00.000Z',
  retiredAt: null,
  retiredBy: null,
  signedUrl: 'https://example.invalid/signed/evidence-one.png'
};

describe('Media section', () => {
  it('shows clean empty states with no Evidence or Photos registered', () => {
    render(PublicationReviewPage, {
      params: { lang: 'en', id: 'place-1' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        moderator: { id: 'moderator-1' },
        review: completePublicationReview,
        defaultFreshnessUntil: '2099-01-01',
        mapStyleUrl: null,
        media: []
      },
      form: null
    });

    expect(screen.getByText('No Evidence screenshots have been registered.')).toBeTruthy();
    expect(screen.getByText('No Photos have been registered.')).toBeTruthy();
  });

  it('renders Evidence and Photo items with their current state', () => {
    render(PublicationReviewPage, {
      params: { lang: 'en', id: 'place-1' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        moderator: { id: 'moderator-1' },
        review: completePublicationReview,
        defaultFreshnessUntil: '2099-01-01',
        mapStyleUrl: null,
        media: [evidenceItem, pendingPhoto, approvedPhoto]
      },
      form: null
    });

    expect(screen.getByText('https://example.invalid/media-source')).toBeTruthy();
    expect(screen.getAllByText('Pending')).toHaveLength(1);
    expect(screen.getAllByText('Approved')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect((screen.getByLabelText('Rights basis') as HTMLSelectElement).value).toBe('cc_by');
    expect((screen.getByLabelText('Rights evidence reference') as HTMLInputElement).value).toBe(
      'Wikimedia Commons page 123'
    );
    expect((screen.getByLabelText('Public attribution text') as HTMLInputElement).value).toBe(
      'Pending Photo by Commons Photographer, CC BY 4.0'
    );
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Retire' })).toHaveLength(2);
  });

  it('shows a retired badge instead of actions for a retired item', () => {
    render(PublicationReviewPage, {
      params: { lang: 'en', id: 'place-1' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        moderator: { id: 'moderator-1' },
        review: completePublicationReview,
        defaultFreshnessUntil: '2099-01-01',
        mapStyleUrl: null,
        media: [
          { ...approvedPhoto, retiredAt: '2026-07-13T00:00:00.000Z', retiredBy: 'moderator-1' }
        ]
      },
      form: null
    });

    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull();
  });
});

function dataReadyLabel(lang: 'is' | 'en'): string {
  return lang === 'is' ? 'Tilbúið' : 'Ready';
}
