<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import type {
    SavedTranslationDraft,
    TranslationWorkspaceEntry
  } from '$server/translations/workspace';
  import {
    TRANSLATION_VALUE_MAX_LENGTH,
    validateTranslationEntry,
    type TranslationValidationIssue
  } from './placeholders';
  import { useTranslationSaveCoordinator, type TranslationSaveState } from './save-coordinator';

  type Locale = 'is' | 'en';
  interface ConflictValue {
    local: string;
    remote: string;
    version: number;
    changed: boolean;
    currentRevision: number | null;
    pendingCount: number;
    confirmingOverwrite: boolean;
  }

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
  const saveCoordinator = useTranslationSaveCoordinator();
  let saveStates = $state<Record<Locale, TranslationSaveState>>({ is: 'idle', en: 'idle' });
  let conflicts = $state<Partial<Record<Locale, ConflictValue>>>({});
  let timers: Partial<Record<Locale, ReturnType<typeof setTimeout>>> = {};
  let pendingSaves: Partial<Record<Locale, Promise<void>>> = {};
  let requestSequence: Record<Locale, number> = { is: 0, en: 0 };
  const issues = $derived(validateTranslationEntry(entry.key, isValue, enValue));

  onMount(() => {
    const unregister = (['is', 'en'] as const).map((locale) =>
      saveCoordinator.register(`${entry.key}:${locale}`, () => flushSave(locale))
    );
    return () => unregister.forEach((remove) => remove());
  });

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
    setSaveState(locale, 'unsaved');
    timers[locale] = setTimeout(() => void save(locale, sequence), 700);
  }

  async function flushSave(locale: Locale): Promise<void> {
    if (timers[locale]) {
      clearTimeout(timers[locale]);
      timers[locale] = undefined;
      await save(locale, requestSequence[locale]);
      return;
    }
    await pendingSaves[locale];
  }

  async function save(locale: Locale, requestedSequence?: number): Promise<void> {
    if (timers[locale]) clearTimeout(timers[locale]);
    timers[locale] = undefined;
    const sequence = requestedSequence ?? ++requestSequence[locale];
    const value = valueFor(locale);
    setSaveState(locale, 'saving');

    const operation = (async () => {
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
          await loadConflict(locale, value, sequence);
          return;
        }
        if (!response.ok) {
          setSaveState(locale, 'error');
          return;
        }

        const saved = (await response.json()) as SavedTranslationDraft;
        if (
          saved.key !== entry.key ||
          saved.locale !== locale ||
          saved.value !== value ||
          !Number.isInteger(saved.version)
        ) {
          setSaveState(locale, 'error');
          return;
        }
        versions[locale] = saved.version;
        changed[locale] = saved.changed;
        publicationRevision = saved.currentRevision;
        conflicts[locale] = undefined;
        setSaveState(locale, 'saved');
        onSaved(saved);
      } catch {
        if (sequence === requestSequence[locale]) setSaveState(locale, 'error');
      }
    })();
    pendingSaves[locale] = operation;
    await operation;
    if (pendingSaves[locale] === operation) pendingSaves[locale] = undefined;
  }

  async function loadConflict(locale: Locale, local: string, sequence: number): Promise<void> {
    try {
      const response = await fetch(saveEndpoint);
      if (!response.ok) {
        setSaveState(locale, 'error');
        return;
      }
      const body = (await response.json()) as {
        workspace?: {
          currentRevision?: number | null;
          pendingCount?: number;
          entries?: TranslationWorkspaceEntry[];
        };
      };
      const fresh = body.workspace?.entries?.find((candidate) => candidate.key === entry.key);
      const pendingCount = body.workspace?.pendingCount;
      if (
        !fresh ||
        body.workspace?.currentRevision === undefined ||
        typeof pendingCount !== 'number' ||
        !Number.isInteger(pendingCount)
      ) {
        setSaveState(locale, 'error');
        return;
      }
      if (sequence !== requestSequence[locale]) return;
      conflicts[locale] = {
        local,
        remote: fresh.draft[locale],
        version: fresh.versions[locale],
        changed: fresh.changed[locale],
        currentRevision: body.workspace.currentRevision,
        pendingCount,
        confirmingOverwrite: false
      };
      setSaveState(locale, 'conflict');
    } catch {
      setSaveState(locale, 'error');
    }
  }

  function useLatest(locale: Locale): void {
    const conflict = conflicts[locale];
    if (!conflict) return;
    if (locale === 'is') isValue = conflict.remote;
    else enValue = conflict.remote;
    versions[locale] = conflict.version;
    changed[locale] = conflict.changed;
    publicationRevision = conflict.currentRevision;
    onSaved({
      key: entry.key,
      locale,
      value: conflict.remote,
      version: conflict.version,
      changed: conflict.changed,
      pendingCount: conflict.pendingCount,
      currentRevision: conflict.currentRevision
    });
    conflicts[locale] = undefined;
    setSaveState(locale, 'idle');
  }

  function requestOverwrite(locale: Locale): void {
    const conflict = conflicts[locale];
    if (conflict) conflict.confirmingOverwrite = true;
  }

  async function confirmOverwrite(locale: Locale): Promise<void> {
    const conflict = conflicts[locale];
    if (!conflict) return;
    versions[locale] = conflict.version;
    publicationRevision = conflict.currentRevision;
    conflicts[locale] = undefined;
    await save(locale, requestSequence[locale]);
  }

  function setSaveState(locale: Locale, state: TranslationSaveState): void {
    saveStates[locale] = state;
    saveCoordinator.setState(`${entry.key}:${locale}`, state);
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
    if (issue === 'placeholder_contract_is') {
      return 'Icelandic placeholders must match this application key.';
    }
    if (issue === 'placeholder_contract_en') {
      return 'English placeholders must match this application key.';
    }
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
          maxlength={TRANSLATION_VALUE_MAX_LENGTH}
          rows="3"
          spellcheck="true"></textarea>
        {#if saveStates[locale] === 'conflict'}
          <div class="save-problem" role="alert">
            <p>This translation changed elsewhere. Choose which value to keep.</p>
            <dl>
              <div>
                <dt>Latest saved value</dt>
                <dd>{conflicts[locale]?.remote}</dd>
              </div>
              <div>
                <dt>Your value</dt>
                <dd>{conflicts[locale]?.local}</dd>
              </div>
            </dl>
            <div class="conflict-actions">
              <button type="button" onclick={() => useLatest(locale)}>Use latest</button>
              {#if conflicts[locale]?.confirmingOverwrite}
                <button type="button" onclick={() => void confirmOverwrite(locale)}
                  >Confirm overwrite with mine</button
                >
              {:else}
                <button type="button" onclick={() => requestOverwrite(locale)}
                  >Overwrite with mine</button
                >
              {/if}
            </div>
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

  .save-problem p {
    margin-top: 0;
  }

  .save-problem dl {
    display: grid;
    margin: 0.5rem 0;
    gap: 0.4rem;
  }

  .save-problem dt {
    font-size: 0.72rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .save-problem dd {
    margin: 0;
    color: var(--hv-color-basalt);
    white-space: pre-wrap;
  }

  .conflict-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
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
