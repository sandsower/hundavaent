<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick, untrack } from 'svelte';

  import { Button, Field, Input, Notice, Select, Textarea } from '@hundavaent/design-system';
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
  const publishAlertId = 'candidate-review-publish-alert';
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

  type ChecklistItem = {
    key: keyof typeof data.review.checks;
    label: MessageKey;
    recovery: MessageKey;
    target: string;
  };
  const checklist = $derived.by((): ChecklistItem[] => {
    const items: ChecklistItem[] = [
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
      },
      {
        key: 'publishableRestraintNote',
        label: 'moderation.checkRestraintNote',
        recovery: 'moderation.replaceRestraintNote',
        target: 'access-condition'
      }
    ];
    if (data.review.lifecycle === 'candidate') {
      items.unshift({
        key: 'candidate',
        label: 'moderation.checkCandidate',
        recovery: 'moderation.addCandidateState',
        target: 'candidate-overview'
      });
    }
    return items;
  });

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
      partially_accessible: 'wheelchairAccessibility.partiallyAccessible',
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
    if (publishError || locationCorrectionError || wheelchairAccessibilityError || mediaError) {
      void tick().then(() => document.getElementById(publishAlertId)?.focus());
    }
  });

  $effect(() => {
    oneditstatechange?.(editingSection !== null);
    return () => oneditstatechange?.(false);
  });
</script>

<!-- data-standalone mirrors the class:standalone flag so the standalone-only rules that used to
     live in `.review-shell.standalone` (and the two `:not(.standalone)` descendant rules) can be
     expressed as data variants; the class itself stays because the kept :global map-surface hook
     still selects on it. group/shell is named because converted components nest inside. -->
<div
  class="review-shell group/shell w-full min-w-0 data-[standalone=true]:mx-auto data-[standalone=true]:my-0 data-[standalone=true]:w-[min(100%_-_2rem,72rem)] data-[standalone=true]:px-0 data-[standalone=true]:pt-12 data-[standalone=true]:pb-20"
  class:standalone
  data-standalone={standalone}
>
  {#if standalone}
    <header class="box-border min-w-0 max-w-192 mb-4">
      <p class="eyebrow box-border min-w-0 tracking-[0.12em] uppercase font-[850] text-fjord">
        {data.copy['nav.moderation']}
      </p>
      <h1
        class="box-border min-w-0 mx-0 my-1 font-display text-[clamp(2rem,6vw,3.5rem)] leading-none tracking-[-0.02em]"
      >
        {data.copy['moderation.reviewTitle']}
      </h1>
      <p class="box-border min-w-0">{data.copy['moderation.reviewIntro']}</p>
    </header>
  {/if}

  {#if publishError}
    <Notice
      tone="error"
      as="section"
      class="message grid gap-[0.5rem]"
      role="alert"
      tabindex={-1}
      id={publishAlertId}
    >
      <strong class="box-border min-w-0">{publishError}</strong>
      {#if form && 'conflict' in form && form.conflict}
        <a
          class="box-border min-w-0 font-extrabold text-fjord"
          href={resolve('/[lang=lang]/moderation/places/[id]', {
            lang: data.lang,
            id: data.review.placeId
          })}
        >
          {data.copy['moderation.reloadCurrent']}
        </a>
      {/if}
    </Notice>
  {/if}

  {#if succeeded}
    <Notice tone="success" as="section" class="message" role="status">
      <strong class="box-border min-w-0">{data.copy['moderation.published']}</strong>
    </Notice>
  {/if}

  <h2 class="readiness-title box-border min-w-0 mx-0 mt-0 mb-[0.45rem] font-display text-[1rem]">
    {data.copy['moderation.checklistTitle']}
  </h2>
  <ModerationReadinessSummary
    label={data.copy['moderation.checklistTitle']}
    state={readinessState}
    stateLabel={readinessLabel}
    summary={readinessSummary}
    issues={readinessIssues}
  />

  <form
    id="candidate-publication"
    class="flex flex-wrap items-end box-border min-w-0 gap-[0.7rem] mt-3 p-3 rounded-panel border border-border-subtle bg-snow-raised"
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

  {#if draftError}<Notice tone="error" as="p" class="message" role="alert">{draftError}</Notice
    >{/if}
  {#if draftSucceeded}
    <Notice tone="success" as="p" class="message" role="status"
      >{data.copy['moderation.workbench.draftSaved']}</Notice
    >
  {/if}

  {#if standalone && (canDecide || decisionError)}<div
      class="candidate-actions box-border min-w-0 mt-3"
    >
      <ModerationActionBar
        label={data.copy['moderation.workbench.candidateActions']}
        disabled={editingSection !== null}
        hint={editingSection !== null
          ? data.copy['moderation.workbench.unsavedDecisionHint']
          : null}
      >
        {#if decisionError}<Notice tone="error" as="p" class="decision-error" role="alert"
            >{decisionError}</Notice
          >{/if}
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
      class="decision-form hidden"
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

  <div class="review-sections grid box-border min-w-0 gap-[0.65rem] mt-3">
    <ModerationReviewSection
      id="candidate-overview"
      title={data.copy['moderation.identityHeading']}
      summary={`${data.review.operatorName} · ${localizePlaceCategory(data.review.category as PlaceCategory, data.copy)}`}
      state={(data.review.lifecycle !== 'candidate' || data.review.checks.candidate) &&
      data.review.checks.operatorAndCategory
        ? 'complete'
        : 'blocking'}
    >
      {#if editingSection === 'identity'}
        <form
          class="section-form grid grid-cols-2 items-end box-border min-w-0 gap-[0.65rem] mt-0 p-3 rounded-panel border border-border-subtle bg-snow-raised max-[48rem]:grid-cols-[1fr]"
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
          <Field label={data.copy['moderation.operatorLabel']} class="mod-field">
            <Input required bind:value={identityOperatorName} />
          </Field>
          <Field label={data.copy['place.category']} class="mod-field">
            <Select required bind:value={identityCategory}>
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
            </Select>
          </Field>
          <div
            class="section-form-actions flex justify-end col-span-full box-border min-w-0 gap-[0.55rem] max-[48rem]:grid max-[48rem]:col-auto"
          >
            <Button intent="neutral" onclick={cancelEditing}>{data.copy['common.cancel']}</Button>
            <Button intent="neutral" type="submit" disabled={savingSection === 'identity'}
              >{saveLabel('identity')}</Button
            >
          </div>
        </form>
      {:else}
        <div class="section-view grid box-border min-w-0 gap-[0.7rem]">
          <section
            class="place-card box-border min-w-0 p-[0.85rem] rounded-panel border border-border-subtle bg-snow-raised shadow-none"
            aria-labelledby="place-name"
          >
            <span
              class="state inline-block box-border min-w-0 px-[0.45rem] py-[0.2rem] rounded-control border border-fjord bg-fjord-soft text-[0.75rem] font-[850] text-basalt"
              >{data.copy[`status.${data.review.lifecycle}` as MessageKey]}</span
            >
            <h2 id="place-name" class="box-border min-w-0 mt-[0.65rem]">
              {data.lang === 'is'
                ? (data.review.nameIs ?? data.review.nameEn ?? data.review.placeId)
                : (data.review.nameEn ?? data.review.nameIs ?? data.review.placeId)}
            </h2>
            <p class="box-border min-w-0">
              {data.review.operatorName} · {localizePlaceCategory(
                data.review.category as PlaceCategory,
                data.copy
              )}
            </p>
          </section>
          <Button
            intent="neutral"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.identityHeading'])}
            onclick={() => beginEditing('identity')}
            >{editLabel(data.copy['moderation.identityHeading'])}</Button
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
          class="section-form section-form-wide grid grid-cols-[1fr] items-end box-border min-w-0 gap-[0.65rem] mt-0 p-3 rounded-panel border border-border-subtle bg-snow-raised"
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
          <Field label={data.copy['moderation.websiteLabel']} class="mod-field">
            <Input type="url" bind:value={detailsWebsiteUrl} />
          </Field>
          <Field label={data.copy['moderation.phoneLabel']} class="mod-field">
            <Input type="tel" bind:value={detailsPhone} />
          </Field>
          <!-- grid-column stays with the kept `.section-form :global(.wide)` hook: the same rule
               also has to reach Field's rendered div below, so it cannot become a utility here. -->
          <div
            class="wide editor-group box-border min-w-0 m-0 p-[0.7rem] rounded-control border border-border-subtle"
          >
            <h3 class="box-border min-w-0 mx-0 mt-0 mb-[0.5rem] text-[0.9rem] font-[850]">
              {data.copy['place.openingHours']}
            </h3>
            <OpeningHoursEditor copy={data.copy} bind:value={detailsOpeningHours} />
          </div>
          <fieldset
            class="wide amenities-editor grid box-border min-w-0 gap-[0.55rem] m-0 p-[0.7rem] rounded-control border border-border-subtle"
          >
            <legend
              class="box-border min-w-0 mx-0 mt-0 mb-[0.5rem] px-[0.35rem] text-[0.9rem] font-[850]"
              >{data.copy['place.amenities']}</legend
            >
            {#each detailsDogAmenities as amenity, index (index)}
              <div
                class="repeated-row grid grid-cols-[minmax(0,1fr)_auto] items-end box-border min-w-0 gap-[0.55rem] max-[48rem]:grid-cols-[1fr]"
              >
                <Field
                  label={data.copy['moderation.amenityLabel'].replace(
                    '{number}',
                    String(index + 1)
                  )}
                  class="mod-field"
                >
                  <Input
                    value={amenity}
                    oninput={(event) => (detailsDogAmenities[index] = event.currentTarget.value)}
                  />
                </Field>
                <Button intent="neutral" onclick={() => removeAmenity(index)}>
                  {data.copy['moderation.removeAmenity']}
                </Button>
              </div>
            {/each}
            <Button intent="neutral" class="add-row" onclick={addAmenity}>
              {data.copy['moderation.addAmenity']}
            </Button>
          </fieldset>
          <div
            class="section-form-actions flex justify-end col-span-full box-border min-w-0 gap-[0.55rem] max-[48rem]:grid max-[48rem]:col-auto"
          >
            <Button intent="neutral" onclick={cancelEditing}>{data.copy['common.cancel']}</Button>
            <Button intent="neutral" type="submit" disabled={savingSection === 'details'}
              >{saveLabel('details')}</Button
            >
          </div>
        </form>
      {:else}
        <div class="section-view detail-facts grid box-border min-w-0 gap-[0.7rem]">
          <dl
            class="grid grid-cols-2 box-border min-w-0 gap-[0.55rem] m-0 max-[48rem]:grid-cols-[1fr]"
          >
            <div
              class="grid box-border min-w-0 gap-[0.2rem] p-[0.55rem] rounded-control border border-border-subtle"
            >
              <dt class="box-border min-w-0 text-[0.75rem] font-bold text-basalt-muted">
                {data.copy['moderation.websiteLabel']}
              </dt>
              <dd class="box-border min-w-0 m-0 wrap-anywhere">
                {data.review.websiteUrl ?? data.copy['common.notAvailable']}
              </dd>
            </div>
            <div
              class="grid box-border min-w-0 gap-[0.2rem] p-[0.55rem] rounded-control border border-border-subtle"
            >
              <dt class="box-border min-w-0 text-[0.75rem] font-bold text-basalt-muted">
                {data.copy['moderation.phoneLabel']}
              </dt>
              <dd class="box-border min-w-0 m-0 wrap-anywhere">
                {data.review.phone ?? data.copy['common.notAvailable']}
              </dd>
            </div>
            <div
              class="grid box-border min-w-0 gap-[0.2rem] p-[0.55rem] rounded-control border border-border-subtle"
            >
              <dt class="box-border min-w-0 text-[0.75rem] font-bold text-basalt-muted">
                {data.copy['place.openingHours']}
              </dt>
              <dd class="box-border min-w-0 m-0 wrap-anywhere">
                {formatOpeningHours(
                  data.review.openingHours,
                  data.copy,
                  data.copy['common.notAvailable']
                )}
              </dd>
            </div>
            <div
              class="grid box-border min-w-0 gap-[0.2rem] p-[0.55rem] rounded-control border border-border-subtle"
            >
              <dt class="box-border min-w-0 text-[0.75rem] font-bold text-basalt-muted">
                {data.copy['place.amenities']}
              </dt>
              <dd class="box-border min-w-0 m-0 wrap-anywhere">
                {data.review.dogAmenities.length
                  ? formatDogAmenities(data.review.dogAmenities, data.copy)
                  : data.copy['common.notAvailable']}
              </dd>
            </div>
          </dl>
          <Button
            intent="neutral"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.workbench.section.details'])}
            onclick={() => beginEditing('details')}
            >{editLabel(data.copy['moderation.workbench.section.details'])}</Button
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
          class="section-form section-form-stack grid grid-cols-[1fr] items-end box-border min-w-0 gap-[0.65rem] mt-0 p-3 rounded-panel border border-border-subtle bg-snow-raised"
          method="POST"
          action="?/updateWheelchairAccessibility"
          use:enhance={enhanceWheelchairAccessibility}
          aria-busy={savingWheelchairAccessibility}
        >
          <input type="hidden" name="placeId" value={data.review.placeId} />
          <input type="hidden" name="expectedVersion" value={data.review.version} />
          <Field label={data.copy['moderation.wheelchairAccessibilityLabel']} class="mod-field">
            <Select name="wheelchairAccessibility" bind:value={wheelchairAccessibilityValue}>
              <option value="accessible">{data.copy['wheelchairAccessibility.accessible']}</option>
              <option value="partially_accessible"
                >{data.copy['wheelchairAccessibility.partiallyAccessible']}</option
              >
              <option value="not_accessible"
                >{data.copy['wheelchairAccessibility.notAccessible']}</option
              >
              <option value="unknown">{data.copy['wheelchairAccessibility.unknown']}</option>
            </Select>
          </Field>
          <p class="field-help box-border min-w-0">
            {data.copy['moderation.wheelchairAccessibilityHelp']}
          </p>
          <div
            class="section-form-actions flex justify-end col-span-full box-border min-w-0 gap-[0.55rem] max-[48rem]:grid max-[48rem]:col-auto"
          >
            <Button intent="neutral" onclick={cancelEditing}>{data.copy['common.cancel']}</Button>
            <Button intent="neutral" type="submit" disabled={savingWheelchairAccessibility}>
              {savingWheelchairAccessibility
                ? data.copy['moderation.workbench.section.saving']
                : data.copy['moderation.saveWheelchairAccessibility']}
            </Button>
          </div>
        </form>
      {:else}
        <div class="section-view grid box-border min-w-0 gap-[0.7rem]">
          <p class="box-border min-w-0">{wheelchairAccessibilityLabel()}</p>
          <Button
            intent="neutral"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.wheelchairAccessibilityLabel'])}
            onclick={() => beginEditing('wheelchair_accessibility')}
            >{editLabel(data.copy['moderation.wheelchairAccessibilityLabel'])}</Button
          >
        </div>
      {/if}
      {#if wheelchairAccessibilityError}
        <Notice tone="error" as="p" class="message" role="alert"
          >{wheelchairAccessibilityError}</Notice
        >
      {:else if wheelchairAccessibilitySucceeded}
        <Notice tone="success" as="p" class="message" role="status">
          {data.copy['moderation.wheelchairAccessibilitySaved']}
        </Notice>
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
      <div
        class="location-detail grid grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)] box-border min-w-0 gap-x-4 gap-y-[0.8rem] group-data-[standalone=false]/shell:grid-cols-[1fr] max-[48rem]:grid-cols-[1fr]"
      >
        <p class="col-span-full box-border min-w-0 my-0">
          {data.review.addressLine}, {data.review.postalCode}
          {data.review.locality}
        </p>
        <p class="col-span-full box-border min-w-0 my-0">
          {data.review.latitude.toFixed(6)}, {data.review.longitude.toFixed(6)}
        </p>
        <p class="col-span-full box-border min-w-0 my-0">
          <strong class="box-border min-w-0">{geometryPrecisionLabel()}</strong>
        </p>
        <p class="col-span-full box-border min-w-0 my-0">{data.review.geometrySource}</p>
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
            class="location-correction section-form grid grid-cols-2 items-end col-2 box-border min-w-0 gap-[0.65rem] mt-0 p-3 rounded-panel border border-border-subtle bg-snow-raised group-data-[standalone=false]/shell:col-1 max-[48rem]:grid-cols-[1fr] max-[48rem]:col-1"
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
            <!-- The retired `.location-correction .wide` rule was dead: it and the kept
                 `.section-form :global(.wide)` hook both said `grid-column: 1 / -1`, and the
                 hook's higher specificity always won - so grid placement stays with the hook. -->
            <div class="wide box-border min-w-0">
              <ModerationLocationEditor
                copy={data.copy}
                bind:value={locationValue}
                markerName={data.review.nameIs ?? data.review.nameEn ?? data.review.placeId}
                mapStyleUrl={data.mapStyleUrl}
              />
            </div>
            <div
              class="section-form-actions wide flex justify-end col-span-full box-border min-w-0 gap-[0.55rem] max-[48rem]:grid max-[48rem]:col-auto"
            >
              <Button intent="neutral" onclick={cancelEditing}>{data.copy['common.cancel']}</Button>
              <Button intent="neutral" type="submit" disabled={savingSection === 'location'}
                >{saveLabel('location')}</Button
              >
            </div>
          </form>
        {:else}
          <Button
            intent="neutral"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.locationHeading'])}
            onclick={() => beginEditing('location')}
            >{editLabel(data.copy['moderation.locationHeading'])}</Button
          >
        {/if}
        {#if locationCorrectionError}
          <Notice tone="error" as="p" class="message" role="alert">{locationCorrectionError}</Notice
          >
        {:else if locationCorrectionSucceeded}
          <Notice tone="success" as="p" class="message" role="status"
            >{data.copy['moderation.geometryCorrected']}</Notice
          >
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
          class="section-form grid grid-cols-2 items-end box-border min-w-0 gap-[0.65rem] mt-0 p-3 rounded-panel border border-border-subtle bg-snow-raised max-[48rem]:grid-cols-[1fr]"
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
          <Field label={data.copy['moderation.nameIsLabel']} class="mod-field">
            <Input required lang="is" bind:value={translationNameIs} />
          </Field>
          <Field label={data.copy['moderation.nameEnLabel']} class="mod-field">
            <Input required lang="en" bind:value={translationNameEn} />
          </Field>
          <Field label={data.copy['moderation.descriptionIsLabel']} class="mod-field wide">
            <Textarea required lang="is" bind:value={translationDescriptionIs} />
          </Field>
          <Field label={data.copy['moderation.descriptionEnLabel']} class="mod-field wide">
            <Textarea required lang="en" bind:value={translationDescriptionEn} />
          </Field>
          <div
            class="section-form-actions flex justify-end col-span-full box-border min-w-0 gap-[0.55rem] max-[48rem]:grid max-[48rem]:col-auto"
          >
            <Button intent="neutral" onclick={cancelEditing}>{data.copy['common.cancel']}</Button>
            <Button intent="neutral" type="submit" disabled={savingSection === 'translations'}
              >{saveLabel('translations')}</Button
            >
          </div>
        </form>
      {:else}
        <div class="section-view translation-view grid box-border min-w-0 gap-[0.7rem]">
          <div
            class="translation-grid grid grid-cols-2 box-border min-w-0 gap-[0.65rem] max-[48rem]:grid-cols-[1fr]"
          >
            <article
              lang="is"
              class="box-border min-w-0 p-3 rounded-panel border border-border-subtle"
            >
              <h3 class="box-border min-w-0 mx-0 mt-0 mb-[0.45rem] text-[0.95rem]">
                {data.copy['moderation.checkIcelandic']}
              </h3>
              <p class="box-border min-w-0">
                {data.review.nameIs ?? data.copy['common.notAvailable']}
              </p>
              <p class="box-border min-w-0">
                {data.review.descriptionIs ?? data.copy['common.notAvailable']}
              </p>
            </article>
            <article
              lang="en"
              class="box-border min-w-0 p-3 rounded-panel border border-border-subtle"
            >
              <h3 class="box-border min-w-0 mx-0 mt-0 mb-[0.45rem] text-[0.95rem]">
                {data.copy['moderation.checkEnglish']}
              </h3>
              <p class="box-border min-w-0">
                {data.review.nameEn ?? data.copy['common.notAvailable']}
              </p>
              <p class="box-border min-w-0">
                {data.review.descriptionEn ?? data.copy['common.notAvailable']}
              </p>
            </article>
          </div>
          <Button
            intent="neutral"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.workbench.section.translations'])}
            onclick={() => beginEditing('translations')}
            >{editLabel(data.copy['moderation.workbench.section.translations'])}</Button
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
          class="section-form section-form-stack grid grid-cols-[1fr] items-end box-border min-w-0 gap-[0.65rem] mt-0 p-3 rounded-panel border border-border-subtle bg-snow-raised"
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
          <div
            class="section-form-actions flex justify-end col-span-full box-border min-w-0 gap-[0.55rem] max-[48rem]:grid max-[48rem]:col-auto"
          >
            <Button intent="neutral" onclick={cancelEditing}>{data.copy['common.cancel']}</Button>
            <Button intent="neutral" type="submit" disabled={savingSection === 'access_conditions'}
              >{saveLabel('access_conditions')}</Button
            >
          </div>
        </form>
      {:else}
        <div class="section-view grid box-border min-w-0 gap-[0.7rem]">
          <!-- The retired bare `ul`/`li` rules were dead here: `.review-records` and
               `.review-records > li` outranked every one of their declarations, so only the
               record treatment below ever rendered. -->
          <ol class="review-records grid box-border min-w-0 gap-[0.55rem] m-0 p-0 list-none">
            {#each data.review.accessConditions as condition (condition.id)}
              <li
                class="grid grid-cols-[1fr] box-border min-w-0 gap-[0.2rem] p-[0.5rem] rounded-control border border-border-subtle bg-snow"
              >
                <strong class="box-border min-w-0">{describeCondition(condition)}</strong>
              </li>
            {/each}
          </ol>
          <Button
            intent="neutral"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.checkAccess'])}
            onclick={() => beginEditing('access_conditions')}
            >{editLabel(data.copy['moderation.checkAccess'])}</Button
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
          class="section-form section-form-stack grid grid-cols-[1fr] items-end box-border min-w-0 gap-[0.65rem] mt-0 p-3 rounded-panel border border-border-subtle bg-snow-raised"
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
          <div
            class="section-form-actions flex justify-end col-span-full box-border min-w-0 gap-[0.55rem] max-[48rem]:grid max-[48rem]:col-auto"
          >
            <Button intent="neutral" onclick={cancelEditing}>{data.copy['common.cancel']}</Button>
            <Button intent="neutral" type="submit" disabled={savingSection === 'evidence_records'}
              >{saveLabel('evidence_records')}</Button
            >
          </div>
        </form>
      {:else}
        <div class="section-view grid box-border min-w-0 gap-[0.7rem]">
          <ul class="review-records grid box-border min-w-0 gap-[0.55rem] m-0 p-0 list-none">
            {#each data.review.evidenceRecords as evidence (evidence.id)}
              <!-- `.evidence-record` restated `.review-records > li`'s display and gap at lower
                   source order, so it never changed a pixel; the record treatment is the one
                   below. The spans only need `block` - the retired `li > span` badge rule was
                   fully undone by `.review-records > li > span`, whose leftover place-items is
                   inert on a block box. -->
              <li
                class="evidence-record grid grid-cols-[1fr] box-border min-w-0 gap-[0.2rem] p-[0.5rem] rounded-control border border-border-subtle bg-snow"
              >
                <strong class="box-border min-w-0">{evidence.sourceLabel}</strong>
                <span class="block box-border min-w-0"
                  >{localizeEvidenceKind(evidence.kind, data.copy)}</span
                >
                {#if evidence.sourceUrl}<span
                    class="reference block box-border min-w-0 wrap-anywhere text-basalt-muted"
                    >{evidence.sourceUrl}</span
                  >{/if}
                {#if evidence.sourceCitation}
                  <span class="reference block box-border min-w-0 wrap-anywhere text-basalt-muted"
                    >{evidence.sourceCitation}</span
                  >
                {/if}
                <time datetime={evidence.observedAt} class="box-border min-w-0"
                  >{formatLocalizedDate(evidence.observedAt, data.lang)}</time
                >
              </li>
            {/each}
          </ul>
          <Button
            intent="neutral"
            class="edit-section"
            aria-label={editLabel(data.copy['moderation.checkEvidence'])}
            onclick={() => beginEditing('evidence_records')}
            >{editLabel(data.copy['moderation.checkEvidence'])}</Button
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
      <div class="media-section box-border min-w-0 mt-4">
        <p class="box-border min-w-0">{data.copy['moderation.media.intro']}</p>

        {#if mediaError}
          <Notice tone="error" as="section" class="message" role="alert">
            <strong class="box-border min-w-0">{mediaError}</strong>
          </Notice>
        {/if}
        {#if mediaSucceeded}
          <Notice tone="success" as="section" class="message" role="status">
            <strong class="box-border min-w-0">
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
          </Notice>
        {/if}

        <!-- The retired `@media (max-width: 48rem)` entry for .media-columns was dead: the
             standalone rule outranked it, and the non-standalone base was already 1fr. -->
        <div
          class="media-columns grid grid-cols-[1fr] box-border min-w-0 gap-[0.75rem] mt-3 group-data-[standalone=true]/shell:grid-cols-2"
        >
          <article
            class="media-column box-border min-w-0 p-[0.85rem] rounded-panel border border-border-subtle bg-snow-raised shadow-none"
            aria-labelledby="evidence-media-title"
            data-media-column="evidence"
          >
            <h3 id="evidence-media-title" class="box-border min-w-0 mt-0">
              {data.copy['moderation.media.evidenceTitle']}
            </h3>
            {#if evidenceItems.length === 0}
              <p class="box-border min-w-0">{data.copy['moderation.media.evidenceEmpty']}</p>
            {:else}
              <ul
                class="media-list grid box-border min-w-0 gap-[0.75rem] mx-0 mt-0 mb-5 p-0 list-none"
              >
                {#each evidenceItems as item (item.mediaId)}
                  <!-- data-retired carries the same flag as class:retired so the retired tone can
                       be a data variant; the retired rule's background restated the base one. -->
                  <li
                    class="media-item grid grid-cols-[160px_1fr] box-border min-w-0 gap-[0.65rem] p-[0.6rem] rounded-control border border-border-subtle bg-snow data-[retired=true]:bg-snow data-[retired=true]:opacity-75 max-[48rem]:grid-cols-[1fr]"
                    class:retired={Boolean(item.retiredAt)}
                    data-retired={Boolean(item.retiredAt)}
                    data-media-item={item.mediaId}
                    data-storage-object-path={item.storageObjectPath}
                  >
                    {#if item.signedUrl}
                      <img
                        src={item.signedUrl}
                        alt=""
                        width="160"
                        height="120"
                        loading="lazy"
                        class="box-border min-w-0 w-[160px] h-[120px] rounded-control object-cover"
                      />
                    {/if}
                    <div class="media-item-body grid content-start box-border min-w-0 gap-[0.4rem]">
                      {#if item.sourceUrl}<span
                          class="reference box-border min-w-0 wrap-anywhere text-basalt-muted"
                          >{item.sourceUrl}</span
                        >{/if}
                      {#if item.capturedAt}
                        <time datetime={item.capturedAt} class="box-border min-w-0"
                          >{formatLocalizedDate(item.capturedAt, data.lang)}</time
                        >
                      {/if}
                      {#if item.retiredAt}
                        <span
                          class="badge inline-block box-border min-w-0 w-fit px-[0.6rem] py-[0.2rem] rounded-control border border-fjord bg-fjord-soft text-[0.85rem] font-extrabold text-basalt"
                          >{data.copy['moderation.media.retired']}</span
                        >
                      {:else}
                        <form
                          method="POST"
                          action="?/retireMedia"
                          use:enhance={enhanceMedia}
                          class="flex flex-wrap items-end box-border min-w-0 gap-[0.7rem] m-0 p-[0.5rem] rounded-panel border border-border-subtle bg-snow-raised"
                        >
                          <input type="hidden" name="placeId" value={data.review.placeId} />
                          <input type="hidden" name="mediaId" value={item.mediaId} />
                          <Button intent="neutral" type="submit"
                            >{data.copy['moderation.media.retireAction']}</Button
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
              class="media-upload-form grid items-stretch box-border min-w-0 gap-[0.6rem] mt-3 p-3 rounded-panel border border-border-subtle bg-snow-raised"
            >
              <input type="hidden" name="placeId" value={data.review.placeId} />
              <h4 class="box-border min-w-0 m-0">
                {data.copy['moderation.media.uploadEvidenceTitle']}
              </h4>
              <Field label={data.copy['moderation.media.fileLabel']} class="mod-field">
                <Input
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  onchange={(fileEvent) => handleEvidenceFileChange(fileEvent.currentTarget)}
                />
              </Field>
              <input type="hidden" name="widthPx" value={evidenceWidth ?? ''} />
              <input type="hidden" name="heightPx" value={evidenceHeight ?? ''} />
              {#if evidenceFileError}
                <Notice tone="error" as="p" class="field-error"
                  >{data.copy[evidenceFileError]}</Notice
                >
              {/if}
              <Field label={data.copy['moderation.media.sourceUrlLabel']} class="mod-field">
                <Input type="url" name="sourceUrl" required />
              </Field>
              <Field label={data.copy['moderation.media.capturedAtLabel']} class="mod-field">
                <Input type="datetime-local" name="capturedAt" required />
              </Field>
              <Button
                intent="neutral"
                type="submit"
                disabled={evidenceProcessing || !evidenceWidth}
              >
                {evidenceProcessing
                  ? data.copy['moderation.media.uploading']
                  : data.copy['moderation.media.uploadEvidenceAction']}
              </Button>
            </form>
          </article>

          <article
            class="media-column box-border min-w-0 p-[0.85rem] rounded-panel border border-border-subtle bg-snow-raised shadow-none"
            aria-labelledby="photo-media-title"
            data-media-column="photo"
          >
            <h3 id="photo-media-title" class="box-border min-w-0 mt-0">
              {data.copy['moderation.media.photosTitle']}
            </h3>
            {#if photoItems.length === 0}
              <p class="box-border min-w-0">{data.copy['moderation.media.photosEmpty']}</p>
            {:else}
              <ul
                class="media-list grid box-border min-w-0 gap-[0.75rem] mx-0 mt-0 mb-5 p-0 list-none"
              >
                {#each photoItems as item (item.mediaId)}
                  <li
                    class="media-item grid grid-cols-[160px_1fr] box-border min-w-0 gap-[0.65rem] p-[0.6rem] rounded-control border border-border-subtle bg-snow data-[retired=true]:bg-snow data-[retired=true]:opacity-75 max-[48rem]:grid-cols-[1fr]"
                    class:retired={Boolean(item.retiredAt)}
                    data-retired={Boolean(item.retiredAt)}
                    data-media-item={item.mediaId}
                    data-storage-object-path={item.storageObjectPath}
                  >
                    {#if item.signedUrl}
                      <img
                        src={item.signedUrl}
                        alt=""
                        width="160"
                        height="120"
                        loading="lazy"
                        class="box-border min-w-0 w-[160px] h-[120px] rounded-control object-cover"
                      />
                    {/if}
                    <div class="media-item-body grid content-start box-border min-w-0 gap-[0.4rem]">
                      <span
                        class="badge inline-block box-border min-w-0 w-fit px-[0.6rem] py-[0.2rem] rounded-control border border-fjord bg-fjord-soft text-[0.85rem] font-extrabold text-basalt"
                        >{data.copy[
                          `moderation.media.state.${item.approvalState}` as MessageKey
                        ]}</span
                      >
                      {#if item.isPrimary}
                        <span
                          class="badge inline-block box-border min-w-0 w-fit px-[0.6rem] py-[0.2rem] rounded-control border border-fjord bg-fjord-soft text-[0.85rem] font-extrabold text-basalt"
                          >{data.copy['moderation.media.primary']}</span
                        >
                      {/if}
                      {#if item.retiredAt}
                        <span
                          class="badge inline-block box-border min-w-0 w-fit px-[0.6rem] py-[0.2rem] rounded-control border border-fjord bg-fjord-soft text-[0.85rem] font-extrabold text-basalt"
                          >{data.copy['moderation.media.retired']}</span
                        >
                      {:else if item.approvalState === 'pending'}
                        <form
                          method="POST"
                          action="?/approveMedia"
                          use:enhance={enhanceMedia}
                          class="approve-form grid items-end box-border min-w-0 gap-[0.5rem] m-0 p-[0.5rem] rounded-panel border border-border-subtle bg-snow-raised"
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
                          <Button intent="neutral" type="submit"
                            >{data.copy['moderation.media.publishPhotoAction']}</Button
                          >
                        </form>
                        <form
                          method="POST"
                          action="?/rejectMedia"
                          use:enhance={enhanceMedia}
                          class="flex flex-wrap items-end box-border min-w-0 gap-[0.7rem] m-0 p-[0.5rem] rounded-panel border border-border-subtle bg-snow-raised"
                        >
                          <input type="hidden" name="placeId" value={data.review.placeId} />
                          <input type="hidden" name="mediaId" value={item.mediaId} />
                          <Button intent="neutral" type="submit"
                            >{data.copy['moderation.media.rejectAction']}</Button
                          >
                        </form>
                      {:else}
                        <form
                          method="POST"
                          action="?/retireMedia"
                          use:enhance={enhanceMedia}
                          class="flex flex-wrap items-end box-border min-w-0 gap-[0.7rem] m-0 p-[0.5rem] rounded-panel border border-border-subtle bg-snow-raised"
                        >
                          <input type="hidden" name="placeId" value={data.review.placeId} />
                          <input type="hidden" name="mediaId" value={item.mediaId} />
                          <Button intent="neutral" type="submit"
                            >{data.copy['moderation.media.retireAction']}</Button
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
              class="media-upload-form grid items-stretch box-border min-w-0 gap-[0.6rem] mt-3 p-3 rounded-panel border border-border-subtle bg-snow-raised"
            >
              <input type="hidden" name="placeId" value={data.review.placeId} />
              <h4 class="box-border min-w-0 m-0">
                {data.copy['moderation.media.uploadPhotoTitle']}
              </h4>
              <Field label={data.copy['moderation.media.fileLabel']} class="mod-field">
                <Input
                  type="file"
                  name="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  onchange={(fileEvent) => handlePhotoFileChange(fileEvent.currentTarget)}
                />
              </Field>
              <input type="hidden" name="widthPx" value={photoWidth ?? ''} />
              <input type="hidden" name="heightPx" value={photoHeight ?? ''} />
              {#if photoFileError}
                <Notice tone="error" as="p" class="field-error">{data.copy[photoFileError]}</Notice>
              {/if}
              <ModerationPhotoApprovalFields
                copy={data.copy}
                defaultAltTextIs={defaultPhotoAltTextIs}
                defaultAltTextEn={defaultPhotoAltTextEn}
                autoPrimary={activeApprovedPhotoCount === 0}
                allowPrimaryChoice={activeApprovedPhotoCount > 0}
              />
              <Button intent="neutral" type="submit" disabled={photoProcessing || !photoWidth}>
                {photoProcessing
                  ? data.copy['moderation.media.uploading']
                  : data.copy['moderation.media.uploadAndPublishAction']}
              </Button>
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
          <Field label={data.copy['moderation.workbench.reasonCode']} class="mod-field">
            <Select bind:value={candidateReasonCode} required>
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
            </Select>
          </Field>
        {/if}
      </ModerationReasonDialog>
    {/if}
  {/if}
</div>

<style>
  /* The one surface-wide reset that cannot be an element utility: it dresses the document body,
     which no markup in this component owns. */
  :global(body) {
    margin: 0;
    background: var(--hv-color-snow);
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-ui);
  }

  /* Notice now owns the border/background/padding/radius for this tone; only the spacing this
     file's layout depends on is re-anchored here, ancestor-scoped through the literal
     .candidate-actions div rather than a bare :global(.decision-error). */
  .candidate-actions :global(.decision-error) {
    margin: 0 0 0.55rem;
  }

  /* Button owns min-height/background now (the bespoke 2.4rem control-height and snow-raised
     re-tone are the unification policy's targets); only the grid placement survives, re-anchored
     through .review-sections since edit-section buttons sit in more than one grid ancestor
     (.section-view and .location-detail). */
  .review-sections :global(.edit-section) {
    justify-self: end;
  }

  /* Field renders the wide translation descriptions, so the full-bleed placement has to reach a
     foreign element; the local .wide divs in these forms ride the same hook. */
  .section-form :global(.wide) {
    grid-column: 1 / -1;
  }

  .section-form-actions :global(button) {
    min-width: 7rem;
  }

  .amenities-editor :global(.add-row) {
    width: fit-content;
  }

  /* MapSurface renders .map-surface, so its column placement stays a cross-component hook. The
     two narrower duplicates below restate the same column-1 placement the base rule already
     gives; they are kept as written rather than pruned. */
  .location-detail :global(.map-surface) {
    grid-column: 1;
  }

  .review-shell:not(.standalone) .location-detail :global(.map-surface) {
    grid-column: 1;
  }

  /* Field's own label carries no weight/size utility (baseline-first); this file's labels were
     always the reduced 0.78rem/750 treatment, so it is re-anchored here via an ancestor-scoped
     :global() targeting Field's rendered label through the .mod-field hook, never a bare
     :global(label) that would leak past this component. The old flex-basis sizing dies outright:
     every Field-bearing form in this file is a CSS Grid (.section-form / .media-upload-form), so
     flex-item sizing never had anywhere left to apply. */
  .review-shell :global(.mod-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  /* Input/Select/Textarea/Button own their own border/background/padding/radius/font-weight now;
     the disabled dimming is re-anchored because Button does not yet style a disabled state on its
     own (a known gap outside this migration's file scope) - kept ancestor-scoped so it stays this
     surface's own affordance rather than a bare app-wide :global(button:disabled). */
  .review-shell :global(button:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* Notice owns tone/border/background/padding/radius now; only the spacing this file's layout
     depends on survives, re-anchored through the .message hook every Notice call site here still
     carries as a layout-glue class. */
  .review-shell :global(.message) {
    margin-bottom: 0.75rem;
  }

  /* Notice's own tone box replaces this paragraph's border/background; only the tight margin
     this grid-gapped upload form depended on survives, re-anchored via the same .field-error hook
     class the Notice call sites here still carry as layout glue. */
  .media-upload-form :global(.field-error) {
    margin: 0;
  }

  @media (max-width: 48rem) {
    .location-detail :global(.map-surface) {
      grid-column: 1;
    }

    .section-form :global(.wide) {
      grid-column: auto;
    }

    .review-sections :global(.edit-section),
    .amenities-editor :global(.add-row) {
      width: 100%;
    }

    .section-form-actions :global(button),
    .media-section :global(button) {
      width: 100%;
    }
  }
</style>
