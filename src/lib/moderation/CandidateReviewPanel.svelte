<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick, untrack } from 'svelte';

  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import { explainAccessCondition } from '$domain/access-explanation';
  import type { PlaceCategory } from '$domain/place';
  import { formatLocalizedDate } from '$i18n/date';
  import {
    formatDogAmenities,
    formatOpeningHours,
    localizeEvidenceKind,
    localizePlaceCategory
  } from '$i18n/structured-place';
  import MapSurface from '$lib/map/MapSurface.svelte';
  import { createMapLibreAdapter, emptyMapLibreStyle } from '$lib/map/maplibre-adapter';
  import type { MapAdapter } from '$lib/map/types';
  import { downscaleImageFile, readImageDimensions } from '$lib/place-media/downscale-image';
  import AccessConditionsEditor from './AccessConditionsEditor.svelte';
  import CandidateDecisionControls, {
    type CandidateDecisionOutcome
  } from './CandidateDecisionControls.svelte';
  import EvidenceRecordsEditor from './EvidenceRecordsEditor.svelte';
  import ModerationActionBar from './ModerationActionBar.svelte';
  import ModerationPublishDialog from './ModerationPublishDialog.svelte';
  import ModerationLocationEditor, {
    type ModerationLocationValue
  } from './ModerationLocationEditor.svelte';
  import ModerationPhotoApprovalFields from './ModerationPhotoApprovalFields.svelte';
  import ModerationReadinessSummary from './ModerationReadinessSummary.svelte';
  import ModerationReasonDialog, {
    type ModerationReasonValue
  } from './ModerationReasonDialog.svelte';
  import ModerationReviewSection from './ModerationReviewSection.svelte';
  import OpeningHoursEditor from './OpeningHoursEditor.svelte';
  import type { ModerationReviewIssue } from './types';

  import type { CandidatePublicationReview } from '$server/moderation/place-moderation';
  import type { ModerationPlaceMediaView } from '$server/moderation/candidate-workspace';
  import type { Json } from '$server/db/generated.types';

  interface CandidateReviewData {
    lang: Locale;
    copy: Catalogue;
    review: CandidatePublicationReview;
    defaultFreshnessUntil: string;
    media: ModerationPlaceMediaView[];
    mapStyleUrl?: string | null;
  }

  interface CandidateReviewForm {
    action?: string;
    success?: boolean;
    error?: string;
    conflict?: boolean;
  }

  interface Props {
    data: CandidateReviewData;
    form?: CandidateReviewForm | null;
    standalone?: boolean;
    publicationReason?: string;
    oneditstatechange?: (editing: boolean) => void;
  }

  let {
    data,
    form = null,
    standalone = false,
    publicationReason: externalPublicationReason = '',
    oneditstatechange
  }: Props = $props();
  type EditableSectionId =
    | 'identity'
    | 'details'
    | 'wheelchair_accessibility'
    | 'location'
    | 'translations'
    | 'access_conditions'
    | 'evidence_records';

  let submitting = $state(false);
  let editingSection = $state<EditableSectionId | null>(null);
  let savingSection = $state<EditableSectionId | null>(null);
  let savingWheelchairAccessibility = $state(false);
  let wheelchairAccessibilityValue =
    $state<CandidatePublicationReview['wheelchairAccessibility']>('unknown');
  let confirmingPublish = $state(false);
  let publicationReason = $state('');
  let candidateDialog = $state<'needs_information' | 'rejected' | null>(null);
  let candidateDecision = $state<'needs_information' | 'rejected' | 'reopen'>('needs_information');
  let candidateReasonCode = $state('insufficient_evidence');
  let candidateMemberReasonIs = $state('');
  let candidateMemberReasonEn = $state('');
  let candidatePrivateNote = $state('');
  let candidateDecisionForm = $state<HTMLFormElement>();
  let publicationForm = $state<HTMLFormElement>();
  let alertElement = $state<HTMLElement>();
  let publishError = $derived(
    form && 'action' in form && form.action === 'publish' && 'error' in form ? form.error : null
  );
  let succeeded = $derived(
    Boolean(
      form && 'action' in form && form.action === 'publish' && 'success' in form && form.success
    )
  );
  let draftError = $derived(
    form && 'action' in form && form.action === 'saveCandidateSection' && 'error' in form
      ? form.error
      : null
  );
  let draftSucceeded = $derived(
    Boolean(
      form &&
      'action' in form &&
      form.action === 'saveCandidateSection' &&
      'success' in form &&
      form.success
    )
  );
  let locationCorrectionError = $derived(
    form && 'action' in form && form.action === 'correctLocation' && 'error' in form
      ? form.error
      : null
  );
  let locationCorrectionSucceeded = $derived(
    Boolean(
      form &&
      'action' in form &&
      form.action === 'correctLocation' &&
      'success' in form &&
      form.success
    )
  );
  let decisionError = $derived(
    form && 'action' in form && form.action === 'decideCandidate' && 'error' in form
      ? form.error
      : null
  );
  let canDecide = $derived(data.review.candidateStatus !== 'published');

  let identityOperatorName = $state('');
  let identityCategory = $state('');
  let detailsWebsiteUrl = $state('');
  let detailsPhone = $state('');
  let detailsOpeningHours = $state<Record<string, Json>>({});
  let detailsDogAmenities = $state<string[]>([]);
  let translationNameIs = $state('');
  let translationDescriptionIs = $state('');
  let translationNameEn = $state('');
  let translationDescriptionEn = $state('');
  let locationValue = $state<ModerationLocationValue>({
    addressLine: '',
    locality: '',
    postalCode: '',
    municipality: 'reykjavik',
    latitude: 64.1466,
    longitude: -21.9426,
    geometryPrecision: 'municipality_anchor_pending_geocode',
    geometrySource: ''
  });

  const identitySectionPayload = $derived(
    JSON.stringify({ operator: { name: identityOperatorName }, category: identityCategory })
  );
  const detailsSectionPayload = $derived(
    JSON.stringify({
      website_url: detailsWebsiteUrl.trim() || null,
      phone: detailsPhone.trim() || null,
      opening_hours: detailsOpeningHours,
      dog_amenities: [...new Set(detailsDogAmenities.map((item) => item.trim()).filter(Boolean))]
    })
  );
  const translationsSectionPayload = $derived(
    JSON.stringify({
      translations: {
        is: { name: translationNameIs, description: translationDescriptionIs },
        en: { name: translationNameEn, description: translationDescriptionEn }
      }
    })
  );
  let wheelchairAccessibilityError = $derived(
    form && 'action' in form && form.action === 'updateWheelchairAccessibility' && 'error' in form
      ? form.error
      : null
  );
  let wheelchairAccessibilitySucceeded = $derived(
    Boolean(
      form &&
      'action' in form &&
      form.action === 'updateWheelchairAccessibility' &&
      'success' in form &&
      form.success
    )
  );

  let mediaError = $derived(
    form &&
      'action' in form &&
      form.action !== 'publish' &&
      form.action !== 'correctLocation' &&
      form.action !== 'saveCandidateSection' &&
      form.action !== 'decideCandidate' &&
      form.action !== 'updateWheelchairAccessibility' &&
      'error' in form
      ? form.error
      : null
  );
  let mediaSucceeded = $derived(
    Boolean(
      form &&
      'action' in form &&
      form.action !== 'publish' &&
      form.action !== 'correctLocation' &&
      form.action !== 'saveCandidateSection' &&
      form.action !== 'decideCandidate' &&
      form.action !== 'updateWheelchairAccessibility' &&
      'success' in form &&
      form.success
    )
  );

  let evidenceProcessing = $state(false);
  let photoProcessing = $state(false);
  let evidenceWidth = $state<number | null>(null);
  let evidenceHeight = $state<number | null>(null);
  let photoWidth = $state<number | null>(null);
  let photoHeight = $state<number | null>(null);
  let evidenceFileError = $state<MessageKey | null>(null);
  let photoFileError = $state<MessageKey | null>(null);

  const evidenceItems = $derived(data.media.filter((item) => item.kind === 'evidence_screenshot'));
  const photoItems = $derived(data.media.filter((item) => item.kind === 'photo'));
  const activeApprovedPhotoCount = $derived(
    photoItems.filter((item) => item.approvalState === 'approved' && !item.retiredAt).length
  );
  const defaultPhotoAltTextIs = $derived(
    `Ljósmynd af ${data.review.nameIs ?? data.review.nameEn ?? data.review.operatorName}`
  );
  const defaultPhotoAltTextEn = $derived(
    `Photo of ${data.review.nameEn ?? data.review.nameIs ?? data.review.operatorName}`
  );
  let locationMapAdapter = $state<MapAdapter>(
    untrack(() =>
      createMapLibreAdapter({
        style: data.mapStyleUrl ?? emptyMapLibreStyle,
        clusterLabel: (count) =>
          data.copy['directory.clusterCount'].replace('{count}', String(count))
      })
    )
  );
  const locationPlaces = $derived([
    {
      placeId: data.review.placeId,
      name: data.review.nameIs ?? data.review.nameEn ?? data.review.placeId,
      latitude: data.review.latitude,
      longitude: data.review.longitude
    }
  ]);
  const locationCamera = $derived({
    latitude: data.review.latitude,
    longitude: data.review.longitude,
    zoom: 16
  });

  const checklist: Array<{
    key: keyof typeof data.review.checks;
    label: MessageKey;
    recovery: MessageKey;
    target: string;
  }> = [
    {
      key: 'candidate',
      label: 'moderation.checkCandidate',
      recovery: 'moderation.addCandidateState',
      target: 'candidate-overview'
    },
    {
      key: 'operatorAndCategory',
      label: 'moderation.checkOperator',
      recovery: 'moderation.addOperator',
      target: 'candidate-overview'
    },
    {
      key: 'capitalRegionLocation',
      label: 'moderation.checkLocation',
      recovery: 'moderation.addLocation',
      target: 'location'
    },
    {
      key: 'geometryQuality',
      label: 'moderation.checkGeometry',
      recovery: 'moderation.correctGeometry',
      target: 'location'
    },
    {
      key: 'icelandicTranslation',
      label: 'moderation.checkIcelandic',
      recovery: 'moderation.addIcelandic',
      target: 'translations'
    },
    {
      key: 'englishTranslation',
      label: 'moderation.checkEnglish',
      recovery: 'moderation.addEnglish',
      target: 'translations'
    },
    {
      key: 'accessCondition',
      label: 'moderation.checkAccess',
      recovery: 'moderation.addAccess',
      target: 'access-condition'
    }
  ];

  const readinessIssues = $derived(
    checklist
      .filter((item) => !data.review.checks[item.key])
      .map((item): ModerationReviewIssue => ({
        sectionId: item.target,
        label: data.copy[item.recovery],
        severity: 'blocking'
      }))
  );
  const readinessState = $derived(data.review.ready ? 'ready' : 'blocked');
  const readinessLabel = $derived(
    data.review.ready
      ? data.copy['moderation.workbench.readiness.ready']
      : data.copy['moderation.workbench.readiness.blocked']
  );
  const readinessSummary = $derived(
    data.review.ready
      ? data.copy['moderation.workbench.readiness.readySummary']
      : data.copy['moderation.workbench.readiness.blockedSummary'].replace(
          '{count}',
          String(readinessIssues.length)
        )
  );

  const enhancePublication: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  const enhanceMedia: SubmitFunction = () => {
    return async ({ update }) => {
      await update();
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
      identityOperatorName = data.review.operatorName;
      identityCategory = data.review.category;
    } else if (sectionId === 'details') {
      detailsWebsiteUrl = data.review.websiteUrl ?? '';
      detailsPhone = data.review.phone ?? '';
      detailsOpeningHours = { ...data.review.openingHours };
      detailsDogAmenities = [...data.review.dogAmenities];
    } else if (sectionId === 'translations') {
      translationNameIs = data.review.nameIs ?? '';
      translationDescriptionIs = data.review.descriptionIs ?? '';
      translationNameEn = data.review.nameEn ?? '';
      translationDescriptionEn = data.review.descriptionEn ?? '';
    } else if (sectionId === 'location') {
      locationValue = {
        addressLine: data.review.addressLine,
        locality: data.review.locality,
        postalCode: data.review.postalCode,
        municipality: data.review.municipality,
        latitude: data.review.latitude,
        longitude: data.review.longitude,
        geometryPrecision: data.review.geometryPrecision,
        geometrySource: data.review.geometrySource
      };
    } else if (sectionId === 'wheelchair_accessibility') {
      wheelchairAccessibilityValue = data.review.wheelchairAccessibility;
    }
    editingSection = sectionId;
  }

  function editLabel(sectionTitle: string): string {
    return data.copy['moderation.workbench.editSection'].replace('{section}', sectionTitle);
  }

  function removeAmenity(index: number): void {
    detailsDogAmenities.splice(index, 1);
  }

  function addAmenity(): void {
    detailsDogAmenities.push('');
  }

  function cancelEditing(): void {
    editingSection = null;
  }

  function detailsSummary(): string {
    const contact =
      data.review.websiteUrl || data.review.phone
        ? data.copy['moderation.workbench.section.contactAvailable']
        : data.copy['moderation.workbench.section.contactMissing'];
    return `${contact} · ${data.copy['moderation.workbench.section.amenityCount'].replace(
      '{count}',
      String(data.review.dogAmenities.length)
    )}`;
  }

  function saveLabel(sectionId: EditableSectionId): string {
    return savingSection === sectionId
      ? data.copy['moderation.workbench.section.saving']
      : data.copy['common.save'];
  }

  const enhanceWheelchairAccessibility: SubmitFunction = () => {
    savingWheelchairAccessibility = true;
    return async ({ result, update }) => {
      await update();
      savingWheelchairAccessibility = false;
      if (result.type === 'success' || result.type === 'redirect') editingSection = null;
    };
  };

  function geometryPrecisionLabel(): string {
    const labels: Record<typeof data.review.geometryPrecision, MessageKey> = {
      moderator_confirmed_point: 'moderation.geometryPrecision.moderatorConfirmed',
      official_address_point: 'moderation.geometryPrecision.officialAddress',
      official_representative_centroid: 'moderation.geometryPrecision.officialCentroid',
      municipality_anchor_pending_geocode: 'moderation.geometryPrecision.pending'
    };

    return data.copy[labels[data.review.geometryPrecision]];
  }

  function wheelchairAccessibilityLabel(): string {
    const labels: Record<typeof data.review.wheelchairAccessibility, MessageKey> = {
      accessible: 'wheelchairAccessibility.accessible',
      not_accessible: 'wheelchairAccessibility.notAccessible',
      unknown: 'wheelchairAccessibility.unknown'
    };

    return data.copy[labels[data.review.wheelchairAccessibility]];
  }

  async function requestPublication(reason: string): Promise<void> {
    publicationReason = reason.trim();
    confirmingPublish = false;
    await tick();
    publicationForm?.requestSubmit();
  }

  function beginCandidateDecision(outcome: CandidateDecisionOutcome): void {
    if (editingSection !== null || submitting || !canDecide) return;
    if (outcome === 'publish') {
      confirmingPublish = true;
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

  function describeCondition(
    condition: CandidatePublicationReview['accessConditions'][number]
  ): string {
    return explainAccessCondition(
      {
        id: condition.id,
        placeId: data.review.placeId,
        revision: 1,
        accessArea: condition.accessArea,
        accessAreaNote: condition.accessAreaNote ?? undefined,
        restraintCondition: condition.restraintCondition,
        restraintNote: condition.restraintNote ?? undefined,
        dogEligibility: condition.dogEligibility,
        availabilityWindow: condition.availabilityWindow,
        availabilityState: condition.availabilityState,
        permissionRequirement: condition.permissionRequirement,
        supersededAt: null
      },
      data.lang
    );
  }

  async function handleEvidenceFileChange(fileInput: HTMLInputElement): Promise<void> {
    evidenceFileError = null;
    evidenceWidth = null;
    evidenceHeight = null;
    const file = fileInput.files?.[0];
    if (!file) return;

    evidenceProcessing = true;
    try {
      const dimensions = await readImageDimensions(file);
      evidenceWidth = dimensions.width;
      evidenceHeight = dimensions.height;
    } catch {
      evidenceFileError = 'moderation.media.error.fileType';
    } finally {
      evidenceProcessing = false;
    }
  }

  async function handlePhotoFileChange(fileInput: HTMLInputElement): Promise<void> {
    photoFileError = null;
    photoWidth = null;
    photoHeight = null;
    const file = fileInput.files?.[0];
    if (!file) return;

    photoProcessing = true;
    try {
      const downscaled = await downscaleImageFile(file);
      photoWidth = downscaled.width;
      photoHeight = downscaled.height;

      const transfer = new DataTransfer();
      transfer.items.add(downscaled.file);
      fileInput.files = transfer.files;
    } catch {
      photoFileError = 'moderation.media.error.fileType';
    } finally {
      photoProcessing = false;
    }
  }

  $effect(() => {
    if (
      (publishError || locationCorrectionError || wheelchairAccessibilityError || mediaError) &&
      alertElement
    ) {
      void tick().then(() => alertElement?.focus());
    }
  });

  $effect(() => {
    oneditstatechange?.(editingSection !== null);
    return () => oneditstatechange?.(false);
  });
</script>

<div class="review-shell" class:standalone>
  {#if standalone}
    <header>
      <p class="eyebrow">{data.copy['nav.moderation']}</p>
      <h1>{data.copy['moderation.reviewTitle']}</h1>
      <p>{data.copy['moderation.reviewIntro']}</p>
    </header>
  {/if}

  {#if publishError}
    <section class="message error" role="alert" tabindex="-1" bind:this={alertElement}>
      <strong>{publishError}</strong>
      {#if form && 'conflict' in form && form.conflict}
        <a
          href={resolve('/[lang=lang]/moderation/places/[id]', {
            lang: data.lang,
            id: data.review.placeId
          })}
        >
          {data.copy['moderation.reloadCurrent']}
        </a>
      {/if}
    </section>
  {/if}

  {#if succeeded}
    <section class="message success" role="status">
      <strong>{data.copy['moderation.published']}</strong>
    </section>
  {/if}

  <h2 class="readiness-title">{data.copy['moderation.checklistTitle']}</h2>
  <ModerationReadinessSummary
    label={data.copy['moderation.checklistTitle']}
    state={readinessState}
    stateLabel={readinessLabel}
    summary={readinessSummary}
    issues={readinessIssues}
  />

  <form
    id="candidate-publication"
    bind:this={publicationForm}
    method="POST"
    action="?/publish"
    use:enhance={enhancePublication}
    aria-busy={submitting}
  >
    <input type="hidden" name="placeId" value={data.review.placeId} />
    <input type="hidden" name="expectedVersion" value={data.review.version} />
    <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
    <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
    <input type="hidden" name="freshnessUntil" value={data.defaultFreshnessUntil} />
    <input
      type="hidden"
      name="publicationReason"
      value={standalone ? publicationReason : externalPublicationReason}
    />
  </form>

  {#if draftError}<p class="message error" role="alert">{draftError}</p>{/if}
  {#if draftSucceeded}
    <p class="message success" role="status">{data.copy['moderation.workbench.draftSaved']}</p>
  {/if}

  {#if standalone && (canDecide || decisionError)}<div class="candidate-actions">
      <ModerationActionBar
        label={data.copy['moderation.workbench.candidateActions']}
        disabled={editingSection !== null}
        hint={editingSection !== null
          ? data.copy['moderation.workbench.unsavedDecisionHint']
          : null}
      >
        {#if decisionError}<p class="decision-error" role="alert">{decisionError}</p>{/if}
        <CandidateDecisionControls
          copy={data.copy}
          status={data.review.candidateStatus}
          ready={data.review.ready}
          disabled={submitting || editingSection !== null}
          ondecide={beginCandidateDecision}
        />
      </ModerationActionBar>
    </div>{/if}

  {#if standalone && canDecide}
    <form
      class="decision-form"
      bind:this={candidateDecisionForm}
      method="POST"
      action="?/decideCandidate"
      use:enhance={enhancePublication}
    >
      <input type="hidden" name="placeId" value={data.review.placeId} />
      <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
      <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
      <input type="hidden" name="decision" value={candidateDecision} />
      <input type="hidden" name="confirmedDecision" value={candidateDecision} />
      <input type="hidden" name="reasonCode" value={candidateReasonCode} />
      <input type="hidden" name="memberReasonIs" value={candidateMemberReasonIs} />
      <input type="hidden" name="memberReasonEn" value={candidateMemberReasonEn} />
      <input type="hidden" name="privateNote" value={candidatePrivateNote} />
    </form>
  {/if}

  <div class="review-sections">
    <ModerationReviewSection
      id="candidate-overview"
      title={data.copy['moderation.identityHeading']}
      summary={`${data.review.operatorName} · ${localizePlaceCategory(data.review.category as PlaceCategory, data.copy)}`}
      state={data.review.checks.candidate && data.review.checks.operatorAndCategory
        ? 'complete'
        : 'blocking'}
    >
      {#if editingSection === 'identity'}
        <form
          class="section-form"
          data-section-form="identity"
          method="POST"
          action="?/saveCandidateSection"
          use:enhance={enhanceSection('identity')}
          aria-busy={savingSection === 'identity'}
        >
          <input type="hidden" name="placeId" value={data.review.placeId} />
          <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
          <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
          <input type="hidden" name="sectionId" value="identity" />
          <input type="hidden" name="sectionPayload" value={identitySectionPayload} />
          <label>
            {data.copy['moderation.operatorLabel']}
            <input required bind:value={identityOperatorName} />
          </label>
          <label>
            {data.copy['place.category']}
            <select required bind:value={identityCategory}>
              <option value="restaurant">{data.copy['category.restaurant']}</option>
              <option value="cafe">{data.copy['category.cafe']}</option>
              <option value="bar">{data.copy['category.bar']}</option>
              <option value="shop">{data.copy['category.shop']}</option>
              <option value="shopping_centre">{data.copy['category.shoppingCentre']}</option>
              <option value="accommodation">{data.copy['category.accommodation']}</option>
              <option value="park">{data.copy['category.park']}</option>
              <option value="recreation">{data.copy['category.recreation']}</option>
              <option value="culture">{data.copy['category.culture']}</option>
              <option value="service">{data.copy['category.service']}</option>
              <option value="other">{data.copy['category.other']}</option>
            </select>
          </label>
          <div class="section-form-actions">
            <button type="button" class="quiet" onclick={cancelEditing}
              >{data.copy['common.cancel']}</button
            >
            <button type="submit" disabled={savingSection === 'identity'}
              >{saveLabel('identity')}</button
            >
          </div>
        </form>
      {:else}
        <div class="section-view">
          <section class="place-card" aria-labelledby="place-name">
            <span class="state">{data.copy[`status.${data.review.lifecycle}` as MessageKey]}</span>
            <h2 id="place-name">
              {data.lang === 'is'
                ? (data.review.nameIs ?? data.review.nameEn ?? data.review.placeId)
                : (data.review.nameEn ?? data.review.nameIs ?? data.review.placeId)}
            </h2>
            <p>
              {data.review.operatorName} · {localizePlaceCategory(
                data.review.category as PlaceCategory,
                data.copy
              )}
            </p>
          </section>
          <button
            type="button"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.identityHeading'])}
            onclick={() => beginEditing('identity')}
            >{editLabel(data.copy['moderation.identityHeading'])}</button
          >
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="candidate-details"
      title={data.copy['moderation.workbench.section.details']}
      summary={detailsSummary()}
    >
      {#if editingSection === 'details'}
        <form
          class="section-form section-form-wide"
          data-section-form="details"
          method="POST"
          action="?/saveCandidateSection"
          use:enhance={enhanceSection('details')}
          aria-busy={savingSection === 'details'}
        >
          <input type="hidden" name="placeId" value={data.review.placeId} />
          <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
          <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
          <input type="hidden" name="sectionId" value="details" />
          <input type="hidden" name="sectionPayload" value={detailsSectionPayload} />
          <label>
            {data.copy['moderation.websiteLabel']}
            <input type="url" bind:value={detailsWebsiteUrl} />
          </label>
          <label>
            {data.copy['moderation.phoneLabel']}
            <input type="tel" bind:value={detailsPhone} />
          </label>
          <div class="wide editor-group">
            <h3>{data.copy['place.openingHours']}</h3>
            <OpeningHoursEditor copy={data.copy} bind:value={detailsOpeningHours} />
          </div>
          <fieldset class="wide amenities-editor">
            <legend>{data.copy['place.amenities']}</legend>
            {#each detailsDogAmenities as amenity, index (index)}
              <div class="repeated-row">
                <label>
                  {data.copy['moderation.amenityLabel'].replace('{number}', String(index + 1))}
                  <input
                    value={amenity}
                    oninput={(event) => (detailsDogAmenities[index] = event.currentTarget.value)}
                  />
                </label>
                <button type="button" class="quiet" onclick={() => removeAmenity(index)}>
                  {data.copy['moderation.removeAmenity']}
                </button>
              </div>
            {/each}
            <button type="button" class="quiet add-row" onclick={addAmenity}>
              {data.copy['moderation.addAmenity']}
            </button>
          </fieldset>
          <div class="section-form-actions">
            <button type="button" class="quiet" onclick={cancelEditing}
              >{data.copy['common.cancel']}</button
            >
            <button type="submit" disabled={savingSection === 'details'}
              >{saveLabel('details')}</button
            >
          </div>
        </form>
      {:else}
        <div class="section-view detail-facts">
          <dl>
            <div>
              <dt>{data.copy['moderation.websiteLabel']}</dt>
              <dd>{data.review.websiteUrl ?? data.copy['common.notAvailable']}</dd>
            </div>
            <div>
              <dt>{data.copy['moderation.phoneLabel']}</dt>
              <dd>{data.review.phone ?? data.copy['common.notAvailable']}</dd>
            </div>
            <div>
              <dt>{data.copy['place.openingHours']}</dt>
              <dd>
                {formatOpeningHours(
                  data.review.openingHours,
                  data.copy,
                  data.copy['common.notAvailable']
                )}
              </dd>
            </div>
            <div>
              <dt>{data.copy['place.amenities']}</dt>
              <dd>
                {data.review.dogAmenities.length
                  ? formatDogAmenities(data.review.dogAmenities, data.copy)
                  : data.copy['common.notAvailable']}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.workbench.section.details'])}
            onclick={() => beginEditing('details')}
            >{editLabel(data.copy['moderation.workbench.section.details'])}</button
          >
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="wheelchair-accessibility"
      title={data.copy['moderation.wheelchairAccessibilityLabel']}
      summary={wheelchairAccessibilityLabel()}
    >
      {#if editingSection === 'wheelchair_accessibility'}
        <form
          class="section-form section-form-stack"
          method="POST"
          action="?/updateWheelchairAccessibility"
          use:enhance={enhanceWheelchairAccessibility}
          aria-busy={savingWheelchairAccessibility}
        >
          <input type="hidden" name="placeId" value={data.review.placeId} />
          <input type="hidden" name="expectedVersion" value={data.review.version} />
          <label>
            {data.copy['moderation.wheelchairAccessibilityLabel']}
            <select name="wheelchairAccessibility" bind:value={wheelchairAccessibilityValue}>
              <option value="accessible">{data.copy['wheelchairAccessibility.accessible']}</option>
              <option value="not_accessible"
                >{data.copy['wheelchairAccessibility.notAccessible']}</option
              >
              <option value="unknown">{data.copy['wheelchairAccessibility.unknown']}</option>
            </select>
          </label>
          <p class="field-help">{data.copy['moderation.wheelchairAccessibilityHelp']}</p>
          <div class="section-form-actions">
            <button type="button" class="quiet" onclick={cancelEditing}
              >{data.copy['common.cancel']}</button
            >
            <button type="submit" disabled={savingWheelchairAccessibility}>
              {savingWheelchairAccessibility
                ? data.copy['moderation.workbench.section.saving']
                : data.copy['moderation.saveWheelchairAccessibility']}
            </button>
          </div>
        </form>
      {:else}
        <div class="section-view">
          <p>{wheelchairAccessibilityLabel()}</p>
          <button
            type="button"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.wheelchairAccessibilityLabel'])}
            onclick={() => beginEditing('wheelchair_accessibility')}
            >{editLabel(data.copy['moderation.wheelchairAccessibilityLabel'])}</button
          >
        </div>
      {/if}
      {#if wheelchairAccessibilityError}
        <p class="message error" role="alert">{wheelchairAccessibilityError}</p>
      {:else if wheelchairAccessibilitySucceeded}
        <p class="message success" role="status">
          {data.copy['moderation.wheelchairAccessibilitySaved']}
        </p>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="location"
      title={data.copy['moderation.locationHeading']}
      summary={`${data.review.addressLine}, ${data.review.locality}`}
      state={data.review.checks.capitalRegionLocation && data.review.checks.geometryQuality
        ? 'complete'
        : 'blocking'}
    >
      <div class="location-detail">
        <p>
          {data.review.addressLine}, {data.review.postalCode}
          {data.review.locality}
        </p>
        <p>{data.review.latitude.toFixed(6)}, {data.review.longitude.toFixed(6)}</p>
        <p><strong>{geometryPrecisionLabel()}</strong></p>
        <p>{data.review.geometrySource}</p>
        {#if editingSection !== 'location'}
          <MapSurface
            adapter={locationMapAdapter}
            places={locationPlaces}
            selectedPlaceId={data.review.placeId}
            camera={locationCamera}
            copy={data.copy}
            onMarkerSelect={() => undefined}
            onCameraChange={() => undefined}
            compact
          />
        {/if}
        {#if editingSection === 'location'}
          <form
            class="location-correction section-form"
            data-section-form="location"
            method="POST"
            action={data.review.lifecycle === 'published'
              ? '?/correctLocation'
              : '?/saveCandidateSection'}
            use:enhance={enhanceSection('location')}
            aria-busy={savingSection === 'location'}
          >
            <input type="hidden" name="placeId" value={data.review.placeId} />
            {#if data.review.lifecycle === 'published'}
              <input type="hidden" name="expectedVersion" value={data.review.version} />
            {:else}
              <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
              <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
              <input type="hidden" name="sectionId" value="location" />
            {/if}
            <div class="wide">
              <ModerationLocationEditor
                copy={data.copy}
                bind:value={locationValue}
                markerName={data.review.nameIs ?? data.review.nameEn ?? data.review.placeId}
                mapStyleUrl={data.mapStyleUrl}
              />
            </div>
            <div class="section-form-actions wide">
              <button type="button" class="quiet" onclick={cancelEditing}
                >{data.copy['common.cancel']}</button
              >
              <button type="submit" disabled={savingSection === 'location'}
                >{saveLabel('location')}</button
              >
            </div>
          </form>
        {:else}
          <button
            type="button"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.locationHeading'])}
            onclick={() => beginEditing('location')}
            >{editLabel(data.copy['moderation.locationHeading'])}</button
          >
        {/if}
        {#if locationCorrectionError}
          <p class="message error" role="alert">{locationCorrectionError}</p>
        {:else if locationCorrectionSucceeded}
          <p class="message success" role="status">{data.copy['moderation.geometryCorrected']}</p>
        {/if}
      </div>
    </ModerationReviewSection>

    <ModerationReviewSection
      id="translations"
      title={data.copy['moderation.workbench.section.translations']}
      summary={data.review.checks.icelandicTranslation && data.review.checks.englishTranslation
        ? data.copy['moderation.workbench.section.translationsComplete']
        : data.copy['moderation.workbench.section.translationsMissing']}
      state={data.review.checks.icelandicTranslation && data.review.checks.englishTranslation
        ? 'complete'
        : 'blocking'}
    >
      {#if editingSection === 'translations'}
        <form
          class="section-form"
          data-section-form="translations"
          method="POST"
          action="?/saveCandidateSection"
          use:enhance={enhanceSection('translations')}
          aria-busy={savingSection === 'translations'}
        >
          <input type="hidden" name="placeId" value={data.review.placeId} />
          <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
          <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
          <input type="hidden" name="sectionId" value="translations" />
          <input type="hidden" name="sectionPayload" value={translationsSectionPayload} />
          <label lang="is">
            {data.copy['moderation.nameIsLabel']}
            <input required bind:value={translationNameIs} />
          </label>
          <label lang="en">
            {data.copy['moderation.nameEnLabel']}
            <input required bind:value={translationNameEn} />
          </label>
          <label class="wide" lang="is">
            {data.copy['moderation.descriptionIsLabel']}
            <textarea required bind:value={translationDescriptionIs}></textarea>
          </label>
          <label class="wide" lang="en">
            {data.copy['moderation.descriptionEnLabel']}
            <textarea required bind:value={translationDescriptionEn}></textarea>
          </label>
          <div class="section-form-actions">
            <button type="button" class="quiet" onclick={cancelEditing}
              >{data.copy['common.cancel']}</button
            >
            <button type="submit" disabled={savingSection === 'translations'}
              >{saveLabel('translations')}</button
            >
          </div>
        </form>
      {:else}
        <div class="section-view translation-view">
          <div class="translation-grid">
            <article lang="is">
              <h3>{data.copy['moderation.checkIcelandic']}</h3>
              <p>{data.review.nameIs ?? data.copy['common.notAvailable']}</p>
              <p>{data.review.descriptionIs ?? data.copy['common.notAvailable']}</p>
            </article>
            <article lang="en">
              <h3>{data.copy['moderation.checkEnglish']}</h3>
              <p>{data.review.nameEn ?? data.copy['common.notAvailable']}</p>
              <p>{data.review.descriptionEn ?? data.copy['common.notAvailable']}</p>
            </article>
          </div>
          <button
            type="button"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.workbench.section.translations'])}
            onclick={() => beginEditing('translations')}
            >{editLabel(data.copy['moderation.workbench.section.translations'])}</button
          >
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="access-condition"
      title={data.copy['moderation.checkAccess']}
      summary={data.copy['moderation.workbench.section.itemCount'].replace(
        '{count}',
        String(data.review.accessConditions.length)
      )}
      state={data.review.checks.accessCondition ? 'complete' : 'blocking'}
    >
      {#if editingSection === 'access_conditions'}
        <form
          class="section-form section-form-stack"
          data-section-form="access_conditions"
          method="POST"
          action="?/saveCandidateSection"
          use:enhance={enhanceSection('access_conditions')}
          aria-busy={savingSection === 'access_conditions'}
        >
          <input type="hidden" name="placeId" value={data.review.placeId} />
          <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
          <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
          <input type="hidden" name="sectionId" value="access_conditions" />
          <AccessConditionsEditor copy={data.copy} conditions={data.review.accessConditions} />
          <div class="section-form-actions">
            <button type="button" class="quiet" onclick={cancelEditing}
              >{data.copy['common.cancel']}</button
            >
            <button type="submit" disabled={savingSection === 'access_conditions'}
              >{saveLabel('access_conditions')}</button
            >
          </div>
        </form>
      {:else}
        <div class="section-view">
          <ol class="review-records">
            {#each data.review.accessConditions as condition (condition.id)}
              <li>
                <strong>{describeCondition(condition)}</strong>
              </li>
            {/each}
          </ol>
          <button
            type="button"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.checkAccess'])}
            onclick={() => beginEditing('access_conditions')}
            >{editLabel(data.copy['moderation.checkAccess'])}</button
          >
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="evidence"
      title={data.copy['moderation.checkEvidence']}
      summary={data.copy['moderation.workbench.section.sourceCount'].replace(
        '{count}',
        String(data.review.evidenceRecords.length)
      )}
      state="complete"
    >
      {#if editingSection === 'evidence_records'}
        <form
          class="section-form section-form-stack"
          data-section-form="evidence_records"
          method="POST"
          action="?/saveCandidateSection"
          use:enhance={enhanceSection('evidence_records')}
          aria-busy={savingSection === 'evidence_records'}
        >
          <input type="hidden" name="placeId" value={data.review.placeId} />
          <input type="hidden" name="expectedItemVersion" value={data.review.itemVersion} />
          <input type="hidden" name="expectedDraftVersion" value={data.review.draftVersion} />
          <input type="hidden" name="sectionId" value="evidence_records" />
          <EvidenceRecordsEditor copy={data.copy} evidenceRecords={data.review.evidenceRecords} />
          <div class="section-form-actions">
            <button type="button" class="quiet" onclick={cancelEditing}
              >{data.copy['common.cancel']}</button
            >
            <button type="submit" disabled={savingSection === 'evidence_records'}
              >{saveLabel('evidence_records')}</button
            >
          </div>
        </form>
      {:else}
        <div class="section-view">
          <ul class="review-records">
            {#each data.review.evidenceRecords as evidence (evidence.id)}
              <li class="evidence-record">
                <strong>{evidence.sourceLabel}</strong>
                <span>{localizeEvidenceKind(evidence.kind, data.copy)}</span>
                {#if evidence.sourceUrl}<span class="reference">{evidence.sourceUrl}</span>{/if}
                {#if evidence.sourceCitation}
                  <span class="reference">{evidence.sourceCitation}</span>
                {/if}
                <time datetime={evidence.observedAt}
                  >{formatLocalizedDate(evidence.observedAt, data.lang)}</time
                >
              </li>
            {/each}
          </ul>
          <button
            type="button"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.checkEvidence'])}
            onclick={() => beginEditing('evidence_records')}
            >{editLabel(data.copy['moderation.checkEvidence'])}</button
          >
        </div>
      {/if}
    </ModerationReviewSection>

    <ModerationReviewSection
      id="candidate-media"
      title={data.copy['moderation.media.title']}
      summary={data.copy['moderation.workbench.section.mediaCount'].replace(
        '{count}',
        String(data.media.length)
      )}
    >
      <div class="media-section">
        <p>{data.copy['moderation.media.intro']}</p>

        {#if mediaError}
          <section class="message error" role="alert">
            <strong>{mediaError}</strong>
          </section>
        {/if}
        {#if mediaSucceeded}
          <section class="message success" role="status">
            <strong>
              {form && 'action' in form && form.action === 'uploadEvidence'
                ? data.copy['moderation.media.uploadSucceeded']
                : form && 'action' in form && form.action === 'uploadPhoto'
                  ? data.copy['moderation.media.approveSucceeded']
                  : form && 'action' in form && form.action === 'approveMedia'
                    ? data.copy['moderation.media.approveSucceeded']
                    : form && 'action' in form && form.action === 'rejectMedia'
                      ? data.copy['moderation.media.rejectSucceeded']
                      : data.copy['moderation.media.retireSucceeded']}
            </strong>
          </section>
        {/if}

        <div class="media-columns">
          <article
            class="media-column"
            aria-labelledby="evidence-media-title"
            data-media-column="evidence"
          >
            <h3 id="evidence-media-title">{data.copy['moderation.media.evidenceTitle']}</h3>
            {#if evidenceItems.length === 0}
              <p>{data.copy['moderation.media.evidenceEmpty']}</p>
            {:else}
              <ul class="media-list">
                {#each evidenceItems as item (item.mediaId)}
                  <li
                    class="media-item"
                    class:retired={Boolean(item.retiredAt)}
                    data-media-item={item.mediaId}
                    data-storage-object-path={item.storageObjectPath}
                  >
                    {#if item.signedUrl}
                      <img src={item.signedUrl} alt="" width="160" height="120" loading="lazy" />
                    {/if}
                    <div class="media-item-body">
                      {#if item.sourceUrl}<span class="reference">{item.sourceUrl}</span>{/if}
                      {#if item.capturedAt}
                        <time datetime={item.capturedAt}
                          >{formatLocalizedDate(item.capturedAt, data.lang)}</time
                        >
                      {/if}
                      {#if item.retiredAt}
                        <span class="badge">{data.copy['moderation.media.retired']}</span>
                      {:else}
                        <form method="POST" action="?/retireMedia" use:enhance={enhanceMedia}>
                          <input type="hidden" name="placeId" value={data.review.placeId} />
                          <input type="hidden" name="mediaId" value={item.mediaId} />
                          <button type="submit">{data.copy['moderation.media.retireAction']}</button
                          >
                        </form>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}

            <form
              method="POST"
              action="?/uploadEvidence"
              enctype="multipart/form-data"
              use:enhance={enhanceMedia}
              class="media-upload-form"
            >
              <input type="hidden" name="placeId" value={data.review.placeId} />
              <h4>{data.copy['moderation.media.uploadEvidenceTitle']}</h4>
              <label>
                {data.copy['moderation.media.fileLabel']}
                <input
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  onchange={(fileEvent) => handleEvidenceFileChange(fileEvent.currentTarget)}
                />
              </label>
              <input type="hidden" name="widthPx" value={evidenceWidth ?? ''} />
              <input type="hidden" name="heightPx" value={evidenceHeight ?? ''} />
              {#if evidenceFileError}
                <p class="field-error">{data.copy[evidenceFileError]}</p>
              {/if}
              <label>
                {data.copy['moderation.media.sourceUrlLabel']}
                <input type="url" name="sourceUrl" required />
              </label>
              <label>
                {data.copy['moderation.media.capturedAtLabel']}
                <input type="datetime-local" name="capturedAt" required />
              </label>
              <button type="submit" disabled={evidenceProcessing || !evidenceWidth}>
                {evidenceProcessing
                  ? data.copy['moderation.media.uploading']
                  : data.copy['moderation.media.uploadEvidenceAction']}
              </button>
            </form>
          </article>

          <article
            class="media-column"
            aria-labelledby="photo-media-title"
            data-media-column="photo"
          >
            <h3 id="photo-media-title">{data.copy['moderation.media.photosTitle']}</h3>
            {#if photoItems.length === 0}
              <p>{data.copy['moderation.media.photosEmpty']}</p>
            {:else}
              <ul class="media-list">
                {#each photoItems as item (item.mediaId)}
                  <li
                    class="media-item"
                    class:retired={Boolean(item.retiredAt)}
                    data-media-item={item.mediaId}
                    data-storage-object-path={item.storageObjectPath}
                  >
                    {#if item.signedUrl}
                      <img src={item.signedUrl} alt="" width="160" height="120" loading="lazy" />
                    {/if}
                    <div class="media-item-body">
                      <span class="badge"
                        >{data.copy[
                          `moderation.media.state.${item.approvalState}` as MessageKey
                        ]}</span
                      >
                      {#if item.isPrimary}
                        <span class="badge">{data.copy['moderation.media.primary']}</span>
                      {/if}
                      {#if item.retiredAt}
                        <span class="badge">{data.copy['moderation.media.retired']}</span>
                      {:else if item.approvalState === 'pending'}
                        <form
                          method="POST"
                          action="?/approveMedia"
                          use:enhance={enhanceMedia}
                          class="approve-form"
                        >
                          <input type="hidden" name="placeId" value={data.review.placeId} />
                          <input type="hidden" name="mediaId" value={item.mediaId} />
                          <ModerationPhotoApprovalFields
                            copy={data.copy}
                            defaultAltTextIs={defaultPhotoAltTextIs}
                            defaultAltTextEn={defaultPhotoAltTextEn}
                            initial={{ ...item, makePrimary: item.isPrimary }}
                            autoPrimary={activeApprovedPhotoCount === 0}
                            allowPrimaryChoice={activeApprovedPhotoCount > 0}
                          />
                          <button type="submit"
                            >{data.copy['moderation.media.publishPhotoAction']}</button
                          >
                        </form>
                        <form method="POST" action="?/rejectMedia" use:enhance={enhanceMedia}>
                          <input type="hidden" name="placeId" value={data.review.placeId} />
                          <input type="hidden" name="mediaId" value={item.mediaId} />
                          <button type="submit">{data.copy['moderation.media.rejectAction']}</button
                          >
                        </form>
                      {:else}
                        <form method="POST" action="?/retireMedia" use:enhance={enhanceMedia}>
                          <input type="hidden" name="placeId" value={data.review.placeId} />
                          <input type="hidden" name="mediaId" value={item.mediaId} />
                          <button type="submit">{data.copy['moderation.media.retireAction']}</button
                          >
                        </form>
                      {/if}
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}

            <form
              method="POST"
              action="?/uploadPhoto"
              enctype="multipart/form-data"
              use:enhance={enhanceMedia}
              class="media-upload-form"
            >
              <input type="hidden" name="placeId" value={data.review.placeId} />
              <h4>{data.copy['moderation.media.uploadPhotoTitle']}</h4>
              <label>
                {data.copy['moderation.media.fileLabel']}
                <input
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  onchange={(fileEvent) => handlePhotoFileChange(fileEvent.currentTarget)}
                />
              </label>
              <input type="hidden" name="widthPx" value={photoWidth ?? ''} />
              <input type="hidden" name="heightPx" value={photoHeight ?? ''} />
              {#if photoFileError}
                <p class="field-error">{data.copy[photoFileError]}</p>
              {/if}
              <ModerationPhotoApprovalFields
                copy={data.copy}
                defaultAltTextIs={defaultPhotoAltTextIs}
                defaultAltTextEn={defaultPhotoAltTextEn}
                autoPrimary={activeApprovedPhotoCount === 0}
                allowPrimaryChoice={activeApprovedPhotoCount > 0}
              />
              <button type="submit" disabled={photoProcessing || !photoWidth}>
                {photoProcessing
                  ? data.copy['moderation.media.uploading']
                  : data.copy['moderation.media.uploadAndPublishAction']}
              </button>
            </form>
          </article>
        </div>
      </div>
    </ModerationReviewSection>
  </div>

  {#if standalone}<ModerationPublishDialog
      open={confirmingPublish}
      title={data.copy['moderation.workbench.publishConfirmTitle']}
      description={data.copy['moderation.workbench.publishConfirmBody']}
      reasonLabel={data.copy['moderation.workbench.publishReasonLabel']}
      reasonHelp={data.copy['moderation.workbench.publishReasonHelp']}
      confirmLabel={data.copy['moderation.verifyAndPublish']}
      cancelLabel={data.copy['moderation.workbench.keepReviewing']}
      onconfirm={requestPublication}
      oncancel={() => (confirmingPublish = false)}
    />
    {#if candidateDialog}
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
        {submitting}
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
</div>

<style>
  :global(body) {
    margin: 0;
    background: var(--hv-color-snow);
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-ui);
  }

  .review-shell {
    min-width: 0;
    width: 100%;
  }

  .review-shell * {
    min-width: 0;
    box-sizing: border-box;
  }

  .review-shell.standalone {
    width: min(100% - 2rem, 72rem);
    margin: 0 auto;
    padding: 3rem 0 5rem;
  }

  header {
    max-width: 48rem;
    margin-bottom: 1rem;
  }

  .eyebrow {
    color: var(--hv-color-fjord);
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.25rem 0;
    font-family: var(--hv-font-display);
    font-size: clamp(2rem, 6vw, 3.5rem);
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .readiness-title {
    margin: 0 0 0.45rem;
    font-family: var(--hv-font-display);
    font-size: 1rem;
  }

  .candidate-actions {
    margin-top: 0.75rem;
  }

  .decision-error {
    margin: 0 0 0.55rem;
    border: 1px solid var(--hv-color-danger);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-danger-soft);
    padding: 0.55rem;
  }

  .review-sections {
    display: grid;
    gap: 0.65rem;
    margin-top: 0.75rem;
  }

  .section-view {
    display: grid;
    gap: 0.7rem;
  }

  .edit-section {
    justify-self: end;
    min-height: 2.4rem;
    background: var(--hv-color-snow-raised);
  }

  .section-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    align-items: end;
    margin-top: 0;
  }

  .section-form-stack,
  .section-form-wide {
    grid-template-columns: 1fr;
  }

  .section-form .wide,
  .section-form-actions {
    grid-column: 1 / -1;
  }

  .section-form-actions {
    display: flex;
    gap: 0.55rem;
    justify-content: flex-end;
  }

  .section-form-actions button {
    min-width: 7rem;
  }

  .section-form .quiet,
  .edit-section {
    background: var(--hv-color-snow-raised);
  }

  .editor-group,
  .amenities-editor {
    margin: 0;
    padding: 0.7rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
  }

  .editor-group h3,
  .amenities-editor legend {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    font-weight: 850;
  }

  .amenities-editor {
    display: grid;
    gap: 0.55rem;
  }

  .amenities-editor legend {
    padding-inline: 0.35rem;
  }

  .repeated-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: end;
  }

  .add-row {
    width: fit-content;
  }

  .detail-facts dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0;
  }

  .detail-facts dl div {
    display: grid;
    gap: 0.2rem;
    padding: 0.55rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
  }

  .detail-facts dt {
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    font-weight: 800;
  }

  .detail-facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .location-correction {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    align-items: end;
    margin-top: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
  }

  .location-correction .wide,
  .location-correction button {
    grid-column: 1 / -1;
  }

  .place-card,
  form {
    border: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
  }

  .evidence-record {
    display: grid;
    gap: 0.2rem;
  }

  .reference {
    overflow-wrap: anywhere;
    color: var(--hv-color-basalt-muted);
  }

  .place-card {
    padding: 0.85rem;
    border-radius: var(--hv-radius-panel);
    box-shadow: none;
  }

  .state {
    display: inline-block;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--hv-color-fjord);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-fjord-soft);
    color: var(--hv-color-basalt);
    font-weight: 850;
    font-size: 0.75rem;
  }

  .place-card h2 {
    margin-top: 0.65rem;
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
    grid-template-columns: 1.65rem 1fr;
    gap: 0.5rem;
    padding: 0.55rem;
    border: 1px solid var(--hv-color-success);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-success-soft);
  }

  li > span {
    display: grid;
    width: 1.55rem;
    height: 1.55rem;
    place-items: center;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-success);
    color: var(--hv-color-snow-raised);
    font-weight: 900;
  }

  li div {
    display: grid;
    gap: 0.2rem;
  }

  .translation-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .translation-grid article {
    padding: 0.75rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
  }

  .translation-grid h3 {
    margin: 0 0 0.45rem;
    font-size: 0.95rem;
  }

  .location-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(22rem, 0.85fr);
    gap: 0.8rem 1rem;
  }

  .location-detail > p {
    grid-column: 1 / -1;
    margin-block: 0;
  }

  .location-detail :global(.map-surface) {
    grid-column: 1;
  }

  .location-detail .location-correction {
    grid-column: 2;
    margin-top: 0;
  }

  .review-shell:not(.standalone) .location-detail {
    grid-template-columns: 1fr;
  }

  .review-shell:not(.standalone) .location-detail :global(.map-surface),
  .review-shell:not(.standalone) .location-detail .location-correction {
    grid-column: 1;
  }

  .review-records {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .review-records > li {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.2rem;
    padding: 0.5rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow);
  }

  .review-records > li > span {
    display: block;
    width: auto;
    height: auto;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font-weight: inherit;
  }

  form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    align-items: end;
    margin-top: 0.75rem;
    padding: 0.75rem;
    border-radius: var(--hv-radius-panel);
  }

  label {
    display: grid;
    flex: 1 1 18rem;
    gap: 0.25rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  input[type='datetime-local'],
  input[type='url'],
  input[type='tel'],
  input[type='file'],
  input:not([type]),
  select {
    width: 100%;
    max-width: 100%;
    min-height: 2.5rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
  }

  textarea {
    width: 100%;
    min-height: 6rem;
    box-sizing: border-box;
    resize: vertical;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
  }

  button {
    min-height: 2.65rem;
    padding: 0.6rem 0.85rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
    font-weight: 850;
    box-shadow: none;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  a {
    color: var(--hv-color-fjord);
    font-weight: 800;
  }

  .message {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding: 0.7rem;
    border: 1px solid;
    border-radius: var(--hv-radius-panel);
  }

  .error {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
  }

  .success {
    border-color: var(--hv-color-success);
    background: var(--hv-color-success-soft);
    color: var(--hv-color-success);
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  a:focus-visible,
  .message:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .media-section {
    margin-top: 1rem;
  }

  .media-columns {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .review-shell.standalone .media-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .media-column {
    padding: 0.85rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: none;
  }

  .media-column h3 {
    margin-top: 0;
  }

  .media-list {
    display: grid;
    gap: 0.75rem;
    margin: 0 0 1.25rem;
    padding: 0;
    list-style: none;
  }

  .media-item {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 0.65rem;
    padding: 0.6rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow);
  }

  .media-item.retired {
    background: var(--hv-color-snow);
    opacity: 0.75;
  }

  .media-item img {
    width: 160px;
    height: 120px;
    border-radius: var(--hv-radius-control);
    object-fit: cover;
  }

  .media-item-body {
    display: grid;
    gap: 0.4rem;
    align-content: start;
  }

  .badge {
    display: inline-block;
    width: fit-content;
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--hv-color-fjord);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-fjord-soft);
    color: var(--hv-color-basalt);
    font-weight: 800;
    font-size: 0.85rem;
  }

  .media-item form {
    margin: 0;
    padding: 0.5rem;
    border: 1px solid var(--hv-border-subtle);
  }

  .approve-form {
    display: grid;
    gap: 0.5rem;
  }

  .media-upload-form {
    display: grid;
    gap: 0.6rem;
    align-items: stretch;
  }

  .media-upload-form h4 {
    margin: 0;
  }

  .field-error {
    margin: 0;
    color: var(--hv-color-danger);
    font-weight: 700;
  }

  @media (max-width: 48rem) {
    .translation-grid,
    .media-columns {
      grid-template-columns: 1fr;
    }

    .media-item {
      grid-template-columns: 1fr;
    }

    .location-detail {
      grid-template-columns: 1fr;
    }

    .location-detail :global(.map-surface),
    .location-detail .location-correction {
      grid-column: 1;
    }

    .location-correction {
      grid-template-columns: 1fr;
    }

    .section-form,
    .detail-facts dl,
    .repeated-row {
      grid-template-columns: 1fr;
    }

    .section-form .wide,
    .section-form-actions {
      grid-column: auto;
    }

    .section-form-actions {
      display: grid;
    }

    .edit-section,
    .add-row {
      width: 100%;
    }

    button {
      width: 100%;
    }
  }
</style>
