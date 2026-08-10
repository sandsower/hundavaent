import { describe, expect, it } from 'vitest';

import {
  createTranslationResolver,
  isEligibleTranslationRoute,
  normalizeTranslationPageId
} from '$lib/translations/in-context-resolver';

const catalogues = {
  is: {
    'about.title': 'Um Hundavænt',
    'common.save': 'Vista',
    'profile.save': 'Vista',
    'welcome.person': 'Velkomin, {name}',
    'count.results': '{count} niðurstöður'
  },
  en: {
    'about.title': 'About Hundavænt',
    'common.save': 'Save',
    'profile.save': 'Save',
    'welcome.person': 'Welcome, {name}',
    'count.results': '{count} results'
  }
};

describe('in-context translation resolver', () => {
  it('resolves an exact visible value to its stable bundle key', () => {
    const resolver = createTranslationResolver(catalogues, 'en');

    expect(resolver.resolve('About Hundavænt')).toEqual({
      kind: 'resolved',
      keys: ['about.title']
    });
  });

  it('retains all candidates for duplicate visible copy instead of guessing', () => {
    const resolver = createTranslationResolver(catalogues, 'en');

    expect(resolver.resolve('Save')).toEqual({
      kind: 'ambiguous',
      keys: ['common.save', 'profile.save']
    });
  });

  it('uses the explicit annotation escape hatch to disambiguate duplicate copy', () => {
    const resolver = createTranslationResolver(catalogues, 'en');

    expect(resolver.resolve('Save', 'profile.save')).toEqual({
      kind: 'resolved',
      keys: ['profile.save']
    });
  });

  it('matches rendered placeholder values while preserving the source key', () => {
    const resolver = createTranslationResolver(catalogues, 'en');

    expect(resolver.resolve('Welcome, Miles')).toEqual({
      kind: 'resolved',
      keys: ['welcome.person']
    });
    expect(resolver.resolve('12 results')).toEqual({
      kind: 'resolved',
      keys: ['count.results']
    });
  });

  it('normalizes browser whitespace without matching unrelated content', () => {
    const resolver = createTranslationResolver(catalogues, 'is');

    expect(resolver.resolve('  Um\n Hundavænt ')).toEqual({
      kind: 'resolved',
      keys: ['about.title']
    });
    expect(resolver.resolve('Hundavænt database content')).toEqual({ kind: 'none', keys: [] });
  });

  it('normalizes locale routes into one page-package identity', () => {
    expect(normalizeTranslationPageId('/[lang=lang]/places/[id]')).toBe('/places/[id]');
    expect(normalizeTranslationPageId('/[lang=lang]')).toBe('/');
  });

  it('excludes auth callbacks and translation-management routes from in-context editing', () => {
    expect(isEligibleTranslationRoute('/[lang=lang]/about')).toBe(true);
    expect(isEligibleTranslationRoute('/[lang=lang]/auth/callback')).toBe(false);
    expect(isEligibleTranslationRoute('/translations/(workspace)/review')).toBe(false);
    expect(isEligibleTranslationRoute(null)).toBe(false);
  });
});
