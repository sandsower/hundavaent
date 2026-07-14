import type { Json } from '$server/db/generated.types';

export type SuggestionInputError = 'excluded_purpose' | 'incomplete' | 'invalid';

export interface SuggestionProposal {
  purpose: 'dog_access_destination';
  operator_name: string;
  category:
    | 'restaurant'
    | 'cafe'
    | 'bar'
    | 'shop'
    | 'shopping_centre'
    | 'accommodation'
    | 'park'
    | 'recreation'
    | 'culture'
    | 'service'
    | 'other';
  location: {
    address_line: string;
    locality: string;
    postal_code: string;
    municipality: string;
    latitude: number;
    longitude: number;
  };
  translations: {
    is: { name: string; description: string; needs_review?: boolean };
    en: { name: string; description: string; needs_review?: boolean };
  };
  website_url: string | null;
  phone: string | null;
  opening_hours: Record<string, Json>;
  dog_amenities: string[];
  access_condition: {
    access_area: 'indoors' | 'outdoors' | 'designated_area' | 'other_bounded';
    access_area_note: string | null;
    restraint_condition:
      'leash_required' | 'off_leash_permitted' | 'carrier_required' | 'other_sourced';
    restraint_note: string | null;
    dog_eligibility: { scope: 'all_dogs' };
    availability_window: Record<string, Json>;
    permission_requirement: 'standing_permission' | 'ask_on_arrival' | 'advance_approval';
  };
  evidence: {
    kind:
      | 'official_website'
      | 'venue_representative'
      | 'member_report'
      | 'direct_observation'
      | 'public_record'
      | 'other';
    source_url: string | null;
    source_citation: string | null;
    source_label: string;
    observed_at: string;
    explanation: string;
    source_metadata: Record<string, Json>;
  };
}

export type SuggestionInputResult =
  { ok: true; proposal: SuggestionProposal } | { ok: false; error: SuggestionInputError };

export interface SuggestionParseOptions {
  locale?: 'is' | 'en';
  now?: () => Date;
}

const categories = new Set<SuggestionProposal['category']>([
  'restaurant',
  'cafe',
  'bar',
  'shop',
  'shopping_centre',
  'accommodation',
  'park',
  'recreation',
  'culture',
  'service',
  'other'
]);
const accessAreas = new Set<SuggestionProposal['access_condition']['access_area']>([
  'indoors',
  'outdoors',
  'designated_area',
  'other_bounded'
]);
const restraints = new Set<SuggestionProposal['access_condition']['restraint_condition']>([
  'leash_required',
  'off_leash_permitted',
  'carrier_required',
  'other_sourced'
]);
const permissions = new Set<SuggestionProposal['access_condition']['permission_requirement']>([
  'standing_permission',
  'ask_on_arrival',
  'advance_approval'
]);
const evidenceKinds = new Set<SuggestionProposal['evidence']['kind']>([
  'official_website',
  'venue_representative',
  'member_report',
  'direct_observation',
  'public_record',
  'other'
]);

export function parseSuggestionFormData(
  form: FormData,
  options: SuggestionParseOptions = {}
): SuggestionInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const purpose = value('purpose');
  if (purpose !== 'dog_access_destination') return { ok: false, error: 'excluded_purpose' };
  if (value('submissionProfile') === 'simple-v1') {
    return parseSimpleSuggestionFormData(form, options);
  }

  const category = value('category');
  const accessArea = value('accessArea');
  const restraint = value('restraintCondition');
  const permission = value('permissionRequirement');
  const evidenceKind = value('evidenceKind');
  const latitude = Number(value('latitude'));
  const longitude = Number(value('longitude'));
  const daysValue = value('availabilityDays');
  const days = daysValue
    ? daysValue
        .split(',')
        .map((day) => Number(day.trim()))
        .filter((day) => Number.isFinite(day))
    : [];
  const observedAt = value('evidenceObservedAt');
  const sourceUrl = value('evidenceUrl');
  const sourceCitation = value('evidenceCitation');
  const openingHours = parseJsonObject(value('openingHoursJson'));
  const sourceMetadata = parseJsonObject(value('sourceMetadataJson'));

  const required = [
    value('operatorName'),
    value('addressLine'),
    value('locality'),
    value('postalCode'),
    value('municipality'),
    value('nameIs'),
    value('descriptionIs'),
    value('nameEn'),
    value('descriptionEn'),
    value('evidenceSourceLabel'),
    observedAt,
    value('evidenceExplanation')
  ];
  if (required.some((item) => !item) || (!sourceUrl && !sourceCitation)) {
    return { ok: false, error: 'incomplete' };
  }

  if (
    !categories.has(category as SuggestionProposal['category']) ||
    !accessAreas.has(accessArea as SuggestionProposal['access_condition']['access_area']) ||
    !restraints.has(restraint as SuggestionProposal['access_condition']['restraint_condition']) ||
    !permissions.has(
      permission as SuggestionProposal['access_condition']['permission_requirement']
    ) ||
    !evidenceKinds.has(evidenceKind as SuggestionProposal['evidence']['kind']) ||
    !/^\d{3}$/.test(value('postalCode')) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(days).size !== days.length ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(observedAt) ||
    (sourceUrl !== '' && !/^https?:\/\/\S+$/i.test(sourceUrl)) ||
    openingHours === 'invalid' ||
    sourceMetadata === 'invalid'
  ) {
    return { ok: false, error: 'invalid' };
  }

  const openingHoursNote = value('openingHoursNote');
  const startsAt = value('availabilityStartsAt');
  const endsAt = value('availabilityEndsAt');
  if ((startsAt && !validTime(startsAt)) || (endsAt && !validTime(endsAt))) {
    return { ok: false, error: 'invalid' };
  }

  const proposal: SuggestionProposal = {
    purpose: 'dog_access_destination',
    operator_name: value('operatorName'),
    category: category as SuggestionProposal['category'],
    location: {
      address_line: value('addressLine'),
      locality: value('locality'),
      postal_code: value('postalCode'),
      municipality: value('municipality'),
      latitude,
      longitude
    },
    translations: {
      is: { name: value('nameIs'), description: value('descriptionIs') },
      en: { name: value('nameEn'), description: value('descriptionEn') }
    },
    website_url: value('websiteUrl') || null,
    phone: value('phone') || null,
    opening_hours:
      openingHours === null ? (openingHoursNote ? { note: openingHoursNote } : {}) : openingHours,
    dog_amenities: value('dogAmenities')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    access_condition: {
      access_area: accessArea as SuggestionProposal['access_condition']['access_area'],
      access_area_note: value('accessAreaNote') || null,
      restraint_condition:
        restraint as SuggestionProposal['access_condition']['restraint_condition'],
      restraint_note: value('restraintNote') || null,
      dog_eligibility: { scope: 'all_dogs' },
      availability_window: {
        ...(days.length ? { days } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {})
      },
      permission_requirement:
        permission as SuggestionProposal['access_condition']['permission_requirement']
    },
    evidence: {
      kind: evidenceKind as SuggestionProposal['evidence']['kind'],
      source_url: sourceUrl || null,
      source_citation: sourceCitation || null,
      source_label: value('evidenceSourceLabel'),
      observed_at: `${observedAt}:00.000Z`,
      explanation: value('evidenceExplanation'),
      source_metadata: sourceMetadata === null ? {} : sourceMetadata
    }
  };

  if (
    (proposal.access_condition.access_area === 'other_bounded' &&
      !proposal.access_condition.access_area_note) ||
    (proposal.access_condition.restraint_condition === 'other_sourced' &&
      !proposal.access_condition.restraint_note)
  ) {
    return { ok: false, error: 'incomplete' };
  }

  return { ok: true, proposal };
}

function parseSimpleSuggestionFormData(
  form: FormData,
  options: SuggestionParseOptions
): SuggestionInputResult {
  const value = (key: string): string => String(form.get(key) ?? '').trim();
  const name = value('name');
  const locationNote = value('locationNote');
  const explanation = value('evidenceExplanation');
  const category = value('category');
  const accessArea = value('accessArea');
  const restraint = value('restraintCondition');
  const evidenceKind = value('evidenceKind');
  const permission = value('permissionRequirement');
  const observedDate = value('evidenceObservedDate');
  const sourceUrl = value('evidenceUrl');
  const latitude = Number(value('latitude'));
  const longitude = Number(value('longitude'));

  if (
    !name ||
    !locationNote ||
    !explanation ||
    !observedDate ||
    value('allDogsWelcome') !== 'confirmed' ||
    !permission
  ) {
    return { ok: false, error: 'incomplete' };
  }
  const now = (options.now ?? (() => new Date()))();
  const observedAt = new Date(`${observedDate}T12:00:00.000Z`);
  if (
    !categories.has(category as SuggestionProposal['category']) ||
    !accessAreas.has(accessArea as SuggestionProposal['access_condition']['access_area']) ||
    !restraints.has(restraint as SuggestionProposal['access_condition']['restraint_condition']) ||
    !evidenceKinds.has(evidenceKind as SuggestionProposal['evidence']['kind']) ||
    !permissions.has(
      permission as SuggestionProposal['access_condition']['permission_requirement']
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(observedDate) ||
    Number.isNaN(observedAt.valueOf()) ||
    observedAt.toISOString().slice(0, 10) !== observedDate ||
    observedDate > now.toISOString().slice(0, 10) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (sourceUrl !== '' && !/^https?:\/\/\S+$/i.test(sourceUrl))
  ) {
    return { ok: false, error: 'invalid' };
  }

  const accessAreaNote = value('accessAreaNote');
  const restraintNote = value('restraintNote');
  if (
    (accessArea === 'other_bounded' && !accessAreaNote) ||
    (restraint === 'other_sourced' && !restraintNote)
  ) {
    return { ok: false, error: 'incomplete' };
  }

  const days = parseAvailabilityDays(value('availabilityDays'));
  const startsAt = value('availabilityStartsAt');
  const endsAt = value('availabilityEndsAt');
  if (days === 'invalid' || (startsAt && !validTime(startsAt)) || (endsAt && !validTime(endsAt))) {
    return { ok: false, error: 'invalid' };
  }

  const locale = options.locale ?? 'en';
  const description = value('description') || explanation;
  const inferredLocation = inferLocation(locationNote, locale);
  const kind = evidenceKind as SuggestionProposal['evidence']['kind'];
  const fallbackTranslation = { name, description, needs_review: true };

  return {
    ok: true,
    proposal: {
      purpose: 'dog_access_destination',
      operator_name: name,
      category: category as SuggestionProposal['category'],
      location: {
        address_line: locationNote,
        locality: inferredLocation.locality,
        postal_code: '000',
        municipality: inferredLocation.municipality,
        latitude,
        longitude
      },
      translations: {
        is: locale === 'is' ? { name, description } : fallbackTranslation,
        en: locale === 'en' ? { name, description } : fallbackTranslation
      },
      website_url: null,
      phone: null,
      opening_hours: {},
      dog_amenities: [],
      access_condition: {
        access_area: accessArea as SuggestionProposal['access_condition']['access_area'],
        access_area_note: accessAreaNote || null,
        restraint_condition:
          restraint as SuggestionProposal['access_condition']['restraint_condition'],
        restraint_note: restraintNote || null,
        dog_eligibility: { scope: 'all_dogs' },
        availability_window: {
          ...(days.length ? { days } : {}),
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {})
        },
        permission_requirement:
          permission as SuggestionProposal['access_condition']['permission_requirement']
      },
      evidence: {
        kind,
        source_url: sourceUrl || null,
        source_citation: sourceUrl ? null : explanation,
        source_label: sourceLabel(kind),
        observed_at: observedAt.toISOString(),
        explanation,
        source_metadata: { submissionProfile: 'simple-v1', contributorLocale: locale }
      }
    }
  };
}

function parseAvailabilityDays(value: string): number[] | 'invalid' {
  if (!value) return [];
  const days = value.split(',').map((day) => Number(day.trim()));
  return days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(days).size !== days.length
    ? 'invalid'
    : days;
}

function inferLocation(
  note: string,
  locale: 'is' | 'en'
): { locality: string; municipality: string } {
  const municipalities = [
    { pattern: /reykjav/i, locality: 'Reykjavík', municipality: 'reykjavik' },
    { pattern: /k[oó]pavog/i, locality: 'Kópavogur', municipality: 'kopavogur' },
    { pattern: /seltjarnarnes/i, locality: 'Seltjarnarnes', municipality: 'seltjarnarnes' },
    { pattern: /gar[ðd]ab/i, locality: 'Garðabær', municipality: 'gardabaer' },
    { pattern: /hafnarfj[oö]r[ðd]/i, locality: 'Hafnarfjörður', municipality: 'hafnarfjordur' },
    { pattern: /mosfellsb/i, locality: 'Mosfellsbær', municipality: 'mosfellsbaer' },
    { pattern: /kj[oó]s/i, locality: 'Kjósarhreppur', municipality: 'kjosarhreppur' }
  ];
  return (
    municipalities.find((candidate) => candidate.pattern.test(note)) ?? {
      locality: locale === 'is' ? 'Höfuðborgarsvæðið' : 'Capital region',
      municipality: 'reykjavik'
    }
  );
}

function sourceLabel(kind: SuggestionProposal['evidence']['kind']): string {
  const labels: Record<SuggestionProposal['evidence']['kind'], string> = {
    official_website: 'Place website',
    venue_representative: 'Place staff',
    member_report: 'Member supplied source',
    direct_observation: 'First-hand visit',
    public_record: 'Public information',
    other: 'Member source'
  };
  return labels[kind];
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parseJsonObject(value: string): Record<string, Json> | null | 'invalid' {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, Json>)
      : 'invalid';
  } catch {
    return 'invalid';
  }
}
