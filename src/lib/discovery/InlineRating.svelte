<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import type { Catalogue, MessageKey } from '$i18n';
  import { requestAuthentication } from '$lib/auth/controller';
  import type {
    CurrentRating,
    DogFriendlinessSummary
  } from '$server/dog-friendliness/dog-friendliness';

  import StarRating from './StarRating.svelte';

  type Category = 'welcome' | 'clarity' | 'comfort' | 'thoughtfulness';
  interface Snapshot {
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
  let queued: Snapshot | null = null;
  let draining = false;
  let failed: Snapshot | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  let noteDirty = false;
  let noteRevision = 0;
  let latestDirty: Snapshot | null = null;
  let interactionVersion = 0;
  let destroyed = false;

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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload(finalSnapshot)),
        keepalive: true
      });
    }
  });

  async function load(): Promise<void> {
    const loadVersion = interactionVersion;
    status = 'loading';
    try {
      const response = await fetch(`/api/ratings/${encodeURIComponent(placeId)}`);
      if (!response.ok) throw new Error('load failed');
      const payload = (await response.json()) as { rating: CurrentRating | null };
      if (destroyed || loadVersion !== interactionVersion) return;
      if (payload.rating?.overallScore) {
        overall = payload.rating.overallScore;
        values = { ...payload.rating.scores };
        note = payload.rating.privateNote ?? '';
        existingNote = payload.rating.privateNote !== null;
      }
      if (!destroyed) status = 'idle';
    } catch {
      if (!destroyed && loadVersion === interactionVersion) status = 'error';
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
    interactionVersion += 1;
    overall = value;
    expanded = true;
    enqueue(snapshot(false));
  }

  function chooseCategory(category: Category, value: number): void {
    interactionVersion += 1;
    values[category] = value;
    enqueue(snapshot(false));
  }

  function resetCategory(category: Category): void {
    interactionVersion += 1;
    values[category] = null;
    enqueue(snapshot(false));
  }

  function snapshot(noteUpdate: boolean): Snapshot {
    if (overall === null) throw new Error('overall required');
    return {
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
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestPayload(next))
        });
        if (!response.ok) throw new Error('save failed');
        if (!queued && !destroyed) status = 'saved';
        if (next.noteUpdate && next.noteRevision === noteRevision) {
          noteDirty = false;
          existingNote = next.privateNote !== null;
        }
        if (!queued && latestDirty === next) latestDirty = null;
      } catch {
        failed = queued ?? next;
        queued = null;
        if (!destroyed) status = 'error';
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

<section class="inline-rating" aria-labelledby={`rating-${placeId}`} data-inline-rating>
  <div class="rating-heading">
    <h3 id={`rating-${placeId}`}>{copy['rating.inline.heading']}</h3>
    <span class="save-status" aria-live="polite" aria-atomic="true">
      {status === 'saving'
        ? copy['rating.saving']
        : status === 'saved'
          ? copy['rating.inline.saved']
          : status === 'error'
            ? copy['rating.inline.saveFailed']
            : ''}
    </span>
  </div>

  {#if summary?.visible && summary.overallVisible && summary.overallMean !== null && summary.eligibleCount !== null}
    <p class="public-summary" aria-label={copy['rating.summary.heading']}>
      <strong>★ {summary.overallMean.toFixed(1)}</strong>
      <span>({summary.eligibleCount})</span>
    </p>
  {/if}

  <StarRating
    label={copy['rating.inline.overall']}
    value={overall}
    onSelect={chooseOverall}
    scoreLabel={labelScore}
  />

  {#if status === 'error'}
    <button class="retry" type="button" onclick={() => (failed ? enqueue(failed) : load())}
      >{copy['common.retry']}</button
    >
  {/if}

  {#if signedIn && expanded && overall !== null}
    <div class="details">
      {#each categories as category (category)}
        <div class="category-row">
          <span>{copy[`rating.dimension.${category}.label` as MessageKey]}</span>
          <StarRating
            label={copy[`rating.dimension.${category}.label` as MessageKey]}
            value={values[category] ?? overall}
            inherited={values[category] === null}
            onSelect={(value) => chooseCategory(category, value)}
            scoreLabel={labelScore}
          />
          {#if values[category] !== null}
            <button class="reset" type="button" onclick={() => resetCategory(category)}
              >{copy['rating.inline.reset']}</button
            >
          {/if}
        </div>
      {/each}

      {#if showNote}
        <label class="note">
          <span>{copy['rating.inline.note']}</span>
          <textarea
            rows="3"
            maxlength="1000"
            bind:value={note}
            oninput={scheduleNote}
            onblur={flushNote}></textarea>
        </label>
      {/if}
    </div>
  {/if}
</section>

<style>
  .inline-rating {
    position: relative;
    display: grid;
    gap: 0.45rem;
    margin-block: 0.75rem;
    padding-block: 0.75rem;
    border-block: 1px solid var(--hv-border-subtle);
  }
  .rating-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  h3,
  p {
    margin: 0;
  }
  h3 {
    font-size: 0.9rem;
  }
  .save-status {
    min-width: 3.5rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
    text-align: end;
  }
  .public-summary {
    display: flex;
    gap: 0.35rem;
    align-items: baseline;
    color: var(--hv-color-basalt-muted);
    font-size: 0.8rem;
  }
  .public-summary strong {
    color: var(--hv-color-basalt);
    font-size: 1rem;
  }
  .details {
    display: grid;
    gap: 0.5rem;
    padding-top: 0.35rem;
    animation: reveal 160ms ease-out both;
  }
  .category-row {
    display: grid;
    grid-template-columns: minmax(6.5rem, 1fr) auto;
    align-items: center;
    gap: 0.2rem 0.5rem;
    font-size: 0.8rem;
    font-weight: 750;
  }
  .reset,
  .retry {
    justify-self: end;
    padding: 0.15rem 0.35rem;
    border: 0;
    background: transparent;
    color: var(--hv-color-fjord);
    font-size: 0.72rem;
    text-decoration: underline;
    cursor: pointer;
  }
  .note {
    display: grid;
    gap: 0.3rem;
    font-size: 0.8rem;
    font-weight: 750;
  }
  textarea {
    width: 100%;
    resize: vertical;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.6rem;
    font: inherit;
  }
  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(-0.2rem);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .details {
      animation: none;
    }
  }
</style>
