import { describe, expect, it } from 'vitest';

import {
  buildPlaceMediaObjectPath,
  extensionForMimeType,
  isAllowedPlaceMediaMimeType,
  parseApprovePlaceMediaFormData,
  parseRegisterEvidenceFormData,
  parseRegisterPhotoFormData
} from '$server/place-media/place-media-input';

function evidenceForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    placeId: '79300000-0000-4000-8000-000000000002',
    mimeType: 'image/png',
    byteSize: '1024',
    widthPx: '400',
    heightPx: '300',
    sourceUrl: 'https://example.invalid/source',
    capturedAt: '2026-07-12T09:00',
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function photoForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    placeId: '79300000-0000-4000-8000-000000000001',
    mimeType: 'image/jpeg',
    byteSize: '2048',
    widthPx: '1600',
    heightPx: '1200',
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function approveForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    mediaId: '79500000-0000-4000-8000-000000000001',
    photographerOrUploader: 'A. Photographer',
    sourceOrCaptureDate: '2026-06-01',
    licenseReference: 'Owner-supplied, permission on file',
    rightsBasis: 'explicit_permission',
    rightsEvidenceReference: 'Permission email dated 2026-06-01',
    sourceUrl: '',
    licenseUrl: '',
    attributionText: 'Photo by A. Photographer',
    attributionUrl: '',
    peopleReview: 'no_prominent_people',
    makePrimary: 'on',
    altTextIs: 'Hundur liggur á gólfi kaffihúss',
    altTextEn: 'A dog lies on a cafe floor',
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe('isAllowedPlaceMediaMimeType', () => {
  it('accepts exactly the three allowed image types', () => {
    expect(isAllowedPlaceMediaMimeType('image/png')).toBe(true);
    expect(isAllowedPlaceMediaMimeType('image/jpeg')).toBe(true);
    expect(isAllowedPlaceMediaMimeType('image/webp')).toBe(true);
  });

  it('rejects any other mime type', () => {
    expect(isAllowedPlaceMediaMimeType('image/gif')).toBe(false);
    expect(isAllowedPlaceMediaMimeType('application/pdf')).toBe(false);
    expect(isAllowedPlaceMediaMimeType('')).toBe(false);
  });
});

describe('extensionForMimeType and buildPlaceMediaObjectPath', () => {
  it('maps each allowed mime type to its extension', () => {
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('image/webp')).toBe('webp');
  });

  it('builds a Place-scoped object path with the object id and correct extension', () => {
    expect(buildPlaceMediaObjectPath('place-1', 'object-1', 'image/jpeg')).toBe(
      'place-1/object-1.jpg'
    );
  });
});

describe('parseRegisterEvidenceFormData', () => {
  it('parses a complete Evidence upload form', () => {
    const result = parseRegisterEvidenceFormData(evidenceForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toEqual({
      place_id: '79300000-0000-4000-8000-000000000002',
      kind: 'evidence_screenshot',
      mime_type: 'image/png',
      byte_size: 1024,
      width_px: 400,
      height_px: 300,
      source_url: 'https://example.invalid/source',
      captured_at: '2026-07-12T09:00:00.000Z'
    });
  });

  it('rejects a missing source URL as incomplete', () => {
    const result = parseRegisterEvidenceFormData(evidenceForm({ sourceUrl: '' }));
    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects a missing capture time as incomplete', () => {
    const result = parseRegisterEvidenceFormData(evidenceForm({ capturedAt: '' }));
    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects a non-http(s) source URL as invalid', () => {
    const result = parseRegisterEvidenceFormData(
      evidenceForm({ sourceUrl: 'javascript:alert(1)' })
    );
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects a disallowed mime type as incomplete', () => {
    const result = parseRegisterEvidenceFormData(evidenceForm({ mimeType: 'image/gif' }));
    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects a byte size over the cap as incomplete', () => {
    const result = parseRegisterEvidenceFormData(
      evidenceForm({ byteSize: String(20 * 1024 * 1024) })
    );
    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects zero or negative dimensions as incomplete', () => {
    expect(parseRegisterEvidenceFormData(evidenceForm({ widthPx: '0' }))).toEqual({
      ok: false,
      error: 'incomplete'
    });
    expect(parseRegisterEvidenceFormData(evidenceForm({ heightPx: '-1' }))).toEqual({
      ok: false,
      error: 'incomplete'
    });
  });
});

describe('parseRegisterPhotoFormData', () => {
  it('parses a complete Photo upload form with no licensing fields required', () => {
    const result = parseRegisterPhotoFormData(photoForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toEqual({
      place_id: '79300000-0000-4000-8000-000000000001',
      kind: 'photo',
      mime_type: 'image/jpeg',
      byte_size: 2048,
      width_px: 1600,
      height_px: 1200
    });
  });

  it('rejects a missing Place id as incomplete', () => {
    const result = parseRegisterPhotoFormData(photoForm({ placeId: '' }));
    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });
});

describe('parseApprovePlaceMediaFormData', () => {
  it('parses a complete approval form', () => {
    const result = parseApprovePlaceMediaFormData(approveForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toEqual({
      media_id: '79500000-0000-4000-8000-000000000001',
      photographer_or_uploader: 'A. Photographer',
      source_or_capture_date: '2026-06-01',
      license_reference: 'Owner-supplied, permission on file',
      rights_basis: 'explicit_permission',
      rights_evidence_reference: 'Permission email dated 2026-06-01',
      source_url: null,
      license_url: null,
      attribution_text: 'Photo by A. Photographer',
      attribution_url: null,
      people_review: 'no_prominent_people',
      make_primary: true,
      alt_text_is: 'Hundur liggur á gólfi kaffihúss',
      alt_text_en: 'A dog lies on a cafe floor'
    });
  });

  it.each([
    'photographerOrUploader',
    'sourceOrCaptureDate',
    'licenseReference',
    'rightsBasis',
    'rightsEvidenceReference',
    'attributionText',
    'peopleReview',
    'altTextIs',
    'altTextEn'
  ])('rejects a missing %s as incomplete', (field) => {
    const result = parseApprovePlaceMediaFormData(approveForm({ [field]: '' }));
    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects a malformed date as invalid', () => {
    const result = parseApprovePlaceMediaFormData(
      approveForm({ sourceOrCaptureDate: '06/01/2026' })
    );
    expect(result).toEqual({ ok: false, error: 'invalid' });
  });

  it('requires source and license URLs for openly licensed photography', () => {
    const result = parseApprovePlaceMediaFormData(
      approveForm({ rightsBasis: 'cc_by', sourceUrl: '', licenseUrl: '' })
    );
    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });

  it('accepts and normalizes an openly licensed photo', () => {
    const result = parseApprovePlaceMediaFormData(
      approveForm({
        rightsBasis: 'cc_by',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cafe.jpg',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        attributionUrl: 'https://commons.wikimedia.org/wiki/User:Photographer',
        makePrimary: ''
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.rights_basis).toBe('cc_by');
    expect(result.command.source_url).toBe('https://commons.wikimedia.org/wiki/File:Cafe.jpg');
    expect(result.command.make_primary).toBe(false);
  });

  it('rejects an unknown people review and malformed rights URLs', () => {
    expect(parseApprovePlaceMediaFormData(approveForm({ peopleReview: 'unknown' }))).toEqual({
      ok: false,
      error: 'incomplete'
    });
    expect(
      parseApprovePlaceMediaFormData(
        approveForm({
          rightsBasis: 'cc_by',
          sourceUrl: 'javascript:alert(1)',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
        })
      )
    ).toEqual({ ok: false, error: 'invalid' });
  });
});
