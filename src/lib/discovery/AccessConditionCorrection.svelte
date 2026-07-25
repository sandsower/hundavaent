<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    submitInlineCorrection,
    type CorrectionResult
  } from '$lib/contributions/correction-client';
  import {
    memberDimensionChoices,
    parseDimensionChange,
    type AccessConditionDimension,
    type MemberDimensionChoice
  } from '$lib/contributions/access-condition-correction';
  import InlineCorrectionShell from '$lib/discovery/InlineCorrectionShell.svelte';
  import type { PublishedAccessFacts } from '$server/discovery/public-places';

  interface Props {
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    condition: PublishedAccessFacts;
    dimension: AccessConditionDimension;
    announce?: (message: string) => void;
  }

  let {
    placeId,
    placeName,
    lang,
    copy,
    signedIn,
    condition,
    dimension,
    announce = () => undefined
  }: Props = $props();

  // Restraint labels reuse the chip copy the Member just tapped, so the choice reads as the same
  // fact. Area has no chip label of its own below indoors, so it names the three areas directly.
  const choiceLabels: Record<MemberDimensionChoice, MessageKey> = {
    leash_required: 'accessSymbols.leash',
    off_leash_permitted: 'accessSymbols.offLeash',
    carrier_required: 'accessSymbols.carrier',
    indoors: 'inlineCorrection.areaIndoors',
    outdoors: 'inlineCorrection.areaOutdoors',
    designated_area: 'inlineCorrection.areaDesignated'
  };

  const startLabels: Record<AccessConditionDimension, MessageKey> = {
    restraint: 'inlineCorrection.startLabelRestraint',
    area: 'inlineCorrection.startLabelArea'
  };

  let choice = $state<MemberDimensionChoice | null>(seededChoice());

  const choices = $derived(memberDimensionChoices[dimension]);
  const published = $derived(currentValue());
  const changed = $derived(choice !== null && choice !== published);

  function currentValue(): string {
    return dimension === 'area' ? condition.accessArea : condition.restraintCondition;
  }

  /**
   * Null when the Place's current value is one this group cannot represent. Pre-checking a
   * substitute would state a rule the Place does not have and would arm the confirm button before
   * the Member chose anything.
   */
  function seededChoice(): MemberDimensionChoice | null {
    return parseDimensionChange(dimension, currentValue())?.value ?? null;
  }

  function reseed(): void {
    choice = seededChoice();
  }

  async function send(note: string | null): Promise<CorrectionResult> {
    const change = parseDimensionChange(dimension, choice);
    // Unreachable while the shell gates sending on `changed`; it is also what proves to the type
    // system that the chosen value belongs to the dimension being corrected.
    if (!change) return { status: 'invalid' };
    return submitInlineCorrection({
      placeId,
      lang,
      target: 'access_condition',
      accessConditionId: condition.id,
      note,
      ...change
    });
  }
</script>

<InlineCorrectionShell
  {copy}
  {signedIn}
  {announce}
  {send}
  startLabel={copy[startLabels[dimension]].replace('{name}', placeName)}
  canSend={changed}
  onOpen={reseed}
>
  {#snippet controls({ dismiss, groupName })}
    <div class="choices">
      {#each choices as option (option)}
        <label>
          <input
            type="radio"
            name={groupName}
            value={option}
            bind:group={choice}
            onkeydown={dismiss}
          />
          <span>{copy[choiceLabels[option]]}</span>
        </label>
      {/each}
    </div>
  {/snippet}
</InlineCorrectionShell>

<style>
  .choices {
    display: grid;
    gap: 0.3rem;
  }

  .choices label {
    display: flex;
    gap: 0.45rem;
    align-items: center;
    font-size: 0.8rem;
    font-weight: 750;
  }
</style>
