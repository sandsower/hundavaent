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

<PageShell width="narrow" class="account-shell">
  {#if data.member}
    <Panel as="section" class="account-card grid gap-context" aria-labelledby="account-title">
      <PageHeader>
        <PageTitle id="account-title">{data.copy['account.signedInTitle']}</PageTitle>
      </PageHeader>

      {#if errorCode}
        <Notice tone="error" as="p" class="account-message" role="alert">
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
          class="account-destination impact"
          aria-labelledby="impact-heading"
        >
          <div class="impact-topline">
            <span class="impact-icon" aria-hidden="true">
              <ImpactPillarIcon kind="recognition" size="small" />
            </span>
            <h2 id="impact-heading">{data.copy['account.impactHeading']}</h2>
            {#if trustedVerificationFeedback.status === 'available' && trustedVerificationFeedback.value.hasUnread}
              <Status>{data.copy['account.newBadge']}</Status>
            {/if}
          </div>

          {#if impactSnapshot.status === 'available' && confirmedLabel}
            <p class="impact-headline">
              <strong>{number(impactSnapshot.value.confirmedContributions)}</strong>
              <span>{confirmedLabel}</span>
            </p>
          {:else}
            <p>{data.copy['account.impactIntro']}</p>
          {/if}

          {#if proofLine && proofOutcome}
            <p class="impact-proof">
              <span class="proof-mark" aria-hidden="true">✓</span>
              <span>
                {proofLine}
                <span class="proof-date">
                  {formatLocalizedDate(proofOutcome.confirmedAt, data.lang)}
                </span>
              </span>
            </p>
          {/if}

          <div class="impact-actions">
            <Button
              intent="primary"
              href={resolve('/[lang=lang]/account/impact', { lang: data.lang })}
            >
              {data.copy['account.impactLink']}
            </Button>
            {#if achievementsNudge}
              <a
                class="achievements-nudge"
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
            class="account-destination trusted-verification"
            data-linked
            aria-labelledby="trusted-verification-heading"
          >
            <span class="trusted-verification-icon" aria-hidden="true">
              <ImpactPillarIcon kind="knowledge" size="small" />
            </span>
            <div>
              <h2 id="trusted-verification-heading">
                {data.copy['account.trustedVerificationHeading']}
              </h2>
              <p>{data.copy['account.trustedVerificationIntro']}</p>
              <Button
                href={resolve('/[lang=lang]/account/keep-current', { lang: data.lang })}
                class="card-link"
              >
                {data.copy['account.trustedVerificationLink']}
              </Button>
            </div>
          </Panel>
        {/if}

        <Panel
          as="section"
          padded
          class="account-destination places"
          data-linked
          aria-labelledby="places-heading"
        >
          <h2 id="places-heading">{data.copy['account.placesHeading']}</h2>
          {#if placesFact}
            <p class="destination-fact">{placesFact}</p>
          {/if}
          <p>{data.copy['account.placesIntro']}</p>
          <Button href={resolve('/[lang=lang]/history', { lang: data.lang })} class="card-link">
            {data.copy['account.placesLink']}
          </Button>
        </Panel>

        <Panel
          as="section"
          padded
          class="account-destination contributions"
          aria-labelledby="contributions-heading"
        >
          <h2 id="contributions-heading">{data.copy['account.contributionsHeading']}</h2>
          {#each suggestionFacts as factLine (factLine)}
            <p class="destination-fact">{factLine}</p>
          {/each}
          <p>{data.copy['account.contributionsIntro']}</p>
          <div class="destination-links flex flex-wrap items-center gap-actions">
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
            class="account-destination moderation"
            data-linked
            aria-labelledby="moderation-heading"
          >
            <h2 id="moderation-heading">{data.copy['account.moderationHeading']}</h2>
            <p>{data.copy['account.moderationIntro']}</p>
            <Button
              href={resolve('/[lang=lang]/moderation', { lang: data.lang })}
              class="card-link"
            >
              {data.copy['account.moderationLink']}
            </Button>
          </Panel>
        {/if}
      </div>

      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <Button href={data.returnTo} intent="quiet" class="discovery-link"
        >{data.copy['account.backToPlace']}</Button
      >

      <div class="settings">
        <button
          type="button"
          class="settings-toggle"
          aria-expanded={settingsOpen}
          onclick={() => (settingsToggled = !settingsOpen)}
        >
          {data.copy['account.settingsHeading']}
        </button>
        {#if settingsOpen}
          <div class="settings-body grid gap-context">
            <Panel
              as="section"
              padded
              class="identity grid gap-panel min-w-0"
              aria-labelledby="identity-heading"
            >
              <h2 id="identity-heading">{data.copy['account.identityHeading']}</h2>
              <dl>
                <div>
                  <dt>{data.copy['account.emailIdentity']}</dt>
                  <dd>{data.member.email || data.copy['account.emailUnavailable']}</dd>
                </div>
                <div>
                  <dt>{data.copy['account.providerIdentity']}</dt>
                  <dd>{providerLabel(data.member.provider)}</dd>
                </div>
                <div>
                  <dt>{data.copy['account.memberSince']}</dt>
                  <dd>{formatLocalizedDate(data.member.createdAt, data.lang)}</dd>
                </div>
              </dl>
            </Panel>

            <form method="POST" action="?/signOut" use:enhance={enhanceAction}>
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
              <h2 id="deletion-heading">{data.copy['account.deletionHeading']}</h2>
              <p>{data.copy['account.deletionExplanation']}</p>
              {#if deletionRequested}
                <Notice tone="success" as="p" class="account-message" role="status">
                  {data.copy['account.deletionRequested']}
                </Notice>
              {:else if !deletionArmed}
                <Button type="button" intent="danger-quiet" onclick={() => (deletionArmed = true)}>
                  {data.copy['account.requestDeletion']}
                </Button>
              {:else}
                <form method="POST" action="?/requestDeletion" use:enhance={enhanceAction}>
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
  :global(.account-shell) {
    display: grid;
    min-height: calc(100dvh - 5.5rem);
    place-items: start center;
  }

  :global(.account-card) {
    width: min(100%, 42rem);
    padding: clamp(var(--hv-space-context), 5vw, 2.5rem);
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  form {
    display: grid;
    gap: 0.65rem;
  }

  /* Button owns its own disabled treatment, which differs from this page's dimmed-fade look;
     the hook keeps the fade for the two migrated Buttons (sign out, confirm deletion) that had
     it before. Both render through Button (a child component), so the hook class needs
     :global() to reach the element it lands on. */
  :global(.disabled-fade):disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* Renders through Notice (a child component), so the hook class needs :global(). Page-unique
     name: bare :global(.message) leaked this typography into the moderation review panels'
     message Notices whenever this route's CSS was loaded first. */
  :global(.account-message) {
    margin: 0;
    font-weight: 700;
    line-height: 1.45;
  }

  /* Identity ledger: label left, value right, hairline between - the same shape the impact
     record uses for its own label/value lists. The two-column grid it replaced put a long
     email on its own wrapped line while short values floated mid-panel. */
  dl {
    display: grid;
    margin: 0;
    gap: 0;
  }

  dl div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.25rem;
    justify-content: space-between;
    align-items: baseline;
    padding-block: 0.75rem;
    border-bottom: 1px solid var(--hv-border-subtle);
  }

  /* Both end rows keep their padding, so the list sits evenly inside the panel instead of
     hugging the bottom edge while the top has the heading's breathing room. */
  dl div:first-of-type {
    padding-top: 0.35rem;
  }

  dl div:last-of-type {
    padding-bottom: 0.35rem;
    border-bottom: 0;
  }

  dt {
    color: var(--hv-color-basalt-muted);
    font-size: 0.88rem;
    font-weight: 750;
  }

  dd {
    margin: 0;
    font-weight: 850;
    overflow-wrap: anywhere;
    text-align: end;
  }

  :global(.identity) {
    padding: clamp(1.35rem, 3.2vw, 1.9rem);
  }

  :global(.account-destination) {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    transition:
      border-color var(--hv-fade-quick) ease,
      background-color var(--hv-fade-quick) ease;
  }

  :global(.account-destination) h2,
  :global(.account-destination) p {
    margin: 0;
  }

  :global(.account-destination) p {
    margin-top: 0.4rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.45;
  }

  :global(.account-destination) .destination-fact {
    color: var(--hv-color-basalt);
    font-size: 0.92rem;
    font-weight: 800;
  }

  /* Paired cards stretch to the row's tallest sibling; the auto margin pins each card's
     control to the bottom edge so the pair reads aligned. The preceding paragraph owns the
     minimum gap, because an auto margin collapses to zero in a content-sized card. .card-link
     now renders through Button (a child component), so it needs its own :global() alongside
     the already-global .account-destination ancestor. */
  :global(.account-destination) :global(.card-link),
  .destination-links {
    margin-top: auto;
  }

  :global(.account-destination) p:last-of-type {
    margin-bottom: var(--hv-space-panel);
  }

  /* The whole card is one link target: the card's single control stretches an invisible hit
     area across the panel. Cards with several destinations (impact, contributions) stay
     button-only, so a card never looks tappable while routing only part of its surface. */
  :global(.account-destination[data-linked]) :global(.card-link)::after {
    position: absolute;
    inset: 0;
    border-radius: var(--hv-radius-panel);
    content: '';
  }

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

  :global(.account-destination.trusted-verification) {
    --impact-tone: var(--hv-color-fjord);

    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .impact-icon,
  .trusted-verification-icon {
    display: grid;
    width: 2.8rem;
    height: 2.8rem;
    place-items: center;
  }

  /* Read top to bottom: the subject, the count, the evidence, the way in. These rules sit
     after the shared .account-destination p rules on purpose - equal specificity, later
     source order, so the figure and the proof strip keep their own margins. */
  .impact-topline {
    display: flex;
    gap: 0.7rem;
    align-items: center;
  }

  /* The figure reads as one line of text rather than a display numeral: at 3rem+ it fought
     the title, which is indented behind its icon. Sized closer to the label, the row scans as
     one statement on the same left edge as the proof strip and the actions below. */
  p.impact-headline {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.5rem;
    align-items: baseline;
    margin-top: 0.75rem;
    color: var(--hv-color-moss-ink);
  }

  p.impact-headline strong {
    margin-left: -0.03em;
    font-family: var(--hv-font-display);
    font-size: 2.15rem;
    font-weight: 950;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  p.impact-headline span {
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.3;
  }

  /* The proof sits in its own tinted strip, so one real outcome reads as evidence rather than
     as a third paragraph of card copy. */
  p.impact-proof {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    margin-top: 0.95rem;
    margin-bottom: 0;
    padding: 0.65rem 0.8rem;
    border-radius: var(--hv-radius-control);
    background: color-mix(in srgb, var(--hv-color-moss) 9%, white);
    color: var(--hv-color-basalt);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .proof-mark {
    display: grid;
    width: 1.35rem;
    height: 1.35rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--hv-color-moss) 22%, white);
    color: var(--hv-color-moss-ink);
    font-size: 0.72rem;
    font-weight: 950;
  }

  .proof-date {
    display: block;
    margin-top: 0.1rem;
    color: var(--hv-color-basalt-muted);
    font-weight: 750;
  }

  .impact-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem 1.1rem;
    align-items: center;
    margin-top: var(--hv-space-panel);
  }

  /* The secondary door to recognition. A quiet text link, not a second button: the card leads
     with one primary destination, and this line is forward-looking on purpose - a goal, never
     a streak. */
  .achievements-nudge {
    color: var(--hv-color-moss-ink);
    font-size: 0.88rem;
    font-weight: 850;
    line-height: 1.35;
    text-decoration: none;
    text-wrap: pretty;
  }

  .achievements-nudge:hover {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .achievements-nudge:focus-visible {
    border-radius: var(--hv-radius-control);
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }

  :global(.account-destination.moderation) {
    background: var(--hv-color-fjord-soft);
  }

  /* Renders through Button (a child component), so the layout hook needs :global(). */
  :global(.discovery-link) {
    display: inline-flex;
    justify-self: start;
  }

  .settings {
    border-top: 1px solid var(--hv-border-subtle);
    padding-top: var(--hv-space-panel);
  }

  .settings-toggle {
    width: fit-content;
    min-height: 0;
    border: 0;
    background: transparent;
    padding: 0;
    color: var(--hv-color-fjord);
    font-weight: 900;
    cursor: pointer;
    text-decoration: underline;
  }

  .settings-toggle:focus-visible {
    border-radius: var(--hv-radius-control);
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }

  .settings-body {
    margin-top: var(--hv-space-panel);
  }

  :global(.deletion) p {
    color: var(--hv-color-basalt-muted);
    line-height: 1.5;
  }

  @media (max-width: 32rem) {
    :global(.account-card) {
      padding: var(--hv-space-context);
    }
  }
</style>
