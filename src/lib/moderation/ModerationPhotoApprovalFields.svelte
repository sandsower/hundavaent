<script lang="ts">
  import { untrack } from 'svelte';

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
    <label>
      {copy['moderation.media.simpleRightsLabel']}
      <select
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
      </select>
      <small>{copy['moderation.media.simpleRightsHelp']}</small>
    </label>
    <label>
      {copy['moderation.media.peopleReviewLabel']}
      <select name="peopleReview" required bind:value={peopleReview}>
        <option value="" disabled>{copy['moderation.media.peopleReview.unknown']}</option>
        <option value="no_prominent_people">
          {copy['moderation.media.peopleReview.noProminentPeople']}
        </option>
        <option value="permission_documented">
          {copy['moderation.media.peopleReview.permissionDocumented']}
        </option>
      </select>
    </label>
  </div>

  {#if rightsChoice === 'reusable_source'}
    <div class="reusable-fields">
      <label>
        {copy['moderation.media.reusableLicenseLabel']}
        <select name="reusableRightsBasis" required bind:value={reusableRightsBasis}>
          <option value="cc0">CC0 1.0</option>
          <option value="public_domain">{copy['moderation.media.rightsBasis.publicDomain']}</option>
          <option value="cc_by">CC BY 4.0</option>
          <option value="cc_by_sa">CC BY-SA 4.0</option>
          <option value="official_reuse">
            {copy['moderation.media.rightsBasis.officialReuse']}
          </option>
        </select>
      </label>
      <label>
        {copy['moderation.media.photoSourceUrlLabel']}
        <input type="url" name="sourceUrl" required value={initial?.sourceUrl ?? ''} />
      </label>
      {#if attributionRequired}
        <label>
          {copy['moderation.media.photographerLabel']}
          <input
            type="text"
            name="photographerOrUploader"
            required
            value={initial?.photographerOrUploader ?? ''}
          />
        </label>
      {/if}
      {#if reusableRightsBasis === 'official_reuse'}
        <label>
          {copy['moderation.media.licenseUrlLabel']}
          <input type="url" name="licenseUrl" required value={initial?.licenseUrl ?? ''} />
        </label>
      {/if}
    </div>
  {/if}

  <details>
    <summary>{copy['moderation.media.optionalDetails']}</summary>
    <div class="optional-fields">
      {#if !attributionRequired}
        <label>
          {copy['moderation.media.photographerLabel']}
          <input
            type="text"
            name="photographerOrUploader"
            value={initial?.photographerOrUploader ?? ''}
          />
        </label>
      {/if}
      <label>
        {copy['moderation.media.licenseDateLabel']}
        <input type="date" name="sourceOrCaptureDate" value={initial?.sourceOrCaptureDate ?? ''} />
      </label>
      <label>
        {copy['moderation.media.licenseReferenceLabel']}
        <input type="text" name="licenseReference" value={initial?.licenseReference ?? ''} />
      </label>
      <label>
        {copy['moderation.media.rightsEvidenceLabel']}
        <input
          type="text"
          name="rightsEvidenceReference"
          value={initial?.rightsEvidenceReference ?? ''}
        />
      </label>
      {#if rightsChoice !== 'reusable_source'}
        <label>
          {copy['moderation.media.photoSourceUrlLabel']}
          <input type="url" name="sourceUrl" value={initial?.sourceUrl ?? ''} />
        </label>
      {/if}
      {#if rightsChoice === 'reusable_source' && reusableRightsBasis !== 'official_reuse'}
        <label>
          {copy['moderation.media.licenseUrlLabel']}
          <input type="url" name="licenseUrl" value={initial?.licenseUrl ?? ''} />
        </label>
      {/if}
      <label>
        {copy['moderation.media.attributionTextLabel']}
        <input type="text" name="attributionText" value={initial?.attributionText ?? ''} />
      </label>
      <label>
        {copy['moderation.media.attributionUrlLabel']}
        <input type="url" name="attributionUrl" value={initial?.attributionUrl ?? ''} />
      </label>
      <label lang="is">
        {copy['moderation.media.altTextIsLabel']}
        <input type="text" name="altTextIs" value={initial?.altTextIs ?? ''} />
      </label>
      <label lang="en">
        {copy['moderation.media.altTextEnLabel']}
        <input type="text" name="altTextEn" value={initial?.altTextEn ?? ''} />
      </label>
      {#if allowPrimaryChoice}
        <label class="checkbox-label">
          <input type="checkbox" name="makePrimary" checked={initial?.makePrimary ?? false} />
          {copy['moderation.media.makePrimaryLabel']}
        </label>
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

  label {
    display: grid;
    align-content: start;
    min-width: 0;
    gap: 0.3rem;
  }

  input,
  select {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 2.5rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
  }

  input[type='checkbox'] {
    width: auto;
    min-height: auto;
    padding: 0;
  }

  small {
    color: var(--hv-color-basalt-muted);
    font-weight: 500;
  }

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

  .checkbox-label {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
  }

  @media (max-width: 42rem) {
    .essential-fields,
    .reusable-fields,
    .optional-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
