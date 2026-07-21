<script lang="ts">
  import { untrack } from 'svelte';

  import type {
    SavedTranslationDraft,
    TranslationWorkspaceEntry
  } from '$server/translations/workspace';
  import { validateTranslationPair, type TranslationValidationIssue } from './placeholders';

  type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'conflict' | 'error';
  type Locale = 'is' | 'en';

  let {
    entry,
    currentRevision,
    localeOrder,
    saveEndpoint,
    onSaved
  }: {
    entry: TranslationWorkspaceEntry;
    currentRevision: number | null;
    localeOrder: readonly Locale[];
    saveEndpoint: string;
    onSaved: (saved: SavedTranslationDraft) => void;
  } = $props();

  let isValue = $state(untrack(() => entry.draft.is));
  let enValue = $state(untrack(() => entry.draft.en));
  let versions = $state(untrack(() => ({ ...entry.versions })));
  let changed = $state(untrack(() => ({ ...entry.changed })));
  let publicationRevision = $state(untrack(() => currentRevision));
  let saveStates = $state<Record<Locale, SaveState>>({ is: 'idle', en: 'idle' });
  let timers: Partial<Record<Locale, ReturnType<typeof setTimeout>>> = {};
  let requestSequence: Record<Locale, number> = { is: 0, en: 0 };
  const issues = $derived(validateTranslationPair(isValue, enValue));

  function valueFor(locale: Locale): string {
    return locale === 'is' ? isValue : enValue;
  }

  function setValue(locale: Locale, value: string): void {
    if (locale === 'is') isValue = value;
    else enValue = value;
    scheduleSave(locale);
  }

  function scheduleSave(locale: Locale): void {
    if (timers[locale]) clearTimeout(timers[locale]);
    const sequence = ++requestSequence[locale];
    saveStates[locale] = 'unsaved';
    timers[locale] = setTimeout(() => void save(locale, sequence), 700);
  }

  function flushSave(locale: Locale): void {
    if (!timers[locale]) return;
    clearTimeout(timers[locale]);
    timers[locale] = undefined;
    void save(locale, requestSequence[locale]);
  }

  async function save(locale: Locale, requestedSequence?: number): Promise<void> {
    if (timers[locale]) clearTimeout(timers[locale]);
    timers[locale] = undefined;
    const sequence = requestedSequence ?? ++requestSequence[locale];
    const value = valueFor(locale);
    saveStates[locale] = 'saving';

    try {
      const response = await fetch(saveEndpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key: entry.key,
          locale,
          value,
          expectedPublicationRevision: publicationRevision,
          expectedDraftVersion: versions[locale]
        })
      });
      if (sequence !== requestSequence[locale]) return;
      if (response.status === 409) {
        saveStates[locale] = 'conflict';
        return;
      }
      if (!response.ok) {
        saveStates[locale] = 'error';
        return;
      }

      const saved = (await response.json()) as SavedTranslationDraft;
      if (
        saved.key !== entry.key ||
        saved.locale !== locale ||
        saved.value !== value ||
        !Number.isInteger(saved.version)
      ) {
        saveStates[locale] = 'error';
        return;
      }
      versions[locale] = saved.version;
      changed[locale] = saved.changed;
      publicationRevision = saved.currentRevision;
      saveStates[locale] = 'saved';
      onSaved(saved);
    } catch {
      if (sequence === requestSequence[locale]) saveStates[locale] = 'error';
    }
  }

  async function retryAfterConflict(locale: Locale): Promise<void> {
    saveStates[locale] = 'saving';
    try {
      const response = await fetch(saveEndpoint);
      if (!response.ok) {
        saveStates[locale] = 'error';
        return;
      }
      const body = (await response.json()) as {
        workspace?: {
          currentRevision?: number | null;
          entries?: TranslationWorkspaceEntry[];
        };
      };
      const fresh = body.workspace?.entries?.find((candidate) => candidate.key === entry.key);
      if (!fresh || body.workspace?.currentRevision === undefined) {
        saveStates[locale] = 'error';
        return;
      }
      versions[locale] = fresh.versions[locale];
      publicationRevision = body.workspace.currentRevision;
      await save(locale);
    } catch {
      saveStates[locale] = 'error';
    }
  }

  function statusLabel(locale: Locale): string {
    const state = saveStates[locale];
    if (state === 'unsaved') return 'Unsaved';
    if (state === 'saving') return 'Saving';
    if (state === 'saved') return 'Saved';
    if (state === 'conflict') return 'Conflict';
    if (state === 'error') return 'Save failed';
    return changed[locale] ? 'Changed' : 'Published';
  }

  function issueText(issue: TranslationValidationIssue): string {
    if (issue === 'missing_is') return 'Icelandic is missing.';
    if (issue === 'missing_en') return 'English is missing.';
    if (issue === 'malformed_is') return 'Icelandic contains malformed placeholder braces.';
    if (issue === 'malformed_en') return 'English contains malformed placeholder braces.';
    return 'Placeholders must match between Icelandic and English.';
  }
</script>

<article class="translation-card hv-panel" aria-labelledby={`translation-${entry.key}`}>
  <header>
    <div>
      <span class="namespace">{entry.namespace}</span>
      <h2 id={`translation-${entry.key}`}>{entry.key}</h2>
    </div>
    {#if changed.is || changed.en}
      <span class="hv-status" data-status="attention">Unpublished</span>
    {/if}
  </header>

  <div class="language-grid">
    {#each localeOrder as locale (locale)}
      <div class="language-field">
        <div class="field-heading">
          <label for={`${entry.key}-${locale}`}>
            {locale === 'is' ? 'Icelandic' : 'English'}
          </label>
          <span class="save-state" aria-live="polite">{statusLabel(locale)}</span>
        </div>
        <textarea
          id={`${entry.key}-${locale}`}
          class="hv-field"
          aria-label={`${locale === 'is' ? 'Icelandic' : 'English'} translation for ${entry.key}`}
          value={valueFor(locale)}
          oninput={(event) => setValue(locale, event.currentTarget.value)}
          onblur={() => flushSave(locale)}
          rows="3"
          spellcheck="true"></textarea>
        {#if saveStates[locale] === 'conflict'}
          <div class="save-problem" role="alert">
            This translation changed elsewhere. Your local value is preserved.
            <button
              type="button"
              onclick={() => void retryAfterConflict(locale)}
              aria-label={`Retry saving ${locale === 'is' ? 'Icelandic' : 'English'} for ${entry.key}`}
              >Retry</button
            >
          </div>
        {:else if saveStates[locale] === 'error'}
          <div class="save-problem" role="alert">
            The draft could not be saved.
            <button
              type="button"
              onclick={() => void save(locale)}
              aria-label={`Retry saving ${locale === 'is' ? 'Icelandic' : 'English'} for ${entry.key}`}
              >Retry</button
            >
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if issues.length > 0}
    <ul class="validation" role="alert">
      {#each issues as issue (issue)}
        <li>{issueText(issue)}</li>
      {/each}
    </ul>
  {/if}
</article>

<style>
  .translation-card {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
  }

  header,
  .field-heading {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    justify-content: space-between;
  }

  h2 {
    margin: 0.15rem 0 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.95rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .namespace {
    color: var(--hv-color-fjord);
    font-size: 0.72rem;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .language-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  .language-field {
    min-width: 0;
  }

  label {
    font-weight: 850;
  }

  .save-state {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  textarea {
    min-height: 6.5rem;
    margin-top: 0.35rem;
    line-height: 1.45;
    resize: vertical;
  }

  .validation,
  .save-problem {
    margin: 0;
    color: var(--hv-color-danger);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .validation {
    padding: 0.65rem 0.8rem 0.65rem 1.8rem;
    border: 1px solid var(--hv-color-danger);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-danger-soft);
  }

  .save-problem {
    display: flex;
    margin-top: 0.4rem;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }

  .save-problem button {
    min-height: 2.25rem;
    border: 1px solid currentColor;
    border-radius: var(--hv-radius-control);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 850;
  }

  @media (max-width: 42rem) {
    .language-grid {
      grid-template-columns: 1fr;
    }

    textarea {
      min-height: 7.5rem;
    }
  }
</style>
