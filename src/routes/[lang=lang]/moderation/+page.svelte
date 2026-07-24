<script lang="ts">
  import { resolve } from '$app/paths';
  import { tick } from 'svelte';
  import CandidateDecisionControls, {
    type CandidateDecisionOutcome
  } from '$lib/moderation/CandidateDecisionControls.svelte';
  import CandidateReviewPanel from '$lib/moderation/CandidateReviewPanel.svelte';
  import CorrectionDecisionControls from '$lib/moderation/CorrectionDecisionControls.svelte';
  import CorrectionReviewPanel from '$lib/moderation/CorrectionReviewPanel.svelte';
  import ModerationWorkspace from '$lib/moderation/ModerationWorkspace.svelte';
  import ModerationPublishDialog from '$lib/moderation/ModerationPublishDialog.svelte';
  import ModerationReasonDialog, {
    type ModerationReasonValue
  } from '$lib/moderation/ModerationReasonDialog.svelte';
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

  interface CandidateActionData {
    action?: string;
    error?: string;
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
            priority: flag.isSafetyConcern,
            priorityLabel:
              flag.trustTier === 'trusted_contributor'
                ? data.copy['contributor.queueBadge.trusted_contributor']
                : undefined
          }))
        : data.suggestions.map((suggestion): ModerationWorkItem => ({
            id: suggestion.suggestionId,
            title: data.lang === 'is' ? suggestion.nameIs : suggestion.nameEn,
            summary: `${localizePlaceCategory(suggestion.category, data.copy)} · ${suggestion.operatorName} · ${suggestion.addressLine}, ${suggestion.locality}`,
            statusLabel: data.copy[`suggestion.status.${suggestion.outcome}` as MessageKey],
            meta: formatLocalizedDate(suggestion.submittedAt, data.lang),
            priority: false,
            priorityLabel:
              suggestion.trustTier === 'trusted_contributor'
                ? data.copy['contributor.queueBadge.trusted_contributor']
                : undefined
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
  const suggestionDecisionAvailable = $derived(
    reviewData?.suggestion.outcome === 'submitted' ||
      reviewData?.suggestion.outcome === 'needs_information'
  );
  const correctionDecisionAvailable = $derived(
    correctionReviewData?.trustedVerification?.outcome !== 'superseded' &&
      (correctionReviewData?.flag.outcome === 'submitted' ||
        correctionReviewData?.flag.outcome === 'needs_information')
  );
  const candidateDecisionAvailable = $derived(
    candidateReviewData?.review.candidateStatus === 'pending' ||
      candidateReviewData?.review.candidateStatus === 'needs_information' ||
      candidateReviewData?.review.candidateStatus === 'rejected'
  );
  const candidateDecisionError = $derived(
    (form as CandidateActionData | null)?.action === 'decideCandidate'
      ? ((form as CandidateActionData).error ?? null)
      : null
  );
  const showDecisionDock = $derived(
    Boolean(
      suggestionDecisionAvailable ||
      correctionDecisionAvailable ||
      candidateDecisionAvailable ||
      candidateDecisionError
    )
  );
  const statusMessage = $derived.by(() => {
    const notice = data.workspaceNotice;
    if (!notice) return '';
    if (notice.kind === 'draft') return data.copy['moderation.workbench.draftSaved'];
    if (data.workspace.queue === 'candidate-places' && notice.kind === 'candidate') {
      if (notice.value === 'published') return data.copy['moderation.published'];
      if (notice.value === 'draft_saved') return data.copy['moderation.workbench.draftSaved'];
      if (notice.value === 'needs_information') {
        return data.copy['moderation.workbench.needsInformationSaved'];
      }
      if (notice.value === 'rejected') return data.copy['moderation.workbench.rejectedSaved'];
      if (notice.value === 'reopened') return data.copy['moderation.workbench.reopenedSaved'];
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
  let reviewHasUnsavedEdits = $state(false);
  let candidateDialog = $state<'publish' | 'needs_information' | 'rejected' | null>(null);
  let candidatePublicationReason = $state('');
  let candidateDecision = $state<'needs_information' | 'rejected' | 'reopen'>('needs_information');
  let candidateReasonCode = $state('insufficient_evidence');
  let candidateMemberReasonIs = $state('');
  let candidateMemberReasonEn = $state('');
  let candidatePrivateNote = $state('');
  let candidateDecisionForm = $state<HTMLFormElement>();
  $effect(() => {
    if (data.workspaceNotice) reviewHasUnsavedEdits = false;
  });
  function handleReviewEditStateChange(editing: boolean): void {
    reviewHasUnsavedEdits = editing;
  }
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
  function chooseCandidateDecision(outcome: CandidateDecisionOutcome): void {
    if (reviewHasUnsavedEdits || !candidateDecisionAvailable) return;
    if (outcome === 'publish') {
      candidateDialog = 'publish';
      return;
    }
    candidateDecision = outcome;
    if (outcome === 'reopen') {
      candidateDialog = null;
      void tick().then(() => candidateDecisionForm?.requestSubmit());
      return;
    }
    candidateReasonCode = 'insufficient_evidence';
    candidateMemberReasonIs = '';
    candidateMemberReasonEn = '';
    candidatePrivateNote = '';
    candidateDialog = outcome;
  }
  async function submitCandidateDecision(reasons: ModerationReasonValue): Promise<void> {
    candidateMemberReasonIs = reasons.memberReasonIs;
    candidateMemberReasonEn = reasons.memberReasonEn;
    candidatePrivateNote = reasons.privateNote;
    candidateDialog = null;
    await tick();
    candidateDecisionForm?.requestSubmit();
  }
  async function submitCandidatePublication(reason: string): Promise<void> {
    candidatePublicationReason = reason.trim();
    candidateDialog = null;
    await tick();
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
    actionsDisabled={Boolean(conflictAction?.conflictRefreshFailed) || reviewHasUnsavedEdits}
    reviewDisabled={Boolean(conflictAction?.conflictRefreshFailed)}
    {showDecisionDock}
    decisionHint={reviewHasUnsavedEdits
      ? data.copy['moderation.workbench.unsavedDecisionHint']
      : null}
    focusTargetId={null}
  >
    {#snippet reviewContent()}
      {#if reviewData}
        <SuggestionReviewPanel
          data={reviewData}
          form={form as never}
          decisionRequest={suggestionDecisionRequest}
          oneditstatechange={handleReviewEditStateChange}
        />
      {:else if correctionReviewData}
        <CorrectionReviewPanel
          data={correctionReviewData}
          form={form as never}
          decisionRequest={correctionDecisionRequest}
          oneditstatechange={handleReviewEditStateChange}
        />
      {:else if candidateReviewData}
        <CandidateReviewPanel
          data={candidateReviewData}
          form={form as never}
          publicationReason={candidatePublicationReason}
          oneditstatechange={handleReviewEditStateChange}
        />
      {/if}
    {/snippet}
    {#snippet decisionContent()}
      {#if reviewData && suggestionDecisionAvailable}
        <SuggestionDecisionControls
          copy={data.copy}
          disabled={reviewHasUnsavedEdits}
          acceptDisabled={Boolean(
            reviewData.suggestion.effectiveProposal.translations.is.needs_review ||
            reviewData.suggestion.effectiveProposal.translations.en.needs_review
          )}
          ondecide={chooseSuggestionDecision}
        />
      {:else if correctionReviewData && correctionDecisionAvailable}
        <CorrectionDecisionControls
          copy={data.copy}
          kind={correctionReviewData.flag.kind}
          targetKind={correctionReviewData.flag.targetKind}
          disabled={reviewHasUnsavedEdits}
          ondecide={chooseCorrectionDecision}
        />
      {:else if candidateReviewData && (candidateDecisionAvailable || candidateDecisionError)}
        {#if candidateDecisionError}
          <p class="candidate-decision-error" role="alert">{candidateDecisionError}</p>
        {/if}
        <CandidateDecisionControls
          copy={data.copy}
          status={candidateReviewData.review.candidateStatus}
          ready={candidateReviewData.review.ready}
          disabled={reviewHasUnsavedEdits}
          ondecide={chooseCandidateDecision}
        />

        {#if candidateDecisionAvailable}
          <form
            class="decision-form"
            bind:this={candidateDecisionForm}
            method="POST"
            action="?/decideCandidate"
          >
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
            <input type="hidden" name="decision" value={candidateDecision} />
            <input type="hidden" name="confirmedDecision" value={candidateDecision} />
            <input type="hidden" name="reasonCode" value={candidateReasonCode} />
            <input type="hidden" name="memberReasonIs" value={candidateMemberReasonIs} />
            <input type="hidden" name="memberReasonEn" value={candidateMemberReasonEn} />
            <input type="hidden" name="privateNote" value={candidatePrivateNote} />
          </form>
        {/if}

        <ModerationPublishDialog
          open={candidateDialog === 'publish'}
          title={data.copy['moderation.workbench.publishConfirmTitle']}
          description={data.copy['moderation.workbench.publishConfirmBody']}
          reasonLabel={data.copy['moderation.workbench.publishReasonLabel']}
          reasonHelp={data.copy['moderation.workbench.publishReasonHelp']}
          confirmLabel={data.copy['moderation.verifyAndPublish']}
          cancelLabel={data.copy['moderation.workbench.keepReviewing']}
          onconfirm={submitCandidatePublication}
          oncancel={() => (candidateDialog = null)}
        />

        {#if candidateDialog === 'needs_information' || candidateDialog === 'rejected'}
          <ModerationReasonDialog
            open
            title={candidateDialog === 'rejected'
              ? data.copy['moderation.workbench.rejectTitle']
              : data.copy['moderation.workbench.needsInformationTitle']}
            description={data.copy['moderation.workbench.decisionHelp']}
            confirmLabel={candidateDialog === 'rejected'
              ? data.copy['moderation.workbench.reject']
              : data.copy['moderation.workbench.needsInformation']}
            cancelLabel={data.copy['moderation.workbench.keepReviewing']}
            reasonIsLabel={data.copy['suggestion.memberReasonIs']}
            reasonEnLabel={data.copy['suggestion.memberReasonEn']}
            privateNoteLabel={data.copy['suggestion.privateNote']}
            tone={candidateDialog === 'rejected' ? 'danger' : 'primary'}
            onconfirm={submitCandidateDecision}
            oncancel={() => (candidateDialog = null)}
          >
            {#if candidateDialog === 'rejected'}
              <label>
                {data.copy['moderation.workbench.reasonCode']}
                <select bind:value={candidateReasonCode} required>
                  <option value="insufficient_evidence"
                    >{data.copy['moderation.workbench.reason.insufficientEvidence']}</option
                  >
                  <option value="inaccurate"
                    >{data.copy['moderation.workbench.reason.inaccurate']}</option
                  >
                  <option value="out_of_scope"
                    >{data.copy['moderation.workbench.reason.outOfScope']}</option
                  >
                  <option value="unsafe">{data.copy['moderation.workbench.reason.unsafe']}</option>
                  <option value="spam">{data.copy['moderation.workbench.reason.spam']}</option>
                  <option value="other">{data.copy['moderation.workbench.reason.other']}</option>
                </select>
              </label>
            {/if}
          </ModerationReasonDialog>
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
  .workspace-actions a {
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
  .workspace-actions a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
  .candidate-decision-error {
    margin: 0 0 0.55rem;
    border: 1px solid var(--hv-color-danger);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-danger-soft);
    padding: 0.55rem;
  }
  .decision-form {
    display: none;
  }
  @media (max-width: 44rem) {
    .workspace-shell {
      width: calc(100% - 0.75rem);
      margin-top: 0.4rem;
    }
  }
</style>
