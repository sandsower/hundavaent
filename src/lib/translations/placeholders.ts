import { catalogues, type MessageKey } from '$i18n';

export const TRANSLATION_VALUE_MAX_LENGTH = 10_000;

export type TranslationValidationIssue =
  | 'missing_is'
  | 'missing_en'
  | 'malformed_is'
  | 'malformed_en'
  | 'placeholder_mismatch'
  | 'placeholder_contract_is'
  | 'placeholder_contract_en';

const placeholderPattern = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function extractPlaceholders(value: string): string[] | null {
  const placeholders: string[] = [];
  const withoutPlaceholders = value.replace(placeholderPattern, (_match, name: string) => {
    placeholders.push(name);
    return '';
  });
  if (withoutPlaceholders.includes('{') || withoutPlaceholders.includes('}')) return null;
  return placeholders.sort();
}

export function validateTranslationPair(
  isValue: string,
  enValue: string
): TranslationValidationIssue[] {
  const issues: TranslationValidationIssue[] = [];
  if (!isValue.trim()) issues.push('missing_is');
  if (!enValue.trim()) issues.push('missing_en');

  const isPlaceholders = extractPlaceholders(isValue);
  const enPlaceholders = extractPlaceholders(enValue);
  if (!isPlaceholders) issues.push('malformed_is');
  if (!enPlaceholders) issues.push('malformed_en');
  if (
    isPlaceholders &&
    enPlaceholders &&
    (isPlaceholders.length !== enPlaceholders.length ||
      isPlaceholders.some((name, index) => name !== enPlaceholders[index]))
  ) {
    issues.push('placeholder_mismatch');
  }
  return issues;
}

export function validateTranslationEntry(
  key: string,
  isValue: string,
  enValue: string
): TranslationValidationIssue[] {
  const issues = validateTranslationPair(isValue, enValue);
  if (!Object.hasOwn(catalogues.is, key)) return issues;
  const messageKey = key as MessageKey;
  const bundledIs = catalogues.is[messageKey];
  const bundledEn = catalogues.en[messageKey];
  if (typeof bundledIs !== 'string' || typeof bundledEn !== 'string') return issues;
  const expectedIs = extractPlaceholders(bundledIs);
  const expectedEn = extractPlaceholders(bundledEn);
  const actualIs = extractPlaceholders(isValue);
  const actualEn = extractPlaceholders(enValue);

  if (expectedIs && actualIs && !samePlaceholders(expectedIs, actualIs)) {
    issues.push('placeholder_contract_is');
  }
  if (expectedEn && actualEn && !samePlaceholders(expectedEn, actualEn)) {
    issues.push('placeholder_contract_en');
  }
  return issues;
}

function samePlaceholders(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}
