<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    localizeAccessArea,
    localizePermission,
    localizePlaceField,
    localizeReportReason,
    localizeRestraint
  } from '$i18n/structured-place';
  import type {
    AccessConditionValue,
    FlagEvidence,
    PlaceFieldValue
  } from '$server/place-flags/place-flag-input';
  import type {
    ModerationPlaceFlag,
    PlaceFlagOutcome,
    RelatedPlaceFlag
  } from '$server/place-flags/place-flags';
  import type { ModerationTrustedVerificationContext } from '$server/trusted-verification/trusted-verification';
  import type { SuggestionProposal } from '$server/suggestions/suggestion-input';
  import CorrectionDecisionControls from './CorrectionDecisionControls.svelte';
  import ModerationActionBar from './ModerationActionBar.svelte';
  import ModerationConfirmDialog from './ModerationConfirmDialog.svelte';
  import ModerationReadinessSummary from './ModerationReadinessSummary.svelte';
  import ModerationReasonDialog, {
    type ModerationReasonValue
  } from './ModerationReasonDialog.svelte';
  import ModerationReviewSection from './ModerationReviewSection.svelte';
  import SuggestionAccessConditionEditor from './SuggestionAccessConditionEditor.svelte';
  import SuggestionEvidenceEditor from './SuggestionEvidenceEditor.svelte';
  import type { ModerationReviewIssue } from './types';

  interface CorrectionReviewData {
    lang: Locale;
    copy: Catalogue;
    flag: ModerationPlaceFlag;
    related: RelatedPlaceFlag[];
    trustedVerification?: ModerationTrustedVerificationContext | null;
    resolved: boolean;
    contributionConfirmed: boolean;
  }

  interface CorrectionReviewForm {
    error?: string;
  }

  interface Props {
    data: CorrectionReviewData;
    form?: CorrectionReviewForm | null;
    standalone?: boolean;
    decisionRequest?: {
      outcome: Exclude<PlaceFlagOutcome, 'submitted'>;
      token: number;
    } | null;
    oneditstatechange?: (editing: boolean) => void;
  }

  type EditableSectionId = 'application' | 'dispute' | 'transition';
  type DecisionOutcome = Exclude<PlaceFlagOutcome, 'submitted'>;

  let {
    data,
    form = null,
    standalone = false,
    decisionRequest = null,
    oneditstatechange
  }: Props = $props();
  const isOpen = $derived(
    data.flag.outcome === 'submitted' || data.flag.outcome === 'needs_information'
  );
  const trustedVerificationSuperseded = $derived(
    data.trustedVerification?.outcome === 'superseded'
  );
  const showDecision = $derived(isOpen && !trustedVerificationSuperseded);
  const hasLiveDrift = $derived(
    JSON.stringify(data.flag.currentLiveValue) !== JSON.stringify(data.flag.currentValueSnapshot)
  );

  let submitting = $state(false);
  let savingSection = $state<EditableSectionId | null>(null);
  let editingSection = $state<EditableSectionId | null>(null);
  let pendingDecision = $state<DecisionOutcome | null>(null);
  let handledDecisionToken = $state<number | null>(null);
  let memberReasonIs = $state('');
  let memberReasonEn = $state('');
  let privateNote = $state('');

  let fieldValueIs = $state('');
  let fieldValueEn = $state('');
  let fieldValueText = $state('');
  let fieldValueJson = $state('{}');
  let fieldValueList = $state('');
  let applicationCondition = $state<SuggestionProposal['access_condition']>(emptyCondition());
  let applicationEvidence = $state<SuggestionProposal['evidence']>(emptyEvidence());
  let verifiedAt = $state('');
  let freshnessUntil = $state('');
  let disputeReason = $state('');
  let disputeEvidence = $state<SuggestionProposal['evidence']>(emptyEvidence());
  let decisionNotes = $state('');

  const attentionIssues = $derived.by(() => {
    const issues: ModerationReviewIssue[] = [];
    if (data.flag.isSafetyConcern) {
      issues.push({
        sectionId: 'correction-evidence',
        label: data.copy['flag.safetyConcernBadge'],
        severity: 'warning'
      });
    }
    if (hasLiveDrift) {
      issues.push({
        sectionId: 'correction-change',
        label: data.copy['flag.currentLiveValue'],
        severity: 'warning'
      });
    }
    if (data.related.length > 0) {
      issues.push({
        sectionId: 'correction-related',
        label: data.copy['flag.section.related'],
        severity: 'warning'
      });
    }
    return issues;
  });
  const readinessState = $derived(attentionIssues.length ? 'attention' : 'ready');
  const readinessLabel = $derived(
    attentionIssues.length
      ? data.copy['moderation.workbench.readiness.attention']
      : data.copy['moderation.workbench.readiness.ready']
  );
  const readinessSummary = $derived(
    attentionIssues.length
      ? data.copy['flag.reviewAttentionSummary']
      : data.copy['flag.reviewReadySummary']
  );
  const effectiveProposedValue = $derived.by(() => {
    const application = data.flag.draftPayload?.application_payload;
    if (!application) return data.flag.proposedValue;
    return data.flag.targetKind === 'place_field'
      ? (application.field_value ?? data.flag.proposedValue)
      : (application.replacement_condition ?? data.flag.proposedValue);
  });

  $effect(() => {
    if (decisionRequest && decisionRequest.token !== handledDecisionToken) {
      handledDecisionToken = decisionRequest.token;
      beginDecision(decisionRequest.outcome);
    }
  });

  $effect(() => {
    oneditstatechange?.(editingSection !== null);
    return () => oneditstatechange?.(false);
  });

  const enhanceForm: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  function enhanceSection(sectionId: EditableSectionId): SubmitFunction {
    return () => {
      savingSection = sectionId;
      return async ({ result, update }) => {
        await update();
        savingSection = null;
        if (result.type === 'success' || result.type === 'redirect') editingSection = null;
      };
    };
  }

  function beginEditing(sectionId: EditableSectionId): void {
    if (trustedVerificationSuperseded) return;
    const draft = data.flag.draftPayload;
    if (sectionId === 'application') {
      const application = draft?.application_payload ?? null;
      if (data.flag.targetKind === 'place_field') {
        initializeFieldValue(
          ((application?.field_value as PlaceFieldValue | undefined) ??
            (data.flag.proposedValue as PlaceFieldValue | null)) ||
            {}
        );
      } else {
        applicationCondition = normalizeCondition(
          (application?.replacement_condition as AccessConditionValue | undefined) ??
            (data.flag.proposedValue as AccessConditionValue | null) ??
            (data.flag.currentLiveValue as AccessConditionValue | null)
        );
        applicationEvidence = toEditableEvidence(
          (application?.evidence as FlagEvidence | undefined) ?? data.flag.evidence
        );
        verifiedAt = toLocal(
          String(
            application?.verified_at ??
              data.flag.currentVerificationVerifiedAt ??
              new Date().toISOString()
          )
        );
        freshnessUntil = toLocal(
          String(
            application?.freshness_until ??
              data.flag.currentVerificationFreshnessUntil ??
              new Date(Date.now() + 31_536_000_000).toISOString()
          )
        );
      }
    } else if (sectionId === 'dispute') {
      const dispute = draft?.dispute_command ?? null;
      disputeReason = String(dispute?.reason ?? data.flag.explanation);
      disputeEvidence = toEditableEvidence(
        (dispute?.evidence as FlagEvidence | undefined) ?? data.flag.evidence
      );
    } else {
      const transition = draft?.transition_command ?? null;
      decisionNotes = String(transition?.decision_notes ?? data.flag.explanation);
    }
    editingSection = sectionId;
  }

  function initializeFieldValue(value: PlaceFieldValue): void {
    fieldValueIs = value.is ?? '';
    fieldValueEn = value.en ?? '';
    const inner = value.value;
    fieldValueText = typeof inner === 'string' ? inner : '';
    fieldValueJson =
      typeof inner === 'object' && inner !== null && !Array.isArray(inner)
        ? JSON.stringify(inner, null, 2)
        : '{}';
    fieldValueList = Array.isArray(inner) ? inner.join(', ') : '';
  }

  function beginDecision(outcome: DecisionOutcome): void {
    if (!isOpen || editingSection !== null) return;
    memberReasonIs = '';
    memberReasonEn = '';
    privateNote = '';
    pendingDecision = outcome;
  }

  async function submitDecision(reasons?: ModerationReasonValue): Promise<void> {
    if (reasons) {
      memberReasonIs = reasons.memberReasonIs;
      memberReasonEn = reasons.memberReasonEn;
      privateNote = reasons.privateNote;
    }
    await tick();
    document.querySelector<HTMLFormElement>('#correction-decision')?.requestSubmit();
    pendingDecision = null;
  }

  function cancelDecision(): void {
    pendingDecision = null;
  }

  function primaryOutcome(): 'applied' | 'confirmed_useful' {
    return data.flag.kind === 'correction' ? 'applied' : 'confirmed_useful';
  }

  function statusKey(status: string): MessageKey {
    return `flag.status.${status}` as MessageKey;
  }

  function kindKey(kind: string): MessageKey {
    return `flag.kind.${kind}` as MessageKey;
  }

  function target(): string {
    return data.flag.targetKind === 'place_field' && data.flag.targetField
      ? localizePlaceField(data.flag.targetField, data.copy)
      : data.copy['correction.targetAccessCondition'];
  }

  function describeValue(value: unknown): string {
    if (value === null || value === undefined) return data.copy['common.notAvailable'];
    if (typeof value !== 'object') return String(value);
    const record = value as Record<string, unknown>;
    if ('is' in record || 'en' in record) return `${record.is ?? ''} / ${record.en ?? ''}`;
    if ('value' in record) {
      const inner = record.value;
      if (inner === null) return data.copy['common.notAvailable'];
      if (Array.isArray(inner)) return inner.join(', ') || data.copy['common.notAvailable'];
      if (typeof inner === 'object') return JSON.stringify(inner);
      return String(inner);
    }
    if ('access_area' in record) {
      return `${localizeAccessArea(record.access_area as never, data.copy)} · ${localizeRestraint(record.restraint_condition as never, data.copy)} · ${localizePermission(record.permission_requirement as never, data.copy)}`;
    }
    return JSON.stringify(value);
  }

  function normalizeCondition(
    value: AccessConditionValue | null
  ): SuggestionProposal['access_condition'] {
    if (!value) return emptyCondition();
    return {
      ...value,
      availability_state:
        value.availability_state ??
        (Object.keys(value.availability_window ?? {}).length ? 'limited' : 'not_stated'),
      availability_window: value.availability_window ?? {}
    };
  }

  function toEditableEvidence(value: FlagEvidence): SuggestionProposal['evidence'] {
    return { ...value, explanation: '' };
  }

  function emptyCondition(): SuggestionProposal['access_condition'] {
    return {
      access_area: 'outdoors',
      access_area_note: null,
      restraint_condition: 'leash_required',
      restraint_note: null,
      dog_eligibility: { scope: 'all_dogs' },
      availability_state: 'not_stated',
      availability_window: {},
      permission_requirement: 'standing_permission'
    };
  }

  function emptyEvidence(): SuggestionProposal['evidence'] {
    return {
      kind: 'member_report',
      source_url: null,
      source_citation: null,
      source_label: '',
      observed_at: '',
      explanation: '',
      source_metadata: {}
    };
  }

  function toLocal(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : '';
  }

  const errorMessage = $derived(
    form?.error === 'conflict'
      ? data.copy['flag.outcomeConflict']
      : form?.error === 'forbidden'
        ? data.copy['moderation.unauthorized']
        : form?.error === 'incomplete'
          ? data.copy['correction.incomplete']
          : form?.error
            ? data.copy['correction.invalid']
            : null
  );
</script>

<div class="review-shell" class:standalone>
  {#if standalone}
    <header>
      <p class="eyebrow">{data.copy[kindKey(data.flag.kind)]} · {target()}</p>
      <h1>{data.lang === 'is' ? data.flag.placeNameIs : data.flag.placeNameEn}</h1>
    </header>
  {/if}

  <p class="summary">
    {data.copy[statusKey(data.flag.outcome)]}
    {#if data.flag.isSafetyConcern}<span class="safety">{data.copy['flag.safetyConcernBadge']}</span
      >{/if}
    {#if data.flag.reportReason}
      · {localizeReportReason(data.flag.reportReason, data.copy)}{/if}
  </p>
  {#if errorMessage}<p class="message error" role="alert">{errorMessage}</p>{/if}
  {#if data.resolved}<p class="message success" role="status">{data.copy['flag.resolved']}</p>{/if}
  {#if data.trustedVerification}
    <aside
      class="trusted-context"
      data-outcome={data.trustedVerification.outcome}
      role={trustedVerificationSuperseded ? 'status' : undefined}
    >
      <strong>{data.copy['trustedVerification.moderation.heading']}</strong>
      <span>
        {data.trustedVerification.taskKind === 'access_freshness'
          ? data.copy['trustedVerification.kind.accessFreshness']
          : data.copy['trustedVerification.kind.dogAmenities']}
        ·
        {trustedVerificationSuperseded
          ? data.copy['trustedVerification.moderation.superseded']
          : data.copy['trustedVerification.moderation.submitted']}
      </span>
    </aside>
  {/if}

  <h2 class="readiness-title">{data.copy['flag.reviewSummary']}</h2>
  <ModerationReadinessSummary
    label={data.copy['flag.reviewSummary']}
    state={readinessState}
    stateLabel={readinessLabel}
    summary={readinessSummary}
    issues={attentionIssues}
  />

  {#if standalone && showDecision}
    <div class="standalone-actions">
      <ModerationActionBar
        label={data.copy['flag.resolve']}
        disabled={editingSection !== null}
        hint={editingSection !== null
          ? data.copy['moderation.workbench.unsavedDecisionHint']
          : null}
      >
        <CorrectionDecisionControls
          copy={data.copy}
          kind={data.flag.kind}
          targetKind={data.flag.targetKind}
          disabled={submitting || editingSection !== null}
          ondecide={beginDecision}
        />
      </ModerationActionBar>
    </div>
  {/if}

  <div class="review-sections">
    <ModerationReviewSection
      id="correction-change"
      title={data.copy['flag.section.change']}
      summary={target()}
    >
      {#if editingSection === 'application'}
        <form
          class="section-form"
          data-section-form="application"
          method="POST"
          action="?/saveCorrectionSection"
          use:enhance={enhanceSection('application')}
        >
          {@render commonSectionInputs('application')}
          <input type="hidden" name="expectedVersion" value={data.flag.currentPlaceVersion ?? ''} />
          {#if data.flag.targetKind === 'place_field' && data.flag.targetField}
            {#if data.flag.targetField === 'name' || data.flag.targetField === 'description'}
              <label
                >{data.copy['correction.nameIs']}<input
                  name="fieldValueIs"
                  required
                  bind:value={fieldValueIs}
                /></label
              >
              <label
                >{data.copy['correction.nameEn']}<input
                  name="fieldValueEn"
                  required
                  bind:value={fieldValueEn}
                /></label
              >
            {:else if data.flag.targetField === 'opening_hours'}
              <label class="wide"
                >{data.copy['correction.openingHoursJson']}<textarea
                  name="fieldValueJson"
                  required
                  rows="5"
                  bind:value={fieldValueJson}></textarea></label
              >
            {:else if data.flag.targetField === 'dog_amenities'}
              <label class="wide"
                >{data.copy['correction.dogAmenitiesList']}<input
                  name="fieldValueList"
                  bind:value={fieldValueList}
                /></label
              >
            {:else}
              <label class="wide"
                >{data.copy['flag.newFieldValue']}<input
                  name="fieldValueText"
                  type={data.flag.targetField === 'website_url' ? 'url' : 'text'}
                  bind:value={fieldValueText}
                /></label
              >
            {/if}
          {:else}
            <input
              type="hidden"
              name="expectedVerificationId"
              value={data.flag.currentVerificationId ?? ''}
            />
            <SuggestionAccessConditionEditor copy={data.copy} bind:value={applicationCondition} />
            <div class="date-grid">
              <label
                >{data.copy['flag.verifiedAt']}<input
                  name="verifiedAt"
                  type="datetime-local"
                  required
                  bind:value={verifiedAt}
                /></label
              ><label
                >{data.copy['flag.freshnessUntil']}<input
                  name="freshnessUntil"
                  type="datetime-local"
                  required
                  bind:value={freshnessUntil}
                /></label
              >
            </div>
            <fieldset class="wide">
              <legend>{data.copy['evidenceField.section']}</legend><SuggestionEvidenceEditor
                copy={data.copy}
                bind:value={applicationEvidence}
                showExplanation={false}
              />
            </fieldset>
          {/if}
          {@render sectionActions('application')}
        </form>
      {:else}
        <div class="diff-grid">
          <article>
            <span>{data.copy['flag.currentLiveValue']}</span><strong
              >{describeValue(data.flag.currentLiveValue)}</strong
            >
          </article>
          <article>
            <span>{data.copy['flag.currentValueSnapshot']}</span><strong
              >{describeValue(data.flag.currentValueSnapshot)}</strong
            >
          </article>
          <article>
            <span>{data.copy['flag.proposedValueLabel']}</span><strong
              >{describeValue(effectiveProposedValue)}</strong
            >
          </article>
        </div>
        {#if data.flag.kind === 'correction'}{@render editButton(
            'application',
            data.copy['flag.section.change']
          )}{/if}
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="correction-evidence"
      title={data.copy['flag.section.evidence']}
      summary={data.flag.evidence.source_label}
      state={data.flag.isSafetyConcern ? 'warning' : 'complete'}
    >
      <div class="evidence-grid">
        <article>
          <h3>{data.copy['evidenceField.section']}</h3>
          <p><strong>{data.flag.evidence.source_label}</strong></p>
          <p>{data.flag.evidence.source_url ?? data.flag.evidence.source_citation}</p>
          <time datetime={data.flag.evidence.observed_at}>{data.flag.evidence.observed_at}</time>
          <p>{data.flag.explanation}</p>
          {#if data.flag.privateNote}<p class="previous-note">
              <strong>{data.copy['flag.previousPrivateNote']}</strong>
              {data.flag.privateNote}
            </p>{/if}
        </article>
        <article>
          <h3>{data.copy['flag.currentVerification.section']}</h3>
          {#if data.flag.currentVerificationId}<p>
              {data.copy['flag.currentVerification.status']}: {data.flag.currentVerificationStatus}
            </p>
            <p>
              {data.copy['flag.currentVerification.verifiedAt']}: {data.flag
                .currentVerificationVerifiedAt}
            </p>
            <p>
              {data.copy['flag.currentVerification.freshnessUntil']}: {data.flag
                .currentVerificationFreshnessUntil}
            </p>
            {#if data.flag.currentVerificationEvidence}<ul>
                {#each data.flag.currentVerificationEvidence as evidence (`${evidence.kind}-${evidence.sourceLabel}-${evidence.observedAt}`)}<li
                  >
                    {evidence.kind} · {evidence.sourceLabel} · {evidence.observedAt}
                  </li>{/each}
              </ul>{/if}{:else}<p>{data.copy['flag.currentVerification.none']}</p>{/if}
        </article>
      </div>
    </ModerationReviewSection>

    <ModerationReviewSection
      id="correction-related"
      title={data.copy['flag.section.related']}
      summary={data.related.length
        ? String(data.related.length)
        : data.copy['flag.noRelatedClaims']}
      state={data.related.length ? 'warning' : 'complete'}
    >
      {#if data.related.length}<ul>
          {#each data.related as related (related.flagId)}<li>
              <strong>{data.copy[kindKey(related.kind)]}</strong><span
                >{data.copy[statusKey(related.outcome)]} · {related.submittedAt}</span
              >
            </li>{/each}
        </ul>{:else}<p>{data.copy['flag.noRelatedClaims']}</p>{/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="correction-alternatives"
      title={data.copy['flag.section.alternatives']}
      summary={data.flag.targetKind === 'access_condition'
        ? `${data.copy['flag.section.openDispute']} · ${data.copy['flag.section.inactivate']}`
        : data.copy['flag.section.inactivate']}
    >
      {#if data.flag.targetKind === 'access_condition'}
        <section class="alternative">
          <h3>{data.copy['flag.section.openDispute']}</h3>
          {#if editingSection === 'dispute'}<form
              class="section-form"
              data-section-form="dispute"
              method="POST"
              action="?/saveCorrectionSection"
              use:enhance={enhanceSection('dispute')}
            >
              {@render commonSectionInputs('dispute')}<input
                type="hidden"
                name="expectedVerificationId"
                value={data.flag.currentVerificationId ?? ''}
              /><label class="wide"
                >{data.copy['flag.disputeReason']}<textarea
                  name="disputeReason"
                  required
                  rows="3"
                  bind:value={disputeReason}></textarea></label
              >
              <fieldset class="wide">
                <legend>{data.copy['evidenceField.section']}</legend><SuggestionEvidenceEditor
                  copy={data.copy}
                  bind:value={disputeEvidence}
                  showExplanation={false}
                />
              </fieldset>
              {@render sectionActions('dispute')}
            </form>{:else}<p>{data.copy['flag.disputeBody']}</p>
            {@render editButton('dispute', data.copy['flag.section.openDispute'])}{/if}
        </section>
      {/if}
      <section class="alternative">
        <h3>{data.copy['flag.section.inactivate']}</h3>
        {#if editingSection === 'transition'}<form
            class="section-form"
            data-section-form="transition"
            method="POST"
            action="?/saveCorrectionSection"
            use:enhance={enhanceSection('transition')}
          >
            {@render commonSectionInputs('transition')}<input
              type="hidden"
              name="expectedVersion"
              value={data.flag.currentPlaceVersion ?? ''}
            /><label class="wide"
              >{data.copy['flag.decisionNotes']}<textarea
                name="decisionNotes"
                required
                rows="3"
                bind:value={decisionNotes}></textarea></label
            >{@render sectionActions('transition')}
          </form>{:else}<p>{data.copy['flag.inactivateBody']}</p>
          {@render editButton('transition', data.copy['flag.section.inactivate'])}{/if}
      </section>
    </ModerationReviewSection>
  </div>

  {#if showDecision}
    <form
      id="correction-decision"
      class="decision-form"
      method="POST"
      action="?/decideCorrection"
      use:enhance={enhanceForm}
    >
      <input type="hidden" name="flagId" value={data.flag.flagId} />
      <input type="hidden" name="expectedItemVersion" value={data.flag.itemVersion} />
      <input type="hidden" name="expectedDraftVersion" value={data.flag.draftVersion} />
      <input type="hidden" name="outcome" value={pendingDecision ?? ''} />
      <input type="hidden" name="memberReasonIs" value={memberReasonIs} />
      <input type="hidden" name="memberReasonEn" value={memberReasonEn} />
      <input type="hidden" name="privateNote" value={privateNote} />
    </form>
  {/if}

  <ModerationConfirmDialog
    open={pendingDecision === primaryOutcome()}
    title={data.flag.kind === 'correction'
      ? data.copy['flag.applyTitle']
      : data.copy['flag.confirmUsefulTitle']}
    description={data.flag.kind === 'correction'
      ? data.copy['flag.applyBody']
      : data.copy['flag.confirmUsefulBody']}
    confirmLabel={data.flag.kind === 'correction'
      ? data.copy['flag.action.apply']
      : data.copy['flag.action.confirmUseful']}
    cancelLabel={data.copy['moderation.workbench.keepReviewing']}
    onconfirm={() => submitDecision()}
    oncancel={cancelDecision}
  />

  {#if pendingDecision && pendingDecision !== primaryOutcome()}
    <ModerationReasonDialog
      open
      title={pendingDecision === 'needs_information'
        ? data.copy['flag.needsInformationTitle']
        : pendingDecision === 'dispute_opened'
          ? data.copy['flag.disputeTitle']
          : pendingDecision === 'place_inactivated'
            ? data.copy['flag.inactivateTitle']
            : data.copy['flag.rejectTitle']}
      description={pendingDecision === 'dispute_opened'
        ? data.copy['flag.disputeBody']
        : pendingDecision === 'place_inactivated'
          ? data.copy['flag.inactivateBody']
          : data.copy['moderation.workbench.decisionHelp']}
      confirmLabel={pendingDecision === 'needs_information'
        ? data.copy['moderation.workbench.needsInformation']
        : pendingDecision === 'dispute_opened'
          ? data.copy['flag.action.openDispute']
          : pendingDecision === 'place_inactivated'
            ? data.copy['flag.action.inactivate']
            : data.copy['moderation.workbench.reject']}
      cancelLabel={data.copy['moderation.workbench.keepReviewing']}
      reasonIsLabel={data.copy['flag.memberReasonIs']}
      reasonEnLabel={data.copy['flag.memberReasonEn']}
      privateNoteLabel={data.copy['flag.privateNote']}
      previousPrivateNoteLabel={data.copy['flag.previousPrivateNote']}
      previousPrivateNote={data.flag.privateNote}
      tone={pendingDecision === 'place_inactivated' || pendingDecision === 'rejected'
        ? 'danger'
        : 'primary'}
      {submitting}
      onconfirm={submitDecision}
      oncancel={cancelDecision}
    />
  {/if}

  {#if !trustedVerificationSuperseded && (data.flag.outcome === 'applied' || data.flag.outcome === 'confirmed_useful')}
    {#if data.contributionConfirmed}
      <p class="message success" role="status">{data.copy['flag.contributionConfirmed']}</p>
    {:else if data.flag.contributionId}<p class="message success">
        {data.copy['flag.contributionAlreadyConfirmed']}
      </p>{:else if !data.flag.contributionId}<form
        method="POST"
        action="?/confirmUseful"
        use:enhance={enhanceForm}
      >
        <input type="hidden" name="flagId" value={data.flag.flagId} /><button
          type="submit"
          disabled={submitting}>{data.copy['flag.confirmUseful']}</button
        >
      </form>{/if}
  {/if}
</div>

{#snippet commonSectionInputs(sectionId: EditableSectionId)}
  <input type="hidden" name="flagId" value={data.flag.flagId} />
  <input type="hidden" name="expectedItemVersion" value={data.flag.itemVersion} />
  <input type="hidden" name="expectedDraftVersion" value={data.flag.draftVersion} />
  <input type="hidden" name="sectionId" value={sectionId} />
{/snippet}

{#snippet sectionActions(sectionId: EditableSectionId)}
  <div class="section-form-actions">
    <button type="button" class="quiet" onclick={() => (editingSection = null)}
      >{data.copy['common.cancel']}</button
    ><button type="submit" disabled={savingSection === sectionId}
      >{savingSection === sectionId
        ? data.copy['moderation.workbench.section.saving']
        : data.copy['common.save']}</button
    >
  </div>
{/snippet}

{#snippet editButton(sectionId: EditableSectionId, title: string)}
  <button
    type="button"
    class="edit-section"
    disabled={trustedVerificationSuperseded}
    aria-label={data.copy['moderation.workbench.editSection'].replace('{section}', title)}
    onclick={() => beginEditing(sectionId)}
    >{data.copy['moderation.workbench.editSection'].replace('{section}', title)}</button
  >
{/snippet}

<style>
  .review-shell {
    display: grid;
    min-width: 0;
    gap: 0.9rem;
  }
  .review-shell.standalone {
    width: min(100% - 2rem, 64rem);
    margin: 2rem auto;
  }
  .trusted-context {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.7rem;
    align-items: baseline;
    border-left: 0.3rem solid var(--hv-color-moss);
    background: color-mix(in srgb, var(--hv-color-moss) 9%, var(--hv-color-snow-raised));
    padding: 0.75rem 0.85rem;
  }
  .trusted-context[data-outcome='superseded'] {
    border-left-color: var(--hv-color-basalt-muted);
  }
  header,
  .review-sections,
  .section-form,
  label {
    display: grid;
    gap: 0.55rem;
  }
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  h1 {
    font-family: var(--hv-font-display);
    font-size: clamp(2rem, 6vw, 4rem);
    line-height: 1;
  }
  .eyebrow {
    color: var(--hv-color-fjord);
    font-size: 0.72rem;
    font-weight: 950;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
  }
  .safety {
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-danger-soft);
    padding: 0.2rem 0.45rem;
    color: var(--hv-color-danger);
    font-weight: 900;
  }
  .readiness-title {
    font-size: 1rem;
  }
  .review-sections {
    gap: 0.65rem;
  }
  .standalone-actions {
    position: sticky;
    z-index: 5;
    top: var(--hv-app-header-height, 0);
  }
  .diff-grid,
  .evidence-grid,
  .date-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
  }
  .evidence-grid,
  .date-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  article,
  .alternative {
    display: grid;
    gap: 0.4rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.65rem;
  }
  article span {
    color: var(--hv-color-basalt-muted);
    font-size: 0.72rem;
    font-weight: 850;
  }
  article strong {
    overflow-wrap: anywhere;
  }
  .section-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 0.6rem;
  }
  .section-form > :global(*),
  .wide,
  .section-form-actions {
    min-width: 0;
  }
  .section-form > :global(.field-grid),
  .section-form > fieldset,
  .wide,
  .section-form-actions,
  .date-grid {
    grid-column: 1 / -1;
  }
  label {
    min-width: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  input,
  textarea,
  :global(select) {
    width: 100%;
    min-height: 2.5rem;
    box-sizing: border-box;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.5rem;
    color: var(--hv-color-basalt);
    font: inherit;
  }
  textarea {
    resize: vertical;
  }
  fieldset {
    min-width: 0;
    margin: 0;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.65rem;
  }
  legend {
    font-weight: 850;
  }
  .section-form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  button {
    min-height: 2.55rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal);
    padding: 0.5rem 0.75rem;
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 900;
  }
  button.quiet,
  .edit-section {
    width: fit-content;
    background: var(--hv-color-snow-raised);
  }
  .edit-section {
    margin-top: 0.55rem;
    margin-left: auto;
  }
  ul {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    gap: 0.2rem;
  }
  .previous-note {
    border-left: 0.25rem solid var(--hv-color-signal);
    padding-left: 0.55rem;
  }
  .message {
    border: 1px solid var(--hv-color-success);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-success-soft);
    padding: 0.65rem;
  }
  .message.error {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
  }
  .decision-form {
    display: none;
  }
  @media (max-width: 44rem) {
    .review-shell.standalone {
      width: min(100% - 1rem, 64rem);
      margin: 0.5rem auto;
    }
    .diff-grid,
    .evidence-grid,
    .date-grid,
    .section-form {
      grid-template-columns: 1fr;
    }
    .section-form > :global(.field-grid),
    .section-form > fieldset,
    .wide,
    .section-form-actions,
    .date-grid {
      grid-column: auto;
    }
  }
</style>
