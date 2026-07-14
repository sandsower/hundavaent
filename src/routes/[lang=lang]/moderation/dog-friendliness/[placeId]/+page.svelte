<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';

  import type { MessageKey } from '$i18n';

  import type { ActionData, PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const dimensions = ['welcome', 'clarity', 'comfort', 'thoughtfulness'] as const;
  const exclusionKinds = ['abuse', 'fraud', 'duplication'] as const;
  const dispositionKinds = ['escalated', 'feedback_use_permitted', 'feedback_use_denied'] as const;

  let submitting = $state(false);

  const enhanceForm = () => {
    submitting = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      submitting = false;
    };
  };

  function scoreLabel(value: number | null): string {
    return value === null ? data.copy['rating.notApplicable'] : String(value);
  }

  const errorMessage = $derived(
    (form as ActionData)?.error === 'incomplete'
      ? data.copy['rating.incomplete']
      : (form as ActionData)?.error === 'invalid'
        ? data.copy['rating.invalid']
        : (form as ActionData)?.error === 'conflict'
          ? data.copy['rating.conflict']
          : (form as ActionData)?.error
            ? data.copy['rating.unavailable']
            : null
  );

  const dispositionRecorded = $derived(
    (form as ActionData)?.success === true && (form as ActionData)?.action === 'recordDisposition'
  );
</script>

<svelte:head>
  <title>{data.copy['moderation.dogFriendliness.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="moderation-shell">
  <p class="eyebrow">{data.placeName ?? data.placeId}</p>
  <h1>{data.copy['moderation.dogFriendliness.title']}</h1>
  <p class="intro">{data.copy['moderation.dogFriendliness.intro']}</p>

  {#if errorMessage}<p class="message error" role="alert">{errorMessage}</p>{/if}
  {#if dispositionRecorded}
    <p class="message" role="status">
      {data.copy['moderation.dogFriendliness.dispositionRecorded']}
    </p>
  {/if}

  {#if data.ratings.length === 0}
    <p class="message" role="status">{data.copy['moderation.dogFriendliness.empty']}</p>
  {:else}
    <ul class="ratings">
      {#each data.ratings as rating (rating.id)}
        {@const noteDetail = data.noteDetails?.[rating.memberId]}
        <li class="rating-row" data-rating-id={rating.id}>
          <div class="rating-header">
            <span class="member"
              >{data.copy['moderation.dogFriendliness.memberColumn']}: {rating.memberId}</span
            >
            <span class="status" class:excluded={rating.excludedAt !== null}>
              {rating.excludedAt !== null
                ? data.copy['moderation.dogFriendliness.excluded']
                : data.copy['moderation.dogFriendliness.eligible']}
            </span>
          </div>

          <dl class="scores">
            {#each dimensions as dimension (dimension)}
              <div>
                <dt>{data.copy[`rating.dimension.${dimension}.label` as MessageKey]}</dt>
                <dd>{scoreLabel(rating.scores[dimension])}</dd>
              </div>
            {/each}
          </dl>

          {#if rating.excludedAt !== null}
            <p class="exclusion-detail">
              {data.copy['moderation.dogFriendliness.exclusionKind']}:
              {rating.excludedKind
                ? data.copy[
                    `moderation.dogFriendliness.exclusionKind.${rating.excludedKind}` as MessageKey
                  ]
                : ''}
              - {rating.excludedReason}
            </p>
            <form
              method="POST"
              action="?/reinstate"
              use:enhance={enhanceForm}
              aria-busy={submitting}
            >
              <input type="hidden" name="memberId" value={rating.memberId} />
              <label>
                {data.copy['moderation.dogFriendliness.reason']}
                <textarea name="reason" rows="2" required></textarea>
              </label>
              <button type="submit" disabled={submitting}>
                {data.copy['moderation.dogFriendliness.reinstateAction']}
              </button>
            </form>
          {:else}
            <form method="POST" action="?/exclude" use:enhance={enhanceForm} aria-busy={submitting}>
              <input type="hidden" name="memberId" value={rating.memberId} />
              <label>
                {data.copy['moderation.dogFriendliness.exclusionKind']}
                <select name="exclusionKind">
                  {#each exclusionKinds as kind (kind)}
                    <option value={kind}
                      >{data.copy[
                        `moderation.dogFriendliness.exclusionKind.${kind}` as MessageKey
                      ]}</option
                    >
                  {/each}
                </select>
              </label>
              <label>
                {data.copy['moderation.dogFriendliness.reason']}
                <textarea name="reason" rows="2" required></textarea>
              </label>
              <button type="submit" disabled={submitting}>
                {data.copy['moderation.dogFriendliness.excludeAction']}
              </button>
            </form>
          {/if}

          {#if rating.privateNote}
            <section
              class="private-note"
              aria-label={data.copy['moderation.dogFriendliness.noteHeading']}
            >
              <h2>{data.copy['moderation.dogFriendliness.noteHeading']}</h2>
              <dl class="note-meta">
                <div>
                  <dt>{data.copy['moderation.dogFriendliness.noteClassificationLabel']}</dt>
                  <dd>
                    {rating.privateNoteClassification
                      ? data.copy[
                          `ratingNote.classification.${rating.privateNoteClassification}` as MessageKey
                        ]
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>{data.copy['moderation.dogFriendliness.noteUpdatedAt']}</dt>
                  <dd>{rating.privateNoteUpdatedAt ?? ''}</dd>
                </div>
              </dl>
              <p class="note-text">{rating.privateNote}</p>

              {#if rating.linkedReportId}
                <p class="linked-report">
                  {data.copy['moderation.dogFriendliness.linkedReportLabel']}:
                  <a
                    href={resolve('/[lang=lang]/moderation/corrections-and-reports/[id]', {
                      lang: data.lang,
                      id: rating.linkedReportId
                    })}
                  >
                    {data.copy['moderation.dogFriendliness.linkedReportLink']}
                  </a>
                </p>
              {/if}

              <details class="note-history">
                <summary>{data.copy['moderation.dogFriendliness.noteHistoryHeading']}</summary>
                {#if !noteDetail || noteDetail.history.length === 0}
                  <p class="message" role="status">
                    {data.copy['moderation.dogFriendliness.noteHistoryEmpty']}
                  </p>
                {:else}
                  <ol class="note-history-list">
                    {#each noteDetail.history as entry, index (index)}
                      <li>
                        <span class="event-kind"
                          >{data.copy[
                            `moderation.dogFriendliness.noteHistoryEventKind.${entry.eventKind}` as MessageKey
                          ]}</span
                        >
                        <span class="event-time">{entry.occurredAt}</span>
                        {#if entry.privateNote}<p>{entry.privateNote}</p>{/if}
                      </li>
                    {/each}
                  </ol>
                {/if}
              </details>

              <form
                method="POST"
                action="?/recordDisposition"
                use:enhance={enhanceForm}
                aria-busy={submitting}
                class="disposition-form"
              >
                <input type="hidden" name="memberId" value={rating.memberId} />
                <label>
                  {data.copy['moderation.dogFriendliness.dispositionKindLabel']}
                  <select name="dispositionKind">
                    {#each dispositionKinds as kind (kind)}
                      <option value={kind}
                        >{data.copy[
                          `moderation.dogFriendliness.dispositionKind.${kind}` as MessageKey
                        ]}</option
                      >
                    {/each}
                  </select>
                </label>
                <label>
                  {data.copy['moderation.dogFriendliness.dispositionNotesLabel']}
                  <textarea name="dispositionNotes" rows="2" required></textarea>
                </label>
                <button type="submit" disabled={submitting}>
                  {data.copy['moderation.dogFriendliness.dispositionSubmit']}
                </button>
              </form>

              {#if noteDetail && noteDetail.dispositions.length > 0}
                <div class="disposition-list">
                  <h3>{data.copy['moderation.dogFriendliness.dispositionListHeading']}</h3>
                  <ul>
                    {#each noteDetail.dispositions as disposition (disposition.id)}
                      <li>
                        <strong
                          >{data.copy[
                            `moderation.dogFriendliness.dispositionKind.${disposition.dispositionKind}` as MessageKey
                          ]}</strong
                        >
                        - {disposition.notes} ({disposition.occurredAt})
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </section>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .moderation-shell {
    width: min(100% - 2rem, 60rem);
    margin: 2rem auto 5rem;
  }
  .eyebrow {
    color: var(--coral-dark);
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  h1 {
    margin: 0.25rem 0;
    font-size: clamp(1.8rem, 5vw, 3rem);
  }
  .ratings {
    display: grid;
    gap: 1rem;
    margin: 1.5rem 0 0;
    padding: 0;
    list-style: none;
  }
  .rating-row {
    display: grid;
    gap: 0.75rem;
    border: 2px solid var(--ink);
    border-radius: 1rem;
    background: var(--paper-raised);
    padding: 1rem;
  }
  .rating-header {
    display: flex;
    justify-content: space-between;
    font-weight: 800;
  }
  .status {
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    background: var(--mint);
    font-size: 0.75rem;
    font-weight: 900;
    text-transform: uppercase;
  }
  .status.excluded {
    background: var(--coral-soft);
  }
  .scores {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 0;
  }
  .scores dt {
    font-size: 0.72rem;
    color: var(--ink-soft);
    font-weight: 750;
  }
  .scores dd {
    margin: 0;
    font-weight: 900;
  }
  .exclusion-detail {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  form {
    display: grid;
    grid-template-columns: 1fr 2fr auto;
    gap: 0.5rem;
    align-items: end;
  }
  label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 800;
  }
  select,
  textarea {
    border: 2px solid var(--ink);
    border-radius: 0.6rem;
    padding: 0.5rem;
    font: inherit;
  }
  button {
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.6rem 1rem;
    font-weight: 900;
  }
  .message {
    border: 2px solid var(--ink);
    border-radius: 0.75rem;
    padding: 0.9rem;
    font-weight: 850;
  }
  .error {
    background: var(--coral-soft);
  }
  .private-note {
    display: grid;
    gap: 0.6rem;
    border: 2px dashed var(--coral-dark);
    border-radius: 0.9rem;
    padding: 0.9rem;
    background: var(--paper);
  }
  .private-note h2 {
    margin: 0;
    font-size: 1rem;
  }
  .note-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 0;
  }
  .note-meta dt {
    font-size: 0.72rem;
    color: var(--ink-soft);
    font-weight: 750;
  }
  .note-meta dd {
    margin: 0;
    font-weight: 800;
  }
  .note-text {
    margin: 0;
    white-space: pre-wrap;
  }
  .linked-report {
    margin: 0;
    font-weight: 800;
  }
  .note-history-list {
    display: grid;
    gap: 0.5rem;
    margin: 0.5rem 0 0;
    padding-left: 1.2rem;
  }
  .note-history-list p {
    margin: 0.25rem 0 0;
    color: var(--ink-soft);
  }
  .event-kind {
    font-weight: 800;
  }
  .event-time {
    color: var(--ink-soft);
    font-size: 0.8rem;
  }
  .disposition-form {
    grid-template-columns: 1fr 2fr auto;
  }
  .disposition-list ul {
    margin: 0.4rem 0 0;
    padding-left: 1.2rem;
  }
  .disposition-list h3 {
    margin: 0;
    font-size: 0.9rem;
  }
  @media (max-width: 40rem) {
    .scores {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    form {
      grid-template-columns: 1fr;
    }
    .disposition-form {
      grid-template-columns: 1fr;
    }
  }
</style>
