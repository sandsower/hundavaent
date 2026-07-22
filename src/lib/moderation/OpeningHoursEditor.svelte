<script lang="ts">
  import type { Catalogue, MessageKey } from '$i18n';
  import type { Json } from '$server/db/generated.types';

  interface Props {
    copy: Catalogue;
    value?: Record<string, Json>;
  }

  let { copy, value = $bindable({}) }: Props = $props();

  const days: ReadonlyArray<{ key: string; label: MessageKey }> = [
    { key: 'monday', label: 'hours.monday' },
    { key: 'tuesday', label: 'hours.tuesday' },
    { key: 'wednesday', label: 'hours.wednesday' },
    { key: 'thursday', label: 'hours.thursday' },
    { key: 'friday', label: 'hours.friday' },
    { key: 'saturday', label: 'hours.saturday' },
    { key: 'sunday', label: 'hours.sunday' }
  ];
  const standardKeys = new Set([...days.map((day) => day.key), 'note']);
  const extraKeys = $derived(Object.keys(value).filter((key) => !standardKeys.has(key)));

  function textValue(key: string): string {
    const item = value[key];
    if (item === undefined || item === null) return '';
    return typeof item === 'string' ? item : JSON.stringify(item);
  }

  function setValue(key: string, nextValue: string): void {
    const next = { ...value };
    if (nextValue.trim()) next[key] = nextValue;
    else delete next[key];
    value = next;
  }

  function renameExtra(previousKey: string, requestedKey: string): void {
    const nextKey = requestedKey.trim();
    if (!nextKey || nextKey === previousKey || standardKeys.has(nextKey)) return;
    const next = { ...value };
    const item = next[previousKey];
    delete next[previousKey];
    next[nextKey] = item;
    value = next;
  }

  function addExtra(): void {
    let suffix = 1;
    let key = 'schedule';
    while (key in value) {
      suffix += 1;
      key = `schedule_${suffix}`;
    }
    value = { ...value, [key]: '' };
  }

  function removeExtra(key: string): void {
    const next = { ...value };
    delete next[key];
    value = next;
  }
</script>

<div class="opening-hours-editor">
  <div class="hours-grid">
    {#each days as day (day.key)}
      <label>
        {copy[day.label]}
        <input
          value={textValue(day.key)}
          placeholder="09:00-17:00"
          oninput={(event) => setValue(day.key, event.currentTarget.value)}
        />
      </label>
    {/each}
    <label class="wide">
      {copy['moderation.openingHoursNoteLabel']}
      <input
        value={textValue('note')}
        oninput={(event) => setValue('note', event.currentTarget.value)}
      />
    </label>
  </div>

  {#each extraKeys as key, index (key)}
    <fieldset class="extra-entry">
      <legend>
        {copy['moderation.openingHoursAdditionalEntry'].replace('{number}', String(index + 1))}
      </legend>
      <label>
        {copy['moderation.openingHoursEntryKey']}
        <input value={key} onblur={(event) => renameExtra(key, event.currentTarget.value)} />
      </label>
      <label>
        {copy['moderation.openingHoursEntryValue']}
        <input
          value={textValue(key)}
          oninput={(event) => setValue(key, event.currentTarget.value)}
        />
      </label>
      <button type="button" class="quiet" onclick={() => removeExtra(key)}>
        {copy['moderation.removeOpeningHoursEntry']}
      </button>
    </fieldset>
  {/each}

  <button type="button" class="quiet add-entry" onclick={addExtra}>
    {copy['moderation.addOpeningHoursEntry']}
  </button>
</div>

<style>
  .opening-hours-editor {
    display: grid;
    gap: 0.65rem;
  }

  .hours-grid,
  .extra-entry {
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

  input {
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

  .wide,
  .extra-entry .quiet {
    grid-column: 1 / -1;
  }

  .extra-entry {
    margin: 0;
    padding: 0.65rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
  }

  .extra-entry legend {
    padding: 0 0.35rem;
    font-size: 0.8rem;
    font-weight: 800;
  }

  .quiet {
    width: fit-content;
    min-height: 2.35rem;
    background: var(--hv-color-snow-raised);
  }

  @media (max-width: 40rem) {
    .hours-grid,
    .extra-entry {
      grid-template-columns: 1fr;
    }

    .wide,
    .extra-entry .quiet {
      grid-column: auto;
    }
  }
</style>
