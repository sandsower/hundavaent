<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    submitInlineCorrection,
    type CorrectionResult
  } from '$lib/contributions/correction-client';
  import {
    memberAmenityMaximumCount,
    memberFieldTextMaximumLength,
    memberUrlMaximumLength,
    parseFieldChange,
    submittedPlaceFieldFlag,
    type MemberPlaceField,
    type PendingPlaceFlag
  } from '$lib/contributions/correction';
  import InlineCorrectionShell from '$lib/discovery/InlineCorrectionShell.svelte';

  /**
   * One text control over the shell for every Place fact a Member can restate. The four fields
   * differ only in what the control accepts and whether emptying it means anything, so they share
   * one editor rather than four near-copies.
   */
  interface Props {
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    field: MemberPlaceField;
    /** The published value, already flattened to the text the control edits. */
    currentValue: string;
    announce?: (message: string) => void;
    /** Reports what was just sent, so the card can suppress this fact without a refetch. */
    onSubmitted?: (flag: PendingPlaceFlag) => void;
  }

  let {
    placeId,
    placeName,
    lang,
    copy,
    signedIn,
    field,
    currentValue,
    announce = () => undefined,
    onSubmitted = () => undefined
  }: Props = $props();

  const startLabels: Record<MemberPlaceField, MessageKey> = {
    name: 'inlineCorrection.startLabelName',
    website_url: 'inlineCorrection.startLabelWebsite',
    phone: 'inlineCorrection.startLabelPhone',
    dog_amenities: 'inlineCorrection.startLabelAmenities'
  };

  const fieldLabels: Record<MemberPlaceField, MessageKey> = {
    name: 'inlineCorrection.fieldName',
    website_url: 'inlineCorrection.fieldWebsite',
    phone: 'inlineCorrection.fieldPhone',
    dog_amenities: 'inlineCorrection.fieldAmenities'
  };

  const inputTypes: Record<MemberPlaceField, 'text' | 'url' | 'tel'> = {
    name: 'text',
    website_url: 'url',
    phone: 'tel',
    dog_amenities: 'text'
  };

  // Seeded by `reseed` on every expand rather than at construction, so a profile that arrives or
  // changes while the trigger is sitting collapsed is the value the Member sees when they open it.
  let draft = $state('');

  /**
   * A Place always has a name, so emptying that control is a rejection rather than a removal, and
   * the control that would invite it is simply not offered. Every other field can honestly be
   * absent, so clearing one is a Correction in its own right.
   */
  const clearable = $derived(field === 'website_url' || field === 'phone');

  // The database puts no ceiling on any of these, so the ceiling is the client's to state. The
  // server rejects an over-long value rather than truncating it, which would publish words the
  // Member did not write.
  //
  // Amenities get no `maxlength` at all. The cap is 20 entries of 200 characters each, and this
  // one control holds the whole comma-separated list, so a 200-character attribute would cap the
  // list at roughly one entry: the entry cap could never be reached, and a stored list already
  // longer than 200 characters could not even be opened and edited. `amenitiesOverCap` counts the
  // entries the way the server does and gates sending, which is what it was written to do.
  const maximumLength = $derived(
    field === 'dog_amenities'
      ? undefined
      : field === 'website_url'
        ? memberUrlMaximumLength
        : memberFieldTextMaximumLength
  );

  const amenities = $derived(
    field === 'dog_amenities'
      ? draft
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '')
      : []
  );
  const amenitiesOverCap = $derived(
    field === 'dog_amenities' &&
      (amenities.length > memberAmenityMaximumCount ||
        amenities.some((entry) => entry.length > memberFieldTextMaximumLength))
  );

  const changed = $derived(
    draft.trim() !== currentValue.trim() &&
      (field !== 'name' || draft.trim() !== '') &&
      !amenitiesOverCap
  );

  function reseed(): void {
    draft = currentValue;
  }

  function clear(): void {
    draft = '';
  }

  async function send(note: string | null): Promise<CorrectionResult> {
    const text = draft.trim();
    const change = parseFieldChange(
      field,
      field === 'dog_amenities' ? amenities : text === '' ? null : text
    );
    // Unreachable while the shell gates sending on `changed`; it is also what proves to the type
    // system that the text belongs to the field being corrected.
    if (!change) return { status: 'invalid' };
    const result = await submitInlineCorrection({
      placeId,
      lang,
      target: 'place_field',
      note,
      ...change
    });
    if (result.status === 'submitted') onSubmitted(submittedPlaceFieldFlag(field));
    return result;
  }
</script>

<InlineCorrectionShell
  {copy}
  {signedIn}
  {announce}
  {send}
  startLabel={copy[startLabels[field]].replace('{name}', placeName)}
  canSend={changed}
  onOpen={reseed}
>
  {#snippet controls({ dismiss })}
    <label class="value grid gap-1 text-[0.75rem] font-[750]">
      <span>{copy[fieldLabels[field]]}</span>
      <input
        type={inputTypes[field]}
        maxlength={maximumLength}
        value={draft}
        autocomplete="off"
        oninput={(event) => (draft = event.currentTarget.value)}
        onkeydown={dismiss}
        class="w-full py-[0.4rem] px-2 border border-border-subtle rounded-control [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-weight:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.8rem]"
      />
    </label>
    {#if field === 'dog_amenities'}
      <p class="hint m-0 text-[0.72rem] leading-[1.35] text-basalt-muted">
        {copy['inlineCorrection.amenitiesHint']}
      </p>
    {/if}
    {#if amenitiesOverCap}
      <p class="hint m-0 text-[0.72rem] leading-[1.35] text-basalt-muted" data-correction-cap>
        {copy['inlineCorrection.amenitiesCap']
          .replace('{count}', String(memberAmenityMaximumCount))
          .replace('{length}', String(memberFieldTextMaximumLength))}
      </p>
    {/if}
    {#if clearable}
      <button
        class="clear inline-flex min-h-6 items-center justify-self-start py-[0.15rem] px-[0.4rem] border-0 rounded-control bg-transparent [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.75rem] font-extrabold text-fjord underline cursor-pointer focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px] disabled:text-basalt-muted disabled:no-underline disabled:cursor-not-allowed"
        type="button"
        disabled={draft.trim() === ''}
        aria-label={copy['inlineCorrection.clearLabel'].replace(
          '{field}',
          copy[fieldLabels[field]]
        )}
        onclick={clear}
        onkeydown={dismiss}
      >
        {copy['inlineCorrection.clear']}
      </button>
    {/if}
  {/snippet}
</InlineCorrectionShell>
