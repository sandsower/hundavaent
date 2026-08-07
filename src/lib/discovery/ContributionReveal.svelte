<script lang="ts">
  import type { Catalogue, Locale, MessageKey } from '$i18n';
  import {
    hasPendingAccessCondition,
    hasPendingPlaceField,
    hasPendingPlaceReport,
    memberPlaceFields,
    placeReportReasons,
    type MemberPlaceField,
    type PendingPlaceFlag,
    type PlaceReportReason
  } from '$lib/contributions/correction';
  import { correctConditionHref, reportPlaceHref } from '$lib/discovery/correct-link';
  import { createLiveAnnouncer } from '$lib/discovery/live-announcement';
  import PlaceFieldCorrection from '$lib/discovery/PlaceFieldCorrection.svelte';
  import PlaceReportAction from '$lib/discovery/PlaceReportAction.svelte';
  import type { PublishedPlaceProfile } from '$server/discovery/public-places';

  /**
   * The one quiet line at the foot of the practical details, and everything behind it.
   *
   * Readers outnumber contributors, and the practical details are what a reader came for. So the
   * details render exactly as they always have and a single disclosure holds every per-fact
   * affordance, including the Place name, which the card had no row for until contribution needed
   * one.
   */
  interface Props {
    placeName: string;
    lang: Locale;
    copy: Catalogue;
    signedIn: boolean;
    profile: PublishedPlaceProfile;
    pending?: readonly PendingPlaceFlag[];
    /** Forwarded from each editor so the card can suppress the fact without a refetch. */
    onSubmitted?: (flag: PendingPlaceFlag) => void;
  }

  let {
    placeName,
    lang,
    copy,
    signedIn,
    profile,
    pending = [],
    onSubmitted = () => undefined
  }: Props = $props();

  const componentId = $props.id();
  let open = $state(false);
  let panel = $state<HTMLElement>();
  let trigger = $state<HTMLButtonElement>();
  let focusTarget = $state<'panel' | 'trigger' | null>(null);
  /**
   * The affordance a Member just sent from is gone the instant it succeeds, replaced by the
   * pending line standing in for it. The shell cannot return focus to a trigger it no longer
   * renders, so the parent that made the swap moves focus onto the line that replaced it: the
   * Member hears what happened, and the next Tab carries on from where they were rather than from
   * the top of the document.
   */
  let submittedFlag = $state<PendingPlaceFlag | null>(null);
  // Four editors share this one region, so two of them reporting the same outcome in a row is the
  // ordinary case rather than the edge case. The shared announcer is what makes the repeat audible.
  let announcement = $state('');
  const announce = createLiveAnnouncer((message) => (announcement = message));

  const fieldLabels: Record<MemberPlaceField, MessageKey> = {
    name: 'placeField.name',
    website_url: 'placeField.websiteUrl',
    phone: 'placeField.phone',
    dog_amenities: 'placeField.dogAmenities'
  };

  // Only for the pending line, which has to name the claim it is standing in for now that the
  // action that carried those words is gone. The actions themselves read the same copy through
  // `PlaceReportAction`, which owns the trigger's label pair.
  const reportLabels: Record<PlaceReportReason, MessageKey> = {
    closed: 'placeReport.closed',
    moved: 'placeReport.moved',
    unsafe: 'placeReport.unsafe'
  };

  // The raw stored values, joined, and deliberately not the localized rendering the details show
  // above. The editor round-trips exactly what is stored, so showing anything else here would
  // invite a Correction against a value the Member cannot see.
  const amenityText = $derived(profile.dogAmenities.join(', '));

  const values = $derived<Record<MemberPlaceField, string>>({
    name: profile.name,
    website_url: profile.websiteUrl ?? '',
    phone: profile.phone ?? '',
    dog_amenities: amenityText
  });

  const multipleConditions = $derived(profile.accessConditions.length > 1);

  function expand(): void {
    open = true;
    focusTarget = 'panel';
  }

  function collapse(): void {
    open = false;
    focusTarget = 'trigger';
  }

  function pendingField(field: MemberPlaceField): boolean {
    return hasPendingPlaceField(pending, field);
  }

  function recordSubmitted(flag: PendingPlaceFlag): void {
    submittedFlag = flag;
    onSubmitted(flag);
  }

  function justSubmittedField(field: MemberPlaceField): boolean {
    return submittedFlag?.targetKind === 'place_field' && submittedFlag.targetField === field;
  }

  function justSubmittedReport(reason: PlaceReportReason): boolean {
    return submittedFlag?.targetKind === 'place' && submittedFlag.reportReason === reason;
  }

  $effect(() => {
    if (focusTarget === 'panel' && panel) {
      panel.querySelector<HTMLElement>('button, a[href]')?.focus();
      focusTarget = null;
    }
    if (focusTarget === 'trigger' && trigger) {
      trigger.focus();
      focusTarget = null;
    }
  });

  $effect(() => {
    // `pending` is read so this re-runs when the card hands the suppression back down, which is
    // what renders the line being focused.
    void pending;
    if (!submittedFlag || !panel) return;
    const line = panel.querySelector<HTMLElement>('[data-pending-focus]');
    if (!line) return;
    line.focus();
    submittedFlag = null;
  });
</script>

<div
  class="contribution-reveal grid justify-items-start mt-[0.35rem] pt-[0.6rem] border-t border-border-subtle"
  data-contribution-reveal
>
  {#if open}
    <section
      bind:this={panel}
      class="panel grid w-full min-w-0 gap-[0.7rem]"
      aria-labelledby={`${componentId}-heading`}
      data-contribution-panel
    >
      <h4
        id={`${componentId}-heading`}
        class="m-0 text-[0.72rem] font-[850] tracking-[0.05em] uppercase text-basalt"
      >
        {copy['inlineCorrection.revealHeading']}
      </h4>

      <ul class="facts grid gap-[0.7rem] m-0 p-0 list-none">
        {#each memberPlaceFields as field (field)}
          <li class="grid min-w-0 gap-[0.15rem]">
            <span class="fact-label text-[0.72rem] font-[850] text-basalt-muted"
              >{copy[fieldLabels[field]]}</span
            >
            <span class="fact-value text-[0.85rem] font-bold [overflow-wrap:anywhere]"
              >{values[field] || copy['common.notAvailable']}</span
            >
            {#if pendingField(field)}
              {@render pendingLine(justSubmittedField(field))}
            {:else}
              <PlaceFieldCorrection
                placeId={profile.placeId}
                {placeName}
                {lang}
                {copy}
                {signedIn}
                {field}
                currentValue={values[field]}
                {announce}
                onSubmitted={recordSubmitted}
              />
            {/if}
          </li>
        {/each}
      </ul>

      {#if multipleConditions}
        <div class="conditions grid gap-2">
          <h5 class="m-0 text-[0.72rem] font-[850] tracking-[0.05em] uppercase text-basalt">
            {copy['inlineCorrection.conditionsHeading']}
          </h5>
          <ul class="facts grid gap-[0.7rem] m-0 p-0 list-none">
            {#each profile.accessConditions as condition, index (condition.id)}
              <li class="grid min-w-0 gap-[0.15rem]">
                <span class="fact-label text-[0.72rem] font-[850] text-basalt-muted"
                  >{copy['place.conditionLabel'].replace('{number}', String(index + 1))}</span
                >
                {#if hasPendingAccessCondition(pending, condition.id)}
                  <!-- Never focused from here: these are links out to the form, so nothing in this
                       panel can turn one into a pending line while the Member is standing on it. -->
                  {@render pendingLine(false)}
                {:else}
                  <!-- eslint-disable svelte/no-navigation-without-resolve -- correctConditionHref builds the path with $app/paths resolve() -->
                  <a
                    href={correctConditionHref(lang, profile.placeId, condition.id)}
                    class="condition-link justify-self-start text-[0.78rem] font-extrabold text-fjord focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
                    aria-label={copy['inlineCorrection.conditionLinkLabel']
                      .replace('{number}', String(index + 1))
                      .replace('{name}', placeName)}
                  >
                    {copy['inlineCorrection.start']}
                  </a>
                  <!-- eslint-enable svelte/no-navigation-without-resolve -->
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Beneath the per-fact affordances, because these three are not about any fact: they are
           claims about the whole Place, and a Member who has one is not looking for a field. -->
      <!-- Every claim in this group is a whole list item rather than an affordance hanging off a fact
           label, so they all have to start on the same left edge. The three actions are buttons carrying
           0.4rem of their own padding, so the pending line that replaces one and the link that follows
           them are inset to match; the 0.45rem lead-in is the same one the buttons bring with them, so
           the rhythm does not change when a claim turns into a pending line. -->
      <div class="reports grid gap-2">
        <h5 class="m-0 text-[0.72rem] font-[850] tracking-[0.05em] uppercase text-basalt">
          {copy['placeReport.heading']}
        </h5>
        <ul class="facts grid gap-1 m-0 p-0 list-none">
          {#each placeReportReasons as reason (reason)}
            <li class="grid min-w-0 gap-[0.15rem]">
              {#if hasPendingPlaceReport(pending, reason)}
                <!-- Per reason, not per Place: an open "closed" says nothing about "unsafe", so
                     the other two claims stay available. -->
                <span
                  class="fact-label report-claim mt-[0.45rem] pl-[0.4rem] text-[0.72rem] font-[850] text-basalt-muted"
                  >{copy[reportLabels[reason]]}</span
                >
                <p
                  class="pending [margin:0.1rem_0_0] pl-[0.4rem] text-[0.75rem] leading-[1.35] font-[750] text-basalt-muted focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
                  data-report-pending
                  data-pending-focus={justSubmittedReport(reason) ? '' : undefined}
                  tabindex="-1"
                >
                  {copy['placeReport.pending']}
                </p>
              {:else}
                <PlaceReportAction
                  placeId={profile.placeId}
                  {placeName}
                  {copy}
                  {signedIn}
                  {reason}
                  {announce}
                  onSubmitted={recordSubmitted}
                />
              {/if}
            </li>
          {/each}
          <li class="grid min-w-0 gap-[0.15rem]">
            <!-- eslint-disable svelte/no-navigation-without-resolve -- reportPlaceHref builds the path with $app/paths resolve() -->
            <a
              href={reportPlaceHref(lang, profile.placeId)}
              class="report-link inline-flex min-h-6 items-center justify-self-start mt-[0.45rem] px-[0.4rem] rounded-control text-[0.72rem] font-extrabold text-fjord focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
              aria-label={copy['placeReport.somethingElseLabel'].replace('{name}', placeName)}
            >
              {copy['placeReport.somethingElse']}
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
          </li>
        </ul>
      </div>

      <button
        class="hide inline-flex min-h-7 items-center justify-self-start py-[0.2rem] px-[0.4rem] border-0 rounded-control bg-transparent [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.78rem] font-extrabold text-fjord underline cursor-pointer focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
        type="button"
        onclick={collapse}
      >
        {copy['inlineCorrection.revealHide']}
      </button>
    </section>
  {:else}
    <!-- The entry point to the whole contribution surface, so it needs a target a thumb can hit.
         1.75rem clears the WCAG 2.5.8 24px minimum with room to spare. -->
    <button
      bind:this={trigger}
      class="reveal inline-flex min-h-7 items-center py-[0.2rem] px-[0.4rem] border-0 rounded-control bg-transparent [font-family:inherit] [font-style:inherit] [font-variant:inherit] [font-stretch:inherit] [line-height:inherit] text-[0.78rem] font-extrabold text-fjord underline cursor-pointer focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
      type="button"
      aria-label={copy['inlineCorrection.revealLabel'].replace('{name}', placeName)}
      onclick={expand}
    >
      {copy['inlineCorrection.reveal']}
    </button>
  {/if}
</div>

<p
  class="visually-hidden absolute w-px h-px -m-px p-0 overflow-hidden border-0 [clip-path:inset(50%)] whitespace-nowrap"
  role="status"
  aria-live="polite"
  data-contribution-announcement
>
  {announcement}
</p>

{#snippet pendingLine(focused: boolean)}
  <!-- Focusable only so this component can land the Member on the line that replaced the affordance
       they just sent from; it is never in the tab order. -->
  <p
    class="pending [margin:0.2rem_0_0] text-[0.75rem] leading-[1.35] font-[750] text-basalt-muted focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:[outline-offset:2px]"
    data-correction-pending
    data-pending-focus={focused ? '' : undefined}
    tabindex="-1"
  >
    {copy['inlineCorrection.pending']}
  </p>
{/snippet}

<style>
  /* Transform only, and deliberately no opacity: this panel is entirely text, so fading it in
     would start every label at a 1:1 contrast ratio and climb through the whole duration. Reduced
     motion is handled by --hv-motion-quick collapsing to zero rather than by an override here. */
  .panel {
    animation: contribution-reveal var(--hv-motion-quick) var(--hv-ease-settle) both;
  }

  @keyframes contribution-reveal {
    from {
      transform: translateY(-0.2rem);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
