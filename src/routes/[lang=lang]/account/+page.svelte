<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import {
    Button,
    Notice,
    PageHeader,
    PageShell,
    PageTitle,
    Panel,
    Status
  } from '@hundavaent/design-system';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { formatLocalizedDate } from '$i18n/date';
  import type { MessageKey } from '$i18n';
  import ImpactPillarIcon from '$lib/impact/ImpactPillarIcon.svelte';
  import type { ImpactContributionKind, ImpactOutcome } from '$server/impact/impact-record';

  import type { AccountFacts, ImpactSnapshot } from './+page.server';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  // A no-JS deletion confirm re-renders the page from scratch; settings must open themselves
  // then, or the only confirmation notice on the page stays hidden. The user's own toggle
  // always wins over that default.
  let settingsToggled = $state<boolean | null>(null);
  const settingsOpen = $derived(
    settingsToggled ?? Boolean(form && 'success' in form && form.success === 'deletion_requested')
  );
  let deletionArmed = $state(false);

  const enhanceAction: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  const errorCode = $derived(form && 'error' in form ? form.error : data.authStatus);
  const successCode = $derived(form && 'success' in form ? form.success : null);
  const trustedVerification = $derived(
    (
      data as typeof data & {
        trustedVerification?:
          { status: 'available'; hasTasks: boolean } | { status: 'unavailable' };
      }
    ).trustedVerification ?? ({ status: 'unavailable' } as const)
  );
  const trustedVerificationFeedback = $derived(
    (
      data as typeof data & {
        trustedVerificationFeedback?:
          { status: 'available'; value: { hasUnread: boolean } } | { status: 'unavailable' };
      }
    ).trustedVerificationFeedback ?? ({ status: 'unavailable' } as const)
  );
  const accountFacts: AccountFacts = $derived(
    (data as typeof data & { accountFacts?: AccountFacts }).accountFacts ?? {
      saved: { status: 'unavailable' },
      visits: { status: 'unavailable' },
      suggestions: { status: 'unavailable' },
      achievements: { status: 'unavailable' }
    }
  );
  const impactSnapshot: ImpactSnapshot = $derived(
    (data as typeof data & { impactSnapshot?: ImpactSnapshot }).impactSnapshot ?? {
      status: 'unavailable'
    }
  );

  const number = (value: number): string => new Intl.NumberFormat(data.lang).format(value);
  const contributionKindKey = (kind: ImpactContributionKind): MessageKey =>
    `impact.outcome.kind.${kind}` as MessageKey;

  // The card leads with the one number the record is about. Same copy keys as the impact record
  // itself, so the hub and the page it opens never disagree about what the count is called.
  const confirmedLabel = $derived.by(() => {
    if (impactSnapshot.status !== 'available') return null;
    return impactSnapshot.value.confirmedContributions === 1
      ? data.copy['impact.primaryConfirmedOne']
      : data.copy['impact.primaryConfirmed'];
  });

  // One concrete outcome as evidence: the most recent contribution that is still confirmed. A
  // revoked one is not proof of anything, and the record itself is the place for the full list.
  const proofOutcome = $derived.by((): ImpactOutcome | null => {
    if (impactSnapshot.status !== 'available') return null;
    return (
      impactSnapshot.value.recentOutcomes.find(
        (outcome) => outcome.state === 'confirmed' && outcome.placeName
      ) ?? null
    );
  });

  const proofLine = $derived.by(() => {
    const outcome = proofOutcome;
    if (!outcome?.placeName) return null;
    return data.copy['account.impactProof']
      .replace('{kind}', data.copy[contributionKindKey(outcome.kind)])
      .replace('{place}', outcome.placeName);
  });

  // Forward-looking, and only when it is true: one qualifying action away from the nearest tier,
  // with progress already underway. Never a streak, and never the plain label dressed up as news -
  // when there is nothing close, the card simply does not mention Achievements.
  const achievementsNudge = $derived.by(() => {
    const fact = accountFacts.achievements;
    if (
      fact.status === 'available' &&
      fact.next &&
      fact.next.current > 0 &&
      fact.next.target - fact.next.current === 1
    ) {
      return data.copy['account.achievementsClose'];
    }
    return null;
  });

  const savedFact = $derived.by(() => {
    if (accountFacts.saved.status !== 'available') return null;
    const count = accountFacts.saved.count;
    if (count === 0) return data.copy['account.savedFactNone'];
    if (count === 1) return data.copy['account.savedFactOne'];
    return data.copy['account.savedFact'].replace('{count}', String(count));
  });

  const visitsFact = $derived.by(() => {
    if (accountFacts.visits.status !== 'available') return null;
    if (!accountFacts.visits.lastVisitedAt) return data.copy['account.visitsFactNone'];
    return data.copy['account.visitsFactLast'].replace(
      '{date}',
      formatLocalizedDate(accountFacts.visits.lastVisitedAt, data.lang)
    );
  });

  const suggestionFacts = $derived.by(() => {
    if (accountFacts.suggestions.status !== 'available') return [];
    const lines: string[] = [];
    const { needsReply, awaitingReview } = accountFacts.suggestions;
    if (needsReply === 1) lines.push(data.copy['account.suggestionsFactNeedsReplyOne']);
    if (needsReply > 1) {
      lines.push(
        data.copy['account.suggestionsFactNeedsReply'].replace('{count}', String(needsReply))
      );
    }
    if (awaitingReview === 1) lines.push(data.copy['account.suggestionsFactPendingOne']);
    if (awaitingReview > 1) {
      lines.push(
        data.copy['account.suggestionsFactPending'].replace('{count}', String(awaitingReview))
      );
    }
    return lines;
  });

  const placesFact = $derived([savedFact, visitsFact].filter(Boolean).join(' · '));

  const deletionRequested = $derived(
    successCode === 'deletion_requested' || data.member?.deletionStatus === 'requested'
  );

  function providerLabel(provider: string): string {
    if (provider === 'facebook') return data.copy['account.providerFacebook'];
    if (provider === 'email') return data.copy['account.providerEmail'];
    return data.copy['account.providerUnknown'];
  }
</script>

<svelte:head>
  <title>{data.copy['account.signedInTitle']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<PageShell
  width="narrow"
  class="account-shell grid min-h-[calc(100dvh_-_5.5rem)] [place-items:start_center]"
>
  {#if data.member}
    <Panel
      as="section"
      class="account-card grid w-[min(100%,42rem)] gap-context p-[clamp(var(--hv-space-context),5vw,2.5rem)] max-[32rem]:p-context"
      aria-labelledby="account-title"
    >
      <PageHeader>
        <PageTitle id="account-title">{data.copy['account.signedInTitle']}</PageTitle>
      </PageHeader>

      <!-- Renders through Notice (a child component), so the typography rides Notice's own class
           prop - it touches nothing Notice's base/tone sets, so there is no same-property race.
           The page-unique `account-message` name stays: a bare `.message` hook leaked this
           typography into the moderation review panels' message Notices whenever this route's CSS
           was loaded first. -->
      {#if errorCode}
        <Notice
          tone="error"
          as="p"
          class="account-message m-0 font-bold leading-[1.45]"
          role="alert"
        >
          {errorCode === 'authentication_required'
            ? data.copy['account.authenticationRequired']
            : data.copy['account.authUnavailable']}
        </Notice>
      {/if}

      <div class="account-home grid gap-context">
        <!-- The featured card: the subject, the count, one piece of evidence, the way in. Not
             data-linked - it carries two destinations, and a whole-card hit area would route
             the nudge's own clicks to the record instead. -->
        <Panel
          as="section"
          padded
          class="account-destination impact relative flex flex-col items-stretch transition-[border-color,background-color] duration-[var(--hv-fade-quick)] ease-[ease]"
          aria-labelledby="impact-heading"
        >
          <!-- Read top to bottom: the subject, the count, the evidence, the way in. The figure
               and the proof strip keep their own top margins, which is why neither carries the
               shared 0.4rem paragraph margin below. -->
          <div class="impact-topline flex items-center gap-[0.7rem]">
            <span
              class="impact-icon grid w-[2.8rem] h-[2.8rem] place-items-center"
              aria-hidden="true"
            >
              <ImpactPillarIcon kind="recognition" size="small" />
            </span>
            <h2 id="impact-heading" class="m-0 text-[1.2rem]">
              {data.copy['account.impactHeading']}
            </h2>
            {#if trustedVerificationFeedback.status === 'available' && trustedVerificationFeedback.value.hasUnread}
              <Status>{data.copy['account.newBadge']}</Status>
            {/if}
          </div>

          {#if impactSnapshot.status === 'available' && confirmedLabel}
            <!-- The figure reads as one line of text rather than a display numeral: at 3rem+ it
                 fought the title, which is indented behind its icon. Sized closer to the label,
                 the row scans as one statement on the same left edge as the proof strip and the
                 actions below. -->
            <p
              class="impact-headline flex flex-wrap items-baseline gap-x-2 gap-y-0 m-0 mt-[0.75rem] leading-[1.45] text-moss-ink last-of-type:mb-panel"
            >
              <strong
                class="ml-[-0.03em] font-display text-[2.15rem] font-[950] leading-none tracking-[-0.02em]"
                >{number(impactSnapshot.value.confirmedContributions)}</strong
              >
              <span class="text-[1rem] font-[850] leading-[1.3]">{confirmedLabel}</span>
            </p>
          {:else}
            <p class="m-0 mt-[0.4rem] leading-[1.45] text-basalt-muted last-of-type:mb-panel">
              {data.copy['account.impactIntro']}
            </p>
          {/if}

          {#if proofLine && proofOutcome}
            <!-- The proof sits in its own tinted strip, so one real outcome reads as evidence
                 rather than as a third paragraph of card copy. Its own `margin-bottom: 0` was
                 always dead - the strip is the card's last paragraph, so the shared
                 `p:last-of-type` bottom margin out-ranked it - and stays dead here. -->
            <p
              class="impact-proof flex items-start gap-[0.6rem] m-0 mt-[0.95rem] px-[0.8rem] py-[0.65rem] rounded-control bg-[color-mix(in_srgb,var(--hv-color-moss)_9%,white)] text-[0.9rem] font-bold leading-[1.35] text-basalt last-of-type:mb-panel"
            >
              <span
                class="proof-mark grid w-[1.35rem] h-[1.35rem] flex-none place-items-center rounded-[999px] bg-[color-mix(in_srgb,var(--hv-color-moss)_22%,white)] text-[0.72rem] font-[950] text-moss-ink"
                aria-hidden="true">✓</span
              >
              <span>
                {proofLine}
                <span class="proof-date block mt-[0.1rem] font-[750] text-basalt-muted">
                  {formatLocalizedDate(proofOutcome.confirmedAt, data.lang)}
                </span>
              </span>
            </p>
          {/if}

          <div
            class="impact-actions flex flex-wrap items-center gap-x-[1.1rem] gap-y-[0.7rem] mt-panel"
          >
            <Button
              intent="primary"
              href={resolve('/[lang=lang]/account/impact', { lang: data.lang })}
            >
              {data.copy['account.impactLink']}
            </Button>
            {#if achievementsNudge}
              <!-- The secondary door to recognition. A quiet text link, not a second button: the
                   card leads with one primary destination, and this line is forward-looking on
                   purpose - a goal, never a streak. -->
              <a
                class="achievements-nudge text-[0.88rem] font-[850] leading-[1.35] text-moss-ink no-underline text-pretty hover:underline hover:underline-offset-[0.2em] focus-visible:rounded-control focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px]"
                href={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}
              >
                {achievementsNudge}&nbsp;<span aria-hidden="true">→</span>
              </a>
            {/if}
          </div>
        </Panel>

        {#if trustedVerification.status === 'available'}
          <Panel
            as="section"
            padded
            class="account-destination trusted-verification relative grid grid-cols-[auto_minmax(0,1fr)] flex-col items-stretch transition-[border-color,background-color] duration-[var(--hv-fade-quick)] ease-[ease] [--impact-tone:var(--hv-color-fjord)]"
            data-linked
            aria-labelledby="trusted-verification-heading"
          >
            <span
              class="trusted-verification-icon grid w-[2.8rem] h-[2.8rem] place-items-center"
              aria-hidden="true"
            >
              <ImpactPillarIcon kind="knowledge" size="small" />
            </span>
            <div>
              <h2 id="trusted-verification-heading" class="m-0 text-[1.2rem]">
                {data.copy['account.trustedVerificationHeading']}
              </h2>
              <p class="m-0 mt-[0.4rem] leading-[1.45] text-basalt-muted last-of-type:mb-panel">
                {data.copy['account.trustedVerificationIntro']}
              </p>
              <!-- Paired cards stretch to the row's tallest sibling; the auto margin pins each
                   card's control to the bottom edge so the pair reads aligned. The preceding
                   paragraph owns the minimum gap, because an auto margin collapses to zero in a
                   content-sized card. .card-link renders through Button (a child component), so
                   the glue rides Button's own class prop rather than a :global() hook. -->
              <!-- The whole card is one link target: the card's single control stretches an
                   invisible hit area across the panel. Cards with several destinations (impact,
                   contributions) stay button-only, so a card never looks tappable while routing
                   only part of its surface. Every .card-link sits in a data-linked card, so the
                   hit area needs no ancestor condition of its own. -->
              <Button
                href={resolve('/[lang=lang]/account/keep-current', { lang: data.lang })}
                class="card-link mt-auto after:absolute after:inset-0 after:rounded-panel after:content-['']"
              >
                {data.copy['account.trustedVerificationLink']}
              </Button>
            </div>
          </Panel>
        {/if}

        <Panel
          as="section"
          padded
          class="account-destination places relative flex flex-col items-stretch transition-[border-color,background-color] duration-[var(--hv-fade-quick)] ease-[ease]"
          data-linked
          aria-labelledby="places-heading"
        >
          <h2 id="places-heading" class="m-0 text-[1.2rem]">
            {data.copy['account.placesHeading']}
          </h2>
          {#if placesFact}
            <p
              class="destination-fact m-0 mt-[0.4rem] text-[0.92rem] font-extrabold leading-[1.45] text-basalt last-of-type:mb-panel"
            >
              {placesFact}
            </p>
          {/if}
          <p class="m-0 mt-[0.4rem] leading-[1.45] text-basalt-muted last-of-type:mb-panel">
            {data.copy['account.placesIntro']}
          </p>
          <Button
            href={resolve('/[lang=lang]/history', { lang: data.lang })}
            class="card-link mt-auto after:absolute after:inset-0 after:rounded-panel after:content-['']"
          >
            {data.copy['account.placesLink']}
          </Button>
        </Panel>

        <Panel
          as="section"
          padded
          class="account-destination contributions relative flex flex-col items-stretch transition-[border-color,background-color] duration-[var(--hv-fade-quick)] ease-[ease]"
          aria-labelledby="contributions-heading"
        >
          <h2 id="contributions-heading" class="m-0 text-[1.2rem]">
            {data.copy['account.contributionsHeading']}
          </h2>
          {#each suggestionFacts as factLine (factLine)}
            <p
              class="destination-fact m-0 mt-[0.4rem] text-[0.92rem] font-extrabold leading-[1.45] text-basalt last-of-type:mb-panel"
            >
              {factLine}
            </p>
          {/each}
          <p class="m-0 mt-[0.4rem] leading-[1.45] text-basalt-muted last-of-type:mb-panel">
            {data.copy['account.contributionsIntro']}
          </p>
          <div class="destination-links flex flex-wrap items-center gap-actions mt-auto">
            <Button intent="primary" href={resolve('/[lang=lang]/suggest', { lang: data.lang })}>
              {data.copy['suggestion.nav']}
            </Button>
            <Button href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}>
              {data.copy['suggestion.myTitle']}
            </Button>
          </div>
        </Panel>

        {#if data.canModerate}
          <Panel
            as="section"
            padded
            class="account-destination moderation relative flex flex-col items-stretch transition-[border-color,background-color] duration-[var(--hv-fade-quick)] ease-[ease]"
            data-linked
            aria-labelledby="moderation-heading"
          >
            <h2 id="moderation-heading" class="m-0 text-[1.2rem]">
              {data.copy['account.moderationHeading']}
            </h2>
            <p class="m-0 mt-[0.4rem] leading-[1.45] text-basalt-muted last-of-type:mb-panel">
              {data.copy['account.moderationIntro']}
            </p>
            <Button
              href={resolve('/[lang=lang]/moderation', { lang: data.lang })}
              class="card-link mt-auto after:absolute after:inset-0 after:rounded-panel after:content-['']"
            >
              {data.copy['account.moderationLink']}
            </Button>
          </Panel>
        {/if}
      </div>

      <!-- Renders through Button (a child component), so the layout hook rides Button's own class
           prop; inline-flex restates what Button's base already sets, so the pair never races. -->
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <Button
        href={data.returnTo}
        intent="quiet"
        class="discovery-link inline-flex justify-self-start"
        >{data.copy['account.backToPlace']}</Button
      >

      <div class="settings pt-panel border-t border-border-subtle">
        <button
          type="button"
          class="settings-toggle w-fit min-h-0 p-0 border-0 bg-transparent font-black text-fjord underline cursor-pointer focus-visible:rounded-control focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px]"
          aria-expanded={settingsOpen}
          onclick={() => (settingsToggled = !settingsOpen)}
        >
          {data.copy['account.settingsHeading']}
        </button>
        {#if settingsOpen}
          <div class="settings-body grid gap-context mt-panel">
            <Panel
              as="section"
              padded
              class="identity grid gap-panel min-w-0"
              aria-labelledby="identity-heading"
            >
              <h2 id="identity-heading" class="m-0 text-[1.2rem]">
                {data.copy['account.identityHeading']}
              </h2>
              <!-- Identity ledger: label left, value right, hairline between - the same shape the
                   impact record uses for its own label/value lists. The two-column grid it
                   replaced put a long email on its own wrapped line while short values floated
                   mid-panel. -->
              <!-- Both end rows keep their padding, so the list sits evenly inside the panel
                   instead of hugging the bottom edge while the top has the heading's breathing
                   room. -->
              <dl class="grid m-0 gap-0">
                <div
                  class="flex flex-wrap items-baseline justify-between gap-x-[1.25rem] gap-y-[0.2rem] py-3 border-b border-border-subtle first-of-type:pt-[0.35rem] last-of-type:pb-[0.35rem] last-of-type:border-b-0"
                >
                  <dt class="text-[0.88rem] font-[750] text-basalt-muted">
                    {data.copy['account.emailIdentity']}
                  </dt>
                  <dd class="m-0 font-[850] wrap-anywhere text-end">
                    {data.member.email || data.copy['account.emailUnavailable']}
                  </dd>
                </div>
                <div
                  class="flex flex-wrap items-baseline justify-between gap-x-[1.25rem] gap-y-[0.2rem] py-3 border-b border-border-subtle first-of-type:pt-[0.35rem] last-of-type:pb-[0.35rem] last-of-type:border-b-0"
                >
                  <dt class="text-[0.88rem] font-[750] text-basalt-muted">
                    {data.copy['account.providerIdentity']}
                  </dt>
                  <dd class="m-0 font-[850] wrap-anywhere text-end">
                    {providerLabel(data.member.provider)}
                  </dd>
                </div>
                <div
                  class="flex flex-wrap items-baseline justify-between gap-x-[1.25rem] gap-y-[0.2rem] py-3 border-b border-border-subtle first-of-type:pt-[0.35rem] last-of-type:pb-[0.35rem] last-of-type:border-b-0"
                >
                  <dt class="text-[0.88rem] font-[750] text-basalt-muted">
                    {data.copy['account.memberSince']}
                  </dt>
                  <dd class="m-0 font-[850] wrap-anywhere text-end">
                    {formatLocalizedDate(data.member.createdAt, data.lang)}
                  </dd>
                </div>
              </dl>
            </Panel>

            <form
              class="grid gap-[0.65rem]"
              method="POST"
              action="?/signOut"
              use:enhance={enhanceAction}
            >
              <input type="hidden" name="returnTo" value={data.returnTo} />
              <Button type="submit" intent="quiet" disabled={submitting} class="disabled-fade">
                {data.copy['account.signOut']}
              </Button>
            </form>

            <Panel
              as="section"
              padded
              class="deletion grid gap-panel min-w-0"
              aria-labelledby="deletion-heading"
            >
              <h2 id="deletion-heading" class="m-0 text-[1.2rem]">
                {data.copy['account.deletionHeading']}
              </h2>
              <p class="leading-[1.5] text-basalt-muted">
                {data.copy['account.deletionExplanation']}
              </p>
              {#if deletionRequested}
                <Notice
                  tone="success"
                  as="p"
                  class="account-message m-0 font-bold leading-[1.45]"
                  role="status"
                >
                  {data.copy['account.deletionRequested']}
                </Notice>
              {:else if !deletionArmed}
                <Button type="button" intent="danger-quiet" onclick={() => (deletionArmed = true)}>
                  {data.copy['account.requestDeletion']}
                </Button>
              {:else}
                <form
                  class="grid gap-[0.65rem]"
                  method="POST"
                  action="?/requestDeletion"
                  use:enhance={enhanceAction}
                >
                  <div class="deletion-actions flex flex-wrap items-center gap-actions">
                    <Button
                      type="submit"
                      intent="danger-quiet"
                      disabled={submitting}
                      class="disabled-fade"
                    >
                      {data.copy['account.confirmDeletion']}
                    </Button>
                    <Button type="button" intent="quiet" onclick={() => (deletionArmed = false)}>
                      {data.copy['account.keepAccount']}
                    </Button>
                  </div>
                </form>
              {/if}
            </Panel>
          </div>
        {/if}
      </div>
    </Panel>
  {/if}
</PageShell>

<style>
  /* Button owns its own disabled treatment, which differs from this page's dimmed-fade look;
     the hook keeps the fade for the two migrated Buttons (sign out, confirm deletion) that had
     it before. Both render through Button (a child component), so the hook class needs
     :global() to reach the element it lands on. */
  :global(.disabled-fade):disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* Panel owns padding through its own `padded` utility, and two same-specificity padding
     utilities on one element resolve by stylesheet order rather than class order - so this
     override stays an unlayered scoped rule, which out-ranks the utilities layer outright. */
  :global(.identity) {
    padding: clamp(1.35rem, 3.2vw, 1.9rem);
  }

  /* The linked-card affordance out-ranks Panel's own border/background utilities the same way,
     and it must keep out-ranking the tinted moderation card below - so the whole
     border-colour/background family for these cards stays unlayered together rather than
     splitting across two cascade systems. */
  :global(.account-destination[data-linked]):focus-within {
    border-color: color-mix(in srgb, var(--hv-color-fjord) 55%, var(--hv-border-subtle));
  }

  @media (hover: hover) {
    :global(.account-destination[data-linked]):hover {
      border-color: color-mix(in srgb, var(--hv-color-fjord) 55%, var(--hv-border-subtle));
      background-color: color-mix(in srgb, var(--hv-color-fjord) 4%, var(--hv-color-snow-raised));
    }
  }

  /* Impact is the one featured card; every other destination renders as a plain panel so the
     accent actually directs attention instead of competing with two other tinted cards. One
     column, not the icon-gutter grid: the gutter reserved empty space beside the figure, the
     proof and the actions all the way down the card. */
  :global(.account-destination.impact) {
    --impact-tone: var(--hv-color-moss);

    border-color: color-mix(in srgb, var(--hv-color-moss) 30%, var(--hv-border-subtle));
    background: linear-gradient(105deg, rgb(79 143 104 / 12%) 0%, var(--hv-color-snow-raised) 38%);
  }

  :global(.account-destination.moderation) {
    background: var(--hv-color-fjord-soft);
  }
</style>
