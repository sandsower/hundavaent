<script lang="ts">
  import { untrack } from 'svelte';

  import { Button, Field, Input, Select } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import type { CandidatePublicationReview } from '$server/moderation/place-moderation';

  interface Props {
    copy: Catalogue;
    conditions: CandidatePublicationReview['accessConditions'];
  }

  interface EditableCondition {
    key: string;
    id?: string;
    accessArea: string;
    accessAreaNote: string;
    restraintCondition: string;
    restraintNote: string;
    maximumWeightKg: string;
    maximumDogs: string;
    eligibilityNotes: string;
    availabilityState: string;
    availabilityDays: string;
    availabilityStartsAt: string;
    availabilityEndsAt: string;
    availabilityStartsOn: string;
    availabilityEndsOn: string;
    availabilityNotes: string;
    permissionRequirement: string;
  }

  let { copy, conditions }: Props = $props();
  let nextKey = 0;
  let items = $state<EditableCondition[]>(untrack(() => conditions.map(toEditableCondition)));
  const sectionPayload = $derived(
    JSON.stringify({ access_conditions: items.map(toCanonicalCondition) })
  );

  function toEditableCondition(
    condition: CandidatePublicationReview['accessConditions'][number]
  ): EditableCondition {
    return {
      key: condition.id,
      id: condition.id,
      accessArea: condition.accessArea,
      accessAreaNote: condition.accessAreaNote ?? '',
      restraintCondition: condition.restraintCondition,
      restraintNote: condition.restraintNote ?? '',
      maximumWeightKg: valueText(condition.dogEligibility.maximumWeightKg),
      maximumDogs: valueText(condition.dogEligibility.maximumDogs),
      eligibilityNotes: condition.dogEligibility.notes ?? '',
      availabilityState:
        condition.availabilityState ??
        (Object.keys(condition.availabilityWindow).length > 0 ? 'limited' : 'not_stated'),
      availabilityDays: condition.availabilityWindow.days?.join(',') ?? '',
      availabilityStartsAt: condition.availabilityWindow.startsAt ?? '',
      availabilityEndsAt: condition.availabilityWindow.endsAt ?? '',
      availabilityStartsOn: condition.availabilityWindow.startsOn ?? '',
      availabilityEndsOn: condition.availabilityWindow.endsOn ?? '',
      availabilityNotes: condition.availabilityWindow.notes ?? '',
      permissionRequirement: condition.permissionRequirement
    };
  }

  function newCondition(): EditableCondition {
    nextKey += 1;
    return {
      key: `new-${nextKey}`,
      accessArea: 'outdoors',
      accessAreaNote: '',
      restraintCondition: 'leash_required',
      restraintNote: '',
      maximumWeightKg: '',
      maximumDogs: '',
      eligibilityNotes: '',
      availabilityState: 'not_stated',
      availabilityDays: '',
      availabilityStartsAt: '',
      availabilityEndsAt: '',
      availabilityStartsOn: '',
      availabilityEndsOn: '',
      availabilityNotes: '',
      permissionRequirement: 'standing_permission'
    };
  }

  function toCanonicalCondition(item: EditableCondition) {
    const maximumWeightKg = positiveNumber(item.maximumWeightKg);
    const maximumDogs = positiveInteger(item.maximumDogs);
    const eligibilityNotes = item.eligibilityNotes.trim();
    const restricted =
      maximumWeightKg !== undefined || maximumDogs !== undefined || Boolean(eligibilityNotes);
    const availabilityWindow =
      item.availabilityState === 'limited'
        ? compactObject({
            days: parseDays(item.availabilityDays),
            startsAt: optionalText(item.availabilityStartsAt),
            endsAt: optionalText(item.availabilityEndsAt),
            startsOn: optionalText(item.availabilityStartsOn),
            endsOn: optionalText(item.availabilityEndsOn),
            notes: optionalText(item.availabilityNotes)
          })
        : {};

    return {
      ...(item.id ? { id: item.id } : {}),
      access_area: item.accessArea,
      access_area_note: optionalText(item.accessAreaNote) ?? null,
      restraint_condition: item.restraintCondition,
      restraint_note: optionalText(item.restraintNote) ?? null,
      dog_eligibility: restricted
        ? {
            scope: 'restricted',
            ...(maximumWeightKg === undefined ? {} : { maximumWeightKg }),
            ...(maximumDogs === undefined ? {} : { maximumDogs }),
            ...(eligibilityNotes ? { notes: eligibilityNotes } : {})
          }
        : { scope: 'all_dogs' },
      availability_state: item.availabilityState,
      availability_window: availabilityWindow,
      permission_requirement: item.permissionRequirement
    };
  }

  function compactObject(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  }

  function parseDays(value: string): number[] | undefined {
    const days = value
      .split(',')
      .map((day) => Number(day.trim()))
      .filter((day) => Number.isInteger(day));
    return days.length ? days : undefined;
  }

  function optionalText(value: string): string | undefined {
    return value.trim() || undefined;
  }

  function positiveNumber(value: string): number | undefined {
    const parsed = Number(value);
    return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  function positiveInteger(value: string): number | undefined {
    const parsed = Number(value);
    return value.trim() && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  function valueText(value: number | undefined): string {
    return value === undefined ? '' : String(value);
  }

  function addCondition(): void {
    items.push(newCondition());
  }

  function removeCondition(index: number): void {
    items.splice(index, 1);
  }
</script>

<div class="access-conditions-editor">
  <input type="hidden" name="sectionPayload" value={sectionPayload} />

  <div class="condition-list grid gap-[0.7rem]">
    {#each items as condition, index (condition.key)}
      <fieldset
        class="condition-card grid gap-[0.65rem] m-0 p-3 border border-border-subtle rounded-panel bg-snow"
      >
        <legend class="px-[0.35rem] py-0 font-[850]">
          {copy['place.conditionLabel'].replace('{number}', String(index + 1))}
        </legend>
        <div class="field-grid grid grid-cols-2 gap-[0.55rem] max-[40rem]:grid-cols-[1fr]">
          <Field label={copy['place.accessArea']} class="mod-field">
            <Select required bind:value={condition.accessArea}>
              <option value="indoors">{copy['access.indoor']}</option>
              <option value="outdoors">{copy['access.outdoor']}</option>
              <option value="designated_area">{copy['access.designated']}</option>
              <option value="other_bounded">{copy['access.otherBounded']}</option>
            </Select>
          </Field>
          <Field label={copy['moderation.areaNoteLabel']} class="mod-field">
            <Input bind:value={condition.accessAreaNote} />
          </Field>
          <Field label={copy['place.restraint']} class="mod-field">
            <Select required bind:value={condition.restraintCondition}>
              <option value="leash_required">{copy['access.leashRequired']}</option>
              <option value="off_leash_permitted">{copy['access.offLeash']}</option>
              <option value="carrier_required">{copy['access.carrierRequired']}</option>
              <option value="other_sourced">{copy['access.otherSourced']}</option>
            </Select>
          </Field>
          <Field label={copy['moderation.restraintNoteLabel']} class="mod-field">
            <Input bind:value={condition.restraintNote} />
          </Field>
          <Field label={copy['moderation.maximumWeightLabel']} class="mod-field">
            <Input type="number" min="0.1" step="0.1" bind:value={condition.maximumWeightKg} />
          </Field>
          <Field label={copy['moderation.maximumDogsLabel']} class="mod-field">
            <Input type="number" min="1" step="1" bind:value={condition.maximumDogs} />
          </Field>
          <Field label={copy['moderation.eligibilityNoteLabel']} class="mod-field wide">
            <Input bind:value={condition.eligibilityNotes} />
          </Field>
          <Field label={copy['moderation.availabilityStateLabel']} class="mod-field">
            <Select required bind:value={condition.availabilityState}>
              <option value="not_stated">{copy['accessSymbols.notStated']}</option>
              <option value="whenever_open">{copy['accessSymbols.wheneverOpen']}</option>
              <option value="limited">{copy['accessSymbols.limited']}</option>
            </Select>
          </Field>
          <Field label={copy['place.permission']} class="mod-field">
            <Select required bind:value={condition.permissionRequirement}>
              <option value="standing_permission">{copy['access.standingPermission']}</option>
              <option value="ask_on_arrival">{copy['access.askOnArrival']}</option>
              <option value="advance_approval">{copy['access.advanceApproval']}</option>
            </Select>
          </Field>
          {#if condition.availabilityState === 'limited'}
            <Field label={copy['moderation.weekdaysLabel']} class="mod-field">
              <Input
                placeholder="1,2,3"
                pattern="[1-7](,[1-7])*"
                bind:value={condition.availabilityDays}
              />
            </Field>
            <Field label={copy['moderation.startsAtLabel']} class="mod-field">
              <Input type="time" bind:value={condition.availabilityStartsAt} />
            </Field>
            <Field label={copy['moderation.endsAtLabel']} class="mod-field">
              <Input type="time" bind:value={condition.availabilityEndsAt} />
            </Field>
            <Field label={copy['moderation.startsOnLabel']} class="mod-field">
              <Input type="date" bind:value={condition.availabilityStartsOn} />
            </Field>
            <Field label={copy['moderation.endsOnLabel']} class="mod-field">
              <Input type="date" bind:value={condition.availabilityEndsOn} />
            </Field>
            <Field label={copy['moderation.availabilityNotesLabel']} class="mod-field wide">
              <Input bind:value={condition.availabilityNotes} />
            </Field>
          {/if}
        </div>
        <Button intent="neutral" class="remove" onclick={() => removeCondition(index)}>
          {copy['moderation.removeCondition']}
        </Button>
      </fieldset>
    {/each}
  </div>

  <Button intent="neutral" class="add" onclick={addCondition}>
    {copy['moderation.addAnotherCondition']}
  </Button>
</div>

<style>
  /* Field's own label carries no weight/size utility (baseline-first); this file's labels were
     always the reduced 0.78rem/750 treatment, so it is re-anchored here via an ancestor-scoped
     :global() targeting Field's rendered label through the .mod-field hook, never a bare
     :global(label) that would leak past this component. */
  .access-conditions-editor :global(.mod-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  .field-grid :global(.wide) {
    grid-column: 1 / -1;
  }

  .condition-card :global(.remove) {
    justify-self: end;
  }

  .access-conditions-editor > :global(.add) {
    margin-top: 0.65rem;
  }

  @media (max-width: 40rem) {
    .field-grid :global(.wide) {
      grid-column: auto;
    }
  }
</style>
