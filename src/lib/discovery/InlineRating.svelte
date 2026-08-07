<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import { Rating } from '@hundavaent/design-system';
  import type { Catalogue, MessageKey } from '$i18n';
  import { requestAuthentication } from '$lib/auth/controller';
  import { applyWeeklyRhythmRecognition } from '$lib/member-activity/client';
  import {
    parseWeeklyRhythmRecognition,
    type WeeklyRhythmRecognition
  } from '$lib/member-activity/types';
  import WeeklyRhythmAcknowledgement from '$lib/member-activity/WeeklyRhythmAcknowledgement.svelte';
  import type {
    CurrentRating,
    DogFriendlinessSummary
  } from '$server/dog-friendliness/dog-friendliness';

  type Category = 'welcome' | 'clarity' | 'comfort' | 'thoughtfulness';
  interface Snapshot {
    commandId: string;
    overall: number;
    welcome: number | null;
    clarity: number | null;
    comfort: number | null;
    thoughtfulness: number | null;
    noteUpdate: boolean;
    privateNote: string | null;
    noteRevision: number | null;
  }
  interface Props {
    placeId: string;
    placeName: string;
    copy: Catalogue;
    signedIn: boolean;
    summary: DogFriendlinessSummary | null;
  }

  let { placeId, placeName, copy, signedIn, summary }: Props = $props();
  const categories: Category[] = ['welcome', 'clarity', 'comfort', 'thoughtfulness'];
  let overall = $state<number | null>(null);
  let values = $state<Record<Category, number | null>>({
    welcome: null,
    clarity: null,
    comfort: null,
    thoughtfulness: null
  });
  let expanded = $state(false);
  let note = $state('');
  let existingNote = $state(false);
  let status = $state<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');
  let errorContext = $state<'load' | 'save' | null>(null);
  let queued: Snapshot | null = null;
  let draining = false;
  let failed: Snapshot | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  let noteDirty = false;
  let noteRevision = 0;
  let latestDirty: Snapshot | null = null;
  let interactionVersion = 0;
  let destroyed = false;
  let initialLoadReady = $state(false);
  let recognition = $state<WeeklyRhythmRecognition | null>(null);

  const lowScore = $derived(
    overall !== null &&
      (overall <= 2 ||
        categories.some((category) => values[category] !== null && values[category]! <= 2))
  );
  const showNote = $derived(lowScore || existingNote || note.length > 0);

  onMount(() => {
    if (signedIn) void load();
  });

  onDestroy(() => {
    destroyed = true;
    if (noteTimer) clearTimeout(noteTimer);
    const finalSnapshot =
      signedIn && overall !== null ? (noteDirty ? snapshot(true) : latestDirty) : null;
    if (finalSnapshot) {
      void fetch(`/api/ratings/${encodeURIComponent(placeId)}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': finalSnapshot.commandId
        },
        body: JSON.stringify(requestPayload(finalSnapshot)),
        keepalive: true
      });
    }
  });

  async function load(): Promise<void> {
    const loadVersion = interactionVersion;
    initialLoadReady = false;
    errorContext = null;
    status = 'loading';
    try {
      const response = await fetch(`/api/ratings/${encodeURIComponent(placeId)}`);
      if (!response.ok) throw new Error('load failed');
      const payload = (await response.json()) as {
        rating: CurrentRating | null;
        recognition?: unknown;
      };
      const parsedRecognition = parseWeeklyRhythmRecognition(payload.recognition, 'rating');
      if (!parsedRecognition) throw new Error('invalid recognition');
      if (destroyed || loadVersion !== interactionVersion) return;
      applyWeeklyRhythmRecognition(parsedRecognition);
      if (parsedRecognition.recognized) recognition = parsedRecognition;
      if (payload.rating?.overallScore) {
        overall = payload.rating.overallScore;
        values = { ...payload.rating.scores };
        note = payload.rating.privateNote ?? '';
        existingNote = payload.rating.privateNote !== null;
      }
      if (!destroyed) {
        initialLoadReady = true;
        status = 'idle';
      }
    } catch {
      if (!destroyed && loadVersion === interactionVersion) {
        errorContext = 'load';
        status = 'error';
      }
    }
  }

  function chooseOverall(value: number): void {
    if (!signedIn) {
      requestAuthentication({
        origin: 'rating',
        intent: { action: 'rating', placeId, placeName, overallRating: value }
      });
      return;
    }
    if (!initialLoadReady) return;
    interactionVersion += 1;
    overall = value;
    expanded = true;
    enqueue(snapshot(false));
  }

  function chooseCategory(category: Category, value: number): void {
    if (!initialLoadReady) return;
    interactionVersion += 1;
    values[category] = value;
    enqueue(snapshot(false));
  }

  function resetCategory(category: Category): void {
    if (!initialLoadReady) return;
    interactionVersion += 1;
    values[category] = null;
    enqueue(snapshot(false));
  }

  function snapshot(noteUpdate: boolean): Snapshot {
    if (overall === null) throw new Error('overall required');
    return {
      commandId: crypto.randomUUID(),
      overall,
      ...values,
      noteUpdate,
      privateNote: note.trim() || null,
      noteRevision: noteUpdate ? noteRevision : null
    };
  }

  function requestPayload(current: Snapshot) {
    return {
      overall: current.overall,
      welcome: current.welcome,
      clarity: current.clarity,
      comfort: current.comfort,
      thoughtfulness: current.thoughtfulness,
      noteUpdate: current.noteUpdate,
      privateNote: current.privateNote
    };
  }

  function enqueue(next: Snapshot): void {
    queued = next;
    latestDirty = next;
    failed = null;
    errorContext = null;
    if (!draining) void drain();
  }

  async function drain(): Promise<void> {
    draining = true;
    while (queued && !destroyed) {
      const next = queued;
      queued = null;
      status = 'saving';
      try {
        const response = await fetch(`/api/ratings/${encodeURIComponent(placeId)}`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': next.commandId
          },
          body: JSON.stringify(requestPayload(next))
        });
        if (!response.ok) throw new Error('save failed');
        const payload = (await response.json()) as { recognition?: unknown };
        const parsedRecognition = parseWeeklyRhythmRecognition(payload.recognition, 'rating');
        if (!parsedRecognition) throw new Error('invalid recognition');
        applyWeeklyRhythmRecognition(parsedRecognition);
        if (parsedRecognition.recognized) recognition = parsedRecognition;
        if (!queued && !destroyed) status = 'saved';
        if (next.noteUpdate && next.noteRevision === noteRevision) {
          noteDirty = false;
          existingNote = next.privateNote !== null;
        }
        if (!queued && latestDirty === next) latestDirty = null;
      } catch {
        failed = queued ?? next;
        queued = null;
        if (!destroyed) {
          errorContext = 'save';
          status = 'error';
        }
      }
    }
    draining = false;
  }

  function scheduleNote(): void {
    interactionVersion += 1;
    noteRevision += 1;
    noteDirty = true;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNote, 650);
  }

  function flushNote(): void {
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = undefined;
    if (noteDirty && overall !== null) enqueue(snapshot(true));
  }

  function labelScore(score: number): string {
    return (score === 1 ? copy['rating.star.one'] : copy['rating.star.many']).replace(
      '{score}',
      String(score)
    );
  }
</script>

<!-- Top rule only: the details disclosure below draws its own top border,
     and a bottom rule here would double it. -->
<section
  class="inline-rating relative grid gap-[0.45rem] [margin-block:0.75rem] [padding-block:0.75rem] [border-block-start:1px_solid_var(--hv-border-subtle)]"
  aria-labelledby={`rating-${placeId}`}
  data-inline-rating
>
  {#if recognition}
    <WeeklyRhythmAcknowledgement {recognition} subjectName={placeName} {copy} />
  {/if}
  <div class="rating-heading flex items-baseline justify-between gap-4">
    <h3 id={`rating-${placeId}`} class="m-0 text-[0.9rem]">
      {copy['rating.inline.heading']}
    </h3>
    <span
      class="save-status min-w-14 text-[0.72rem] text-end text-basalt-muted"
      aria-live="polite"
      aria-atomic="true"
    >
      {status === 'saving'
        ? copy['rating.saving']
        : status === 'saved'
          ? copy['rating.inline.saved']
          : status === 'error'
            ? errorContext === 'load'
              ? copy['rating.inline.loadFailed']
              : errorContext === 'save'
                ? copy['rating.inline.saveFailed']
                : ''
            : ''}
    </span>
  </div>

  {#if summary?.visible && summary.overallVisible && summary.overallMean !== null && summary.eligibleCount !== null}
    <p
      class="public-summary flex items-baseline gap-[0.35rem] m-0 text-[0.8rem] text-basalt-muted"
      aria-label={copy['rating.summary.heading']}
    >
      <strong class="text-base text-basalt">★ {summary.overallMean.toFixed(1)}</strong>
      <span>({summary.eligibleCount})</span>
    </p>
  {/if}

  <Rating
    label={copy['rating.inline.overall']}
    value={overall}
    disabled={signedIn && !initialLoadReady}
    onSelect={chooseOverall}
    scoreLabel={labelScore}
  />

  {#if status === 'error'}
    <button
      class="retry justify-self-end py-[0.15rem] px-[0.35rem] border-0 bg-transparent text-[0.72rem] text-fjord underline cursor-pointer"
      type="button"
      onclick={() => (failed ? enqueue(failed) : load())}>{copy['common.retry']}</button
    >
  {/if}

  {#if signedIn && expanded && overall !== null}
    <!-- The details carry text, so the reveal is transform-only: words arrive at full contrast
         and move into place (see the fade-family limit in tokens.css). -->
    <div class="details grid gap-2 pt-[0.35rem]">
      {#each categories as category (category)}
        <div
          class="category-row grid grid-cols-[minmax(6.5rem,1fr)_auto] items-center gap-y-[0.2rem] gap-x-2 text-[0.8rem] font-[750]"
        >
          <span>{copy[`rating.dimension.${category}.label` as MessageKey]}</span>
          <Rating
            label={copy[`rating.dimension.${category}.label` as MessageKey]}
            value={values[category] ?? overall}
            inherited={values[category] === null}
            disabled={!initialLoadReady}
            onSelect={(value) => chooseCategory(category, value)}
            scoreLabel={labelScore}
          />
          {#if values[category] !== null}
            <button
              class="reset justify-self-end py-[0.15rem] px-[0.35rem] border-0 bg-transparent text-[0.72rem] text-fjord underline cursor-pointer"
              type="button"
              onclick={() => resetCategory(category)}>{copy['rating.inline.reset']}</button
            >
          {/if}
        </div>
      {/each}

      {#if showNote}
        <label class="note grid gap-[0.3rem] text-[0.8rem] font-[750]">
          <span>{copy['rating.inline.note']}</span>
          <textarea
            rows="3"
            maxlength="1000"
            bind:value={note}
            oninput={scheduleNote}
            onblur={flushNote}
            class="w-full resize-y p-[0.6rem] border border-border-subtle rounded-control [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-weight:inherit] [font-stretch:inherit] [line-height:inherit]"
          ></textarea>
        </label>
      {/if}
    </div>
  {/if}
</section>

<style>
  .details {
    animation: reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  @keyframes reveal {
    from {
      transform: translateY(-0.2rem);
    }
    to {
      transform: none;
    }
  }
</style>
