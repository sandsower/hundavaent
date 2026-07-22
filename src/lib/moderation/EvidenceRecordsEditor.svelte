<script lang="ts">
  import { untrack } from 'svelte';

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

<input type="hidden" name="sectionPayload" value={sectionPayload} />

<div class="evidence-list">
  {#each items as evidence, index (evidence.key)}
    <fieldset class="evidence-card">
      <legend>{copy['moderation.evidenceHeading']} {index + 1}</legend>
      <div class="field-grid">
        <label>
          {copy['moderation.evidenceKindLabel']}
          <select required bind:value={evidence.kind}>
            <option value="official_website">{copy['evidence.officialWebsite']}</option>
            <option value="venue_representative">{copy['evidence.venueRepresentative']}</option>
            <option value="member_report">{copy['evidence.memberReport']}</option>
            <option value="direct_observation">{copy['evidence.directObservation']}</option>
            <option value="public_record">{copy['evidence.publicRecord']}</option>
            <option value="other">{copy['evidence.other']}</option>
          </select>
        </label>
        <label>
          {copy['moderation.evidenceObservedAtLabel']}
          <input type="datetime-local" required bind:value={evidence.observedAt} />
        </label>
        <label class="wide">
          {copy['moderation.evidenceSourceLabel']}
          <input required bind:value={evidence.sourceLabel} />
        </label>
        <label class="wide">
          {copy['moderation.evidenceUrlLabel']}
          <input type="url" bind:value={evidence.sourceUrl} />
        </label>
        <label class="wide">
          {copy['moderation.evidenceCitationLabel']}
          <input bind:value={evidence.sourceCitation} />
        </label>
      </div>
      <details class="metadata">
        <summary>{copy['evidenceField.sourceMetadata']}</summary>
        <label for={`metadata-${evidence.key}`}>{copy['evidenceField.sourceMetadata']}</label>
        <textarea
          id={`metadata-${evidence.key}`}
          aria-describedby={`metadata-help-${evidence.key}`}
          rows="4"
          bind:value={evidence.sourceMetadataText}
          oninput={(event) => validateMetadata(event.currentTarget, evidence.sourceMetadataText)}
        ></textarea>
        <small id={`metadata-help-${evidence.key}`}>{copy['moderation.sourceMetadataHelp']}</small>
      </details>
      <button type="button" class="quiet remove" onclick={() => removeEvidence(index)}>
        {copy['moderation.removeEvidence']}
      </button>
    </fieldset>
  {/each}
</div>

<button type="button" class="quiet add" onclick={addEvidence}>
  {copy['moderation.addAnotherEvidence']}
</button>

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

  label {
    display: grid;
    gap: 0.25rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
  }

  input,
  select,
  textarea {
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

  textarea {
    resize: vertical;
  }

  .wide {
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

  .metadata label {
    margin-top: 0.55rem;
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
