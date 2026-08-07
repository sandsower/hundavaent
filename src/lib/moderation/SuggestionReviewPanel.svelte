<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

  import { Button, Field, Input, Notice, Select, Textarea } from '@hundavaent/design-system';
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    formatDogAmenities,
    formatOpeningHours,
    localizeAccessArea,
    localizeEvidenceKind,
    localizePermission,
    localizePlaceCategory,
    localizeRestraint
  } from '$i18n/structured-place';
  import type {
    ContributorEvidenceItem,
    ModerationContributorStatus
  } from '$server/contributors/contributor-status';
  import type { Json } from '$server/db/generated.types';
  import type { SuggestionProposal } from '$server/suggestions/suggestion-input';
  import type {
    ModerationSuggestion,
    SuggestionOutcome,
    SuggestionPlaceMatch
  } from '$server/suggestions/suggestions';
  import ModerationActionBar from './ModerationActionBar.svelte';
  import ModerationConfirmDialog from './ModerationConfirmDialog.svelte';
  import ModerationLocationEditor, {
    type ModerationLocationValue
  } from './ModerationLocationEditor.svelte';
  import ModerationReadinessSummary from './ModerationReadinessSummary.svelte';
  import ModerationReasonDialog, {
    type ModerationReasonValue
  } from './ModerationReasonDialog.svelte';
  import ModerationReviewSection from './ModerationReviewSection.svelte';
  import OpeningHoursEditor from './OpeningHoursEditor.svelte';
  import SuggestionAccessConditionEditor from './SuggestionAccessConditionEditor.svelte';
  import SuggestionDecisionControls from './SuggestionDecisionControls.svelte';
  import SuggestionEvidenceEditor from './SuggestionEvidenceEditor.svelte';
  import type { ModerationReviewIssue } from './types';

  interface SuggestionReviewData {
    lang: Locale;
    copy: Catalogue;
    suggestion: ModerationSuggestion;
    matches: SuggestionPlaceMatch[];
    resolved: boolean;
    contributionConfirmed: boolean;
    contributor?: ModerationContributorStatus | null;
    contributorEvidence?: ContributorEvidenceItem[];
    contributionRevoked?: boolean;
    conductFlagRecorded?: boolean;
    conductFlagCleared?: boolean;
    mapStyleUrl?: string | null;
  }

  interface SuggestionReviewForm {
    error?: string;
  }

  interface Props {
    data: SuggestionReviewData;
    form?: SuggestionReviewForm | null;
    standalone?: boolean;
    decisionRequest?: {
      outcome: Exclude<SuggestionOutcome, 'submitted'>;
      token: number;
    } | null;
    oneditstatechange?: (editing: boolean) => void;
  }

  type EditableSectionId =
    | 'identity'
    | 'location'
    | 'translations'
    | 'hours-and-amenities'
    | 'access-condition'
    | 'evidence';
  type DecisionOutcome = Exclude<SuggestionOutcome, 'submitted'>;
  type ContributorAction = 'record' | 'clear' | 'revoke' | null;

  let {
    data,
    form = null,
    standalone = false,
    decisionRequest = null,
    oneditstatechange
  }: Props = $props();
  const proposal = $derived(data.suggestion.effectiveProposal);
  const decisionStillActionable = $derived(
    data.suggestion.outcome === 'submitted' || data.suggestion.outcome === 'needs_information'
  );
  const contributorEvidence = $derived(data.contributorEvidence ?? []);
  const activeEvidenceFlagId = $derived(
    contributorEvidence.find((item) => item.flagActive)?.flagId ?? null
  );

  let submitting = $state(false);
  let savingSection = $state<EditableSectionId | null>(null);
  let editingSection = $state<EditableSectionId | null>(null);
  let pendingDecision = $state<DecisionOutcome | null>(null);
  let handledDecisionToken = $state<number | null>(null);
  let memberReasonIs = $state('');
  let memberReasonEn = $state('');
  let privateNote = $state('');
  let duplicatePlaceId = $state('');
  let operatorIdentityPlaceId = $state('new');
  let locationIdentityPlaceId = $state('new');
  let contributorAction = $state<ContributorAction>(null);
  let contributionToRevoke = $state('');

  let identityOperatorName = $state('');
  let identityCategory = $state<SuggestionProposal['category']>('other');
  let locationValue = $state<ModerationLocationValue>({
    addressLine: '',
    locality: '',
    postalCode: '',
    municipality: 'reykjavik',
    latitude: 64.1466,
    longitude: -21.9426,
    geometryPrecision: 'moderator_confirmed_point',
    geometrySource: 'Moderator-confirmed map point'
  });
  let translationNameIs = $state('');
  let translationDescriptionIs = $state('');
  let translationNameEn = $state('');
  let translationDescriptionEn = $state('');
  let detailsWebsiteUrl = $state('');
  let detailsPhone = $state('');
  let detailsOpeningHours = $state<Record<string, Json>>({});
  let detailsDogAmenities = $state<string[]>([]);
  let accessCondition = $state<SuggestionProposal['access_condition']>({
    access_area: 'outdoors',
    access_area_note: null,
    restraint_condition: 'leash_required',
    restraint_note: null,
    dog_eligibility: { scope: 'all_dogs' },
    availability_state: 'not_stated',
    availability_window: {},
    permission_requirement: 'standing_permission'
  });
  let evidence = $state<SuggestionProposal['evidence']>({
    kind: 'member_report',
    source_url: null,
    source_citation: null,
    source_label: '',
    observed_at: '',
    explanation: '',
    source_metadata: {}
  });

  const identityPayload = $derived(
    JSON.stringify({
      purpose: 'dog_access_destination',
      operator_name: identityOperatorName,
      category: identityCategory
    })
  );
  const locationPayload = $derived(
    JSON.stringify({
      location: {
        address_line: locationValue.addressLine,
        locality: locationValue.locality,
        postal_code: locationValue.postalCode,
        municipality: locationValue.municipality,
        latitude: Number(locationValue.latitude),
        longitude: Number(locationValue.longitude)
      }
    })
  );
  const translationsPayload = $derived(
    JSON.stringify({
      translations: {
        is: {
          name: translationNameIs,
          description: translationDescriptionIs,
          needs_review: false
        },
        en: {
          name: translationNameEn,
          description: translationDescriptionEn,
          needs_review: false
        }
      }
    })
  );
  const detailsPayload = $derived(
    JSON.stringify({
      website_url: detailsWebsiteUrl.trim() || null,
      phone: detailsPhone.trim() || null,
      opening_hours: detailsOpeningHours,
      dog_amenities: [...new Set(detailsDogAmenities.map((item) => item.trim()).filter(Boolean))]
    })
  );
  const accessPayload = $derived(JSON.stringify({ access_condition: accessCondition }));
  const evidencePayload = $derived(JSON.stringify({ evidence }));

  const translationBlocked = $derived(
    Boolean(proposal.translations.is.needs_review || proposal.translations.en.needs_review)
  );
  const readinessIssues = $derived.by(() => {
    const issues: ModerationReviewIssue[] = [];
    if (translationBlocked) {
      issues.push({
        sectionId: 'suggestion-translations',
        label: data.copy['suggestion.translationNeeded'],
        severity: 'blocking'
      });
    }
    if (data.matches.length > 0) {
      issues.push({
        sectionId: 'suggestion-matches',
        label: data.copy['suggestion.matches'],
        severity: 'warning'
      });
    }
    return issues;
  });
  const reviewState = $derived(
    translationBlocked ? 'blocked' : data.matches.length ? 'attention' : 'ready'
  );
  const reviewStateLabel = $derived(
    translationBlocked
      ? data.copy['moderation.workbench.readiness.blocked']
      : data.copy['moderation.workbench.readiness.ready']
  );
  const reviewSummary = $derived(
    translationBlocked
      ? data.copy['suggestion.reviewBlockedSummary'].replace('{count}', '1')
      : data.copy['suggestion.reviewReadySummary']
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
    if (sectionId === 'identity') {
      identityOperatorName = proposal.operator_name;
      identityCategory = proposal.category;
    } else if (sectionId === 'location') {
      locationValue = {
        addressLine: proposal.location.address_line,
        locality: proposal.location.locality,
        postalCode: proposal.location.postal_code,
        municipality: proposal.location.municipality,
        latitude: proposal.location.latitude,
        longitude: proposal.location.longitude,
        geometryPrecision: 'moderator_confirmed_point',
        geometrySource: 'Moderator-confirmed map point'
      };
    } else if (sectionId === 'translations') {
      // The name carries even under `needs_review`. A flagged translation means "nobody wrote
      // this in this language", which is true of the description and false of the name: the
      // Member typed one name and it is the same string in both locales. Blanking it made a
      // Moderator retype that one answer twice, and a typo in either copy silently parts the
      // Place from the `operator_name` the Member actually gave. The description stays blank,
      // because there is nothing there but the server's own sentence.
      translationNameIs = proposal.translations.is.name;
      translationDescriptionIs = proposal.translations.is.needs_review
        ? ''
        : proposal.translations.is.description;
      translationNameEn = proposal.translations.en.name;
      translationDescriptionEn = proposal.translations.en.needs_review
        ? ''
        : proposal.translations.en.description;
    } else if (sectionId === 'hours-and-amenities') {
      detailsWebsiteUrl = proposal.website_url ?? '';
      detailsPhone = proposal.phone ?? '';
      detailsOpeningHours = { ...proposal.opening_hours };
      detailsDogAmenities = [...proposal.dog_amenities];
    } else if (sectionId === 'access-condition') {
      accessCondition = structuredClone(proposal.access_condition);
    } else {
      evidence = structuredClone(proposal.evidence);
    }
    editingSection = sectionId;
  }

  function editLabel(title: string): string {
    return data.copy['moderation.workbench.editSection'].replace('{section}', title);
  }

  function saveLabel(sectionId: EditableSectionId): string {
    return savingSection === sectionId
      ? data.copy['moderation.workbench.section.saving']
      : data.copy['common.save'];
  }

  function lifecycleKey(lifecycle: string): MessageKey {
    return `suggestion.lifecycle.${lifecycle}` as MessageKey;
  }

  function flagKindKey(kind: string): MessageKey {
    return `contributor.moderation.flagKind.${kind}` as MessageKey;
  }

  function beginDecision(outcome: DecisionOutcome): void {
    if (!decisionStillActionable || editingSection !== null) return;
    memberReasonIs = '';
    memberReasonEn = '';
    privateNote = '';
    if (outcome !== 'duplicate') duplicatePlaceId = '';
    pendingDecision = outcome;
  }

  function cancelDecision(): void {
    pendingDecision = null;
  }

  async function submitDecision(reasons?: ModerationReasonValue): Promise<void> {
    if (reasons) {
      memberReasonIs = reasons.memberReasonIs;
      memberReasonEn = reasons.memberReasonEn;
      privateNote = reasons.privateNote;
    }
    await tick();
    document.querySelector<HTMLFormElement>('#suggestion-decision')?.requestSubmit();
    pendingDecision = null;
  }

  function removeAmenity(index: number): void {
    detailsDogAmenities.splice(index, 1);
  }
</script>

<div
  class="review-panel grid min-w-0 gap-[0.9rem] data-[standalone=true]:mx-auto data-[standalone=true]:my-8 data-[standalone=true]:w-[min(100%_-_2rem,64rem)] max-[44rem]:data-[standalone=true]:my-2 max-[44rem]:data-[standalone=true]:w-[min(100%_-_1rem,64rem)]"
  class:standalone
  data-standalone={standalone}
>
  {#if standalone}
    <header class="grid gap-[0.55rem]">
      <p class="eyebrow m-0 text-[0.72rem] font-extrabold tracking-[0.08em] uppercase text-fjord">
        {data.copy['suggestion.review']}
      </p>
      <h1 class="m-0 font-display text-[clamp(2rem,6vw,4rem)] leading-none">
        {data.lang === 'is' ? data.suggestion.nameIs : data.suggestion.nameEn}
      </h1>
      <p class="m-0">
        {data.suggestion.operatorName} · {data.suggestion.addressLine}, {data.suggestion.locality}
      </p>
    </header>
  {/if}

  {#if form?.error}
    <Notice as="p" tone="error" role="alert">
      {form.error === 'conflict'
        ? data.copy['suggestion.outcomeConflict']
        : form.error === 'forbidden'
          ? data.copy['moderation.unauthorized']
          : data.copy['suggestion.invalid']}
    </Notice>
  {/if}
  {#if data.resolved}<Notice as="p" tone="success" role="status">
      {data.copy['suggestion.resolved']}
    </Notice>{/if}
  {#if data.contributionConfirmed}
    <Notice as="p" tone="success" role="status"
      >{data.copy['suggestion.contributionConfirmed']}</Notice
    >
  {/if}
  {#if data.contributionRevoked}
    <Notice as="p" tone="success" role="status"
      >{data.copy['contributor.moderation.revoked']}</Notice
    >
  {/if}

  <h2 class="readiness-title m-0 text-[1rem]">{data.copy['suggestion.reviewSummary']}</h2>
  <ModerationReadinessSummary
    label={data.copy['suggestion.reviewSummary']}
    state={reviewState}
    stateLabel={reviewStateLabel}
    summary={reviewSummary}
    issues={readinessIssues}
  />

  {#if standalone && decisionStillActionable}
    <div class="standalone-actions sticky z-5 top-[var(--hv-app-header-height,0)]">
      <ModerationActionBar
        label={data.copy['suggestion.resolve']}
        disabled={editingSection !== null}
        hint={editingSection !== null
          ? data.copy['moderation.workbench.unsavedDecisionHint']
          : null}
      >
        <SuggestionDecisionControls
          copy={data.copy}
          disabled={submitting || editingSection !== null}
          acceptDisabled={translationBlocked}
          ondecide={beginDecision}
        />
      </ModerationActionBar>
    </div>
  {/if}

  <div class="review-sections grid gap-[0.65rem]">
    <ModerationReviewSection
      id="suggestion-identity"
      title={data.copy['suggestion.section.identity']}
      summary={`${proposal.operator_name} · ${localizePlaceCategory(proposal.category, data.copy)}`}
    >
      {#if editingSection === 'identity'}
        <form
          class="section-form grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
          data-section-form="identity"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('identity')}
        >
          {@render sectionInputs('identity', identityPayload)}
          <Field label={data.copy['suggestion.operator']} class="compact-field">
            <Input required bind:value={identityOperatorName} />
          </Field>
          <Field label={data.copy['suggestion.category']} class="compact-field">
            <Select required bind:value={identityCategory}>
              {#each ['restaurant', 'cafe', 'bar', 'shop', 'shopping_centre', 'accommodation', 'park', 'recreation', 'culture', 'service', 'other'] as category (category)}
                <option value={category}
                  >{data.copy[
                    `category.${category === 'shopping_centre' ? 'shoppingCentre' : category}` as MessageKey
                  ]}</option
                >
              {/each}
            </Select>
          </Field>
          {@render sectionActions('identity')}
        </form>
      {:else}
        <div class="section-view grid gap-[0.55rem]">
          <dl class="grid m-0 gap-[0.45rem]">
            <div
              class="grid grid-cols-[minmax(7rem,0.35fr)_1fr] gap-[0.6rem] max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="font-extrabold">{data.copy['suggestion.operator']}</dt>
              <dd class="min-w-0 m-0 wrap-anywhere">{proposal.operator_name}</dd>
            </div>
            <div
              class="grid grid-cols-[minmax(7rem,0.35fr)_1fr] gap-[0.6rem] max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="font-extrabold">{data.copy['suggestion.category']}</dt>
              <dd class="min-w-0 m-0 wrap-anywhere">
                {localizePlaceCategory(proposal.category, data.copy)}
              </dd>
            </div>
          </dl>
          {@render editButton('identity', data.copy['suggestion.section.identity'])}
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-location"
      title={data.copy['moderation.locationHeading']}
      summary={`${proposal.location.address_line}, ${proposal.location.locality}`}
    >
      {#if editingSection === 'location'}
        <form
          class="section-form grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
          data-section-form="location"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('location')}
        >
          {@render sectionInputs('location', locationPayload)}
          <div class="wide col-span-full max-[44rem]:col-auto">
            <ModerationLocationEditor
              copy={data.copy}
              bind:value={locationValue}
              markerName={proposal.translations.is.name || proposal.translations.en.name}
              mapStyleUrl={data.mapStyleUrl}
            />
          </div>
          {@render sectionActions('location')}
        </form>
      {:else}
        <div class="section-view grid gap-[0.55rem]">
          <p class="m-0">
            {proposal.location.address_line}, {proposal.location.postal_code}
            {proposal.location.locality}
          </p>
          <p class="m-0">{proposal.location.latitude}, {proposal.location.longitude}</p>
          {@render editButton('location', data.copy['moderation.locationHeading'])}
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-translations"
      title={data.copy['moderation.workbench.section.translations']}
      summary={translationBlocked
        ? data.copy['moderation.workbench.section.translationsMissing']
        : data.copy['moderation.workbench.section.translationsComplete']}
      state={translationBlocked ? 'blocking' : 'complete'}
    >
      {#if editingSection === 'translations'}
        <form
          class="section-form grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
          data-section-form="translations"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('translations')}
        >
          {@render sectionInputs('translations', translationsPayload)}
          <fieldset
            class="col-span-full min-w-0 m-0 p-[0.65rem] border border-border-subtle rounded-control max-[44rem]:col-auto"
          >
            <legend class="font-extrabold">{data.copy['suggestion.translationIs']}</legend>
            <Field label={data.copy['suggestion.name']} class="compact-field">
              <Input required bind:value={translationNameIs} />
            </Field>
            <Field label={data.copy['suggestion.description']} class="compact-field">
              <Textarea required rows={3} bind:value={translationDescriptionIs} />
            </Field>
          </fieldset>
          <fieldset
            class="col-span-full min-w-0 m-0 p-[0.65rem] border border-border-subtle rounded-control max-[44rem]:col-auto"
          >
            <legend class="font-extrabold">{data.copy['suggestion.translationEn']}</legend>
            <Field label={data.copy['suggestion.name']} class="compact-field">
              <Input required bind:value={translationNameEn} />
            </Field>
            <Field label={data.copy['suggestion.description']} class="compact-field">
              <Textarea required rows={3} bind:value={translationDescriptionEn} />
            </Field>
          </fieldset>
          {@render sectionActions('translations')}
        </form>
      {:else}
        <div
          class="section-view translations grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
        >
          <article lang="is" class="p-[0.65rem] border border-border-subtle rounded-control">
            <strong>{proposal.translations.is.name}</strong>
            <p class="m-0">{proposal.translations.is.description}</p>
          </article>
          <article lang="en" class="p-[0.65rem] border border-border-subtle rounded-control">
            <strong>{proposal.translations.en.name}</strong>
            <p class="m-0">{proposal.translations.en.description}</p>
          </article>
          {@render editButton(
            'translations',
            data.copy['moderation.workbench.section.translations']
          )}
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-details"
      title={data.copy['moderation.workbench.section.details']}
      summary={`${proposal.website_url ?? data.copy['common.notAvailable']} · ${data.copy['moderation.workbench.section.amenityCount'].replace('{count}', String(proposal.dog_amenities.length))}`}
    >
      {#if editingSection === 'hours-and-amenities'}
        <form
          class="section-form grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
          data-section-form="hours-and-amenities"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('hours-and-amenities')}
        >
          {@render sectionInputs('hours-and-amenities', detailsPayload)}
          <Field label={data.copy['suggestion.website']} class="compact-field">
            <Input type="url" bind:value={detailsWebsiteUrl} />
          </Field>
          <Field label={data.copy['suggestion.phone']} class="compact-field">
            <Input type="tel" bind:value={detailsPhone} />
          </Field>
          <div class="wide editor-group col-span-full max-[44rem]:col-auto">
            <h3 class="m-0">{data.copy['suggestion.openingHours']}</h3>
            <OpeningHoursEditor copy={data.copy} bind:value={detailsOpeningHours} />
          </div>
          <fieldset
            class="wide col-span-full min-w-0 m-0 p-[0.65rem] border border-border-subtle rounded-control max-[44rem]:col-auto"
          >
            <legend class="font-extrabold">{data.copy['suggestion.amenities']}</legend>
            {#each detailsDogAmenities as amenity, index (index)}<div
                class="repeated-row grid grid-cols-[1fr_auto] gap-[0.45rem] mb-[0.45rem]"
              >
                <Input
                  aria-label={data.copy['moderation.amenityLabel'].replace(
                    '{number}',
                    String(index + 1)
                  )}
                  value={amenity}
                  oninput={(event) => (detailsDogAmenities[index] = event.currentTarget.value)}
                /><Button type="button" intent="neutral" onclick={() => removeAmenity(index)}
                  >{data.copy['moderation.removeAmenity']}</Button
                >
              </div>{/each}
            <Button type="button" intent="neutral" onclick={() => detailsDogAmenities.push('')}
              >{data.copy['moderation.addAmenity']}</Button
            >
          </fieldset>
          {@render sectionActions('hours-and-amenities')}
        </form>
      {:else}
        <div class="section-view grid gap-[0.55rem]">
          <dl class="grid m-0 gap-[0.45rem]">
            <div
              class="grid grid-cols-[minmax(7rem,0.35fr)_1fr] gap-[0.6rem] max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="font-extrabold">{data.copy['suggestion.contact']}</dt>
              <dd class="min-w-0 m-0 wrap-anywhere">
                {proposal.website_url ?? data.copy['common.notAvailable']} · {proposal.phone ??
                  data.copy['common.notAvailable']}
              </dd>
            </div>
            <div
              class="grid grid-cols-[minmax(7rem,0.35fr)_1fr] gap-[0.6rem] max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="font-extrabold">{data.copy['suggestion.openingHours']}</dt>
              <dd class="min-w-0 m-0 wrap-anywhere">
                {formatOpeningHours(
                  proposal.opening_hours,
                  data.copy,
                  data.copy['common.notAvailable']
                )}
              </dd>
            </div>
            <div
              class="grid grid-cols-[minmax(7rem,0.35fr)_1fr] gap-[0.6rem] max-[44rem]:grid-cols-[1fr]"
            >
              <dt class="font-extrabold">{data.copy['suggestion.amenities']}</dt>
              <dd class="min-w-0 m-0 wrap-anywhere">
                {proposal.dog_amenities.length
                  ? formatDogAmenities(proposal.dog_amenities, data.copy)
                  : data.copy['common.notAvailable']}
              </dd>
            </div>
          </dl>
          {@render editButton(
            'hours-and-amenities',
            data.copy['moderation.workbench.section.details']
          )}
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-access"
      title={data.copy['suggestion.section.access']}
      summary={`${localizeAccessArea(proposal.access_condition.access_area, data.copy)} · ${localizeRestraint(proposal.access_condition.restraint_condition, data.copy)}`}
    >
      {#if editingSection === 'access-condition'}
        <form
          class="section-form wide-form grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
          data-section-form="access-condition"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('access-condition')}
        >
          {@render sectionInputs('access-condition', accessPayload)}
          <SuggestionAccessConditionEditor copy={data.copy} bind:value={accessCondition} />
          {@render sectionActions('access-condition')}
        </form>
      {:else}
        <div class="section-view grid gap-[0.55rem]">
          <p class="m-0">
            {localizeAccessArea(proposal.access_condition.access_area, data.copy)} · {localizeRestraint(
              proposal.access_condition.restraint_condition,
              data.copy
            )} · {localizePermission(proposal.access_condition.permission_requirement, data.copy)}
          </p>
          {@render editButton('access-condition', data.copy['suggestion.section.access'])}
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-evidence"
      title={data.copy['suggestion.section.evidence']}
      summary={`${localizeEvidenceKind(proposal.evidence.kind, data.copy)} · ${proposal.evidence.source_label}`}
    >
      {#if editingSection === 'evidence'}
        <form
          class="section-form wide-form grid grid-cols-2 gap-[0.55rem] max-[44rem]:grid-cols-[1fr]"
          data-section-form="evidence"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('evidence')}
        >
          {@render sectionInputs('evidence', evidencePayload)}
          <SuggestionEvidenceEditor copy={data.copy} bind:value={evidence} />
          {@render sectionActions('evidence')}
        </form>
      {:else}
        <div class="section-view grid gap-[0.55rem]">
          <p class="m-0">
            <strong>{proposal.evidence.source_label}</strong> ·
            <time datetime={proposal.evidence.observed_at}>{proposal.evidence.observed_at}</time>
          </p>
          {#if proposal.evidence.source_url}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- evidence URLs are externally supplied moderator references -->
            <a href={proposal.evidence.source_url} target="_blank" rel="noreferrer"
              >{proposal.evidence.source_url}</a
            >
          {/if}
          <p class="m-0">{proposal.evidence.explanation}</p>
          {@render editButton('evidence', data.copy['suggestion.section.evidence'])}
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-matches"
      title={data.copy['suggestion.matches']}
      summary={data.matches.length ? `${data.matches.length}` : data.copy['suggestion.noMatches']}
      state={data.matches.length ? 'warning' : 'complete'}
    >
      {#if data.matches.length === 0}<p class="m-0">
          {data.copy['suggestion.noMatches']}
        </p>{:else}<ul class="match-list grid m-0 gap-2 p-0 list-none">
          {#each data.matches as match (match.placeId)}<li
              class="grid gap-[0.2rem] pb-2 border-b border-b-border-subtle"
            >
              <strong
                >{data.lang === 'is'
                  ? (match.nameIs ?? match.operatorName)
                  : (match.nameEn ?? match.operatorName)}</strong
              ><span
                >{data.copy[lifecycleKey(match.lifecycle)]} · {match.addressLine}, {match.locality}</span
              ><span
                >{#if match.sameOperator}<b>{data.copy['suggestion.sameOperator']}</b>{/if}
                {#if match.exactLocation}<b>{data.copy['suggestion.exactLocation']}</b>{/if}</span
              >
            </li>{/each}
        </ul>{/if}
      <fieldset
        class="identity-decisions grid grid-cols-2 min-w-0 m-[0.75rem_0_0] gap-[0.55rem] p-[0.65rem] border border-border-subtle rounded-control max-[44rem]:grid-cols-[1fr]"
      >
        <legend class="font-extrabold col-span-full max-[44rem]:col-auto"
          >{data.copy['suggestion.identityDecisions']}</legend
        >
        <Field label={data.copy['suggestion.operatorIdentity']} class="compact-field">
          <Select bind:value={operatorIdentityPlaceId}
            ><option value="new">{data.copy['suggestion.newOperatorIdentity']}</option
            >{#each data.matches as match (match.placeId)}<option value={match.placeId}
                >{data.copy['suggestion.reuseFrom']}
                {match.operatorName} · {data.copy[lifecycleKey(match.lifecycle)]}</option
              >{/each}</Select
          >
        </Field>
        <Field label={data.copy['suggestion.locationIdentity']} class="compact-field">
          <Select bind:value={locationIdentityPlaceId}
            ><option value="new">{data.copy['suggestion.newLocationIdentity']}</option
            >{#each data.matches as match (match.placeId)}<option value={match.placeId}
                >{data.copy['suggestion.reuseFrom']}
                {match.addressLine}, {match.locality} · {data.copy[
                  lifecycleKey(match.lifecycle)
                ]}</option
              >{/each}</Select
          >
        </Field>
      </fieldset>
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-contributor"
      title={data.copy['suggestion.section.contributor']}
      summary={data.contributor
        ? data.copy[`contributor.status.${data.contributor.status}` as MessageKey]
        : data.copy['common.notAvailable']}
    >
      <p class="signal-note m-0 text-basalt-muted">
        {data.copy['contributor.moderation.signalNote']}
      </p>
      {#if data.contributor}<p class="m-0">
          <strong>{data.copy[`contributor.status.${data.contributor.status}` as MessageKey]}</strong
          >
        </p>
        {#if !data.contributor.policyVersion}<p class="m-0">
            {data.copy['contributor.moderation.policyMissing']}
          </p>{/if}{/if}
      {#if contributorEvidence.length}<ul class="grid m-0 gap-2 p-0 list-none">
          {#each contributorEvidence as item, index (item.contributionId ?? item.flagId ?? index)}<li
            >
              {#if item.contributionId}<span
                  >{data.copy['contributor.moderation.evidenceContribution']} · {item.confirmedAt}</span
                >{#if !item.revokedAt}<Button
                    type="button"
                    intent="neutral"
                    onclick={() => {
                      contributionToRevoke = item.contributionId ?? '';
                      contributorAction = 'revoke';
                    }}>{data.copy['contributor.moderation.revoke']}</Button
                  >{/if}{:else}<span
                  >{data.copy[flagKindKey(item.flagKind ?? '')]} · {item.flagReason}</span
                >{/if}
            </li>{/each}
        </ul>{/if}
      <div class="context-actions flex flex-wrap justify-end gap-2">
        <Button type="button" intent="neutral" onclick={() => (contributorAction = 'record')}
          >{data.copy['contributor.moderation.flagMember']}</Button
        >{#if activeEvidenceFlagId}<Button
            type="button"
            intent="neutral"
            onclick={() => (contributorAction = 'clear')}
            >{data.copy['contributor.moderation.clearFlag']}</Button
          >{/if}
      </div>
      {#if contributorAction === 'revoke'}<form
          class="compact-form grid gap-[0.55rem]"
          method="POST"
          action="?/revokeContribution"
          use:enhance={enhanceForm}
        >
          <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><input
            type="hidden"
            name="contributionId"
            value={contributionToRevoke}
          />
          <Field label={data.copy['contributor.moderation.revokeReason']} class="compact-field">
            <Input name="revokeReason" required />
          </Field>
          {@render compactActions()}
        </form>{:else if contributorAction === 'record'}<form
          class="compact-form grid gap-[0.55rem]"
          method="POST"
          action="?/recordConductFlag"
          use:enhance={enhanceForm}
        >
          <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><input
            type="hidden"
            name="memberId"
            value={data.suggestion.memberId}
          />
          <Field label={data.copy['contributor.moderation.flagKind']} class="compact-field">
            <Select name="flagKind"
              ><option value="fraud">{data.copy['contributor.moderation.flagKind.fraud']}</option
              ><option value="abuse">{data.copy['contributor.moderation.flagKind.abuse']}</option
              ><option value="policy_violation"
                >{data.copy['contributor.moderation.flagKind.policy_violation']}</option
              ></Select
            >
          </Field>
          <Field label={data.copy['contributor.moderation.flagReason']} class="compact-field">
            <Textarea name="flagReason" required />
          </Field>
          {@render compactActions()}
        </form>{:else if contributorAction === 'clear' && activeEvidenceFlagId}<form
          class="compact-form grid gap-[0.55rem]"
          method="POST"
          action="?/clearConductFlag"
          use:enhance={enhanceForm}
        >
          <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><input
            type="hidden"
            name="flagId"
            value={activeEvidenceFlagId}
          />
          <Field label={data.copy['contributor.moderation.clearReason']} class="compact-field">
            <Input name="clearReason" required />
          </Field>
          {@render compactActions()}
        </form>{/if}
    </ModerationReviewSection>
  </div>

  {#if decisionStillActionable}
    <form
      id="suggestion-decision"
      class="decision-form hidden"
      method="POST"
      action="?/decideSuggestion"
      use:enhance={enhanceForm}
    >
      <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} />
      <input type="hidden" name="expectedItemVersion" value={data.suggestion.itemVersion} />
      <input type="hidden" name="expectedDraftVersion" value={data.suggestion.draftVersion} />
      <input type="hidden" name="outcome" value={pendingDecision ?? ''} />
      <input type="hidden" name="memberReasonIs" value={memberReasonIs} />
      <input type="hidden" name="memberReasonEn" value={memberReasonEn} />
      <input type="hidden" name="privateNote" value={privateNote} />
      <input type="hidden" name="duplicatePlaceId" value={duplicatePlaceId} />
      <input type="hidden" name="operatorIdentityPlaceId" value={operatorIdentityPlaceId} />
      <input type="hidden" name="locationIdentityPlaceId" value={locationIdentityPlaceId} />
    </form>
  {/if}

  <ModerationConfirmDialog
    open={pendingDecision === 'accepted'}
    title={data.copy['suggestion.acceptTitle']}
    description={data.copy['suggestion.acceptBody']}
    confirmLabel={data.copy['suggestion.action.accept']}
    cancelLabel={data.copy['moderation.workbench.keepReviewing']}
    onconfirm={() => submitDecision()}
    oncancel={cancelDecision}
  />

  {#if pendingDecision && pendingDecision !== 'accepted'}
    <ModerationReasonDialog
      open
      title={pendingDecision === 'needs_information'
        ? data.copy['suggestion.needsInformationTitle']
        : pendingDecision === 'duplicate'
          ? data.copy['suggestion.duplicateTitle']
          : data.copy['suggestion.rejectTitle']}
      description={data.copy['moderation.workbench.decisionHelp']}
      confirmLabel={pendingDecision === 'needs_information'
        ? data.copy['moderation.workbench.needsInformation']
        : pendingDecision === 'duplicate'
          ? data.copy['suggestion.action.duplicate']
          : data.copy['moderation.workbench.reject']}
      cancelLabel={data.copy['moderation.workbench.keepReviewing']}
      reasonIsLabel={data.copy['suggestion.memberReasonIs']}
      reasonEnLabel={data.copy['suggestion.memberReasonEn']}
      privateNoteLabel={data.copy['suggestion.privateNote']}
      previousPrivateNoteLabel={data.copy['suggestion.previousPrivateNote']}
      previousPrivateNote={data.suggestion.privateNote}
      tone={pendingDecision === 'rejected' ? 'danger' : 'primary'}
      {submitting}
      onconfirm={submitDecision}
      oncancel={cancelDecision}
    >
      {#if pendingDecision === 'duplicate'}
        <Field label={data.copy['suggestion.duplicatePlace']} class="compact-field">
          <Select bind:value={duplicatePlaceId} required
            ><option value=""></option>{#each data.matches as match (match.placeId)}<option
                value={match.placeId}>{match.operatorName} · {match.addressLine}</option
              >{/each}</Select
          >
        </Field>
      {/if}
    </ModerationReasonDialog>
  {/if}

  {#if data.suggestion.outcome === 'accepted'}
    {#if data.suggestion.contributionId && !data.contributionConfirmed}<Notice
        as="p"
        tone="success"
      >
        {data.copy['suggestion.contributionAlreadyConfirmed']}
      </Notice>{:else if !data.suggestion.contributionId}<form
        method="POST"
        action="?/confirmUseful"
        use:enhance={enhanceForm}
      >
        <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><Button
          type="submit"
          intent="committed"
          disabled={submitting}>{data.copy['suggestion.confirmUseful']}</Button
        >
      </form>{/if}
  {/if}
</div>

{#snippet sectionInputs(sectionId: EditableSectionId, sectionPayload: string)}
  <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} />
  <input type="hidden" name="expectedItemVersion" value={data.suggestion.itemVersion} />
  <input type="hidden" name="expectedDraftVersion" value={data.suggestion.draftVersion} />
  <input type="hidden" name="sectionId" value={sectionId} />
  <input type="hidden" name="sectionPayload" value={sectionPayload} />
{/snippet}

{#snippet sectionActions(sectionId: EditableSectionId)}
  <div
    class="section-form-actions flex flex-wrap justify-end col-span-full gap-2 max-[44rem]:col-auto"
  >
    <Button type="button" intent="neutral" onclick={() => (editingSection = null)}
      >{data.copy['common.cancel']}</Button
    ><Button type="submit" intent="committed" disabled={savingSection === sectionId}
      >{saveLabel(sectionId)}</Button
    >
  </div>
{/snippet}

{#snippet editButton(sectionId: EditableSectionId, title: string)}
  <Button
    type="button"
    intent="neutral"
    class="edit-section"
    aria-label={editLabel(title)}
    onclick={() => beginEditing(sectionId)}>{editLabel(title)}</Button
  >
{/snippet}

{#snippet compactActions()}
  <div
    class="section-form-actions flex flex-wrap justify-end col-span-full gap-2 max-[44rem]:col-auto"
  >
    <Button type="button" intent="neutral" onclick={() => (contributorAction = null)}
      >{data.copy['common.cancel']}</Button
    ><Button type="submit" intent="committed">{data.copy['common.save']}</Button>
  </div>
{/snippet}

<style>
  .wide-form > :global(*) {
    grid-column: 1 / -1;
  }
  /* Field renders its own label/control stack inside a child component, so scoped CSS cannot
     reach the label directly - the whole remaining chain after .compact-field is wrapped in one
     :global() (the SelectedPlaceCard ".card-body :global(.details-status p)" precedent), rather
     than just the class, because a bare `label` tag selector after a partial :global() would
     still be scope-hashed and fail to match. This preserves the original muted/reduced-size
     label treatment Field's own docs invite a call site to keep via a scoped hook; Input/Select/
     Textarea now own the field's border/radius/surface/focus ring, and Button now owns the
     button look/weight/min-height (the old bespoke 2.55rem/900 pair is retired). */
  .review-panel :global(.compact-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  /* Button renders its own <button> inside a child component, so scoped CSS cannot reach it
     directly - .edit-section is guaranteed to land on that rendered element because we pass it
     through Button's class prop ourselves (the FavouriteControl precedent). Button's neutral
     intent now owns the background; only the leftover grid placement survives here. */
  .translations :global(.edit-section) {
    grid-column: 1 / -1;
  }
  .review-panel :global(.edit-section) {
    justify-self: end;
  }
  @media (max-width: 44rem) {
    .wide-form > :global(*),
    .translations :global(.edit-section) {
      grid-column: auto;
    }
  }
</style>
