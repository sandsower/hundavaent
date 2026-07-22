<script lang="ts">
  import { untrack } from 'svelte';

  import type { Catalogue } from '$i18n';
  import type { SuggestionProposal } from '$server/suggestions/suggestion-input';

  interface Props {
    copy: Catalogue;
    value: SuggestionProposal['access_condition'];
  }

  let { copy, value = $bindable() }: Props = $props();
  const initial = untrack(() => value);
  let accessArea = $state(initial.access_area);
  let accessAreaNote = $state(initial.access_area_note ?? '');
  let restraintCondition = $state(initial.restraint_condition);
  let restraintNote = $state(initial.restraint_note ?? '');
  let availabilityState = $state(initial.availability_state);
  let availabilityDays = $state(
    Array.isArray(initial.availability_window.days)
      ? initial.availability_window.days.join(',')
      : ''
  );
  let availabilityStartsAt = $state(
    typeof initial.availability_window.startsAt === 'string'
      ? initial.availability_window.startsAt
      : ''
  );
  let availabilityEndsAt = $state(
    typeof initial.availability_window.endsAt === 'string' ? initial.availability_window.endsAt : ''
  );
  let permissionRequirement = $state(initial.permission_requirement);

  $effect(() => {
    const days = availabilityDays
      .split(',')
      .map((day) => Number(day.trim()))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
    value = {
      access_area: accessArea,
      access_area_note: accessAreaNote.trim() || null,
      restraint_condition: restraintCondition,
      restraint_note: restraintNote.trim() || null,
      dog_eligibility: { scope: 'all_dogs' },
      availability_state: availabilityState,
      availability_window:
        availabilityState === 'limited'
          ? {
              ...(days.length ? { days } : {}),
              ...(availabilityStartsAt ? { startsAt: availabilityStartsAt } : {}),
              ...(availabilityEndsAt ? { endsAt: availabilityEndsAt } : {})
            }
          : {},
      permission_requirement: permissionRequirement
    };
  });
</script>

<div class="field-grid">
  <label>
    {copy['suggestion.accessArea']}
    <select required bind:value={accessArea}>
      <option value="indoors">{copy['access.indoor']}</option>
      <option value="outdoors">{copy['access.outdoor']}</option>
      <option value="designated_area">{copy['access.designated']}</option>
      <option value="other_bounded">{copy['access.otherBounded']}</option>
    </select>
  </label>
  <label>
    {copy['suggestion.accessAreaNote']}
    <input bind:value={accessAreaNote} required={accessArea === 'other_bounded'} />
  </label>
  <label>
    {copy['suggestion.restraint']}
    <select required bind:value={restraintCondition}>
      <option value="leash_required">{copy['access.leashRequired']}</option>
      <option value="off_leash_permitted">{copy['access.offLeash']}</option>
      <option value="carrier_required">{copy['access.carrierRequired']}</option>
      <option value="other_sourced">{copy['access.otherSourced']}</option>
    </select>
  </label>
  <label>
    {copy['suggestion.restraintNote']}
    <input bind:value={restraintNote} required={restraintCondition === 'other_sourced'} />
  </label>
  <label>
    {copy['moderation.availabilityStateLabel']}
    <select required bind:value={availabilityState}>
      <option value="not_stated">{copy['accessSymbols.notStated']}</option>
      <option value="whenever_open">{copy['accessSymbols.wheneverOpen']}</option>
      <option value="limited">{copy['accessSymbols.limited']}</option>
    </select>
  </label>
  <label>
    {copy['suggestion.permission']}
    <select required bind:value={permissionRequirement}>
      <option value="standing_permission">{copy['access.standingPermission']}</option>
      <option value="ask_on_arrival">{copy['access.askOnArrival']}</option>
      <option value="advance_approval">{copy['access.advanceApproval']}</option>
    </select>
  </label>
  {#if availabilityState === 'limited'}
    <label>
      {copy['suggestion.availabilityDays']}
      <input bind:value={availabilityDays} pattern="[1-7](,[1-7])*" required />
    </label>
    <label>
      {copy['suggestion.availabilityStarts']}
      <input type="time" bind:value={availabilityStartsAt} />
    </label>
    <label>
      {copy['suggestion.availabilityEnds']}
      <input type="time" bind:value={availabilityEndsAt} />
    </label>
  {/if}
</div>

<style>
  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }
  label {
    display: grid;
    min-width: 0;
    gap: 0.25rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  input,
  select {
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
  @media (max-width: 40rem) {
    .field-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
