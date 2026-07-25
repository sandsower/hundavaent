<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    submitInlineCorrection,
    type CorrectionResult
  } from '$lib/contributions/correction-client';
  import {
    isMemberAreaChoice,
    isMemberPermissionChoice,
    isMemberRestraintChoice,
    memberDimensionChoices,
    parseDimensionChange,
    submittedAccessConditionFlag,
    type MemberAreaChoice,
    type MemberPermissionChoice,
    type MemberRestraintChoice,
    type PendingPlaceFlag
  } from '$lib/contributions/correction';
  import InlineCorrectionShell from '$lib/discovery/InlineCorrectionShell.svelte';
  import type { PublishedAccessFacts } from '$server/discovery/public-places';

  /**
   * The dimensions whose whole vocabulary is a plain radio group. Eligibility is the one that is
   * not: a limit is a choice plus the number bounding it, so it has its own editor rather than a
   * fourth case here.
   */
  type RadioDimension = 'restraint' | 'area' | 'permission';
  type RadioChoice = MemberRestraintChoice | MemberAreaChoice | MemberPermissionChoice;

  interface Props {
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    condition: PublishedAccessFacts;
    dimension: RadioDimension;
    announce?: (message: string) => void;
    /** Reports what was just sent, so the card can suppress its siblings without a refetch. */
    onSubmitted?: (flag: PendingPlaceFlag) => void;
  }

  let {
    placeId,
    placeName,
    lang,
    copy,
    signedIn,
    condition,
    dimension,
    announce = () => undefined,
    onSubmitted = () => undefined
  }: Props = $props();

  // Labels reuse the chip copy the Member just tapped wherever a chip states that value, so the
  // choice reads as the same fact. Where no chip label exists -- the areas below indoors, and
  // advance approval, which the chips flatten into "special conditions" -- the value is named
  // directly rather than borrowed from a label that means something broader.
  const choiceLabels: Record<RadioChoice, MessageKey> = {
    leash_required: 'accessSymbols.leash',
    off_leash_permitted: 'accessSymbols.offLeash',
    carrier_required: 'accessSymbols.carrier',
    indoors: 'inlineCorrection.areaIndoors',
    outdoors: 'inlineCorrection.areaOutdoors',
    designated_area: 'inlineCorrection.areaDesignated',
    standing_permission: 'accessSymbols.permissionOpen',
    ask_on_arrival: 'accessSymbols.askOnArrival',
    advance_approval: 'inlineCorrection.permissionAdvance'
  };

  const startLabels: Record<RadioDimension, MessageKey> = {
    restraint: 'inlineCorrection.startLabelRestraint',
    area: 'inlineCorrection.startLabelArea',
    permission: 'inlineCorrection.startLabelPermission'
  };

  let choice = $state<RadioChoice | null>(seededChoice());

  const choices = $derived(memberDimensionChoices[dimension]);
  const published = $derived(currentValue());
  const changed = $derived(choice !== null && choice !== published);

  function currentValue(): string {
    if (dimension === 'area') return condition.accessArea;
    if (dimension === 'permission') return condition.permissionRequirement;
    return condition.restraintCondition;
  }

  /**
   * Null when the Place's current value is one this group cannot represent. Pre-checking a
   * substitute would state a rule the Place does not have and would arm the confirm button before
   * the Member chose anything. Permission has no such value, so its seed is always the stored one.
   */
  function seededChoice(): RadioChoice | null {
    const current = currentValue();
    if (dimension === 'restraint') return isMemberRestraintChoice(current) ? current : null;
    if (dimension === 'area') return isMemberAreaChoice(current) ? current : null;
    return isMemberPermissionChoice(current) ? current : null;
  }

  function reseed(): void {
    choice = seededChoice();
  }

  async function send(note: string | null): Promise<CorrectionResult> {
    const change = parseDimensionChange(dimension, choice);
    // Unreachable while the shell gates sending on `changed`; it is also what proves to the type
    // system that the chosen value belongs to the dimension being corrected.
    if (!change) return { status: 'invalid' };
    const result = await submitInlineCorrection({
      placeId,
      lang,
      target: 'access_condition',
      accessConditionId: condition.id,
      note,
      ...change
    });
    if (result.status === 'submitted') onSubmitted(submittedAccessConditionFlag(condition.id));
    return result;
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
