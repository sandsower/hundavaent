<script lang="ts">
  import { Button, Field, Input } from '@hundavaent/design-system';
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
      <Field label={copy[day.label]} class="mod-field">
        <Input
          value={textValue(day.key)}
          placeholder="09:00-17:00"
          oninput={(event) => setValue(day.key, event.currentTarget.value)}
        />
      </Field>
    {/each}
    <Field label={copy['moderation.openingHoursNoteLabel']} class="mod-field wide">
      <Input
        value={textValue('note')}
        oninput={(event) => setValue('note', event.currentTarget.value)}
      />
    </Field>
  </div>

  {#each extraKeys as key, index (key)}
    <fieldset class="extra-entry">
      <legend>
        {copy['moderation.openingHoursAdditionalEntry'].replace('{number}', String(index + 1))}
      </legend>
      <Field label={copy['moderation.openingHoursEntryKey']} class="mod-field">
        <Input value={key} onblur={(event) => renameExtra(key, event.currentTarget.value)} />
      </Field>
      <Field label={copy['moderation.openingHoursEntryValue']} class="mod-field">
        <Input
          value={textValue(key)}
          oninput={(event) => setValue(key, event.currentTarget.value)}
        />
      </Field>
      <Button intent="neutral" class="remove-entry" onclick={() => removeExtra(key)}>
        {copy['moderation.removeOpeningHoursEntry']}
      </Button>
    </fieldset>
  {/each}

  <Button intent="neutral" class="add-entry" onclick={addExtra}>
    {copy['moderation.addOpeningHoursEntry']}
  </Button>
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

  /* Field's own label carries no weight/size utility (baseline-first); this file's labels were
     always the reduced 0.78rem/750 treatment, so it is re-anchored here via an ancestor-scoped
     :global() targeting Field's rendered label through the .mod-field hook, never a bare
     :global(label) that would leak past this component. */
  .opening-hours-editor :global(.mod-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  .hours-grid :global(.wide),
  .extra-entry :global(.remove-entry) {
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

  @media (max-width: 40rem) {
    .hours-grid,
    .extra-entry {
      grid-template-columns: 1fr;
    }

    .hours-grid :global(.wide),
    .extra-entry :global(.remove-entry) {
      grid-column: auto;
    }
  }
</style>
