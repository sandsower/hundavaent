<script lang="ts">
  import { untrack } from 'svelte';

  import { Field, Input, Select, Textarea } from '@hundavaent/design-system';
  import type { Catalogue } from '$i18n';
  import type { Json } from '$server/db/generated.types';
  import type { SuggestionProposal } from '$server/suggestions/suggestion-input';

  interface Props {
    copy: Catalogue;
    value: SuggestionProposal['evidence'];
    showExplanation?: boolean;
  }

  let { copy, value = $bindable(), showExplanation = true }: Props = $props();
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

<div class="field-grid grid grid-cols-2 gap-[0.55rem] max-[40rem]:grid-cols-[1fr]">
  <Field label={copy['suggestion.evidenceKind']} class="compact-field">
    <Select name="evidenceKind" required bind:value={kind}>
      <option value="official_website">{copy['evidence.officialWebsite']}</option>
      <option value="venue_representative">{copy['evidence.venueRepresentative']}</option>
      <option value="member_report">{copy['evidence.memberReport']}</option>
      <option value="direct_observation">{copy['evidence.directObservation']}</option>
      <option value="public_record">{copy['evidence.publicRecord']}</option>
      <option value="other">{copy['evidence.other']}</option>
    </Select>
  </Field>
  <Field label={copy['suggestion.evidenceObserved']} class="compact-field">
    <Input name="evidenceObservedAt" type="datetime-local" required bind:value={observedAt} />
  </Field>
  <Field label={copy['suggestion.evidenceLabel']} class="compact-field wide">
    <Input name="evidenceSourceLabel" required bind:value={sourceLabel} />
  </Field>
  <Field label={copy['suggestion.evidenceUrl']} class="compact-field wide">
    <Input name="evidenceUrl" type="url" bind:value={sourceUrl} />
  </Field>
  <Field label={copy['suggestion.evidenceCitation']} class="compact-field wide">
    <Input name="evidenceCitation" bind:value={sourceCitation} />
  </Field>
  {#if showExplanation}
    <Field label={copy['suggestion.evidenceExplanation']} class="compact-field wide">
      <Textarea rows={3} required bind:value={explanation} />
    </Field>
  {/if}
  <details class="wide p-[0.55rem] border border-border-subtle rounded-control">
    <summary class="cursor-pointer font-extrabold">{copy['evidenceField.sourceMetadata']}</summary>
    <Field label={copy['evidenceField.sourceMetadata']} class="compact-field">
      <Textarea
        name="sourceMetadataJson"
        rows={4}
        bind:value={metadataText}
        oninput={(event) => validateMetadata(event.currentTarget)}
      />
    </Field>
  </details>
</div>

<style>
  /* Field renders its own label/control stack inside a child component, so scoped CSS cannot
     reach the label directly - the whole remaining chain after .compact-field is wrapped in one
     :global() (the SelectedPlaceCard ".card-body :global(.details-status p)" precedent), rather
     than just the class, because a bare `label` tag selector after a partial :global() would
     still be scope-hashed and fail to match. This preserves the original muted/reduced-size
     label treatment Field's own docs invite a call site to keep via a scoped hook; Input/Select/
     Textarea now own the field's border/radius/surface/focus ring. .wide is also Field-rendered,
     so it needs its own :global() to keep spanning both grid columns. */
  .field-grid :global(.compact-field label) {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 800;
  }
  .field-grid :global(.wide) {
    grid-column: 1 / -1;
  }
  @media (max-width: 40rem) {
    .field-grid :global(.wide) {
      grid-column: auto;
    }
  }
</style>
