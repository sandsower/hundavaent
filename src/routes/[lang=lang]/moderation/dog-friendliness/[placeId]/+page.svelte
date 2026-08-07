<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';

  import { Button, Field, Notice, Select, Textarea } from '@hundavaent/design-system';
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

<main
  class="moderation-shell w-[min(100%_-_2rem,var(--hv-content-wide))] m-[var(--hv-space-section)_auto_5rem]"
  data-ui-mode="operations"
>
  <p class="eyebrow font-[950] tracking-[0.08em] uppercase text-fjord">
    {data.placeName ?? data.placeId}
  </p>
  <h1
    class="my-1 mx-0 font-display text-[clamp(1.8rem,5vw,3rem)] font-[650] leading-none tracking-[-0.03em] text-basalt"
  >
    {data.copy['moderation.dogFriendliness.title']}
  </h1>
  <p class="intro">{data.copy['moderation.dogFriendliness.intro']}</p>

  {#if errorMessage}
    <Notice tone="error" role="alert" class="font-extrabold">{errorMessage}</Notice>
  {/if}
  {#if dispositionRecorded}
    <Notice tone="info" role="status" class="font-extrabold">
      {data.copy['moderation.dogFriendliness.dispositionRecorded']}
    </Notice>
  {/if}

  {#if data.ratings.length === 0}
    <Notice tone="info" role="status" class="font-extrabold"
      >{data.copy['moderation.dogFriendliness.empty']}</Notice
    >
  {:else}
    <ul class="ratings grid gap-4 mx-0 mt-6 mb-0 p-0 list-none">
      {#each data.ratings as rating (rating.id)}
        {@const noteDetail = data.noteDetails?.[rating.memberId]}
        <li
          class="rating-row grid gap-3 p-4 border border-border-subtle rounded-panel bg-snow-raised shadow-raised"
          data-rating-id={rating.id}
        >
          <div class="rating-header flex justify-between font-extrabold">
            <span class="member"
              >{data.copy['moderation.dogFriendliness.memberColumn']}: {rating.memberId}</span
            >
            <!-- data-excluded mirrors the class:excluded flag so the excluded tone, which used to
                 live in `.status.excluded`, can be a data variant; the class itself stays. -->
            <span
              class="status py-[0.15rem] px-[0.6rem] border border-success rounded-control bg-success-soft text-[0.75rem] font-black uppercase text-success data-[excluded=true]:border-danger data-[excluded=true]:bg-danger-soft data-[excluded=true]:text-danger"
              class:excluded={rating.excludedAt !== null}
              data-excluded={rating.excludedAt !== null}
            >
              {rating.excludedAt !== null
                ? data.copy['moderation.dogFriendliness.excluded']
                : data.copy['moderation.dogFriendliness.eligible']}
            </span>
          </div>

          <dl
            class="scores grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2 m-0 max-[40rem]:grid-cols-[repeat(2,minmax(0,1fr))]"
          >
            <div>
              <dt class="text-[0.72rem] font-[750] text-basalt-muted">
                {data.copy['rating.inline.overall']}
              </dt>
              <dd class="m-0 font-black">{scoreLabel(rating.overallScore ?? null)}</dd>
            </div>
            {#each dimensions as dimension (dimension)}
              <div>
                <dt class="text-[0.72rem] font-[750] text-basalt-muted">
                  {data.copy[`rating.dimension.${dimension}.label` as MessageKey]}
                </dt>
                <dd class="m-0 font-black">{scoreLabel(rating.scores[dimension])}</dd>
              </div>
            {/each}
          </dl>

          {#if rating.excludedAt !== null}
            <p class="exclusion-detail m-0 text-[0.85rem] text-basalt-muted">
              {data.copy['moderation.dogFriendliness.exclusionKind']}:
              {rating.excludedKind
                ? data.copy[
                    `moderation.dogFriendliness.exclusionKind.${rating.excludedKind}` as MessageKey
                  ]
                : ''}
              - {rating.excludedReason}
            </p>
            <form
              class="grid grid-cols-[1fr_2fr_auto] items-end gap-2 max-[40rem]:grid-cols-[1fr]"
              method="POST"
              action="?/reinstate"
              use:enhance={enhanceForm}
              aria-busy={submitting}
            >
              <input type="hidden" name="memberId" value={rating.memberId} />
              <Field label={data.copy['moderation.dogFriendliness.reason']}>
                <Textarea name="reason" rows={2} required></Textarea>
              </Field>
              <Button type="submit" intent="primary" disabled={submitting}>
                {data.copy['moderation.dogFriendliness.reinstateAction']}
              </Button>
            </form>
          {:else}
            <form
              class="grid grid-cols-[1fr_2fr_auto] items-end gap-2 max-[40rem]:grid-cols-[1fr]"
              method="POST"
              action="?/exclude"
              use:enhance={enhanceForm}
              aria-busy={submitting}
            >
              <input type="hidden" name="memberId" value={rating.memberId} />
              <Field label={data.copy['moderation.dogFriendliness.exclusionKind']}>
                <Select name="exclusionKind">
                  {#each exclusionKinds as kind (kind)}
                    <option value={kind}
                      >{data.copy[
                        `moderation.dogFriendliness.exclusionKind.${kind}` as MessageKey
                      ]}</option
                    >
                  {/each}
                </Select>
              </Field>
              <Field label={data.copy['moderation.dogFriendliness.reason']}>
                <Textarea name="reason" rows={2} required></Textarea>
              </Field>
              <Button type="submit" intent="primary" disabled={submitting}>
                {data.copy['moderation.dogFriendliness.excludeAction']}
              </Button>
            </form>
          {/if}

          {#if rating.privateNote}
            <section
              class="private-note grid gap-[0.6rem] p-[0.9rem] border border-fjord rounded-panel bg-fjord-soft"
              aria-label={data.copy['moderation.dogFriendliness.noteHeading']}
            >
              <h2 class="m-0 text-[1rem]">
                {data.copy['moderation.dogFriendliness.noteHeading']}
              </h2>
              <dl class="note-meta grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 m-0">
                <div>
                  <dt class="text-[0.72rem] font-[750] text-basalt">
                    {data.copy['moderation.dogFriendliness.noteClassificationLabel']}
                  </dt>
                  <dd class="m-0 font-extrabold">
                    {rating.privateNoteClassification
                      ? data.copy[
                          `ratingNote.classification.${rating.privateNoteClassification}` as MessageKey
                        ]
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt class="text-[0.72rem] font-[750] text-basalt">
                    {data.copy['moderation.dogFriendliness.noteUpdatedAt']}
                  </dt>
                  <dd class="m-0 font-extrabold">{rating.privateNoteUpdatedAt ?? ''}</dd>
                </div>
              </dl>
              <p class="note-text m-0 whitespace-pre-wrap">{rating.privateNote}</p>

              {#if rating.linkedReportId}
                <p class="linked-report m-0 font-extrabold">
                  {data.copy['moderation.dogFriendliness.linkedReportLabel']}:
                  <!-- text-basalt, not text-fjord: this anchor only ever renders inside
                       .private-note, whose `.private-note a` rule outranked the bare `a` rule in
                       the original, so the fjord colour never reached it. -->
                  <a
                    class="text-basalt focus-visible:rounded-control focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
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
                <!-- Same story as the linked-report anchor: the only summary on this page sits
                     inside .private-note, so `.private-note summary` won and the bare
                     `summary { color: fjord }` declaration was dead. -->
                <summary
                  class="text-basalt focus-visible:rounded-control focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
                  >{data.copy['moderation.dogFriendliness.noteHistoryHeading']}</summary
                >
                {#if !noteDetail || noteDetail.history.length === 0}
                  <Notice tone="info" role="status" class="font-extrabold">
                    {data.copy['moderation.dogFriendliness.noteHistoryEmpty']}
                  </Notice>
                {:else}
                  <ol class="note-history-list grid gap-2 mx-0 mt-2 mb-0 pl-[1.2rem]">
                    {#each noteDetail.history as entry, index (index)}
                      <li>
                        <span class="event-kind font-extrabold"
                          >{data.copy[
                            `moderation.dogFriendliness.noteHistoryEventKind.${entry.eventKind}` as MessageKey
                          ]}</span
                        >
                        <span class="event-time text-[0.8rem] text-basalt-muted"
                          >{entry.occurredAt}</span
                        >
                        {#if entry.privateNote}<p class="mx-0 mt-1 mb-0 text-basalt-muted">
                            {entry.privateNote}
                          </p>{/if}
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
                class="disposition-form grid grid-cols-[1fr_2fr_auto] items-end gap-2 max-[40rem]:grid-cols-[1fr]"
              >
                <input type="hidden" name="memberId" value={rating.memberId} />
                <Field label={data.copy['moderation.dogFriendliness.dispositionKindLabel']}>
                  <Select name="dispositionKind">
                    {#each dispositionKinds as kind (kind)}
                      <option value={kind}
                        >{data.copy[
                          `moderation.dogFriendliness.dispositionKind.${kind}` as MessageKey
                        ]}</option
                      >
                    {/each}
                  </Select>
                </Field>
                <Field label={data.copy['moderation.dogFriendliness.dispositionNotesLabel']}>
                  <Textarea name="dispositionNotes" rows={2} required></Textarea>
                </Field>
                <Button type="submit" intent="primary" disabled={submitting}>
                  {data.copy['moderation.dogFriendliness.dispositionSubmit']}
                </Button>
              </form>

              {#if noteDetail && noteDetail.dispositions.length > 0}
                <div class="disposition-list">
                  <h3 class="m-0 text-[0.9rem]">
                    {data.copy['moderation.dogFriendliness.dispositionListHeading']}
                  </h3>
                  <ul class="mx-0 mt-[0.4rem] mb-0 pl-[1.2rem]">
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
  /* Field renders its own <label>, crossing this component's scoping boundary; :global() reaches
     it purely on the literal element, ancestor-scoped to form the same way
     moderation/sign-in/+page.svelte's `form :global(label)` reaches Field's label - safe here
     since every form in this file wraps only Field/Select/Textarea/Button, none of which render a
     second, unrelated <label> of their own. Weight and size are the one thing not approved to
     simplify away in this migration - Field intentionally carries no opinion on either. */
  form :global(label) {
    font-size: 0.8rem;
    font-weight: 800;
  }
</style>
