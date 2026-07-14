export type Dimension = 'welcome' | 'clarity' | 'comfort' | 'thoughtfulness';

export interface RatingScores {
  welcome: number | null;
  clarity: number | null;
  comfort: number | null;
  thoughtfulness: number | null;
}

export type RatingInputError = 'incomplete' | 'invalid';

export type RatingInputResult =
  { ok: true; payload: RatingScores } | { ok: false; error: RatingInputError };

export type PrivateRatingNoteClassification = 'subjective' | 'inaccurate_info' | 'safety_concern';

// A Private Rating Note update is explicit: `update` is true whenever the Member's form touched
// the note fieldset at all (including clearing it), so a plain score-only resubmission never
// silently clears an existing note by omission. `note: null` with `update: true` means "clear it".
export type RatingNoteInput =
  | { update: false }
  | { update: true; note: string | null; classification: PrivateRatingNoteClassification | null };

const privateRatingNoteClassifications = new Set<PrivateRatingNoteClassification>([
  'subjective',
  'inaccurate_info',
  'safety_concern'
]);

export function isPrivateRatingNoteClassification(
  value: unknown
): value is PrivateRatingNoteClassification {
  return (
    typeof value === 'string' &&
    privateRatingNoteClassifications.has(value as PrivateRatingNoteClassification)
  );
}

// Reads the note fieldset from a Rating submission form. The fieldset is only rendered (and only
// meaningfully present in the FormData) when the client-visible threshold check already offered
// it, but the server never trusts that alone -- submit_dog_friendliness_rating re-validates the
// low-score gate and the forced classification itself.
export function readRatingNoteInput(form: FormData): RatingNoteInput {
  if (form.get('noteFieldsetTouched') !== 'true') {
    return { update: false };
  }

  const noteAction = String(form.get('noteAction') ?? '').trim();
  if (noteAction === 'clear') {
    return { update: true, note: null, classification: null };
  }

  const note = String(form.get('privateRatingNote') ?? '').trim();
  const classification = String(form.get('privateRatingNoteClassification') ?? '').trim();

  return {
    update: true,
    note: note || null,
    classification: isPrivateRatingNoteClassification(classification) ? classification : null
  };
}

const dimensionFields: Record<Dimension, string> = {
  welcome: 'welcomeScore',
  clarity: 'clarityScore',
  comfort: 'comfortScore',
  thoughtfulness: 'thoughtfulnessScore'
};

function readScore(form: FormData, field: string): number | null | 'invalid' {
  const raw = String(form.get(field) ?? '').trim();
  if (raw === '' || raw === 'na') return null;
  if (!/^\d+$/.test(raw)) return 'invalid';
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return 'invalid';
  return parsed;
}

export function parseRatingFormData(form: FormData): RatingInputResult {
  const welcome = readScore(form, dimensionFields.welcome);
  const clarity = readScore(form, dimensionFields.clarity);
  const comfort = readScore(form, dimensionFields.comfort);
  const thoughtfulness = readScore(form, dimensionFields.thoughtfulness);

  if (
    welcome === 'invalid' ||
    clarity === 'invalid' ||
    comfort === 'invalid' ||
    thoughtfulness === 'invalid'
  ) {
    return { ok: false, error: 'invalid' };
  }

  if (welcome === null && clarity === null && comfort === null && thoughtfulness === null) {
    return { ok: false, error: 'incomplete' };
  }

  return { ok: true, payload: { welcome, clarity, comfort, thoughtfulness } };
}

export type RatingExclusionKind = 'abuse' | 'fraud' | 'duplication';

export interface RatingExclusionInput {
  exclusionKind: RatingExclusionKind;
  reason: string;
}

export type RatingExclusionInputResult =
  { ok: true; payload: RatingExclusionInput } | { ok: false; error: RatingInputError };

const exclusionKinds = new Set<RatingExclusionKind>(['abuse', 'fraud', 'duplication']);

export function parseRatingExclusionFormData(form: FormData): RatingExclusionInputResult {
  const kind = String(form.get('exclusionKind') ?? '').trim();
  const reason = String(form.get('reason') ?? '').trim();

  if (!exclusionKinds.has(kind as RatingExclusionKind) || !reason) {
    return { ok: false, error: 'incomplete' };
  }

  return { ok: true, payload: { exclusionKind: kind as RatingExclusionKind, reason } };
}

export interface RatingReinstatementInput {
  reason: string;
}

export type RatingReinstatementInputResult =
  { ok: true; payload: RatingReinstatementInput } | { ok: false; error: RatingInputError };

export function parseRatingReinstatementFormData(form: FormData): RatingReinstatementInputResult {
  const reason = String(form.get('reason') ?? '').trim();

  if (!reason) return { ok: false, error: 'incomplete' };

  return { ok: true, payload: { reason } };
}

export type RatingNoteDispositionKind =
  'escalated' | 'feedback_use_permitted' | 'feedback_use_denied';

export interface RatingNoteDispositionInput {
  dispositionKind: RatingNoteDispositionKind;
  notes: string;
}

export type RatingNoteDispositionInputResult =
  { ok: true; payload: RatingNoteDispositionInput } | { ok: false; error: RatingInputError };

const dispositionKinds = new Set<RatingNoteDispositionKind>([
  'escalated',
  'feedback_use_permitted',
  'feedback_use_denied'
]);

export function parseRatingNoteDispositionFormData(
  form: FormData
): RatingNoteDispositionInputResult {
  const kind = String(form.get('dispositionKind') ?? '').trim();
  const notes = String(form.get('dispositionNotes') ?? '').trim();

  if (!dispositionKinds.has(kind as RatingNoteDispositionKind) || !notes) {
    return { ok: false, error: 'incomplete' };
  }

  return { ok: true, payload: { dispositionKind: kind as RatingNoteDispositionKind, notes } };
}
