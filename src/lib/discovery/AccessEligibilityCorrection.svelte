<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    submitInlineCorrection,
    type CorrectionResult
  } from '$lib/contributions/correction-client';
  import {
    memberEligibilityChoiceFor,
    memberEligibilityChoices,
    submittedAccessConditionFlag,
    type MemberEligibilityChoice,
    type MemberEligibilityValue,
    type PendingPlaceFlag
  } from '$lib/contributions/correction';
  import InlineCorrectionShell from '$lib/discovery/InlineCorrectionShell.svelte';
  import type { PublishedAccessFacts } from '$server/discovery/public-places';

  /**
   * Eligibility is the one Access Condition dimension whose choice is not its stored value: a
   * restricted scope says nothing without the number bounding it. So the group names the kind of
   * limit and one required numeric control carries the figure, which is why this is its own thin
   * editor rather than a fourth case in the radio-only one.
   */
  interface Props {
    placeId: string;
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    condition: PublishedAccessFacts;
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
    announce = () => undefined,
    onSubmitted = () => undefined
  }: Props = $props();

  const choiceLabels: Record<MemberEligibilityChoice, MessageKey> = {
    all_dogs: 'accessSymbols.allDogs',
    maximum_weight_kg: 'inlineCorrection.eligibilityWeight',
    maximum_dogs: 'inlineCorrection.eligibilityDogs'
  };

  const limitLabels: Record<'maximum_weight_kg' | 'maximum_dogs', MessageKey> = {
    maximum_weight_kg: 'inlineCorrection.eligibilityWeightValue',
    maximum_dogs: 'inlineCorrection.eligibilityDogsValue'
  };

  let choice = $state<MemberEligibilityChoice | null>(seededChoice());
  let limit = $state(seededLimit());
  let limitInput = $state<HTMLInputElement>();
  let claimLimitFocus = $state(false);

  const limitKind = $derived(choice === 'all_dogs' || choice === null ? null : choice);
  const proposed = $derived(proposedValue());
  const changed = $derived(proposed !== null && !isCurrentValue(proposed));

  function seededChoice(): MemberEligibilityChoice | null {
    return memberEligibilityChoiceFor(condition.dogEligibility);
  }

  /**
   * The figure is seeded only when the group can represent the whole eligibility. A Place whose
   * eligibility carries a sourced note or two limits at once seeds nothing, so no number the
   * Member never typed can travel back as their claim.
   */
  function seededLimit(): string {
    const seeded = memberEligibilityChoiceFor(condition.dogEligibility);
    if (seeded === 'maximum_weight_kg') return String(condition.dogEligibility.maximumWeightKg);
    if (seeded === 'maximum_dogs') return String(condition.dogEligibility.maximumDogs);
    return '';
  }

  function reseed(): void {
    choice = seededChoice();
    limit = seededLimit();
  }

  function proposedValue(): MemberEligibilityValue | null {
    if (choice === 'all_dogs') return { scope: 'all_dogs' };
    if (choice === null) return null;

    const figure = Number(limit.trim());
    if (limit.trim() === '' || !Number.isFinite(figure) || figure <= 0) return null;
    if (choice === 'maximum_weight_kg') return { scope: 'restricted', maximumWeightKg: figure };
    return Number.isInteger(figure) ? { scope: 'restricted', maximumDogs: figure } : null;
  }

  function isCurrentValue(value: MemberEligibilityValue): boolean {
    const current = condition.dogEligibility;
    if (memberEligibilityChoiceFor(current) === null) return false;
    if (value.scope === 'all_dogs') return current.scope === 'all_dogs';
    if ('maximumWeightKg' in value) return current.maximumWeightKg === value.maximumWeightKg;
    return current.maximumDogs === value.maximumDogs;
  }

  /**
   * The numeric control only exists once a limit is chosen, so choosing one has to carry focus
   * into it. Without this the next Tab from the group lands on the note and the required figure is
   * skipped by exactly the Members who never use a pointer. The claim is a flag rather than a
   * direct focus call because the input does not exist yet at the moment the choice is made.
   */
  function claimFocusFor(option: MemberEligibilityChoice): void {
    claimLimitFocus = option !== 'all_dogs';
  }

  $effect(() => {
    if (!claimLimitFocus || !limitInput) return;
    limitInput.focus();
    claimLimitFocus = false;
  });

  async function send(note: string | null): Promise<CorrectionResult> {
    // Unreachable while the shell gates sending on `changed`; it is also what proves to the type
    // system that a limit choice arrived with the figure that bounds it.
    if (!proposed) return { status: 'invalid' };
    const result = await submitInlineCorrection({
      placeId,
      lang,
      target: 'access_condition',
      accessConditionId: condition.id,
      dimension: 'eligibility',
      value: proposed,
      note
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
  startLabel={copy['inlineCorrection.startLabelEligibility'].replace('{name}', placeName)}
  canSend={changed}
  onOpen={reseed}
>
  {#snippet controls({ dismiss, groupName })}
    <div class="choices">
      {#each memberEligibilityChoices as option (option)}
        <label>
          <input
            type="radio"
            name={groupName}
            value={option}
            bind:group={choice}
            onchange={() => claimFocusFor(option)}
            onkeydown={dismiss}
          />
          <span>{copy[choiceLabels[option]]}</span>
        </label>
      {/each}
    </div>

    {#if limitKind}
      <label class="limit">
        <span>{copy[limitLabels[limitKind]]}</span>
        <input
          bind:this={limitInput}
          type="number"
          inputmode="numeric"
          min="1"
          step={limitKind === 'maximum_dogs' ? '1' : 'any'}
          required
          value={limit}
          autocomplete="off"
          oninput={(event) => (limit = event.currentTarget.value)}
          onkeydown={dismiss}
        />
      </label>
    {/if}
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

  .limit {
    display: grid;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 750;
  }

  .limit input {
    width: 100%;
    max-width: 8rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    font: inherit;
    font-size: 0.8rem;
  }
</style>
