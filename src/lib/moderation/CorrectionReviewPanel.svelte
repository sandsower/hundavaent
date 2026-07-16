<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { untrack } from 'svelte';
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    localizeAccessArea,
    localizePermission,
    localizePlaceField,
    localizeReportReason,
    localizeRestraint
  } from '$i18n/structured-place';

  import type { ModerationPlaceFlag, RelatedPlaceFlag } from '$server/place-flags/place-flags';

  interface CorrectionReviewData {
    lang: Locale;
    copy: Catalogue;
    flag: ModerationPlaceFlag;
    related: RelatedPlaceFlag[];
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
  }

  let { data, form = null, standalone = false }: Props = $props();

  const accessAreas = ['indoors', 'outdoors', 'designated_area', 'other_bounded'] as const;
  const restraints = [
    'leash_required',
    'off_leash_permitted',
    'carrier_required',
    'other_sourced'
  ] as const;
  const permissions = ['standing_permission', 'ask_on_arrival', 'advance_approval'] as const;
  const replacementCondition = $derived(
    data.flag.targetKind === 'access_condition' && data.flag.proposedValue
      ? (data.flag.proposedValue as Record<string, unknown>)
      : null
  );
  const replacementWindow = $derived(
    replacementCondition?.availability_window &&
      typeof replacementCondition.availability_window === 'object'
      ? (replacementCondition.availability_window as Record<string, unknown>)
      : {}
  );
  let availabilityState = $state<'whenever_open' | 'limited' | 'not_stated'>('not_stated');
  $effect(() => {
    const state = replacementCondition?.availability_state;
    availabilityState =
      state === 'whenever_open' || state === 'limited' || state === 'not_stated'
        ? state
        : Object.keys(replacementWindow).length > 0
          ? 'limited'
          : 'not_stated';
  });

  let submitting = $state(false);
  const isOpen = $derived(
    data.flag.outcome === 'submitted' || data.flag.outcome === 'needs_information'
  );
  const showDecision = $derived(isOpen || form?.error === 'conflict');
  // The outcome select starts from the kind-appropriate default and is thereafter freely editable
  // by the Moderator, so the initial read of `data.flag.kind` is intentionally untracked.
  let outcome = $state(
    untrack(() => (data.flag.kind === 'correction' ? 'applied' : 'confirmed_useful'))
  );

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
    if (typeof value === 'object') {
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
    return String(value);
  }

  const enhanceForm: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

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
    <p class="eyebrow">{data.copy[kindKey(data.flag.kind)]} · {target()}</p>
    <h1>{data.lang === 'is' ? data.flag.placeNameIs : data.flag.placeNameEn}</h1>
  {/if}
  <p class="summary">
    {data.copy[statusKey(data.flag.outcome)]}
    {#if data.flag.isSafetyConcern}<span class="safety">{data.copy['flag.safetyConcernBadge']}</span
      >{/if}
    {#if data.flag.reportReason}
      · {localizeReportReason(data.flag.reportReason, data.copy)}
    {/if}
  </p>

  {#if errorMessage}<p class="message error" role="alert">{errorMessage}</p>{/if}
  {#if data.resolved}<p class="message success" role="status">{data.copy['flag.resolved']}</p>{/if}
  {#if data.contributionConfirmed}
    <p class="message success" role="status">{data.copy['flag.contributionConfirmed']}</p>
  {/if}

  <section aria-labelledby="comparison-title">
    <h2 id="comparison-title">{data.copy['correction.currentValue']}</h2>
    <dl>
      <div>
        <dt>{data.copy['flag.currentLiveValue']}</dt>
        <dd>{describeValue(data.flag.currentLiveValue)}</dd>
      </div>
      <div>
        <dt>{data.copy['flag.currentValueSnapshot']}</dt>
        <dd>{describeValue(data.flag.currentValueSnapshot)}</dd>
      </div>
      {#if data.flag.kind === 'correction'}
        <div>
          <dt>{data.copy['flag.proposedValueLabel']}</dt>
          <dd>{describeValue(data.flag.proposedValue)}</dd>
        </div>
      {/if}
    </dl>
  </section>

  <section aria-labelledby="evidence-title">
    <h2 id="evidence-title">{data.copy['evidenceField.section']}</h2>
    <dl>
      <div>
        <dt>{data.copy['evidenceField.label']}</dt>
        <dd>{data.flag.evidence.source_label}</dd>
      </div>
      <div>
        <dt>{data.copy['evidenceField.url']}</dt>
        <dd>{data.flag.evidence.source_url ?? data.flag.evidence.source_citation}</dd>
      </div>
      <div>
        <dt>{data.copy['evidenceField.observedAt']}</dt>
        <dd>{data.flag.evidence.observed_at}</dd>
      </div>
      <div>
        <dt>{data.copy['correction.explanation']}</dt>
        <dd>{data.flag.explanation}</dd>
      </div>
    </dl>
  </section>

  {#if data.flag.targetKind === 'access_condition'}
    <section aria-labelledby="verification-title">
      <h2 id="verification-title">{data.copy['flag.currentVerification.section']}</h2>
      {#if data.flag.currentVerificationId}
        <dl>
          <div>
            <dt>{data.copy['flag.currentVerification.status']}</dt>
            <dd>{data.flag.currentVerificationStatus}</dd>
          </div>
          <div>
            <dt>{data.copy['flag.currentVerification.verifiedAt']}</dt>
            <dd>{data.flag.currentVerificationVerifiedAt}</dd>
          </div>
          <div>
            <dt>{data.copy['flag.currentVerification.freshnessUntil']}</dt>
            <dd>{data.flag.currentVerificationFreshnessUntil}</dd>
          </div>
          <div>
            <dt>{data.copy['flag.currentVerification.provenance']}</dt>
            <dd>
              <ul>
                {#each data.flag.currentVerificationEvidence ?? [] as source (source.sourceLabel + source.observedAt)}
                  <li>{source.kind} · {source.sourceLabel} · {source.observedAt}</li>
                {/each}
              </ul>
            </dd>
          </div>
        </dl>
      {:else}
        <p>{data.copy['flag.currentVerification.none']}</p>
      {/if}
    </section>
  {/if}

  <section aria-labelledby="related-title">
    <h2 id="related-title">{data.copy['flag.relatedClaims']}</h2>
    {#if data.related.length === 0}
      <p>{data.copy['flag.noRelatedClaims']}</p>
    {:else}
      <ul>
        {#each data.related as related (related.flagId)}
          <li>
            <strong>{data.copy[kindKey(related.kind)]}</strong>
            <span>{data.copy[statusKey(related.outcome)]} · {related.submittedAt}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if showDecision}
    <form
      id="correction-decision"
      method="POST"
      action="?/resolve"
      use:enhance={enhanceForm}
      aria-busy={submitting}
    >
      <input type="hidden" name="flagId" value={data.flag.flagId} />
      <label>
        {data.copy['suggestion.outcome']}
        <select name="outcome" bind:value={outcome}>
          {#if data.flag.kind === 'correction'}
            <option value="applied">{data.copy['flag.status.applied']}</option>
          {:else}
            <option value="confirmed_useful">{data.copy['flag.status.confirmed_useful']}</option>
          {/if}
          {#if data.flag.targetKind === 'access_condition'}
            <option value="dispute_opened">{data.copy['flag.status.dispute_opened']}</option>
          {/if}
          <option value="place_inactivated">{data.copy['flag.status.place_inactivated']}</option>
          <option value="needs_information">{data.copy['flag.status.needs_information']}</option>
          <option value="rejected">{data.copy['flag.status.rejected']}</option>
        </select>
      </label>

      <div class="grid two">
        <label>
          {data.copy['flag.memberReasonIs']}
          <textarea name="memberReasonIs" rows="2" required></textarea>
        </label>
        <label>
          {data.copy['flag.memberReasonEn']}
          <textarea name="memberReasonEn" rows="2" required></textarea>
        </label>
      </div>

      {#if data.flag.privateNote}
        <p class="previous-note">
          <strong>{data.copy['flag.previousPrivateNote']}</strong>
          {data.flag.privateNote}
        </p>
      {/if}
      <label>
        {data.copy['flag.privateNote']}
        <textarea name="privateNote" rows="3"></textarea>
      </label>

      {#if outcome === 'applied' && data.flag.targetKind === 'place_field' && data.flag.targetField}
        <fieldset class="proposal-editor">
          <legend>{data.copy['flag.newFieldValue']}</legend>
          <input type="hidden" name="expectedVersion" value={data.flag.currentPlaceVersion ?? ''} />
          {#if data.flag.targetField === 'name' || data.flag.targetField === 'description'}
            <div class="grid two">
              <label>
                {data.copy['correction.nameIs']}
                <input name="fieldValueIs" required />
              </label>
              <label>
                {data.copy['correction.nameEn']}
                <input name="fieldValueEn" required />
              </label>
            </div>
          {:else if data.flag.targetField === 'opening_hours'}
            <label>
              {data.copy['correction.openingHoursJson']}
              <textarea name="fieldValueJson" rows="4"></textarea>
            </label>
          {:else if data.flag.targetField === 'dog_amenities'}
            <label>
              {data.copy['correction.dogAmenitiesList']}
              <input name="fieldValueList" />
            </label>
          {:else}
            <label>
              {data.copy['correction.textValue']}
              <input name="fieldValueText" />
            </label>
          {/if}
        </fieldset>
      {/if}

      {#if outcome === 'applied' && data.flag.targetKind === 'access_condition'}
        <fieldset class="proposal-editor">
          <legend>{data.copy['flag.replacementCondition']}</legend>
          <input
            type="hidden"
            name="expectedVerificationId"
            value={data.flag.currentVerificationId ?? ''}
          />
          <div class="grid three">
            <label>
              {data.copy['correction.accessArea']}
              <select name="accessArea">
                {#each accessAreas as area (area)}
                  <option value={area}>{localizeAccessArea(area, data.copy)}</option>
                {/each}
              </select>
            </label>
            <label>
              {data.copy['correction.restraint']}
              <select name="restraintCondition">
                {#each restraints as restraint (restraint)}
                  <option value={restraint}>{localizeRestraint(restraint, data.copy)}</option>
                {/each}
              </select>
            </label>
            <label>
              {data.copy['correction.permission']}
              <select name="permissionRequirement">
                {#each permissions as permission (permission)}
                  <option value={permission}>{localizePermission(permission, data.copy)}</option>
                {/each}
              </select>
            </label>
          </div>
          <label>
            {data.copy['correction.accessAreaNote']}
            <input name="accessAreaNote" />
          </label>
          <label>
            {data.copy['correction.restraintNote']}
            <input name="restraintNote" />
          </label>
          <label>
            {data.copy['moderation.availabilityStateLabel']}
            <select name="availabilityState" bind:value={availabilityState}>
              <option value="not_stated">{data.copy['accessSymbols.notStated']}</option>
              <option value="whenever_open">{data.copy['accessSymbols.wheneverOpen']}</option>
              <option value="limited">{data.copy['accessSymbols.limited']}</option>
            </select>
          </label>
          {#if availabilityState === 'limited'}
            <div class="grid two">
              <label>
                {data.copy['correction.availabilityStarts']}
                <input
                  name="availabilityStartsAt"
                  type="time"
                  value={typeof replacementWindow.startsAt === 'string'
                    ? replacementWindow.startsAt
                    : ''}
                />
              </label>
              <label>
                {data.copy['correction.availabilityEnds']}
                <input
                  name="availabilityEndsAt"
                  type="time"
                  value={typeof replacementWindow.endsAt === 'string'
                    ? replacementWindow.endsAt
                    : ''}
                />
              </label>
            </div>
            <label>
              {data.copy['correction.availabilityDays']}
              <input
                name="availabilityDays"
                value={Array.isArray(replacementWindow.days)
                  ? replacementWindow.days.join(',')
                  : ''}
              />
            </label>
          {/if}
          <div class="grid two">
            <label>
              {data.copy['evidenceField.kind']}
              <select name="evidenceKind">
                <option value="official_website">official_website</option>
                <option value="venue_representative">venue_representative</option>
                <option value="member_report">member_report</option>
                <option value="direct_observation">direct_observation</option>
                <option value="public_record">public_record</option>
                <option value="other">other</option>
              </select>
            </label>
            <label>
              {data.copy['evidenceField.label']}
              <input name="evidenceSourceLabel" />
            </label>
          </div>
          <div class="grid two">
            <label>
              {data.copy['evidenceField.url']}
              <input name="evidenceUrl" type="url" />
            </label>
            <label>
              {data.copy['evidenceField.citation']}
              <input name="evidenceCitation" />
            </label>
          </div>
          <label>
            {data.copy['evidenceField.observedAt']}
            <input name="evidenceObservedAt" type="datetime-local" />
          </label>
          <div class="grid two">
            <label>
              {data.copy['flag.verifiedAt']}
              <input name="verifiedAt" type="datetime-local" />
            </label>
            <label>
              {data.copy['flag.freshnessUntil']}
              <input name="freshnessUntil" type="date" />
            </label>
          </div>
        </fieldset>
      {/if}

      {#if outcome === 'dispute_opened'}
        <fieldset class="proposal-editor">
          <legend>{data.copy['flag.disputeReason']}</legend>
          <input
            type="hidden"
            name="expectedVerificationId"
            value={data.flag.currentVerificationId ?? ''}
          />
          <label>
            {data.copy['flag.disputeReason']}
            <textarea name="disputeReason" rows="2" required></textarea>
          </label>
          <div class="grid two">
            <label>
              {data.copy['evidenceField.kind']}
              <select name="evidenceKind">
                <option value="official_website">official_website</option>
                <option value="venue_representative">venue_representative</option>
                <option value="member_report">member_report</option>
                <option value="direct_observation">direct_observation</option>
                <option value="public_record">public_record</option>
                <option value="other">other</option>
              </select>
            </label>
            <label>
              {data.copy['evidenceField.label']}
              <input name="evidenceSourceLabel" />
            </label>
          </div>
          <div class="grid two">
            <label>
              {data.copy['evidenceField.url']}
              <input name="evidenceUrl" type="url" />
            </label>
            <label>
              {data.copy['evidenceField.citation']}
              <input name="evidenceCitation" />
            </label>
          </div>
          <label>
            {data.copy['evidenceField.observedAt']}
            <input name="evidenceObservedAt" type="datetime-local" />
          </label>
        </fieldset>
      {/if}

      {#if outcome === 'place_inactivated'}
        <fieldset class="proposal-editor">
          <legend>{data.copy['flag.decisionNotes']}</legend>
          <input type="hidden" name="expectedVersion" value={data.flag.currentPlaceVersion ?? ''} />
          <label>
            {data.copy['flag.decisionNotes']}
            <textarea name="decisionNotes" rows="2" required></textarea>
          </label>
        </fieldset>
      {/if}

      <button type="submit" disabled={submitting || (form?.error === 'conflict' && !isOpen)}
        >{data.copy['flag.resolve']}</button
      >
    </form>
  {/if}

  {#if data.flag.outcome === 'applied' || data.flag.outcome === 'confirmed_useful'}
    {#if data.flag.contributionId}
      <p class="message success">{data.copy['flag.contributionAlreadyConfirmed']}</p>
    {:else}
      <form method="POST" action="?/confirmUseful" use:enhance={enhanceForm} aria-busy={submitting}>
        <input type="hidden" name="flagId" value={data.flag.flagId} />
        <button type="submit" disabled={submitting}>{data.copy['flag.confirmUseful']}</button>
      </form>
    {/if}
  {/if}
</div>

<style>
  .review-shell {
    width: 100%;
  }
  .review-shell.standalone {
    width: min(100% - 2rem, 64rem);
    margin: 3rem auto;
  }
  .eyebrow {
    margin: 0;
    color: var(--hv-color-fjord);
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  h1 {
    margin: 0.25rem 0;
    font-family: var(--hv-font-display);
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1;
  }
  .summary {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-weight: 850;
  }
  .safety {
    margin-left: 0.5rem;
    border: 1px solid var(--hv-color-danger);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-danger-soft);
    padding: 0.2rem 0.5rem;
    color: var(--hv-color-danger);
  }
  section,
  form {
    margin-top: 0.75rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    padding: 0.8rem;
    box-shadow: none;
  }
  dl,
  ul,
  form {
    display: grid;
    gap: 0.6rem;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-family: var(--hv-font-display);
    font-size: 1rem;
    line-height: 1.2;
  }
  dl,
  ul {
    margin: 0;
    padding: 0;
  }
  ul {
    list-style: none;
  }
  dl div {
    display: grid;
    grid-template-columns: minmax(7.5rem, 0.35fr) minmax(0, 1fr);
    gap: 0.75rem;
    padding-block: 0.45rem;
    border-top: 1px solid var(--hv-border-subtle);
  }
  dt {
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.02em;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
  }
  li {
    display: grid;
    gap: 0.25rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.6rem;
  }
  .previous-note {
    margin: 0;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow);
    padding: 0.65rem;
  }
  .previous-note strong {
    display: block;
    margin-bottom: 0.2rem;
  }
  .message.success {
    border-color: var(--hv-color-success);
    background: var(--hv-color-success-soft);
    color: var(--hv-color-success);
  }
  .message.error {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
  }
  fieldset.proposal-editor {
    display: grid;
    gap: 0.75rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    padding: 0.75rem;
  }
  legend {
    padding: 0 0.35rem;
    font-weight: 950;
  }
  label {
    display: grid;
    gap: 0.25rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  input,
  textarea,
  select {
    width: 100%;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    padding: 0.55rem 0.6rem;
    color: var(--hv-color-basalt);
    font: inherit;
  }
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
  button {
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    padding: 0.65rem 0.85rem;
    font-weight: 900;
    box-shadow: none;
    justify-self: start;
  }
  .grid {
    display: grid;
    gap: 0.75rem;
  }
  .two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  @media (max-width: 48rem) {
    .two,
    .three,
    dl div {
      grid-template-columns: 1fr;
    }
  }
</style>
