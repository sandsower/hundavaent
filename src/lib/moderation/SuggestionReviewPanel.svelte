<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

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
  let locationAddressLine = $state('');
  let locationLocality = $state('');
  let locationPostalCode = $state('');
  let locationMunicipality = $state('');
  let locationLatitude = $state(0);
  let locationLongitude = $state(0);
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
        address_line: locationAddressLine,
        locality: locationLocality,
        postal_code: locationPostalCode,
        municipality: locationMunicipality,
        latitude: Number(locationLatitude),
        longitude: Number(locationLongitude)
      }
    })
  );
  const translationsPayload = $derived(
    JSON.stringify({
      translations: {
        is: { name: translationNameIs, description: translationDescriptionIs },
        en: { name: translationNameEn, description: translationDescriptionEn }
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
        if (result.type === 'success') editingSection = null;
      };
    };
  }

  function beginEditing(sectionId: EditableSectionId): void {
    if (sectionId === 'identity') {
      identityOperatorName = proposal.operator_name;
      identityCategory = proposal.category;
    } else if (sectionId === 'location') {
      locationAddressLine = proposal.location.address_line;
      locationLocality = proposal.location.locality;
      locationPostalCode = proposal.location.postal_code;
      locationMunicipality = proposal.location.municipality;
      locationLatitude = proposal.location.latitude;
      locationLongitude = proposal.location.longitude;
    } else if (sectionId === 'translations') {
      translationNameIs = proposal.translations.is.needs_review
        ? ''
        : proposal.translations.is.name;
      translationDescriptionIs = proposal.translations.is.needs_review
        ? ''
        : proposal.translations.is.description;
      translationNameEn = proposal.translations.en.needs_review
        ? ''
        : proposal.translations.en.name;
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
  }

  function removeAmenity(index: number): void {
    detailsDogAmenities.splice(index, 1);
  }
</script>

<div class="review-panel" class:standalone>
  {#if standalone}
    <header>
      <p class="eyebrow">{data.copy['suggestion.review']}</p>
      <h1>{data.lang === 'is' ? data.suggestion.nameIs : data.suggestion.nameEn}</h1>
      <p>
        {data.suggestion.operatorName} · {data.suggestion.addressLine}, {data.suggestion.locality}
      </p>
    </header>
  {/if}

  {#if form?.error}
    <p class="message error" role="alert">
      {form.error === 'conflict'
        ? data.copy['suggestion.outcomeConflict']
        : form.error === 'forbidden'
          ? data.copy['moderation.unauthorized']
          : data.copy['suggestion.invalid']}
    </p>
  {/if}
  {#if data.resolved}<p class="message success" role="status">
      {data.copy['suggestion.resolved']}
    </p>{/if}
  {#if data.contributionConfirmed}
    <p class="message success" role="status">{data.copy['suggestion.contributionConfirmed']}</p>
  {/if}
  {#if data.contributionRevoked}
    <p class="message success" role="status">{data.copy['contributor.moderation.revoked']}</p>
  {/if}

  <h2 class="readiness-title">{data.copy['suggestion.reviewSummary']}</h2>
  <ModerationReadinessSummary
    label={data.copy['suggestion.reviewSummary']}
    state={reviewState}
    stateLabel={reviewStateLabel}
    summary={reviewSummary}
    issues={readinessIssues}
  />

  {#if standalone && decisionStillActionable}
    <div class="standalone-actions">
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

  <div class="review-sections">
    <ModerationReviewSection
      id="suggestion-identity"
      title={data.copy['suggestion.section.identity']}
      summary={`${proposal.operator_name} · ${localizePlaceCategory(proposal.category, data.copy)}`}
    >
      {#if editingSection === 'identity'}
        <form
          class="section-form"
          data-section-form="identity"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('identity')}
        >
          {@render sectionInputs('identity', identityPayload)}
          <label
            >{data.copy['suggestion.operator']}<input
              required
              bind:value={identityOperatorName}
            /></label
          >
          <label
            >{data.copy['suggestion.category']}<select required bind:value={identityCategory}>
              {#each ['restaurant', 'cafe', 'bar', 'shop', 'shopping_centre', 'accommodation', 'park', 'recreation', 'culture', 'service', 'other'] as category}
                <option value={category}
                  >{data.copy[
                    `category.${category === 'shopping_centre' ? 'shoppingCentre' : category}` as MessageKey
                  ]}</option
                >
              {/each}
            </select></label
          >
          {@render sectionActions('identity')}
        </form>
      {:else}
        <div class="section-view">
          <dl>
            <div>
              <dt>{data.copy['suggestion.operator']}</dt>
              <dd>{proposal.operator_name}</dd>
            </div>
            <div>
              <dt>{data.copy['suggestion.category']}</dt>
              <dd>{localizePlaceCategory(proposal.category, data.copy)}</dd>
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
          class="section-form"
          data-section-form="location"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('location')}
        >
          {@render sectionInputs('location', locationPayload)}
          <label
            >{data.copy['suggestion.address']}<input
              required
              bind:value={locationAddressLine}
            /></label
          >
          <label
            >{data.copy['suggestion.locality']}<input
              required
              bind:value={locationLocality}
            /></label
          >
          <label
            >{data.copy['suggestion.postalCode']}<input
              required
              pattern="[0-9][0-9][0-9]"
              bind:value={locationPostalCode}
            /></label
          >
          <label
            >{data.copy['suggestion.municipality']}<input
              required
              bind:value={locationMunicipality}
            /></label
          >
          <label
            >{data.copy['suggestion.latitude']}<input
              required
              type="number"
              step="any"
              bind:value={locationLatitude}
            /></label
          >
          <label
            >{data.copy['suggestion.longitude']}<input
              required
              type="number"
              step="any"
              bind:value={locationLongitude}
            /></label
          >
          {@render sectionActions('location')}
        </form>
      {:else}
        <div class="section-view">
          <p>
            {proposal.location.address_line}, {proposal.location.postal_code}
            {proposal.location.locality}
          </p>
          <p>{proposal.location.latitude}, {proposal.location.longitude}</p>
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
          class="section-form"
          data-section-form="translations"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('translations')}
        >
          {@render sectionInputs('translations', translationsPayload)}
          <fieldset>
            <legend>{data.copy['suggestion.translationIs']}</legend><label
              >{data.copy['suggestion.name']}<input
                required
                bind:value={translationNameIs}
              /></label
            ><label
              >{data.copy['suggestion.description']}<textarea
                required
                rows="3"
                bind:value={translationDescriptionIs}></textarea></label
            >
          </fieldset>
          <fieldset>
            <legend>{data.copy['suggestion.translationEn']}</legend><label
              >{data.copy['suggestion.name']}<input
                required
                bind:value={translationNameEn}
              /></label
            ><label
              >{data.copy['suggestion.description']}<textarea
                required
                rows="3"
                bind:value={translationDescriptionEn}></textarea></label
            >
          </fieldset>
          {@render sectionActions('translations')}
        </form>
      {:else}
        <div class="section-view translations">
          <article lang="is">
            <strong>{proposal.translations.is.name}</strong>
            <p>{proposal.translations.is.description}</p>
          </article>
          <article lang="en">
            <strong>{proposal.translations.en.name}</strong>
            <p>{proposal.translations.en.description}</p>
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
          class="section-form"
          data-section-form="hours-and-amenities"
          method="POST"
          action="?/saveSuggestionSection"
          use:enhance={enhanceSection('hours-and-amenities')}
        >
          {@render sectionInputs('hours-and-amenities', detailsPayload)}
          <label
            >{data.copy['suggestion.website']}<input
              type="url"
              bind:value={detailsWebsiteUrl}
            /></label
          >
          <label
            >{data.copy['suggestion.phone']}<input type="tel" bind:value={detailsPhone} /></label
          >
          <div class="wide editor-group">
            <h3>{data.copy['suggestion.openingHours']}</h3>
            <OpeningHoursEditor copy={data.copy} bind:value={detailsOpeningHours} />
          </div>
          <fieldset class="wide">
            <legend>{data.copy['suggestion.amenities']}</legend>
            {#each detailsDogAmenities as amenity, index (index)}<div class="repeated-row">
                <input
                  aria-label={data.copy['moderation.amenityLabel'].replace(
                    '{number}',
                    String(index + 1)
                  )}
                  bind:value={detailsDogAmenities[index]}
                /><button type="button" class="quiet" onclick={() => removeAmenity(index)}
                  >{data.copy['moderation.removeAmenity']}</button
                >
              </div>{/each}
            <button type="button" class="quiet" onclick={() => detailsDogAmenities.push('')}
              >{data.copy['moderation.addAmenity']}</button
            >
          </fieldset>
          {@render sectionActions('hours-and-amenities')}
        </form>
      {:else}
        <div class="section-view">
          <dl>
            <div>
              <dt>{data.copy['suggestion.contact']}</dt>
              <dd>
                {proposal.website_url ?? data.copy['common.notAvailable']} · {proposal.phone ??
                  data.copy['common.notAvailable']}
              </dd>
            </div>
            <div>
              <dt>{data.copy['suggestion.openingHours']}</dt>
              <dd>
                {formatOpeningHours(
                  proposal.opening_hours,
                  data.copy,
                  data.copy['common.notAvailable']
                )}
              </dd>
            </div>
            <div>
              <dt>{data.copy['suggestion.amenities']}</dt>
              <dd>
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
          class="section-form wide-form"
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
        <div class="section-view">
          <p>
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
          class="section-form wide-form"
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
        <div class="section-view">
          <p>
            <strong>{proposal.evidence.source_label}</strong> ·
            <time datetime={proposal.evidence.observed_at}>{proposal.evidence.observed_at}</time>
          </p>
          {#if proposal.evidence.source_url}<a href={proposal.evidence.source_url}
              >{proposal.evidence.source_url}</a
            >{/if}
          <p>{proposal.evidence.explanation}</p>
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
      {#if data.matches.length === 0}<p>{data.copy['suggestion.noMatches']}</p>{:else}<ul
          class="match-list"
        >
          {#each data.matches as match (match.placeId)}<li>
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
      <fieldset class="identity-decisions">
        <legend>{data.copy['suggestion.identityDecisions']}</legend><label
          >{data.copy['suggestion.operatorIdentity']}<select bind:value={operatorIdentityPlaceId}
            ><option value="new">{data.copy['suggestion.newOperatorIdentity']}</option
            >{#each data.matches as match}<option value={match.placeId}
                >{data.copy['suggestion.reuseFrom']}
                {match.operatorName} · {data.copy[lifecycleKey(match.lifecycle)]}</option
              >{/each}</select
          ></label
        ><label
          >{data.copy['suggestion.locationIdentity']}<select bind:value={locationIdentityPlaceId}
            ><option value="new">{data.copy['suggestion.newLocationIdentity']}</option
            >{#each data.matches as match}<option value={match.placeId}
                >{data.copy['suggestion.reuseFrom']}
                {match.addressLine}, {match.locality} · {data.copy[
                  lifecycleKey(match.lifecycle)
                ]}</option
              >{/each}</select
          ></label
        >
      </fieldset>
    </ModerationReviewSection>

    <ModerationReviewSection
      id="suggestion-contributor"
      title={data.copy['suggestion.section.contributor']}
      summary={data.contributor
        ? data.copy[`contributor.status.${data.contributor.status}` as MessageKey]
        : data.copy['common.notAvailable']}
    >
      <p class="signal-note">{data.copy['contributor.moderation.signalNote']}</p>
      {#if data.contributor}<p>
          <strong>{data.copy[`contributor.status.${data.contributor.status}` as MessageKey]}</strong
          >
        </p>
        {#if !data.contributor.policyVersion}<p>
            {data.copy['contributor.moderation.policyMissing']}
          </p>{/if}{/if}
      {#if contributorEvidence.length}<ul>
          {#each contributorEvidence as item, index (item.contributionId ?? item.flagId ?? index)}<li
            >
              {#if item.contributionId}<span
                  >{data.copy['contributor.moderation.evidenceContribution']} · {item.confirmedAt}</span
                >{#if !item.revokedAt}<button
                    type="button"
                    class="quiet"
                    onclick={() => {
                      contributionToRevoke = item.contributionId ?? '';
                      contributorAction = 'revoke';
                    }}>{data.copy['contributor.moderation.revoke']}</button
                  >{/if}{:else}<span
                  >{data.copy[flagKindKey(item.flagKind ?? '')]} · {item.flagReason}</span
                >{/if}
            </li>{/each}
        </ul>{/if}
      <div class="context-actions">
        <button type="button" class="quiet" onclick={() => (contributorAction = 'record')}
          >{data.copy['contributor.moderation.flagMember']}</button
        >{#if activeEvidenceFlagId}<button
            type="button"
            class="quiet"
            onclick={() => (contributorAction = 'clear')}
            >{data.copy['contributor.moderation.clearFlag']}</button
          >{/if}
      </div>
      {#if contributorAction === 'revoke'}<form
          class="compact-form"
          method="POST"
          action="?/revokeContribution"
          use:enhance={enhanceForm}
        >
          <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><input
            type="hidden"
            name="contributionId"
            value={contributionToRevoke}
          /><label
            >{data.copy['contributor.moderation.revokeReason']}<input
              name="revokeReason"
              required
            /></label
          >{@render compactActions()}
        </form>{:else if contributorAction === 'record'}<form
          class="compact-form"
          method="POST"
          action="?/recordConductFlag"
          use:enhance={enhanceForm}
        >
          <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><input
            type="hidden"
            name="memberId"
            value={data.suggestion.memberId}
          /><label
            >{data.copy['contributor.moderation.flagKind']}<select name="flagKind"
              ><option value="fraud">{data.copy['contributor.moderation.flagKind.fraud']}</option
              ><option value="abuse">{data.copy['contributor.moderation.flagKind.abuse']}</option
              ><option value="policy_violation"
                >{data.copy['contributor.moderation.flagKind.policy_violation']}</option
              ></select
            ></label
          ><label
            >{data.copy['contributor.moderation.flagReason']}<textarea name="flagReason" required
            ></textarea></label
          >{@render compactActions()}
        </form>{:else if contributorAction === 'clear' && activeEvidenceFlagId}<form
          class="compact-form"
          method="POST"
          action="?/clearConductFlag"
          use:enhance={enhanceForm}
        >
          <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><input
            type="hidden"
            name="flagId"
            value={activeEvidenceFlagId}
          /><label
            >{data.copy['contributor.moderation.clearReason']}<input
              name="clearReason"
              required
            /></label
          >{@render compactActions()}
        </form>{/if}
    </ModerationReviewSection>
  </div>

  {#if decisionStillActionable}
    <form
      id="suggestion-decision"
      class="decision-form"
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
        <label
          >{data.copy['suggestion.duplicatePlace']}<select bind:value={duplicatePlaceId} required
            ><option value=""></option>{#each data.matches as match}<option value={match.placeId}
                >{match.operatorName} · {match.addressLine}</option
              >{/each}</select
          ></label
        >
      {/if}
    </ModerationReasonDialog>
  {/if}

  {#if data.suggestion.outcome === 'accepted'}
    {#if data.suggestion.contributionId && !data.contributionConfirmed}<p class="message success">
        {data.copy['suggestion.contributionAlreadyConfirmed']}
      </p>{:else if !data.suggestion.contributionId}<form
        method="POST"
        action="?/confirmUseful"
        use:enhance={enhanceForm}
      >
        <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} /><button
          type="submit"
          disabled={submitting}>{data.copy['suggestion.confirmUseful']}</button
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
  <div class="section-form-actions">
    <button type="button" class="quiet" onclick={() => (editingSection = null)}
      >{data.copy['common.cancel']}</button
    ><button type="submit" disabled={savingSection === sectionId}>{saveLabel(sectionId)}</button>
  </div>
{/snippet}

{#snippet editButton(sectionId: EditableSectionId, title: string)}
  <button
    type="button"
    class="edit-section"
    aria-label={editLabel(title)}
    onclick={() => beginEditing(sectionId)}>{editLabel(title)}</button
  >
{/snippet}

{#snippet compactActions()}
  <div class="section-form-actions">
    <button type="button" class="quiet" onclick={() => (contributorAction = null)}
      >{data.copy['common.cancel']}</button
    ><button type="submit">{data.copy['common.save']}</button>
  </div>
{/snippet}

<style>
  .review-panel {
    display: grid;
    min-width: 0;
    gap: 0.9rem;
  }
  .review-panel.standalone {
    width: min(100% - 2rem, 64rem);
    margin: 2rem auto;
  }
  header,
  .review-sections,
  .section-view,
  .section-form,
  .compact-form,
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
  .section-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .section-form > :global(.wide),
  .section-form > fieldset,
  .section-form-actions,
  .wide-form > :global(*) {
    grid-column: 1 / -1;
  }
  label {
    min-width: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  input,
  select,
  textarea {
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
  dl {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }
  dl div {
    display: grid;
    grid-template-columns: minmax(7rem, 0.35fr) 1fr;
    gap: 0.6rem;
  }
  dt {
    font-weight: 850;
  }
  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .translations {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .translations .edit-section {
    grid-column: 1 / -1;
  }
  article {
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.65rem;
  }
  .section-form-actions,
  .context-actions {
    display: flex;
    flex-wrap: wrap;
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
    justify-self: end;
  }
  .repeated-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.45rem;
    margin-bottom: 0.45rem;
  }
  .match-list,
  ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .match-list li {
    display: grid;
    gap: 0.2rem;
    border-bottom: 1px solid var(--hv-border-subtle);
    padding-bottom: 0.5rem;
  }
  .identity-decisions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    margin-top: 0.75rem;
  }
  .identity-decisions legend {
    grid-column: 1 / -1;
  }
  .signal-note {
    color: var(--hv-color-basalt-muted);
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
    .review-panel.standalone {
      width: min(100% - 1rem, 64rem);
      margin: 0.5rem auto;
    }
    .section-form,
    .translations,
    .identity-decisions {
      grid-template-columns: 1fr;
    }
    .section-form > :global(.wide),
    .section-form > fieldset,
    .section-form-actions,
    .wide-form > :global(*),
    .translations .edit-section,
    .identity-decisions legend {
      grid-column: auto;
    }
    dl div {
      grid-template-columns: 1fr;
    }
  }
</style>
