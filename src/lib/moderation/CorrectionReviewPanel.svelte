<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

  import { Button, Field, Input, Notice, Select, Textarea } from '@hundavaent/design-system';
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    localizeAccessArea,
    localizeFlagTarget,
    localizePermission,
    localizeReportReason,
    localizeRestraint,
    localizeStoredPlaceCategory
  } from '$i18n/structured-place';
  import type {
    AccessConditionValue,
    FlagEvidence,
    PlaceFieldValue,
    PlaceSnapshotValue
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
  // A place-level Report addresses neither a field nor a Condition, so the detail read has no live
  // value to compare and always returns null. Reading that as drift would put a permanent warning
  // on every whole-place Report and say nothing true about the Place.
  const hasLiveDrift = $derived(
    data.flag.targetKind !== 'place' &&
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

  const effectiveProposedValue = $derived.by(() => {
    const application = data.flag.draftPayload?.application_payload;
    if (!application) return data.flag.proposedValue;
    return data.flag.targetKind === 'place_field'
      ? (application.field_value ?? data.flag.proposedValue)
      : (application.replacement_condition ?? data.flag.proposedValue);
  });

  /**
   * The omitted-locale hatch: a Member who speaks one language names the other instead of guessing
   * it, and the database accepts that claim so it is never lost. Applying it would publish a
   * half-translated Place, so this panel is what stops it, exactly as the Suggestion panel stops a
   * half-translated Suggestion.
   *
   * The test is "is a locale actually missing", not "is a flag present". The flag says which locale
   * the Member could not write; only the value says whether anyone has written it since. Reading the
   * effective value is what lets a Moderator fill the gap in the application draft and then apply,
   * without a round trip through the Member.
   */
  const translationBlocked = $derived(
    isLocalizedField(data.flag.targetField) && missingLocale(effectiveProposedValue) !== null
  );

  function isLocalizedField(field: string | null): boolean {
    return data.flag.targetKind === 'place_field' && (field === 'name' || field === 'description');
  }

  function missingLocale(value: unknown): 'is' | 'en' | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const localized = value as PlaceFieldValue;
    if (!localized.is?.trim()) return 'is';
    return localized.en?.trim() ? null : 'en';
  }

  const attentionIssues = $derived.by(() => {
    const issues: ModerationReviewIssue[] = [];
    if (translationBlocked) {
      issues.push({
        sectionId: 'correction-change',
        label: data.copy['flag.translationNeeded'],
        severity: 'blocking'
      });
    }
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
  const readinessState = $derived(
    translationBlocked ? 'blocked' : attentionIssues.length ? 'attention' : 'ready'
  );
  const readinessLabel = $derived(
    translationBlocked
      ? data.copy['moderation.workbench.readiness.blocked']
      : attentionIssues.length
        ? data.copy['moderation.workbench.readiness.attention']
        : data.copy['moderation.workbench.readiness.ready']
  );
  const readinessSummary = $derived(
    translationBlocked
      ? data.copy['flag.reviewBlockedSummary']
      : attentionIssues.length
        ? data.copy['flag.reviewAttentionSummary']
        : data.copy['flag.reviewReadySummary']
  );

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
    // The flagged locale prefills empty rather than with a neighbouring language's text. A prefilled
    // box invites a Moderator to accept a value nobody wrote; an empty required box asks for the
    // one thing that is actually missing.
    fieldValueIs = value.needs_review === 'is' ? '' : (value.is ?? '');
    fieldValueEn = value.needs_review === 'en' ? '' : (value.en ?? '');
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
    return localizeFlagTarget(data.flag.targetKind, data.flag.targetField, data.copy);
  }

  /**
   * The place snapshot has no key in common with either of the other two snapshot shapes, so it is
   * read structurally rather than by trusting `targetKind` alone: a row that says `place` but
   * carries something else renders nothing rather than half a Place.
   */
  function placeSnapshot(value: unknown): PlaceSnapshotValue | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const name = record.name;
    if (typeof name !== 'object' || name === null) return null;
    const localized = name as Record<string, unknown>;
    if (typeof localized.is !== 'string' || typeof localized.en !== 'string') return null;
    if (typeof record.category !== 'string' || typeof record.locality !== 'string') return null;
    return {
      name: { is: localized.is, en: localized.en },
      category: record.category,
      locality: record.locality
    };
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

<div
  class="review-shell grid min-w-0 gap-[0.9rem] data-[standalone=true]:mx-auto data-[standalone=true]:my-8 data-[standalone=true]:w-[min(100%_-_2rem,64rem)] max-[44rem]:data-[standalone=true]:my-2 max-[44rem]:data-[standalone=true]:w-[min(100%_-_1rem,64rem)]"
  class:standalone
  data-standalone={standalone}
>
  {#if standalone}
    <header class="grid gap-[0.55rem]">
      <p class="eyebrow m-0 text-[0.72rem] font-extrabold tracking-[0.08em] uppercase text-fjord">
        {data.copy[kindKey(data.flag.kind)]} · {target()}
      </p>
      <h1 class="m-0 font-display text-[clamp(2rem,6vw,4rem)] leading-none">
        {data.lang === 'is' ? data.flag.placeNameIs : data.flag.placeNameEn}
      </h1>
    </header>
  {/if}

  <p class="summary flex flex-wrap items-center m-0 gap-[0.35rem] text-[0.82rem] text-basalt-muted">
    {data.copy[statusKey(data.flag.outcome)]}
    {#if data.flag.isSafetyConcern}<span
        class="safety py-[0.2rem] px-[0.45rem] rounded-control bg-danger-soft font-extrabold text-danger"
        >{data.copy['flag.safetyConcernBadge']}</span
      >{/if}
    {#if data.flag.reportReason}
      · {localizeReportReason(data.flag.reportReason, data.copy)}{/if}
  </p>
  {#if errorMessage}<Notice as="p" tone="error" role="alert">{errorMessage}</Notice>{/if}
  {#if data.resolved}<Notice as="p" tone="success" role="status"
      >{data.copy['flag.resolved']}</Notice
    >{/if}
  {#if data.trustedVerification}
    <aside
      class="trusted-context flex flex-wrap items-baseline gap-x-[0.7rem] gap-y-[0.35rem] py-3 px-[0.85rem] border-l-[0.3rem] border-l-moss bg-[color-mix(in_srgb,var(--hv-color-moss)_9%,var(--hv-color-snow-raised))] data-[outcome=superseded]:border-l-basalt-muted"
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

  <h2 class="readiness-title m-0 text-[1rem]">{data.copy['flag.reviewSummary']}</h2>
  <ModerationReadinessSummary
    label={data.copy['flag.reviewSummary']}
    state={readinessState}
    stateLabel={readinessLabel}
    summary={readinessSummary}
    issues={attentionIssues}
  />

  {#if standalone && showDecision}
    <div class="standalone-actions sticky z-5 top-[var(--hv-app-header-height,0)]">
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
          acceptDisabled={translationBlocked}
          ondecide={beginDecision}
        />
      </ModerationActionBar>
    </div>
  {/if}

  <div class="review-sections grid gap-[0.65rem]">
    <!-- The section state is blocking only. Live drift stays a readiness warning that leaves this
         section collapsed, because drift is something to notice; a missing locale is something the
         Moderator has to type in here, so the section opens itself. -->
    <ModerationReviewSection
      id="correction-change"
      title={data.copy['flag.section.change']}
      summary={target()}
      state={translationBlocked ? 'blocking' : 'complete'}
    >
      {#if editingSection === 'application'}
        <form
          class="section-form grid grid-cols-2 mt-[0.6rem] gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
          data-section-form="application"
          method="POST"
          action="?/saveCorrectionSection"
          use:enhance={enhanceSection('application')}
        >
          {@render commonSectionInputs('application')}
          <input type="hidden" name="expectedVersion" value={data.flag.currentPlaceVersion ?? ''} />
          {#if data.flag.targetKind === 'place_field' && data.flag.targetField}
            {#if data.flag.targetField === 'name' || data.flag.targetField === 'description'}
              <Field label={data.copy['correction.nameIs']} class="compact-field">
                <Input name="fieldValueIs" required bind:value={fieldValueIs} />
              </Field>
              <Field label={data.copy['correction.nameEn']} class="compact-field">
                <Input name="fieldValueEn" required bind:value={fieldValueEn} />
              </Field>
            {:else if data.flag.targetField === 'opening_hours'}
              <Field label={data.copy['correction.openingHoursJson']} class="compact-field wide">
                <Textarea name="fieldValueJson" required rows={5} bind:value={fieldValueJson} />
              </Field>
            {:else if data.flag.targetField === 'dog_amenities'}
              <Field label={data.copy['correction.dogAmenitiesList']} class="compact-field wide">
                <Input name="fieldValueList" bind:value={fieldValueList} />
              </Field>
            {:else if data.flag.targetField === 'wheelchair_accessibility'}
              <Field
                label={data.copy['moderation.wheelchairAccessibilityLabel']}
                class="compact-field wide"
              >
                <Select name="fieldValueText" bind:value={fieldValueText}>
                  <!-- The apply path accepts the three definite states only; the explicit-unknown
                       state stays with the Moderator's own wheelchair command. -->
                  <option value="accessible"
                    >{data.copy['wheelchairAccessibility.accessible']}</option
                  >
                  <option value="partially_accessible"
                    >{data.copy['wheelchairAccessibility.partiallyAccessible']}</option
                  >
                  <option value="not_accessible"
                    >{data.copy['wheelchairAccessibility.notAccessible']}</option
                  >
                </Select>
              </Field>
            {:else}
              <Field label={data.copy['flag.newFieldValue']} class="compact-field wide">
                <Input
                  name="fieldValueText"
                  type={data.flag.targetField === 'website_url' ? 'url' : 'text'}
                  bind:value={fieldValueText}
                />
              </Field>
            {/if}
          {:else}
            <input
              type="hidden"
              name="expectedVerificationId"
              value={data.flag.currentVerificationId ?? ''}
            />
            <SuggestionAccessConditionEditor copy={data.copy} bind:value={applicationCondition} />
            <div
              class="date-grid grid grid-cols-2 col-span-full gap-[0.55rem] max-[44rem]:grid-cols-[1fr] max-[44rem]:col-auto"
            >
              <Field label={data.copy['flag.verifiedAt']} class="compact-field">
                <Input name="verifiedAt" type="datetime-local" required bind:value={verifiedAt} />
              </Field>
              <Field label={data.copy['flag.freshnessUntil']} class="compact-field">
                <Input
                  name="freshnessUntil"
                  type="datetime-local"
                  required
                  bind:value={freshnessUntil}
                />
              </Field>
            </div>
            <fieldset
              class="wide col-span-full min-w-0 m-0 p-[0.65rem] border border-border-subtle rounded-control max-[44rem]:col-auto"
            >
              <legend class="font-extrabold">{data.copy['evidenceField.section']}</legend
              ><SuggestionEvidenceEditor
                copy={data.copy}
                bind:value={applicationEvidence}
                showExplanation={false}
              />
            </fieldset>
          {/if}
          {@render sectionActions('application')}
        </form>
      {:else if data.flag.targetKind === 'place'}
        <!-- The whole Place has no before-and-after pair to lay out: nothing is proposed, and there
             is no live value to drift from. What a Moderator needs is what identified the Place at
             the moment the claim was raised, in case it has been renamed or recategorized since. -->
        {@const snapshot = placeSnapshot(data.flag.currentValueSnapshot)}
        {#if snapshot}
          <dl class="place-snapshot grid m-0 gap-[0.55rem]" data-place-snapshot>
            <div
              class="grid grid-cols-[minmax(8rem,0.35fr)_1fr] min-w-0 gap-4 max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="text-[0.72rem] font-extrabold text-basalt-muted">
                {data.copy['flag.placeSnapshot']}
              </dt>
              <dd class="m-0 wrap-anywhere">{snapshot.name.is} / {snapshot.name.en}</dd>
            </div>
            <div
              class="grid grid-cols-[minmax(8rem,0.35fr)_1fr] min-w-0 gap-4 max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="text-[0.72rem] font-extrabold text-basalt-muted">
                {data.copy['suggestion.category']}
              </dt>
              <dd class="m-0 wrap-anywhere">
                {localizeStoredPlaceCategory(snapshot.category, data.copy)}
              </dd>
            </div>
            <div
              class="grid grid-cols-[minmax(8rem,0.35fr)_1fr] min-w-0 gap-4 max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="text-[0.72rem] font-extrabold text-basalt-muted">
                {data.copy['moderation.localityLabel']}
              </dt>
              <dd class="m-0 wrap-anywhere">{snapshot.locality}</dd>
            </div>
          </dl>
        {:else}
          <p class="m-0">{describeValue(data.flag.currentValueSnapshot)}</p>
        {/if}
      {:else}
        <div class="diff-grid grid grid-cols-3 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]">
          <article
            class="grid gap-[0.4rem] p-[0.65rem] border border-border-subtle rounded-control"
          >
            <span class="text-[0.72rem] font-extrabold text-basalt-muted"
              >{data.copy['flag.currentLiveValue']}</span
            ><strong class="wrap-anywhere">{describeValue(data.flag.currentLiveValue)}</strong>
          </article>
          <article
            class="grid gap-[0.4rem] p-[0.65rem] border border-border-subtle rounded-control"
          >
            <span class="text-[0.72rem] font-extrabold text-basalt-muted"
              >{data.copy['flag.currentValueSnapshot']}</span
            ><strong class="wrap-anywhere">{describeValue(data.flag.currentValueSnapshot)}</strong>
          </article>
          <article
            class="grid gap-[0.4rem] p-[0.65rem] border border-border-subtle rounded-control"
          >
            <span class="text-[0.72rem] font-extrabold text-basalt-muted"
              >{data.copy['flag.proposedValueLabel']}</span
            ><strong class="wrap-anywhere">{describeValue(effectiveProposedValue)}</strong>
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
      <div class="evidence-grid grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]">
        <article class="grid gap-[0.4rem] p-[0.65rem] border border-border-subtle rounded-control">
          <h3 class="m-0">{data.copy['evidenceField.section']}</h3>
          <p class="m-0">
            <strong class="wrap-anywhere">{data.flag.evidence.source_label}</strong>
          </p>
          <p class="m-0">{data.flag.evidence.source_url ?? data.flag.evidence.source_citation}</p>
          <time datetime={data.flag.evidence.observed_at}>{data.flag.evidence.observed_at}</time>
          <p class="m-0">{data.flag.explanation}</p>
          {#if data.flag.privateNote}<p
              class="previous-note m-0 pl-[0.55rem] border-l-[0.25rem] border-l-signal"
            >
              <strong class="wrap-anywhere">{data.copy['flag.previousPrivateNote']}</strong>
              {data.flag.privateNote}
            </p>{/if}
        </article>
        <article class="grid gap-[0.4rem] p-[0.65rem] border border-border-subtle rounded-control">
          <h3 class="m-0">{data.copy['flag.currentVerification.section']}</h3>
          {#if data.flag.currentVerificationId}<p class="m-0">
              {data.copy['flag.currentVerification.status']}: {data.flag.currentVerificationStatus}
            </p>
            <p class="m-0">
              {data.copy['flag.currentVerification.verifiedAt']}: {data.flag
                .currentVerificationVerifiedAt}
            </p>
            <p class="m-0">
              {data.copy['flag.currentVerification.freshnessUntil']}: {data.flag
                .currentVerificationFreshnessUntil}
            </p>
            {#if data.flag.currentVerificationEvidence}<ul
                class="grid m-0 gap-[0.45rem] p-0 list-none"
              >
                {#each data.flag.currentVerificationEvidence as evidence (`${evidence.kind}-${evidence.sourceLabel}-${evidence.observedAt}`)}<li
                    class="grid gap-[0.2rem]"
                  >
                    {evidence.kind} · {evidence.sourceLabel} · {evidence.observedAt}
                  </li>{/each}
              </ul>{/if}{:else}<p class="m-0">
              {data.copy['flag.currentVerification.none']}
            </p>{/if}
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
      {#if data.related.length}<ul class="grid m-0 gap-[0.45rem] p-0 list-none">
          {#each data.related as related (related.flagId)}<li class="grid gap-[0.2rem]">
              <strong>{data.copy[kindKey(related.kind)]}</strong><span
                >{data.copy[statusKey(related.outcome)]} · {related.submittedAt}</span
              >
            </li>{/each}
        </ul>{:else}<p class="m-0">{data.copy['flag.noRelatedClaims']}</p>{/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="correction-alternatives"
      title={data.copy['flag.section.alternatives']}
      summary={data.flag.targetKind === 'access_condition'
        ? `${data.copy['flag.section.openDispute']} · ${data.copy['flag.section.inactivate']}`
        : data.copy['flag.section.inactivate']}
    >
      {#if data.flag.targetKind === 'access_condition'}
        <section
          class="alternative grid gap-[0.4rem] p-[0.65rem] border border-border-subtle rounded-control"
        >
          <h3 class="m-0">{data.copy['flag.section.openDispute']}</h3>
          {#if editingSection === 'dispute'}<form
              class="section-form grid grid-cols-2 mt-[0.6rem] gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
              data-section-form="dispute"
              method="POST"
              action="?/saveCorrectionSection"
              use:enhance={enhanceSection('dispute')}
            >
              {@render commonSectionInputs('dispute')}<input
                type="hidden"
                name="expectedVerificationId"
                value={data.flag.currentVerificationId ?? ''}
              />
              <Field label={data.copy['flag.disputeReason']} class="compact-field wide">
                <Textarea name="disputeReason" required rows={3} bind:value={disputeReason} />
              </Field>
              <fieldset
                class="wide col-span-full min-w-0 m-0 p-[0.65rem] border border-border-subtle rounded-control max-[44rem]:col-auto"
              >
                <legend class="font-extrabold">{data.copy['evidenceField.section']}</legend
                ><SuggestionEvidenceEditor
                  copy={data.copy}
                  bind:value={disputeEvidence}
                  showExplanation={false}
                />
              </fieldset>
              {@render sectionActions('dispute')}
            </form>{:else}<p class="m-0">{data.copy['flag.disputeBody']}</p>
            {@render editButton('dispute', data.copy['flag.section.openDispute'])}{/if}
        </section>
      {/if}
      <section
        class="alternative grid gap-[0.4rem] p-[0.65rem] border border-border-subtle rounded-control"
      >
        <h3 class="m-0">{data.copy['flag.section.inactivate']}</h3>
        {#if editingSection === 'transition'}<form
            class="section-form grid grid-cols-2 mt-[0.6rem] gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
            data-section-form="transition"
            method="POST"
            action="?/saveCorrectionSection"
            use:enhance={enhanceSection('transition')}
          >
            {@render commonSectionInputs('transition')}<input
              type="hidden"
              name="expectedVersion"
              value={data.flag.currentPlaceVersion ?? ''}
            />
            <Field label={data.copy['flag.decisionNotes']} class="compact-field wide">
              <Textarea name="decisionNotes" required rows={3} bind:value={decisionNotes} />
            </Field>
            {@render sectionActions('transition')}
          </form>{:else}<p class="m-0">{data.copy['flag.inactivateBody']}</p>
          {@render editButton('transition', data.copy['flag.section.inactivate'])}{/if}
      </section>
    </ModerationReviewSection>
  </div>

  {#if showDecision}
    <form
      id="correction-decision"
      class="decision-form hidden"
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
      <Notice as="p" tone="success" role="status">{data.copy['flag.contributionConfirmed']}</Notice>
    {:else if data.flag.contributionId}<Notice as="p" tone="success">
        {data.copy['flag.contributionAlreadyConfirmed']}
      </Notice>{:else if !data.flag.contributionId}<form
        method="POST"
        action="?/confirmUseful"
        use:enhance={enhanceForm}
      >
        <input type="hidden" name="flagId" value={data.flag.flagId} /><Button
          type="submit"
          intent="committed"
          disabled={submitting}>{data.copy['flag.confirmUseful']}</Button
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
  <div
    class="section-form-actions flex justify-end col-span-full min-w-0 gap-2 max-[44rem]:col-auto"
  >
    <Button type="button" intent="neutral" onclick={() => (editingSection = null)}
      >{data.copy['common.cancel']}</Button
    ><Button type="submit" intent="committed" disabled={savingSection === sectionId}
      >{savingSection === sectionId
        ? data.copy['moderation.workbench.section.saving']
        : data.copy['common.save']}</Button
    >
  </div>
{/snippet}

{#snippet editButton(sectionId: EditableSectionId, title: string)}
  <Button
    type="button"
    intent="neutral"
    class="edit-section"
    disabled={trustedVerificationSuperseded}
    aria-label={data.copy['moderation.workbench.editSection'].replace('{section}', title)}
    onclick={() => beginEditing(sectionId)}
    >{data.copy['moderation.workbench.editSection'].replace('{section}', title)}</Button
  >
{/snippet}

<style>
  .section-form > :global(*),
  .review-shell :global(.wide) {
    min-width: 0;
  }
  .section-form > :global(.field-grid),
  .review-shell :global(.wide) {
    grid-column: 1 / -1;
  }
  /* Field renders its own label/control stack inside a child component, so scoped CSS cannot
     reach the label directly - the whole remaining chain after .compact-field is wrapped in one
     :global() (the SelectedPlaceCard ".card-body :global(.details-status p)" precedent), rather
     than just the class, because a bare `label` tag selector after a partial :global() would
     still be scope-hashed and fail to match. This preserves the original muted/reduced-size
     label treatment Field's own docs invite a call site to keep via a scoped hook; Input/Select/
     Textarea now own the field's border/radius/surface/focus ring. .wide above is also
     :global()-anchored because it now lands both on plain locally-authored elements (the evidence
     fieldsets) and on Field's own child-component-rendered wrapper - :global() matches either. */
  .review-shell :global(.compact-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  /* Button renders its own <button> inside a child component, so scoped CSS cannot reach it
     directly - .edit-section is guaranteed to land on that rendered element because we pass it
     through Button's class prop ourselves (the FavouriteControl precedent). Button's neutral
     intent now owns the background/weight/min-height (the old bespoke 2.55rem/900 pair is
     retired); only the leftover margin placement survives here. */
  .review-shell :global(.edit-section) {
    margin-top: 0.55rem;
    margin-left: auto;
  }
  @media (max-width: 44rem) {
    .section-form > :global(.field-grid),
    .review-shell :global(.wide) {
      grid-column: auto;
    }
  }
</style>
