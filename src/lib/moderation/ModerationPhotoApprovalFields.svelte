<script lang="ts">
  import { untrack } from 'svelte';

  import { Choice, Field, Input, Select } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import type {
    CompletedPlacePhotoPeopleReview,
    PlacePhotoRightsBasis,
    SimplePlacePhotoRightsChoice
  } from '$server/place-media/place-media-input';

  interface InitialPhotoMetadata {
    photographerOrUploader?: string | null;
    sourceOrCaptureDate?: string | null;
    licenseReference?: string | null;
    rightsBasis?: PlacePhotoRightsBasis | null;
    rightsEvidenceReference?: string | null;
    sourceUrl?: string | null;
    licenseUrl?: string | null;
    attributionText?: string | null;
    attributionUrl?: string | null;
    peopleReview?: string | null;
    makePrimary?: boolean;
    altTextIs?: string | null;
    altTextEn?: string | null;
  }

  interface Props {
    copy: Catalogue;
    defaultAltTextIs: string;
    defaultAltTextEn: string;
    initial?: InitialPhotoMetadata;
    autoPrimary?: boolean;
    allowPrimaryChoice?: boolean;
  }

  let {
    copy,
    defaultAltTextIs,
    defaultAltTextEn,
    initial,
    autoPrimary = false,
    allowPrimaryChoice = false
  }: Props = $props();
  let rightsChoice = $state<SimplePlacePhotoRightsChoice>(
    untrack(() =>
      initial?.rightsBasis && initial.rightsBasis !== 'explicit_permission'
        ? 'reusable_source'
        : initial?.rightsBasis === 'explicit_permission'
          ? 'permission'
          : 'own_photo'
    )
  );
  let reusableRightsBasis = $state<Exclude<PlacePhotoRightsBasis, 'explicit_permission'>>(
    untrack(() =>
      initial?.rightsBasis && initial.rightsBasis !== 'explicit_permission'
        ? initial.rightsBasis
        : 'cc_by'
    )
  );
  let peopleReview = $state<CompletedPlacePhotoPeopleReview | ''>(
    untrack(() =>
      initial?.peopleReview === 'no_prominent_people' ||
      initial?.peopleReview === 'permission_documented'
        ? initial.peopleReview
        : ''
    )
  );
  const attributionRequired = $derived(
    rightsChoice === 'reusable_source' &&
      (reusableRightsBasis === 'cc_by' || reusableRightsBasis === 'cc_by_sa')
  );
</script>

<div class="photo-approval-fields">
  <div class="essential-fields">
    <Field
      label={copy['moderation.media.simpleRightsLabel']}
      hint={copy['moderation.media.simpleRightsHelp']}
      class="mod-field"
    >
      <Select
        name="rightsChoice"
        required
        aria-label={copy['moderation.media.simpleRightsLabel']}
        bind:value={rightsChoice}
      >
        <option value="own_photo">{copy['moderation.media.simpleRights.ownPhoto']}</option>
        <option value="permission">{copy['moderation.media.simpleRights.permission']}</option>
        <option value="reusable_source">
          {copy['moderation.media.simpleRights.reusableSource']}
        </option>
      </Select>
    </Field>
    <Field label={copy['moderation.media.peopleReviewLabel']} class="mod-field">
      <Select name="peopleReview" required bind:value={peopleReview}>
        <option value="" disabled>{copy['moderation.media.peopleReview.unknown']}</option>
        <option value="no_prominent_people">
          {copy['moderation.media.peopleReview.noProminentPeople']}
        </option>
        <option value="permission_documented">
          {copy['moderation.media.peopleReview.permissionDocumented']}
        </option>
      </Select>
    </Field>
  </div>

  {#if rightsChoice === 'reusable_source'}
    <div class="reusable-fields">
      <Field label={copy['moderation.media.reusableLicenseLabel']} class="mod-field">
        <Select name="reusableRightsBasis" required bind:value={reusableRightsBasis}>
          <option value="cc0">CC0 1.0</option>
          <option value="public_domain">{copy['moderation.media.rightsBasis.publicDomain']}</option>
          <option value="cc_by">CC BY 4.0</option>
          <option value="cc_by_sa">CC BY-SA 4.0</option>
          <option value="official_reuse">
            {copy['moderation.media.rightsBasis.officialReuse']}
          </option>
        </Select>
      </Field>
      <Field label={copy['moderation.media.photoSourceUrlLabel']} class="mod-field">
        <Input type="url" name="sourceUrl" required value={initial?.sourceUrl ?? ''} />
      </Field>
      {#if attributionRequired}
        <Field label={copy['moderation.media.photographerLabel']} class="mod-field">
          <Input
            type="text"
            name="photographerOrUploader"
            required
            value={initial?.photographerOrUploader ?? ''}
          />
        </Field>
      {/if}
      {#if reusableRightsBasis === 'official_reuse'}
        <Field label={copy['moderation.media.licenseUrlLabel']} class="mod-field">
          <Input type="url" name="licenseUrl" required value={initial?.licenseUrl ?? ''} />
        </Field>
      {/if}
    </div>
  {/if}

  <details>
    <summary>{copy['moderation.media.optionalDetails']}</summary>
    <div class="optional-fields">
      {#if !attributionRequired}
        <Field label={copy['moderation.media.photographerLabel']} class="mod-field">
          <Input
            type="text"
            name="photographerOrUploader"
            value={initial?.photographerOrUploader ?? ''}
          />
        </Field>
      {/if}
      <Field label={copy['moderation.media.licenseDateLabel']} class="mod-field">
        <Input type="date" name="sourceOrCaptureDate" value={initial?.sourceOrCaptureDate ?? ''} />
      </Field>
      <Field label={copy['moderation.media.licenseReferenceLabel']} class="mod-field">
        <Input type="text" name="licenseReference" value={initial?.licenseReference ?? ''} />
      </Field>
      <Field label={copy['moderation.media.rightsEvidenceLabel']} class="mod-field">
        <Input
          type="text"
          name="rightsEvidenceReference"
          value={initial?.rightsEvidenceReference ?? ''}
        />
      </Field>
      {#if rightsChoice !== 'reusable_source'}
        <Field label={copy['moderation.media.photoSourceUrlLabel']} class="mod-field">
          <Input type="url" name="sourceUrl" value={initial?.sourceUrl ?? ''} />
        </Field>
      {/if}
      {#if rightsChoice === 'reusable_source' && reusableRightsBasis !== 'official_reuse'}
        <Field label={copy['moderation.media.licenseUrlLabel']} class="mod-field">
          <Input type="url" name="licenseUrl" value={initial?.licenseUrl ?? ''} />
        </Field>
      {/if}
      <Field label={copy['moderation.media.attributionTextLabel']} class="mod-field">
        <Input type="text" name="attributionText" value={initial?.attributionText ?? ''} />
      </Field>
      <Field label={copy['moderation.media.attributionUrlLabel']} class="mod-field">
        <Input type="url" name="attributionUrl" value={initial?.attributionUrl ?? ''} />
      </Field>
      <Field label={copy['moderation.media.altTextIsLabel']} class="mod-field">
        <Input type="text" name="altTextIs" lang="is" value={initial?.altTextIs ?? ''} />
      </Field>
      <Field label={copy['moderation.media.altTextEnLabel']} class="mod-field">
        <Input type="text" name="altTextEn" lang="en" value={initial?.altTextEn ?? ''} />
      </Field>
      {#if allowPrimaryChoice}
        <Choice
          type="checkbox"
          class="checkbox-choice"
          name="makePrimary"
          checked={initial?.makePrimary ?? false}
        >
          {copy['moderation.media.makePrimaryLabel']}
        </Choice>
      {/if}
    </div>
  </details>

  {#if autoPrimary}
    <input type="hidden" name="makePrimary" value="on" />
  {/if}
  <input type="hidden" name="defaultAltTextIs" value={defaultAltTextIs} />
  <input type="hidden" name="defaultAltTextEn" value={defaultAltTextEn} />
</div>

<style>
  .photo-approval-fields,
  .essential-fields,
  .reusable-fields,
  .optional-fields {
    display: grid;
    gap: 0.75rem;
  }

  .essential-fields,
  .reusable-fields,
  .optional-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* Field's own label carries no weight/size utility (baseline-first); this component never had
     bespoke label typography of its own (it relied on the shared bare `label{}` rule this file
     used to define), so nothing to re-anchor beyond min-width:0 - already Field's own default. */

  details {
    border-top: 1px solid color-mix(in srgb, var(--hv-color-basalt) 18%, transparent);
    padding-top: 0.65rem;
  }

  summary {
    cursor: pointer;
    color: var(--hv-color-fjord);
    font-weight: 800;
  }

  .optional-fields {
    margin-top: 0.75rem;
  }

  .optional-fields :global(.checkbox-choice) {
    grid-column: 1 / -1;
  }

  @media (max-width: 42rem) {
    .essential-fields,
    .reusable-fields,
    .optional-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
