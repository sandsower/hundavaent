<script lang="ts">
  import { untrack } from 'svelte';

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

<input type="hidden" name="sectionPayload" value={sectionPayload} />

<div class="condition-list">
  {#each items as condition, index (condition.key)}
    <fieldset class="condition-card">
      <legend>{copy['place.conditionLabel'].replace('{number}', String(index + 1))}</legend>
      <div class="field-grid">
        <label>
          {copy['place.accessArea']}
          <select required bind:value={condition.accessArea}>
            <option value="indoors">{copy['access.indoor']}</option>
            <option value="outdoors">{copy['access.outdoor']}</option>
            <option value="designated_area">{copy['access.designated']}</option>
            <option value="other_bounded">{copy['access.otherBounded']}</option>
          </select>
        </label>
        <label>
          {copy['moderation.areaNoteLabel']}
          <input bind:value={condition.accessAreaNote} />
        </label>
        <label>
          {copy['place.restraint']}
          <select required bind:value={condition.restraintCondition}>
            <option value="leash_required">{copy['access.leashRequired']}</option>
            <option value="off_leash_permitted">{copy['access.offLeash']}</option>
            <option value="carrier_required">{copy['access.carrierRequired']}</option>
            <option value="other_sourced">{copy['access.otherSourced']}</option>
          </select>
        </label>
        <label>
          {copy['moderation.restraintNoteLabel']}
          <input bind:value={condition.restraintNote} />
        </label>
        <label>
          {copy['moderation.maximumWeightLabel']}
          <input type="number" min="0.1" step="0.1" bind:value={condition.maximumWeightKg} />
        </label>
        <label>
          {copy['moderation.maximumDogsLabel']}
          <input type="number" min="1" step="1" bind:value={condition.maximumDogs} />
        </label>
        <label class="wide">
          {copy['moderation.eligibilityNoteLabel']}
          <input bind:value={condition.eligibilityNotes} />
        </label>
        <label>
          {copy['moderation.availabilityStateLabel']}
          <select required bind:value={condition.availabilityState}>
            <option value="not_stated">{copy['accessSymbols.notStated']}</option>
            <option value="whenever_open">{copy['accessSymbols.wheneverOpen']}</option>
            <option value="limited">{copy['accessSymbols.limited']}</option>
          </select>
        </label>
        <label>
          {copy['place.permission']}
          <select required bind:value={condition.permissionRequirement}>
            <option value="standing_permission">{copy['access.standingPermission']}</option>
            <option value="ask_on_arrival">{copy['access.askOnArrival']}</option>
            <option value="advance_approval">{copy['access.advanceApproval']}</option>
          </select>
        </label>
        {#if condition.availabilityState === 'limited'}
          <label>
            {copy['moderation.weekdaysLabel']}
            <input
              placeholder="1,2,3"
              pattern="[1-7](,[1-7])*"
              bind:value={condition.availabilityDays}
            />
          </label>
          <label>
            {copy['moderation.startsAtLabel']}
            <input type="time" bind:value={condition.availabilityStartsAt} />
          </label>
          <label>
            {copy['moderation.endsAtLabel']}
            <input type="time" bind:value={condition.availabilityEndsAt} />
          </label>
          <label>
            {copy['moderation.startsOnLabel']}
            <input type="date" bind:value={condition.availabilityStartsOn} />
          </label>
          <label>
            {copy['moderation.endsOnLabel']}
            <input type="date" bind:value={condition.availabilityEndsOn} />
          </label>
          <label class="wide">
            {copy['moderation.availabilityNotesLabel']}
            <input bind:value={condition.availabilityNotes} />
          </label>
        {/if}
      </div>
      <button type="button" class="quiet remove" onclick={() => removeCondition(index)}>
        {copy['moderation.removeCondition']}
      </button>
    </fieldset>
  {/each}
</div>

<button type="button" class="quiet add" onclick={addCondition}>
  {copy['moderation.addAnotherCondition']}
</button>

<style>
  .condition-list {
    display: grid;
    gap: 0.7rem;
  }

  .condition-card {
    display: grid;
    gap: 0.65rem;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow);
  }

  legend {
    padding: 0 0.35rem;
    font-weight: 850;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  input,
  select {
    width: 100%;
    min-height: 2.5rem;
    box-sizing: border-box;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-basalt);
    font: inherit;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .quiet {
    width: fit-content;
    min-height: 2.4rem;
    background: var(--hv-color-snow-raised);
  }

  .remove {
    justify-self: end;
  }

  .add {
    margin-top: 0.65rem;
  }

  @media (max-width: 40rem) {
    .field-grid {
      grid-template-columns: 1fr;
    }

    .wide {
      grid-column: auto;
    }
  }
</style>
