<script lang="ts">
  import { untrack } from 'svelte';

  import type { Catalogue } from '$i18n';
  import type { Json } from '$server/db/generated.types';
  import type { SuggestionProposal } from '$server/suggestions/suggestion-input';

  interface Props {
    copy: Catalogue;
    value: SuggestionProposal['evidence'];
  }

  let { copy, value = $bindable() }: Props = $props();
  const initial = untrack(() => value);
  let kind = $state(initial.kind);
  let sourceUrl = $state(initial.source_url ?? '');
  let sourceCitation = $state(initial.source_citation ?? '');
  let sourceLabel = $state(initial.source_label);
  let observedAt = $state(toLocal(initial.observed_at));
  let explanation = $state(initial.explanation);
  let metadataText = $state(JSON.stringify(initial.source_metadata, null, 2));

  $effect(() => {
    value = {
      kind,
      source_url: sourceUrl.trim() || null,
      source_citation: sourceCitation.trim() || null,
      source_label: sourceLabel.trim(),
      observed_at: toIso(observedAt),
      explanation: explanation.trim(),
      source_metadata: parseMetadata(metadataText)
    };
  });

  function toLocal(input: string): string {
    const date = new Date(input);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16) : '';
  }

  function toIso(input: string): string {
    const date = new Date(input);
    return Number.isFinite(date.getTime()) ? date.toISOString() : input;
  }

  function parseMetadata(input: string): Record<string, Json> {
    try {
      const parsed: unknown = JSON.parse(input);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, Json>)
        : {};
    } catch {
      return {};
    }
  }

  function validateMetadata(input: HTMLTextAreaElement): void {
    try {
      const parsed: unknown = JSON.parse(metadataText);
      input.setCustomValidity(
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? ''
          : copy['suggestion.invalid']
      );
    } catch {
      input.setCustomValidity(copy['suggestion.invalid']);
    }
  }
</script>

<div class="field-grid">
  <label>
    {copy['suggestion.evidenceKind']}
    <select required bind:value={kind}>
      <option value="official_website">{copy['evidence.officialWebsite']}</option>
      <option value="venue_representative">{copy['evidence.venueRepresentative']}</option>
      <option value="member_report">{copy['evidence.memberReport']}</option>
      <option value="direct_observation">{copy['evidence.directObservation']}</option>
      <option value="public_record">{copy['evidence.publicRecord']}</option>
      <option value="other">{copy['evidence.other']}</option>
    </select>
  </label>
  <label>
    {copy['suggestion.evidenceObserved']}
    <input type="datetime-local" required bind:value={observedAt} />
  </label>
  <label class="wide">
    {copy['suggestion.evidenceLabel']}
    <input required bind:value={sourceLabel} />
  </label>
  <label class="wide">
    {copy['suggestion.evidenceUrl']}
    <input type="url" bind:value={sourceUrl} />
  </label>
  <label class="wide">
    {copy['suggestion.evidenceCitation']}
    <input bind:value={sourceCitation} />
  </label>
  <label class="wide">
    {copy['suggestion.evidenceExplanation']}
    <textarea rows="3" required bind:value={explanation}></textarea>
  </label>
  <details class="wide">
    <summary>{copy['evidenceField.sourceMetadata']}</summary>
    <label>
      {copy['evidenceField.sourceMetadata']}
      <textarea
        rows="4"
        bind:value={metadataText}
        oninput={(event) => validateMetadata(event.currentTarget)}></textarea>
    </label>
  </details>
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
  select,
  textarea {
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
  textarea {
    resize: vertical;
  }
  .wide {
    grid-column: 1 / -1;
  }
  details {
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    padding: 0.55rem;
  }
  summary {
    cursor: pointer;
    font-weight: 800;
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
