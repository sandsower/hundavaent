<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import type { WheelchairAccessibility } from '$domain/place';
  import {
    submitInlineCorrection,
    type CorrectionResult
  } from '$lib/contributions/correction-client';
  import {
    isMemberWheelchairAccessibilityChoice,
    memberWheelchairAccessibilityChoices,
    parseFieldChange,
    submittedPlaceFieldFlag,
    type MemberWheelchairAccessibilityChoice,
    type PendingPlaceFlag
  } from '$lib/contributions/correction';
  import InlineCorrectionShell from '$lib/discovery/InlineCorrectionShell.svelte';

  /**
   * The radio group behind the accessibility badge's panel. The whole vocabulary is the three
   * definite states: `unknown` is the absence of a claim, so it is never offered, and a Place
   * whose published state is unknown seeds nothing rather than pre-checking a state the Member
   * has not claimed.
   */
  interface Props {
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    /** The published state the editor corrects, exactly as the badge shows it. */
    state: WheelchairAccessibility;
    announce?: (message: string) => void;
    /** Reports what was just sent, so the card can suppress the affordance without a refetch. */
    onSubmitted?: (flag: PendingPlaceFlag) => void;
  }

  let {
    placeId,
    placeName,
    lang,
    copy,
    signedIn,
    // Renamed on arrival: a local binding called `state` would collide with the `$state` rune.
    state: published,
    announce = () => undefined,
    onSubmitted = () => undefined
  }: Props = $props();

  const choiceLabels: Record<MemberWheelchairAccessibilityChoice, MessageKey> = {
    accessible: 'wheelchairAccessibility.accessible',
    partially_accessible: 'wheelchairAccessibility.partiallyAccessible',
    not_accessible: 'wheelchairAccessibility.notAccessible'
  };

  let choice = $state<MemberWheelchairAccessibilityChoice | null>(seededChoice());

  const changed = $derived(choice !== null && choice !== published);

  function seededChoice(): MemberWheelchairAccessibilityChoice | null {
    return isMemberWheelchairAccessibilityChoice(published) ? published : null;
  }

  function reseed(): void {
    choice = seededChoice();
  }

  async function send(note: string | null): Promise<CorrectionResult> {
    const change = parseFieldChange('wheelchair_accessibility', choice);
    // Unreachable while the shell gates sending on `changed`; it is also what proves to the type
    // system that the chosen value belongs to the field being corrected.
    if (!change) return { status: 'invalid' };
    const result = await submitInlineCorrection({
      placeId,
      lang,
      target: 'place_field',
      note,
      ...change
    });
    if (result.status === 'submitted') {
      onSubmitted(submittedPlaceFieldFlag('wheelchair_accessibility'));
    }
    return result;
  }
</script>

<InlineCorrectionShell
  {copy}
  {signedIn}
  {announce}
  {send}
  startLabel={copy['inlineCorrection.startLabelMobility'].replace('{name}', placeName)}
  canSend={changed}
  onOpen={reseed}
>
  {#snippet controls({ dismiss, groupName })}
    <div class="choices">
      {#each memberWheelchairAccessibilityChoices as option (option)}
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
