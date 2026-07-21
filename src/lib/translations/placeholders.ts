export type TranslationValidationIssue =
  'missing_is' | 'missing_en' | 'malformed_is' | 'malformed_en' | 'placeholder_mismatch';

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
