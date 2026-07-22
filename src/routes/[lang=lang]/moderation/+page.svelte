<script lang="ts">
  import { resolve } from '$app/paths';
  import CandidateReviewPanel from '$lib/moderation/CandidateReviewPanel.svelte';
  import CorrectionDecisionControls from '$lib/moderation/CorrectionDecisionControls.svelte';
  import CorrectionReviewPanel from '$lib/moderation/CorrectionReviewPanel.svelte';
  import ModerationWorkspace from '$lib/moderation/ModerationWorkspace.svelte';
  import ModerationConfirmDialog from '$lib/moderation/ModerationConfirmDialog.svelte';
  import SuggestionDecisionControls from '$lib/moderation/SuggestionDecisionControls.svelte';
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

  const activeFilter = $derived(data.workspace.filters[0] ?? 'actionable');
  const queues = $derived(
    data.queues.map((queue) => ({
      id: queue.queueId,
      count:
        activeFilter === 'deferred'
          ? queue.deferredCount
          : activeFilter === 'resolved'
            ? queue.resolvedCount
            : queue.actionableCount
    }))
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
      if (notice.value === 'draft_saved') return data.copy['moderation.workbench.draftSaved'];
      if (notice.value === 'needs_information') {
        return data.copy['moderation.workbench.needsInformationSaved'];
      }
      if (notice.value === 'rejected') return data.copy['moderation.workbench.rejectedSaved'];
      if (notice.value === 'reopened') return data.copy['moderation.workbench.reopenedSaved'];
      if (notice.value === 'location_corrected') return data.copy['moderation.geometryCorrected'];
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
  let suggestionDecisionToken = $state(0);
  let suggestionDecisionRequest = $state<{
    outcome: Exclude<SuggestionOutcome, 'submitted'>;
    token: number;
  } | null>(null);
  let correctionDecisionToken = $state(0);
  let correctionDecisionRequest = $state<{
    outcome: Exclude<import('$server/place-flags/place-flags').PlaceFlagOutcome, 'submitted'>;
    token: number;
  } | null>(null);
  let candidateDialog = $state<'publish' | 'needs_information' | 'rejected' | null>(null);
  function chooseSuggestionDecision(outcome: Exclude<SuggestionOutcome, 'submitted'>): void {
    suggestionDecisionToken += 1;
    suggestionDecisionRequest = { outcome, token: suggestionDecisionToken };
  }
  function chooseCorrectionDecision(
    outcome: Exclude<import('$server/place-flags/place-flags').PlaceFlagOutcome, 'submitted'>
  ): void {
    correctionDecisionToken += 1;
    correctionDecisionRequest = { outcome, token: correctionDecisionToken };
  }
  function submitCandidatePublication(): void {
    candidateDialog = null;
    document.querySelector<HTMLFormElement>('#candidate-publication')?.requestSubmit();
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
        <SuggestionReviewPanel
          data={reviewData}
          form={form as never}
          decisionRequest={suggestionDecisionRequest}
        />
      {:else if correctionReviewData}
        <CorrectionReviewPanel
          data={correctionReviewData}
          form={form as never}
          decisionRequest={correctionDecisionRequest}
        />
      {:else if candidateReviewData}
        <CandidateReviewPanel data={candidateReviewData} form={form as never} />
      {/if}
    {/snippet}
    {#snippet decisionContent()}
      {#if reviewData}
        <SuggestionDecisionControls
          copy={data.copy}
          disabled={!hasReviewData}
          acceptDisabled={Boolean(
            reviewData.suggestion.effectiveProposal.translations.is.needs_review ||
            reviewData.suggestion.effectiveProposal.translations.en.needs_review
          )}
          ondecide={chooseSuggestionDecision}
        />
      {:else if correctionReviewData}
        <CorrectionDecisionControls
          copy={data.copy}
          kind={correctionReviewData.flag.kind}
          targetKind={correctionReviewData.flag.targetKind}
          ondecide={chooseCorrectionDecision}
        />
      {:else if candidateReviewData}
        <div
          class="decision-options candidate-options"
          role="group"
          aria-label={data.copy['moderation.reviewTitle']}
        >
          {#if activeFilter === 'resolved'}
            <form method="POST" action="?/decideCandidate">
              <input type="hidden" name="placeId" value={candidateReviewData.review.placeId} />
              <input
                type="hidden"
                name="expectedItemVersion"
                value={candidateReviewData.review.itemVersion}
              />
              <input
                type="hidden"
                name="expectedDraftVersion"
                value={candidateReviewData.review.draftVersion}
              />
              <input type="hidden" name="decision" value="reopen" />
              <button class="decision-option" type="submit">
                {data.copy['moderation.workbench.reopen']}
              </button>
            </form>
          {:else}
            <button
              class="decision-option primary"
              type="button"
              disabled={!candidateReviewData.review.ready}
              onclick={() => (candidateDialog = 'publish')}
            >
              {data.copy['moderation.verifyAndPublish']}
            </button>
            <button
              class="decision-option"
              type="button"
              onclick={() => (candidateDialog = 'needs_information')}
            >
              {data.copy['moderation.workbench.needsInformation']}
            </button>
            <button
              class="decision-option danger"
              type="button"
              onclick={() => (candidateDialog = 'rejected')}
            >
              {data.copy['moderation.workbench.reject']}
            </button>
          {/if}
        </div>

        <ModerationConfirmDialog
          open={candidateDialog === 'publish'}
          title={data.copy['moderation.workbench.publishConfirmTitle']}
          description={data.copy['moderation.workbench.publishConfirmBody']}
          confirmLabel={data.copy['moderation.verifyAndPublish']}
          cancelLabel={data.copy['moderation.workbench.keepReviewing']}
          onconfirm={submitCandidatePublication}
          oncancel={() => (candidateDialog = null)}
        />

        {#if candidateDialog === 'needs_information' || candidateDialog === 'rejected'}
          <dialog
            class="candidate-dialog"
            open
            aria-labelledby="candidate-decision-title"
            oncancel={() => (candidateDialog = null)}
          >
            <h2 id="candidate-decision-title">
              {candidateDialog === 'rejected'
                ? data.copy['moderation.workbench.rejectTitle']
                : data.copy['moderation.workbench.needsInformationTitle']}
            </h2>
            <p>{data.copy['moderation.workbench.decisionHelp']}</p>
            <form method="POST" action="?/decideCandidate">
              <input type="hidden" name="placeId" value={candidateReviewData.review.placeId} />
              <input
                type="hidden"
                name="expectedItemVersion"
                value={candidateReviewData.review.itemVersion}
              />
              <input
                type="hidden"
                name="expectedDraftVersion"
                value={candidateReviewData.review.draftVersion}
              />
              <input type="hidden" name="decision" value={candidateDialog} />
              {#if candidateDialog === 'rejected'}
                <input type="hidden" name="confirmedDecision" value="rejected" />
                <label>
                  {data.copy['moderation.workbench.reasonCode']}
                  <select name="reasonCode" required>
                    <option value="insufficient_evidence"
                      >{data.copy['moderation.workbench.reason.insufficientEvidence']}</option
                    >
                    <option value="inaccurate"
                      >{data.copy['moderation.workbench.reason.inaccurate']}</option
                    >
                    <option value="out_of_scope"
                      >{data.copy['moderation.workbench.reason.outOfScope']}</option
                    >
                    <option value="unsafe">{data.copy['moderation.workbench.reason.unsafe']}</option
                    >
                    <option value="spam">{data.copy['moderation.workbench.reason.spam']}</option>
                    <option value="other">{data.copy['moderation.workbench.reason.other']}</option>
                  </select>
                </label>
              {/if}
              <label>
                {data.copy['suggestion.memberReasonIs']}
                <textarea name="memberReasonIs" rows="3" required></textarea>
              </label>
              <label>
                {data.copy['suggestion.memberReasonEn']}
                <textarea name="memberReasonEn" rows="3" required></textarea>
              </label>
              <label>
                {data.copy['suggestion.privateNote']}
                <textarea name="privateNote" rows="2"></textarea>
              </label>
              <div class="dialog-actions">
                <button type="button" onclick={() => (candidateDialog = null)}>
                  {data.copy['moderation.workbench.keepReviewing']}
                </button>
                <button class:danger={candidateDialog === 'rejected'} type="submit">
                  {candidateDialog === 'rejected'
                    ? data.copy['moderation.workbench.reject']
                    : data.copy['moderation.workbench.needsInformation']}
                </button>
              </div>
            </form>
          </dialog>
        {/if}
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
  .candidate-options {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .candidate-options form {
    display: contents;
  }
  .decision-option.primary {
    background: var(--hv-color-signal);
  }
  .decision-option.danger:not(:disabled),
  .candidate-dialog button.danger {
    background: var(--hv-color-danger);
    color: var(--hv-color-snow-raised);
  }
  .candidate-dialog {
    position: fixed;
    z-index: 40;
    inset: 50% auto auto 50%;
    display: grid;
    width: min(calc(100% - 2rem), 34rem);
    max-height: calc(100dvh - 2rem);
    translate: -50% -50%;
    gap: 0.75rem;
    overflow-y: auto;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-shell);
    background: var(--hv-color-snow-raised);
    padding: 1.1rem;
    color: var(--hv-color-basalt);
    box-shadow: var(--hv-shadow-raised);
  }
  .candidate-dialog::backdrop {
    background: rgb(20 37 41 / 55%);
  }
  .candidate-dialog h2,
  .candidate-dialog p {
    margin: 0;
  }
  .candidate-dialog form,
  .candidate-dialog label {
    display: grid;
    gap: 0.35rem;
  }
  .candidate-dialog form {
    gap: 0.7rem;
  }
  .candidate-dialog textarea,
  .candidate-dialog select {
    width: 100%;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.55rem;
    color: var(--hv-color-basalt);
    font: inherit;
  }
  .dialog-actions {
    display: flex;
    gap: 0.55rem;
    justify-content: flex-end;
  }
  .dialog-actions button {
    min-height: 2.7rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.55rem 0.8rem;
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 900;
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
