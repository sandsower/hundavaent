<script lang="ts">
  import { resolve } from '$app/paths';
  import CandidateReviewPanel from '$lib/moderation/CandidateReviewPanel.svelte';
  import CorrectionReviewPanel from '$lib/moderation/CorrectionReviewPanel.svelte';
  import ModerationWorkspace from '$lib/moderation/ModerationWorkspace.svelte';
  import SuggestionReviewPanel from '$lib/moderation/SuggestionReviewPanel.svelte';
  import type { ModerationWorkItem } from '$lib/moderation/types';
  import type { MessageKey } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import {
    localizePlaceCategory,
    localizePlaceField,
    localizeReportReason
  } from '$i18n/structured-place';

  import type { PageProps } from './$types';
  import type { SuggestionOutcome } from '$server/suggestions/suggestions';

  let { data, form }: PageProps = $props();

  interface ConflictActionData {
    conflictQueue?: string;
    conflictReview?: unknown;
    conflictRefreshFailed?: boolean;
  }

  const conflictAction = $derived(form as ConflictActionData | null);

  const queues = $derived(
    data.queues.map((queue) => ({ id: queue.queueId, count: queue.actionableCount }))
  );
  const items = $derived(
    data.workspace.queue === 'candidate-places'
      ? data.candidates.map((candidate): ModerationWorkItem => ({
          id: candidate.placeId,
          title: candidate.operatorName,
          summary: `${localizePlaceCategory(candidate.category, data.copy)} · ${candidate.addressLine}, ${candidate.locality}`,
          statusLabel: data.copy['status.candidate'],
          meta: formatLocalizedDate(candidate.createdAt, data.lang),
          priority: false
        }))
      : data.workspace.queue === 'corrections-and-reports'
        ? data.corrections.map((flag): ModerationWorkItem => ({
            id: flag.flagId,
            title: data.lang === 'is' ? flag.placeNameIs : flag.placeNameEn,
            summary: `${data.copy[`flag.kind.${flag.kind}` as MessageKey]} · ${
              flag.targetKind === 'place_field' && flag.targetField
                ? localizePlaceField(flag.targetField, data.copy)
                : data.copy['correction.targetAccessCondition']
            }${flag.reportReason ? ` · ${localizeReportReason(flag.reportReason, data.copy)}` : ''}`,
            statusLabel: data.copy[`flag.status.${flag.outcome}` as MessageKey],
            meta: formatLocalizedDate(flag.submittedAt, data.lang),
            priority: flag.isSafetyConcern
          }))
        : data.suggestions.map((suggestion): ModerationWorkItem => ({
            id: suggestion.suggestionId,
            title: data.lang === 'is' ? suggestion.nameIs : suggestion.nameEn,
            summary: `${localizePlaceCategory(suggestion.category, data.copy)} · ${suggestion.operatorName} · ${suggestion.addressLine}, ${suggestion.locality}`,
            statusLabel: data.copy[`suggestion.status.${suggestion.outcome}` as MessageKey],
            meta: formatLocalizedDate(suggestion.submittedAt, data.lang),
            priority: suggestion.trustTier === 'trusted_contributor'
          }))
  );
  const suggestionReviewSource = $derived(
    conflictAction?.conflictQueue === 'suggestions'
      ? (conflictAction.conflictReview as typeof data.suggestionReview)
      : data.suggestionReview
  );
  const correctionReviewSource = $derived(
    conflictAction?.conflictQueue === 'corrections-and-reports'
      ? (conflictAction.conflictReview as typeof data.correctionReview)
      : data.correctionReview
  );
  const candidateReviewSource = $derived(
    conflictAction?.conflictQueue === 'candidate-places'
      ? (conflictAction.conflictReview as typeof data.candidateReview)
      : data.candidateReview
  );
  const reviewData = $derived(
    suggestionReviewSource ? { lang: data.lang, copy: data.copy, ...suggestionReviewSource } : null
  );
  const correctionReviewData = $derived(
    correctionReviewSource ? { lang: data.lang, copy: data.copy, ...correctionReviewSource } : null
  );
  const candidateReviewData = $derived(
    candidateReviewSource ? { lang: data.lang, copy: data.copy, ...candidateReviewSource } : null
  );
  const hasReviewData = $derived(
    Boolean(reviewData || correctionReviewData || candidateReviewData)
  );
  const statusMessage = $derived.by(() => {
    const notice = data.workspaceNotice;
    if (!notice) return '';
    if (data.workspace.queue === 'candidate-places' && notice.kind === 'candidate') {
      if (notice.value === 'published') return data.copy['moderation.published'];
      if (notice.value === 'location_corrected') return data.copy['moderation.geometryCorrected'];
      if (notice.value === 'wheelchair_accessibility_updated') {
        return data.copy['moderation.wheelchairAccessibilitySaved'];
      }
      if (notice.value === 'evidence_uploaded' || notice.value === 'photo_uploaded') {
        return data.copy['moderation.media.uploadSucceeded'];
      }
      if (notice.value === 'media_approved') return data.copy['moderation.media.approveSucceeded'];
      if (notice.value === 'media_rejected') return data.copy['moderation.media.rejectSucceeded'];
      return data.copy['moderation.media.retireSucceeded'];
    }
    if (data.workspace.queue === 'corrections-and-reports') {
      return notice.kind === 'resolved'
        ? `${data.copy[`flag.status.${notice.value}` as MessageKey]}. ${data.copy['flag.resolved']}`
        : data.copy['flag.contributionConfirmed'];
    }
    if (notice.kind === 'resolved') {
      return `${data.copy[`suggestion.status.${notice.value}` as MessageKey]}. ${data.copy['suggestion.resolved']}`;
    }
    if (notice.kind === 'contribution') {
      return notice.value === 'confirmed'
        ? data.copy['suggestion.contributionConfirmed']
        : data.copy['contributor.moderation.revoked'];
    }
    return notice.value === 'recorded'
      ? data.copy['contributor.moderation.flagRecorded']
      : data.copy['contributor.moderation.flagCleared'];
  });
  let selectedOutcome = $state('needs_information');
  $effect(() => {
    const selectedItemId = data.workspace.itemId;
    selectedOutcome =
      selectedItemId && data.workspace.queue === 'corrections-and-reports' && correctionReviewData
        ? correctionReviewData.flag.kind === 'correction'
          ? 'applied'
          : 'confirmed_useful'
        : 'needs_information';
  });
  function chooseSuggestionDecision(outcome: SuggestionOutcome): void {
    selectedOutcome = outcome;
    const form = document.querySelector<HTMLFormElement>('#suggestion-decision');
    const select = form?.querySelector<HTMLSelectElement>('select[name="outcome"]');
    if (select) {
      select.value = outcome;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form?.querySelector<HTMLElement>('textarea[name="memberReasonIs"]')?.focus();
  }
  function chooseCorrectionDecision(outcome: string): void {
    selectedOutcome = outcome;
    const form = document.querySelector<HTMLFormElement>('#correction-decision');
    const select = form?.querySelector<HTMLSelectElement>('select[name="outcome"]');
    if (select) {
      select.value = outcome;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form?.querySelector<HTMLElement>('textarea[name="memberReasonIs"]')?.focus();
  }
  function focusCandidateDecision(target: 'publication' | 'media'): void {
    const element = document.querySelector<HTMLElement>(`#candidate-${target}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element?.querySelector<HTMLElement>('input, button')?.focus();
  }
</script>

<svelte:head>
  <title>{data.copy['nav.moderation']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="workspace-shell" data-ui-mode="operations">
  <ModerationWorkspace
    copy={data.copy}
    baseHref={`/${data.lang}/moderation`}
    {queues}
    activeQueueId={data.workspace.queue}
    {items}
    selectedItemId={data.workspace.itemId}
    filters={data.workspace.filters}
    cursor={data.workspace.cursor}
    cursorTrail={data.workspace.cursorTrail}
    nextCursor={data.nextCursor}
    hasPrevious={data.hasPrevious}
    {statusMessage}
    errorMessage={data.queueError}
    reviewErrorMessage={conflictAction?.conflictRefreshFailed
      ? data.copy['moderation.workspace.conflictRefreshFailed']
      : data.reviewError}
    actionsDisabled={Boolean(conflictAction?.conflictRefreshFailed)}
    showDecisionDock={hasReviewData}
    focusTargetId={null}
  >
    {#snippet reviewContent()}
      {#if reviewData}
        <SuggestionReviewPanel data={reviewData} form={form as never} />
      {:else if correctionReviewData}
        <CorrectionReviewPanel data={correctionReviewData} form={form as never} />
      {:else if candidateReviewData}
        <CandidateReviewPanel data={candidateReviewData} form={form as never} />
      {/if}
    {/snippet}
    {#snippet decisionContent()}
      {#if reviewData}
        <div class="decision-options" role="group" aria-label={data.copy['suggestion.resolve']}>
          {#each ['needs_information', 'accepted', 'duplicate', 'rejected'] as outcome (outcome)}
            <button
              class="decision-option"
              class:selected={selectedOutcome === outcome}
              type="button"
              aria-pressed={selectedOutcome === outcome}
              onclick={() => chooseSuggestionDecision(outcome as SuggestionOutcome)}
            >
              {data.copy[`suggestion.status.${outcome}` as MessageKey]}
            </button>
          {/each}
        </div>
      {:else if correctionReviewData}
        <div
          class="decision-options correction-options"
          role="group"
          aria-label={data.copy['flag.resolve']}
        >
          {#each [correctionReviewData.flag.kind === 'correction' ? 'applied' : 'confirmed_useful', ...(correctionReviewData.flag.targetKind === 'access_condition' ? ['dispute_opened'] : []), 'place_inactivated', 'needs_information', 'rejected'] as outcome (outcome)}
            <button
              class="decision-option"
              class:selected={selectedOutcome === outcome}
              type="button"
              aria-pressed={selectedOutcome === outcome}
              onclick={() => chooseCorrectionDecision(outcome)}
            >
              {data.copy[`flag.status.${outcome}` as MessageKey]}
            </button>
          {/each}
        </div>
      {:else if candidateReviewData}
        <div
          class="decision-options candidate-options"
          role="group"
          aria-label={data.copy['moderation.reviewTitle']}
        >
          <button
            class="decision-option"
            type="button"
            onclick={() => focusCandidateDecision('publication')}
          >
            {data.copy['moderation.checklistTitle']}
          </button>
          <button
            class="decision-option"
            type="button"
            onclick={() => focusCandidateDecision('media')}
          >
            {data.copy['moderation.media.title']}
          </button>
        </div>
      {/if}
    {/snippet}
  </ModerationWorkspace>

  <nav class="workspace-actions" aria-label={data.copy['moderation.hub.navLabel']}>
    <a href={resolve('/[lang=lang]/moderation/places/new', { lang: data.lang })}>
      {data.copy['moderation.candidateTitle']}
    </a>
  </nav>
</main>

<style>
  .workspace-shell {
    width: calc(100% - 1rem);
    margin: 0.5rem auto 2rem;
  }
  :global(body) {
    background: var(--hv-color-snow);
    color: var(--hv-color-basalt);
  }
  .workspace-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    margin-top: 1.2rem;
  }
  .workspace-actions a,
  .decision-option {
    display: inline-block;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.65rem 0.9rem;
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 900;
    text-decoration: none;
    cursor: pointer;
  }
  .workspace-actions a:focus-visible,
  .decision-option:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
  .decision-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.45rem;
  }
  .decision-option {
    min-width: 0;
    padding-inline: 0.55rem;
    font-size: 0.76rem;
    line-height: 1.15;
  }
  .decision-option.selected {
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    box-shadow: inset 0 -0.22rem 0 var(--hv-color-basalt);
  }
  .correction-options {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .candidate-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 44rem) {
    .workspace-shell {
      width: calc(100% - 0.75rem);
      margin-top: 0.4rem;
    }
    .decision-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
