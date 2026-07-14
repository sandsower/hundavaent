<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import {
    localizeAccessArea,
    localizeEvidenceKind,
    localizePermission,
    localizePlaceCategory,
    localizeRestraint
  } from '$i18n/structured-place';
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type {
    ContributorEvidenceItem,
    ModerationContributorStatus
  } from '$server/contributors/contributor-status';
  import type { SuggestionProposal } from '$server/suggestions/suggestion-input';
  import type {
    ModerationSuggestion,
    SuggestionOutcome,
    SuggestionPlaceMatch
  } from '$server/suggestions/suggestions';

  interface SuggestionReviewData {
    lang: Locale;
    copy: Catalogue;
    suggestion: ModerationSuggestion;
    matches: SuggestionPlaceMatch[];
    resolved: boolean;
    contributionConfirmed: boolean;
    contributor: ModerationContributorStatus | null;
    contributorEvidence: ContributorEvidenceItem[];
    contributionRevoked: boolean;
    conductFlagRecorded: boolean;
    conductFlagCleared: boolean;
  }

  interface SuggestionReviewForm {
    error?: string;
    matchesRefreshed?: boolean;
    refreshedMatches?: SuggestionPlaceMatch[];
    refreshedOutcome?: SuggestionOutcome;
    refreshedMemberReasonIs?: string;
    refreshedMemberReasonEn?: string;
    refreshedPrivateNote?: string;
    refreshedProposal?: SuggestionProposal;
  }

  interface Props {
    data: SuggestionReviewData;
    form?: SuggestionReviewForm | null;
    standalone?: boolean;
  }

  let { data, form = null, standalone = false }: Props = $props();
  let submitting = $state(false);
  let outcome = $state('needs_information');
  const decisionStillActionable = $derived(
    data.suggestion.outcome === 'submitted' || data.suggestion.outcome === 'needs_information'
  );
  $effect(() => {
    if (form?.refreshedOutcome) outcome = form.refreshedOutcome;
  });
  const proposal = $derived(
    form?.refreshedProposal ?? data.suggestion.reviewedProposal ?? data.suggestion.proposal
  );
  const identityMatches = $derived(form?.refreshedMatches ?? data.matches);
  const categories = [
    'restaurant',
    'cafe',
    'bar',
    'shop',
    'shopping_centre',
    'accommodation',
    'park',
    'recreation',
    'culture',
    'service',
    'other'
  ] as const;
  const municipalities = [
    'reykjavik',
    'kopavogur',
    'seltjarnarnes',
    'gardabaer',
    'hafnarfjordur',
    'mosfellsbaer',
    'kjosarhreppur'
  ] as const;
  const accessAreas = ['indoors', 'outdoors', 'designated_area', 'other_bounded'] as const;
  const restraints = [
    'leash_required',
    'off_leash_permitted',
    'carrier_required',
    'other_sourced'
  ] as const;
  const permissions = ['standing_permission', 'ask_on_arrival', 'advance_approval'] as const;
  const evidenceKinds = [
    'official_website',
    'venue_representative',
    'member_report',
    'direct_observation',
    'public_record',
    'other'
  ] as const;
  const dateTimeLocal = (value: string) => value.slice(0, 16);
  const translationValue = (value: string, needsReview?: boolean) => (needsReview ? '' : value);
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  const availability = $derived(
    proposal.access_condition.availability_window as Record<string, unknown>
  );
  const lifecycleKey = (lifecycle: string): MessageKey =>
    `suggestion.lifecycle.${lifecycle}` as MessageKey;
  const enhanceForm: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };
  const flagKindKey = (kind: string): MessageKey =>
    `contributor.moderation.flagKind.${kind}` as MessageKey;
  const activeEvidenceFlagId = $derived(
    data.contributorEvidence.find((item) => item.flagActive)?.flagId ?? null
  );
</script>

<div class="review-panel" class:standalone>
  {#if standalone}
    <p class="eyebrow">{data.copy['suggestion.review']}</p>
    <h1>{data.lang === 'is' ? data.suggestion.nameIs : data.suggestion.nameEn}</h1>
    <p>
      {data.suggestion.operatorName} · {data.suggestion.addressLine}, {data.suggestion.locality}
    </p>
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
  {#if data.resolved}
    <p class="message success" role="status">{data.copy['suggestion.resolved']}</p>
  {/if}
  {#if data.contributionConfirmed}
    <p class="message success" role="status">{data.copy['suggestion.contributionConfirmed']}</p>
  {/if}
  {#if form?.matchesRefreshed}
    <p class="message success" role="status">{data.copy['suggestion.matchesRefreshed']}</p>
  {/if}

  <section aria-labelledby="proposal-title">
    <h2 id="proposal-title">{data.copy['suggestion.reviewedProposal']}</h2>
    <dl>
      <div>
        <dt>{data.copy['suggestion.operator']}</dt>
        <dd>{proposal.operator_name}</dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.category']}</dt>
        <dd>{localizePlaceCategory(proposal.category, data.copy)}</dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.location']}</dt>
        <dd>
          {proposal.location.address_line}, {proposal.location.postal_code}
          {proposal.location.locality} · {proposal.location.municipality} · {proposal.location
            .latitude}, {proposal.location.longitude}
        </dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.translationIs']}</dt>
        <dd>
          <strong>{proposal.translations.is.name}</strong><br />{proposal.translations.is
            .description}
        </dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.translationEn']}</dt>
        <dd>
          <strong>{proposal.translations.en.name}</strong><br />{proposal.translations.en
            .description}
        </dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.contact']}</dt>
        <dd>{proposal.website_url ?? '–'} · {proposal.phone ?? '–'}</dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.openingHours']}</dt>
        <dd><pre>{json(proposal.opening_hours)}</pre></dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.amenities']}</dt>
        <dd>{proposal.dog_amenities.join(', ') || '–'}</dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.access']}</dt>
        <dd>
          {localizeAccessArea(proposal.access_condition.access_area, data.copy)}
          {#if proposal.access_condition.access_area_note}
            · {proposal.access_condition.access_area_note}{/if}
          · {localizeRestraint(proposal.access_condition.restraint_condition, data.copy)}
          {#if proposal.access_condition.restraint_note}
            · {proposal.access_condition.restraint_note}{/if}
          · {localizePermission(proposal.access_condition.permission_requirement, data.copy)}
          <pre>{json(proposal.access_condition.availability_window)}</pre>
        </dd>
      </div>
      <div>
        <dt>{data.copy['suggestion.evidence']}</dt>
        <dd>
          {localizeEvidenceKind(proposal.evidence.kind, data.copy)} · {proposal.evidence
            .source_label}<br />
          {#if proposal.evidence.source_url}
            <!-- eslint-disable svelte/no-navigation-without-resolve -->
            <a href={proposal.evidence.source_url}>{proposal.evidence.source_url}</a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          {/if}
          {#if proposal.evidence.source_citation}<span>{proposal.evidence.source_citation}</span
            >{/if}<br />
          <time datetime={proposal.evidence.observed_at}>{proposal.evidence.observed_at}</time><br
          />
          {proposal.evidence.explanation}
          <pre>{json(proposal.evidence.source_metadata)}</pre>
        </dd>
      </div>
    </dl>
  </section>

  <section aria-labelledby="matches-title">
    <h2 id="matches-title">{data.copy['suggestion.matches']}</h2>
    {#if identityMatches.length === 0}
      <p>{data.copy['suggestion.noMatches']}</p>
    {:else}
      <ul>
        {#each identityMatches as match (match.placeId)}
          <li>
            <strong
              >{data.lang === 'is'
                ? (match.nameIs ?? match.operatorName)
                : (match.nameEn ?? match.operatorName)}</strong
            >
            <span
              >{data.copy[lifecycleKey(match.lifecycle)]} · {match.addressLine}, {match.locality}</span
            >
            <span class="signals">
              {#if match.sameOperator}<b>{data.copy['suggestion.sameOperator']}</b>{/if}
              {#if match.exactLocation}<b>{data.copy['suggestion.exactLocation']}</b>{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section aria-labelledby="contributor-title">
    <h2 id="contributor-title">{data.copy['contributor.moderation.heading']}</h2>
    <p class="signal-note">{data.copy['contributor.moderation.signalNote']}</p>

    {#if data.contributionRevoked}
      <p class="message success" role="status">{data.copy['contributor.moderation.revoked']}</p>
    {/if}
    {#if data.conductFlagRecorded}
      <p class="message success" role="status">
        {data.copy['contributor.moderation.flagRecorded']}
      </p>
    {/if}
    {#if data.conductFlagCleared}
      <p class="message success" role="status">{data.copy['contributor.moderation.flagCleared']}</p>
    {/if}

    {#if data.contributor}
      <dl>
        <div>
          <dt>{data.copy['contributor.moderation.statusLabel']}</dt>
          <dd>{data.copy[`contributor.status.${data.contributor.status}` as MessageKey]}</dd>
        </div>
        <div>
          <dt>{data.copy['contributor.moderation.flagActive']}</dt>
          <dd>
            {data.contributor.hasActiveFlag
              ? data.copy['contributor.moderation.flagActive']
              : data.copy['contributor.moderation.noFlag']}
          </dd>
        </div>
      </dl>
      {#if !data.contributor.policyVersion}
        <p class="policy-missing">{data.copy['contributor.moderation.policyMissing']}</p>
      {/if}

      <h3>{data.copy['contributor.moderation.evidenceHeading']}</h3>
      {#if data.contributorEvidence.length === 0}
        <p>{data.copy['contributor.moderation.evidenceEmpty']}</p>
      {:else}
        <ul>
          {#each data.contributorEvidence as item, index (item.contributionId ?? item.flagId ?? index)}
            <li>
              {#if item.contributionId}
                <span
                  >{data.copy['contributor.moderation.evidenceContribution']} · {item.confirmedAt}</span
                >
                {#if item.revokedAt}
                  <strong>{data.copy['contributor.moderation.evidenceRevoked']}</strong>
                  <span>{item.revokedReason}</span>
                {:else}
                  <form
                    method="POST"
                    action="?/revokeContribution"
                    use:enhance={enhanceForm}
                    aria-busy={submitting}
                  >
                    <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} />
                    <input type="hidden" name="contributionId" value={item.contributionId} />
                    <label
                      >{data.copy['contributor.moderation.revokeReason']}<input
                        name="revokeReason"
                        required
                      /></label
                    >
                    <button type="submit" disabled={submitting}
                      >{data.copy['contributor.moderation.revoke']}</button
                    >
                  </form>
                {/if}
              {:else}
                <span>{data.copy[flagKindKey(item.flagKind ?? '')]} · {item.flagRecordedAt}</span>
                <span>{item.flagReason}</span>
                {#if item.flagActive}
                  <strong>{data.copy['contributor.moderation.flagActive']}</strong>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      <form
        method="POST"
        action="?/recordConductFlag"
        use:enhance={enhanceForm}
        aria-busy={submitting}
      >
        <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} />
        <input type="hidden" name="memberId" value={data.suggestion.memberId} />
        <label
          >{data.copy['contributor.moderation.flagKind']}
          <select name="flagKind">
            <option value="fraud">{data.copy['contributor.moderation.flagKind.fraud']}</option>
            <option value="abuse">{data.copy['contributor.moderation.flagKind.abuse']}</option>
            <option value="policy_violation"
              >{data.copy['contributor.moderation.flagKind.policy_violation']}</option
            >
          </select>
        </label>
        <label
          >{data.copy['contributor.moderation.flagReason']}<textarea
            name="flagReason"
            rows="2"
            required></textarea></label
        >
        <button type="submit" disabled={submitting}
          >{data.copy['contributor.moderation.flagMember']}</button
        >
      </form>

      {#if activeEvidenceFlagId}
        <form
          method="POST"
          action="?/clearConductFlag"
          use:enhance={enhanceForm}
          aria-busy={submitting}
        >
          <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} />
          <input type="hidden" name="flagId" value={activeEvidenceFlagId} />
          <label
            >{data.copy['contributor.moderation.clearReason']}<input
              name="clearReason"
              required
            /></label
          >
          <button type="submit" disabled={submitting}
            >{data.copy['contributor.moderation.clearFlag']}</button
          >
        </form>
      {/if}
    {/if}
  </section>

  {#if decisionStillActionable || form?.error === 'conflict'}
    <form
      id="suggestion-decision"
      method="POST"
      action="?/resolve"
      use:enhance={enhanceForm}
      aria-busy={submitting}
    >
      <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} />
      <label>
        {data.copy['suggestion.outcome']}
        <select name="outcome" bind:value={outcome}>
          <option value="needs_information"
            >{data.copy['suggestion.status.needs_information']}</option
          >
          <option value="accepted">{data.copy['suggestion.status.accepted']}</option>
          <option value="duplicate">{data.copy['suggestion.status.duplicate']}</option>
          <option value="rejected">{data.copy['suggestion.status.rejected']}</option>
        </select>
      </label>
      <div class="two">
        <label
          >{data.copy['suggestion.memberReasonIs']}<textarea name="memberReasonIs" rows="3" required
            >{form?.refreshedMemberReasonIs ?? ''}</textarea
          ></label
        >
        <label
          >{data.copy['suggestion.memberReasonEn']}<textarea name="memberReasonEn" rows="3" required
            >{form?.refreshedMemberReasonEn ?? ''}</textarea
          ></label
        >
      </div>
      {#if data.suggestion.privateNote}
        <p class="previous-note">
          <strong>{data.copy['suggestion.previousPrivateNote']}</strong>
          {data.suggestion.privateNote}
        </p>
      {/if}
      <label
        >{data.copy['suggestion.privateNote']}<textarea name="privateNote" rows="3"
          >{form?.refreshedPrivateNote ?? ''}</textarea
        ></label
      >
      {#if outcome === 'accepted'}
        <fieldset class="proposal-editor">
          <legend>{data.copy['suggestion.correctProposal']}</legend>
          <input type="hidden" name="purpose" value="dog_access_destination" />
          <label
            >{data.copy['suggestion.operator']}<input
              name="operatorName"
              value={proposal.operator_name}
              required
            /></label
          >
          <label
            >{data.copy['suggestion.category']}
            <select name="category" value={proposal.category}>
              {#each categories as category (category)}<option value={category}
                  >{localizePlaceCategory(category, data.copy)}</option
                >{/each}
            </select>
          </label>
          <div class="two">
            <label
              >{data.copy['suggestion.address']}<input
                name="addressLine"
                value={proposal.location.address_line}
                required
              /></label
            >
            <label
              >{data.copy['suggestion.locality']}<input
                name="locality"
                value={proposal.location.locality}
                required
              /></label
            >
            <label
              >{data.copy['suggestion.postalCode']}<input
                name="postalCode"
                value={proposal.location.postal_code}
                pattern="[0-9][0-9][0-9]"
                required
              /></label
            >
            <label
              >{data.copy['suggestion.municipality']}
              <select name="municipality" value={proposal.location.municipality}>
                {#each municipalities as municipality (municipality)}<option value={municipality}
                    >{municipality}</option
                  >{/each}
              </select>
            </label>
            <label
              >{data.copy['suggestion.latitude']}<input
                name="latitude"
                type="number"
                step="any"
                value={proposal.location.latitude}
                required
              /></label
            >
            <label
              >{data.copy['suggestion.longitude']}<input
                name="longitude"
                type="number"
                step="any"
                value={proposal.location.longitude}
                required
              /></label
            >
          </div>
          <div class="two">
            <fieldset>
              <legend>{data.copy['suggestion.translationIs']}</legend>
              {#if proposal.translations.is.needs_review}
                <p class="translation-needed" role="status">
                  {data.copy['suggestion.translationNeeded']}
                </p>
              {/if}
              <label
                >{data.copy['suggestion.name']}<input
                  name="nameIs"
                  value={translationValue(
                    proposal.translations.is.name,
                    proposal.translations.is.needs_review
                  )}
                  required
                /></label
              >
              <label
                >{data.copy['suggestion.description']}<textarea
                  name="descriptionIs"
                  rows="3"
                  required
                  >{translationValue(
                    proposal.translations.is.description,
                    proposal.translations.is.needs_review
                  )}</textarea
                ></label
              >
            </fieldset>
            <fieldset>
              <legend>{data.copy['suggestion.translationEn']}</legend>
              {#if proposal.translations.en.needs_review}
                <p class="translation-needed" role="status">
                  {data.copy['suggestion.translationNeeded']}
                </p>
              {/if}
              <label
                >{data.copy['suggestion.name']}<input
                  name="nameEn"
                  value={translationValue(
                    proposal.translations.en.name,
                    proposal.translations.en.needs_review
                  )}
                  required
                /></label
              >
              <label
                >{data.copy['suggestion.description']}<textarea
                  name="descriptionEn"
                  rows="3"
                  required
                  >{translationValue(
                    proposal.translations.en.description,
                    proposal.translations.en.needs_review
                  )}</textarea
                ></label
              >
            </fieldset>
          </div>
          <div class="two">
            <label
              >{data.copy['suggestion.website']}<input
                name="websiteUrl"
                type="url"
                value={proposal.website_url ?? ''}
              /></label
            >
            <label
              >{data.copy['suggestion.phone']}<input
                name="phone"
                value={proposal.phone ?? ''}
              /></label
            >
          </div>
          <label
            >{data.copy['suggestion.openingHoursJson']}<textarea name="openingHoursJson" rows="4"
              >{json(proposal.opening_hours)}</textarea
            ></label
          >
          <label
            >{data.copy['suggestion.amenities']}<input
              name="dogAmenities"
              value={proposal.dog_amenities.join(', ')}
            /></label
          >
          <div class="three">
            <label
              >{data.copy['suggestion.accessArea']}
              <select name="accessArea" value={proposal.access_condition.access_area}>
                {#each accessAreas as accessArea (accessArea)}<option value={accessArea}
                    >{localizeAccessArea(accessArea, data.copy)}</option
                  >{/each}
              </select>
            </label>
            <label
              >{data.copy['suggestion.restraint']}
              <select
                name="restraintCondition"
                value={proposal.access_condition.restraint_condition}
              >
                {#each restraints as restraint (restraint)}<option value={restraint}
                    >{localizeRestraint(restraint, data.copy)}</option
                  >{/each}
              </select>
            </label>
            <label
              >{data.copy['suggestion.permission']}
              <select
                name="permissionRequirement"
                value={proposal.access_condition.permission_requirement}
              >
                {#each permissions as permission (permission)}<option value={permission}
                    >{localizePermission(permission, data.copy)}</option
                  >{/each}
              </select>
            </label>
          </div>
          <div class="two">
            <label
              >{data.copy['suggestion.accessAreaNote']}<input
                name="accessAreaNote"
                value={proposal.access_condition.access_area_note ?? ''}
              /></label
            >
            <label
              >{data.copy['suggestion.restraintNote']}<input
                name="restraintNote"
                value={proposal.access_condition.restraint_note ?? ''}
              /></label
            >
            <label
              >{data.copy['suggestion.availabilityDays']}<input
                name="availabilityDays"
                value={Array.isArray(availability.days) ? availability.days.join(',') : ''}
              /></label
            >
            <label
              >{data.copy['suggestion.availabilityStarts']}<input
                name="availabilityStartsAt"
                type="time"
                value={typeof availability.startsAt === 'string' ? availability.startsAt : ''}
              /></label
            >
            <label
              >{data.copy['suggestion.availabilityEnds']}<input
                name="availabilityEndsAt"
                type="time"
                value={typeof availability.endsAt === 'string' ? availability.endsAt : ''}
              /></label
            >
          </div>
          <div class="two">
            <label
              >{data.copy['suggestion.evidenceKind']}
              <select name="evidenceKind" value={proposal.evidence.kind}>
                {#each evidenceKinds as kind (kind)}<option value={kind}
                    >{localizeEvidenceKind(kind, data.copy)}</option
                  >{/each}
              </select>
            </label>
            <label
              >{data.copy['suggestion.evidenceObserved']}<input
                name="evidenceObservedAt"
                type="datetime-local"
                value={dateTimeLocal(proposal.evidence.observed_at)}
                required
              /></label
            >
            <label
              >{data.copy['suggestion.evidenceUrl']}<input
                name="evidenceUrl"
                type="url"
                value={proposal.evidence.source_url ?? ''}
              /></label
            >
            <label
              >{data.copy['suggestion.evidenceCitation']}<input
                name="evidenceCitation"
                value={proposal.evidence.source_citation ?? ''}
              /></label
            >
            <label
              >{data.copy['suggestion.evidenceLabel']}<input
                name="evidenceSourceLabel"
                value={proposal.evidence.source_label}
                required
              /></label
            >
            <label
              >{data.copy['suggestion.evidenceExplanation']}<textarea
                name="evidenceExplanation"
                rows="3"
                required>{proposal.evidence.explanation}</textarea
              ></label
            >
          </div>
          <label
            >{data.copy['suggestion.sourceMetadata']}<textarea name="sourceMetadataJson" rows="4"
              >{json(proposal.evidence.source_metadata)}</textarea
            ></label
          >
        </fieldset>
        <fieldset class="identity-decisions">
          <legend>{data.copy['suggestion.identityDecisions']}</legend>
          <button type="submit" formaction="?/refreshMatches" formnovalidate class="secondary">
            {data.copy['suggestion.refreshIdentityMatches']}
          </button>
          <label
            >{data.copy['suggestion.operatorIdentity']}
            <select name="operatorIdentityPlaceId" required>
              <option value="new">{data.copy['suggestion.newOperatorIdentity']}</option>
              {#each identityMatches as match (match.placeId)}<option value={match.placeId}
                  >{data.copy['suggestion.reuseFrom']}
                  {match.operatorName} · {data.copy[lifecycleKey(match.lifecycle)]}</option
                >{/each}
            </select>
          </label>
          <label
            >{data.copy['suggestion.locationIdentity']}
            <select name="locationIdentityPlaceId" required>
              <option value="new">{data.copy['suggestion.newLocationIdentity']}</option>
              {#each identityMatches as match (match.placeId)}<option value={match.placeId}
                  >{data.copy['suggestion.reuseFrom']}
                  {match.addressLine}, {match.locality} · {data.copy[
                    lifecycleKey(match.lifecycle)
                  ]}</option
                >{/each}
            </select>
          </label>
        </fieldset>
      {/if}
      {#if outcome === 'duplicate'}
        <label>
          {data.copy['suggestion.duplicatePlace']}
          <select name="duplicatePlaceId" required>
            <option value=""></option>
            {#each data.matches as match (match.placeId)}
              <option value={match.placeId}>{match.operatorName} · {match.addressLine}</option>
            {/each}
          </select>
        </label>
      {/if}
      <button
        type="submit"
        disabled={submitting || (form?.error === 'conflict' && !decisionStillActionable)}
        >{data.copy['suggestion.resolve']}</button
      >
    </form>
  {/if}

  {#if data.suggestion.outcome === 'accepted'}
    {#if data.suggestion.contributionId && !data.contributionConfirmed}
      <p class="message success">{data.copy['suggestion.contributionAlreadyConfirmed']}</p>
    {:else if !data.suggestion.contributionId}
      <form method="POST" action="?/confirmUseful" use:enhance={enhanceForm} aria-busy={submitting}>
        <input type="hidden" name="suggestionId" value={data.suggestion.suggestionId} />
        <button type="submit" disabled={submitting}>{data.copy['suggestion.confirmUseful']}</button>
      </form>
    {/if}
  {/if}
</div>

<style>
  .review-panel.standalone {
    width: min(100% - 2rem, 64rem);
    margin: 3rem auto;
  }
  .eyebrow {
    color: var(--coral-dark);
    font-weight: 950;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 7vw, 5rem);
    line-height: 0.95;
  }
  section,
  form {
    margin-top: 1.5rem;
    border: 2px solid var(--ink);
    border-radius: 1rem;
    background: var(--paper-raised);
    padding: 1rem;
    box-shadow: 0.25rem 0.3rem 0 var(--teal);
  }
  dl,
  ul,
  form {
    display: grid;
    gap: 0.8rem;
  }
  dl div {
    display: grid;
    grid-template-columns: minmax(8rem, 0.35fr) 1fr;
    gap: 1rem;
  }
  dt {
    font-weight: 900;
  }
  dd {
    margin: 0;
  }
  ul {
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    gap: 0.25rem;
    border: 1px solid var(--ink);
    border-radius: 0.75rem;
    padding: 0.75rem;
  }
  .signals {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .signals b {
    border-radius: 999px;
    background: var(--mint);
    padding: 0.25rem 0.5rem;
  }
  .signal-note,
  .policy-missing {
    margin: 0 0 0.5rem;
    color: var(--ink-soft);
    font-size: 0.88rem;
  }
  .previous-note {
    margin: 0;
    border: 1px solid var(--ink);
    border-radius: 0.75rem;
    background: var(--paper-light);
    padding: 0.75rem;
  }
  .previous-note strong {
    display: block;
    margin-bottom: 0.25rem;
  }
  label {
    display: grid;
    gap: 0.35rem;
    font-weight: 850;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }
  fieldset {
    min-width: 0;
    border: 1px solid var(--ink);
    border-radius: 0.8rem;
    padding: 0.8rem;
  }
  legend {
    padding: 0 0.35rem;
    font-weight: 950;
  }
  pre {
    max-width: 100%;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  select,
  textarea,
  input {
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    background: white;
    padding: 0.7rem;
    color: var(--ink);
    font: inherit;
  }
  button {
    width: fit-content;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--sun);
    padding: 0.75rem 1rem;
    color: var(--ink);
    font-weight: 900;
    box-shadow: 0 0.2rem 0 var(--ink);
  }
  select:focus-visible,
  textarea:focus-visible,
  input:focus-visible,
  button:focus-visible {
    outline: 4px solid var(--focus);
  }
  .message {
    border: 2px solid var(--ink);
    border-radius: 0.75rem;
    padding: 0.8rem;
    font-weight: 850;
  }
  .error {
    background: var(--coral-soft);
  }
  .success {
    background: var(--mint);
  }
  @media (max-width: 42rem) {
    .two,
    .three,
    dl div {
      grid-template-columns: 1fr;
    }
  }
</style>
