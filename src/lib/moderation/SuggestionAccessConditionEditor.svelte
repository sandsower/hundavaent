<script lang="ts">
  import { untrack } from 'svelte';

  import { Field, Input, Select } from '@hundavaent/design-system';
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

<div class="field-grid grid grid-cols-2 gap-[0.55rem] max-[40rem]:grid-cols-[1fr]">
  <Field label={copy['suggestion.accessArea']} class="compact-field">
    <Select name="accessArea" required bind:value={accessArea}>
      <option value="indoors">{copy['access.indoor']}</option>
      <option value="outdoors">{copy['access.outdoor']}</option>
      <option value="designated_area">{copy['access.designated']}</option>
      <option value="other_bounded">{copy['access.otherBounded']}</option>
    </Select>
  </Field>
  <Field label={copy['suggestion.accessAreaNote']} class="compact-field">
    <Input
      name="accessAreaNote"
      bind:value={accessAreaNote}
      required={accessArea === 'other_bounded'}
    />
  </Field>
  <Field label={copy['suggestion.restraint']} class="compact-field">
    <Select name="restraintCondition" required bind:value={restraintCondition}>
      <option value="leash_required">{copy['access.leashRequired']}</option>
      <option value="off_leash_permitted">{copy['access.offLeash']}</option>
      <option value="carrier_required">{copy['access.carrierRequired']}</option>
      <option value="other_sourced">{copy['access.otherSourced']}</option>
    </Select>
  </Field>
  <Field label={copy['suggestion.restraintNote']} class="compact-field">
    <Input
      name="restraintNote"
      bind:value={restraintNote}
      required={restraintCondition === 'other_sourced'}
    />
  </Field>
  <Field label={copy['moderation.availabilityStateLabel']} class="compact-field">
    <Select name="availabilityState" required bind:value={availabilityState}>
      <option value="not_stated">{copy['accessSymbols.notStated']}</option>
      <option value="whenever_open">{copy['accessSymbols.wheneverOpen']}</option>
      <option value="limited">{copy['accessSymbols.limited']}</option>
    </Select>
  </Field>
  <Field label={copy['suggestion.permission']} class="compact-field">
    <Select name="permissionRequirement" required bind:value={permissionRequirement}>
      <option value="standing_permission">{copy['access.standingPermission']}</option>
      <option value="ask_on_arrival">{copy['access.askOnArrival']}</option>
      <option value="advance_approval">{copy['access.advanceApproval']}</option>
    </Select>
  </Field>
  {#if availabilityState === 'limited'}
    <Field label={copy['suggestion.availabilityDays']} class="compact-field">
      <Input
        name="availabilityDays"
        bind:value={availabilityDays}
        pattern="[1-7](,[1-7])*"
        required
      />
    </Field>
    <Field label={copy['suggestion.availabilityStarts']} class="compact-field">
      <Input name="availabilityStartsAt" type="time" bind:value={availabilityStartsAt} />
    </Field>
    <Field label={copy['suggestion.availabilityEnds']} class="compact-field">
      <Input name="availabilityEndsAt" type="time" bind:value={availabilityEndsAt} />
    </Field>
  {/if}
</div>

<style>
  /* Field renders its own label/control stack inside a child component, so scoped CSS cannot
     reach the label directly - the whole remaining chain after .compact-field is wrapped in one
     :global() (the SelectedPlaceCard ".card-body :global(.details-status p)" precedent), rather
     than just the class, because a bare `label` tag selector after a partial :global() would
     still be scope-hashed and fail to match. This preserves the original muted/reduced-size
     label treatment Field's own docs invite a call site to keep via a scoped hook; Input/Select
     now own the field's border/radius/surface/focus ring. */
  .field-grid :global(.compact-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
</style>
