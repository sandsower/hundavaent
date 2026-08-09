<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import { Panel, Status, Textarea } from '@hundavaent/design-system';
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
    const predecessor = pendingSaves[locale];
    if (predecessor) await predecessor;
    if (sequence !== requestSequence[locale]) return;
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
        if (response.status === 409) {
          if (sequence === requestSequence[locale]) await loadConflict(locale, value, sequence);
          return;
        }
        if (!response.ok) {
          if (sequence === requestSequence[locale]) setSaveState(locale, 'error');
          return;
        }

        const saved = (await response.json()) as SavedTranslationDraft;
        if (
          saved.key !== entry.key ||
          saved.locale !== locale ||
          saved.value !== value ||
          !Number.isInteger(saved.version)
        ) {
          if (sequence === requestSequence[locale]) setSaveState(locale, 'error');
          return;
        }
        versions[locale] = saved.version;
        changed[locale] = saved.changed;
        publicationRevision = saved.currentRevision;
        onSaved(saved);
        if (sequence === requestSequence[locale]) {
          conflicts[locale] = undefined;
          setSaveState(locale, 'saved');
        }
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
    return changed[locale] ? 'Changed' : 'Deployed JSON';
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

<Panel as="article" class="translation-card" aria-labelledby={`translation-${entry.key}`}>
  <header class="flex items-start justify-between gap-3">
    <div>
      <span class="namespace text-[0.72rem] font-[850] tracking-[0.08em] uppercase text-fjord"
        >{entry.namespace}</span
      >
      <h2
        class="[margin:0.15rem_0_0] [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace] text-[0.95rem] leading-[1.35] [overflow-wrap:anywhere]"
        id={`translation-${entry.key}`}
      >
        {entry.key}
      </h2>
    </div>
    {#if changed.is || changed.en}
      <Status tone="attention">Waiting for source</Status>
    {/if}
  </header>

  <div class="language-grid grid grid-cols-2 gap-[0.85rem] max-narrow:grid-cols-1">
    {#each localeOrder as locale (locale)}
      <div class="language-field min-w-0">
        <div class="field-heading flex items-start justify-between gap-3">
          <label class="font-[850]" for={`${entry.key}-${locale}`}>
            {locale === 'is' ? 'Icelandic' : 'English'}
          </label>
          <span class="save-state text-[0.78rem] font-[750] text-basalt-muted" aria-live="polite"
            >{statusLabel(locale)}</span
          >
        </div>
        <Textarea
          class="translation-field"
          id={`${entry.key}-${locale}`}
          aria-label={`${locale === 'is' ? 'Icelandic' : 'English'} translation for ${entry.key}`}
          value={valueFor(locale)}
          oninput={(event) => setValue(locale, event.currentTarget.value)}
          onblur={() => flushSave(locale)}
          maxlength={TRANSLATION_VALUE_MAX_LENGTH}
          rows={3}
          spellcheck="true"
        />
        {#if saveStates[locale] === 'conflict'}
          <div
            class="save-problem flex items-center justify-between gap-2 [margin:0.4rem_0_0] text-[0.85rem] font-bold text-danger"
            role="alert"
          >
            <p class="mt-0">This translation changed elsewhere. Choose which value to keep.</p>
            <dl class="grid gap-[0.4rem] my-2 mx-0">
              <div>
                <dt class="text-[0.72rem] font-[850] uppercase">Latest saved value</dt>
                <dd class="m-0 whitespace-pre-wrap text-basalt">{conflicts[locale]?.remote}</dd>
              </div>
              <div>
                <dt class="text-[0.72rem] font-[850] uppercase">Your value</dt>
                <dd class="m-0 whitespace-pre-wrap text-basalt">{conflicts[locale]?.local}</dd>
              </div>
            </dl>
            <div class="conflict-actions flex flex-wrap gap-[0.4rem]">
              <button
                class="min-h-9 border border-current rounded-control bg-transparent [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[850] [color:inherit]"
                type="button"
                onclick={() => useLatest(locale)}>Use latest</button
              >
              {#if conflicts[locale]?.confirmingOverwrite}
                <button
                  class="min-h-9 border border-current rounded-control bg-transparent [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[850] [color:inherit]"
                  type="button"
                  onclick={() => void confirmOverwrite(locale)}>Confirm overwrite with mine</button
                >
              {:else}
                <button
                  class="min-h-9 border border-current rounded-control bg-transparent [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[850] [color:inherit]"
                  type="button"
                  onclick={() => requestOverwrite(locale)}>Overwrite with mine</button
                >
              {/if}
            </div>
          </div>
        {:else if saveStates[locale] === 'error'}
          <div
            class="save-problem flex items-center justify-between gap-2 [margin:0.4rem_0_0] text-[0.85rem] font-bold text-danger"
            role="alert"
          >
            The draft could not be saved.
            <button
              class="min-h-9 border border-current rounded-control bg-transparent [font-family:inherit] [font-size:inherit] [font-stretch:inherit] [font-style:inherit] [font-variant:inherit] [line-height:inherit] font-[850] [color:inherit]"
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
    <ul
      class="validation m-0 [padding:0.65rem_0.8rem_0.65rem_1.8rem] border border-danger rounded-control bg-danger-soft text-[0.85rem] font-bold text-danger"
      role="alert"
    >
      {#each issues as issue (issue)}
        <li>{issueText(issue)}</li>
      {/each}
    </ul>
  {/if}
</Panel>

<style>
  /* .translation-card now lives on Panel's root <article>, outside this file's scope hash. Bare
     class is unique repo-wide (grep-verified). */
  :global(.translation-card) {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
  }

  /* The textarea now lives on Textarea's own rendered element, outside this file's scope hash,
     and is no longer a literal <textarea> tag anywhere in this file's template (Svelte's
     unused-selector check needs one to keep a bare-tag :global() selector, which this file no
     longer has), so it takes a class hook instead - the same pattern as .show-more in
     TranslationWorkspace.svelte. Bare class is unique repo-wide (grep-verified). */
  :global(.translation-field) {
    min-height: 6.5rem;
    margin-top: 0.35rem;
    line-height: 1.45;
    resize: vertical;
  }

  @media (max-width: 42rem) {
    :global(.translation-field) {
      min-height: 7.5rem;
    }
  }
</style>
