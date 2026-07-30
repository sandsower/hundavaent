<script lang="ts">
  import { untrack } from 'svelte';

  import { Button, Field, Input, Select, Textarea } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import type { Json } from '$server/db/generated.types';
  import type { CandidatePublicationReview } from '$server/moderation/place-moderation';

  interface Props {
    copy: Catalogue;
    evidenceRecords: CandidatePublicationReview['evidenceRecords'];
  }

  interface EditableEvidence {
    key: string;
    id?: string;
    kind: string;
    sourceUrl: string;
    sourceCitation: string;
    sourceLabel: string;
    observedAt: string;
    sourceMetadataText: string;
  }

  let { copy, evidenceRecords }: Props = $props();
  let nextKey = 0;
  let items = $state<EditableEvidence[]>(untrack(() => evidenceRecords.map(toEditableEvidence)));
  const sectionPayload = $derived(
    JSON.stringify({ evidence_records: items.map(toCanonicalEvidence) })
  );

  function toEditableEvidence(
    evidence: CandidatePublicationReview['evidenceRecords'][number]
  ): EditableEvidence {
    return {
      key: evidence.id,
      id: evidence.id,
      kind: evidence.kind,
      sourceUrl: evidence.sourceUrl ?? '',
      sourceCitation: evidence.sourceCitation ?? '',
      sourceLabel: evidence.sourceLabel,
      observedAt: toDateTimeLocal(evidence.observedAt),
      sourceMetadataText: JSON.stringify(evidence.sourceMetadata, null, 2)
    };
  }

  function newEvidence(): EditableEvidence {
    nextKey += 1;
    return {
      key: `new-${nextKey}`,
      kind: 'official_website',
      sourceUrl: '',
      sourceCitation: '',
      sourceLabel: '',
      observedAt: toDateTimeLocal(new Date().toISOString()),
      sourceMetadataText: '{}'
    };
  }

  function toCanonicalEvidence(item: EditableEvidence) {
    return {
      ...(item.id ? { id: item.id } : {}),
      kind: item.kind,
      source_url: item.sourceUrl.trim() || null,
      source_citation: item.sourceCitation.trim() || null,
      source_label: item.sourceLabel,
      observed_at: toIsoDateTime(item.observedAt),
      source_metadata: parseMetadata(item.sourceMetadataText)
    };
  }

  function parseMetadata(value: string): Record<string, Json> {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, Json>)
        : {};
    } catch {
      return {};
    }
  }

  function validateMetadata(input: HTMLTextAreaElement, value: string): void {
    try {
      const parsed: unknown = JSON.parse(value);
      input.setCustomValidity(
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? ''
          : copy['moderation.incomplete']
      );
    } catch {
      input.setCustomValidity(copy['moderation.incomplete']);
    }
  }

  function toDateTimeLocal(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : '';
  }

  function toIsoDateTime(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : value;
  }

  function addEvidence(): void {
    items.push(newEvidence());
  }

  function removeEvidence(index: number): void {
    items.splice(index, 1);
  }
</script>

<div class="evidence-records-editor">
  <input type="hidden" name="sectionPayload" value={sectionPayload} />

  <div class="evidence-list">
    {#each items as evidence, index (evidence.key)}
      <fieldset class="evidence-card">
        <legend>{copy['moderation.evidenceHeading']} {index + 1}</legend>
        <div class="field-grid">
          <Field label={copy['moderation.evidenceKindLabel']} class="mod-field">
            <Select required bind:value={evidence.kind}>
              <option value="official_website">{copy['evidence.officialWebsite']}</option>
              <option value="venue_representative">{copy['evidence.venueRepresentative']}</option>
              <option value="member_report">{copy['evidence.memberReport']}</option>
              <option value="direct_observation">{copy['evidence.directObservation']}</option>
              <option value="public_record">{copy['evidence.publicRecord']}</option>
              <option value="other">{copy['evidence.other']}</option>
            </Select>
          </Field>
          <Field label={copy['moderation.evidenceObservedAtLabel']} class="mod-field">
            <Input type="datetime-local" required bind:value={evidence.observedAt} />
          </Field>
          <Field label={copy['moderation.evidenceSourceLabel']} class="mod-field wide">
            <Input required bind:value={evidence.sourceLabel} />
          </Field>
          <Field label={copy['moderation.evidenceUrlLabel']} class="mod-field wide">
            <Input type="url" bind:value={evidence.sourceUrl} />
          </Field>
          <Field label={copy['moderation.evidenceCitationLabel']} class="mod-field wide">
            <Input bind:value={evidence.sourceCitation} />
          </Field>
        </div>
        <details class="metadata">
          <summary>{copy['evidenceField.sourceMetadata']}</summary>
          <Field
            label={copy['evidenceField.sourceMetadata']}
            hint={copy['moderation.sourceMetadataHelp']}
            class="mod-field"
          >
            <Textarea
              rows={4}
              bind:value={evidence.sourceMetadataText}
              oninput={(event) =>
                validateMetadata(event.currentTarget, evidence.sourceMetadataText)}
            />
          </Field>
        </details>
        <Button intent="neutral" class="remove" onclick={() => removeEvidence(index)}>
          {copy['moderation.removeEvidence']}
        </Button>
      </fieldset>
    {/each}
  </div>

  <Button intent="neutral" class="add" onclick={addEvidence}>
    {copy['moderation.addAnotherEvidence']}
  </Button>
</div>

<style>
  .evidence-list {
    display: grid;
    gap: 0.7rem;
  }

  .evidence-card {
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

  /* Field's own label carries no weight/size utility (baseline-first); this file's labels were
     always the reduced 0.78rem/750 treatment, so it is re-anchored here via an ancestor-scoped
     :global() targeting Field's rendered label through the .mod-field hook, never a bare
     :global(label) that would leak past this component. */
  .evidence-records-editor :global(.mod-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  .field-grid :global(.wide) {
    grid-column: 1 / -1;
  }

  .metadata {
    padding: 0.6rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
  }

  .metadata summary {
    cursor: pointer;
    font-weight: 800;
  }

  .metadata :global(.mod-field) {
    margin-top: 0.55rem;
  }

  .evidence-card :global(.remove) {
    justify-self: end;
  }

  .evidence-records-editor > :global(.add) {
    margin-top: 0.65rem;
  }

  @media (max-width: 40rem) {
    .field-grid {
      grid-template-columns: 1fr;
    }

    .field-grid :global(.wide) {
      grid-column: auto;
    }
  }
</style>
