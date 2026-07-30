<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import {
    Button,
    Eyebrow,
    Meta,
    Notice,
    PageHeader,
    PageShell,
    PageTitle,
    Panel,
    Status
  } from '@hundavaent/design-system';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { formatLocalizedDate } from '$i18n/date';
  import ImpactPillarIcon from '$lib/impact/ImpactPillarIcon.svelte';
  import WeeklyRhythmTrail from '$lib/member-activity/WeeklyRhythmTrail.svelte';
  import type { WeeklyRhythmHistory } from '$lib/member-activity/types';

  import type { AccountFacts } from './+page.server';
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
  const weeklyRhythmHistory = $derived(
    (
      data as typeof data & {
        weeklyRhythmHistory?: WeeklyRhythmHistory;
      }
    ).weeklyRhythmHistory ?? ({ status: 'unavailable' } as const)
  );
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

  // The door teases only when the nudge is true: one qualifying action away from the nearest
  // tier, with progress already underway. Everything else keeps the plain label - three rounds
  // of copy showed that any attempt to surface the mechanics here confuses more than it helps.
  const achievementsDoorLabel = $derived.by(() => {
    const fact = accountFacts.achievements;
    if (
      fact.status === 'available' &&
      fact.next &&
      fact.next.current > 0 &&
      fact.next.target - fact.next.current === 1
    ) {
      return data.copy['account.achievementsClose'];
    }
    return data.copy['achievements.nav'];
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
        <Eyebrow>{data.copy['site.name']}</Eyebrow>
        <PageTitle id="account-title">{data.copy['account.signedInTitle']}</PageTitle>
        <Meta class="account-intro">{data.copy['account.signedInIntro']}</Meta>
      </PageHeader>

      {#if errorCode}
        <Notice tone="error" as="p" class="account-message" role="alert">
          {errorCode === 'authentication_required'
            ? data.copy['account.authenticationRequired']
            : data.copy['account.authUnavailable']}
        </Notice>
      {/if}

      <WeeklyRhythmTrail
        history={weeklyRhythmHistory}
        lang={data.lang}
        copy={data.copy}
        achievementsHref={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}
        achievementsLabel={achievementsDoorLabel}
      />

      <div class="account-home grid gap-context">
        <Panel
          as="section"
          padded
          class="account-destination impact"
          data-linked
          aria-labelledby="impact-heading"
        >
          <span class="impact-icon" aria-hidden="true">
            <ImpactPillarIcon kind="recognition" size="small" />
          </span>
          <div>
            <div class="destination-heading">
              <h2 id="impact-heading">{data.copy['account.impactHeading']}</h2>
              {#if trustedVerificationFeedback.status === 'available' && trustedVerificationFeedback.value.hasUnread}
                <Status>{data.copy['account.newBadge']}</Status>
              {/if}
            </div>
            <p>{data.copy['account.impactIntro']}</p>
            <Button
              href={resolve('/[lang=lang]/account/impact', { lang: data.lang })}
              class="card-link"
            >
              {data.copy['account.impactLink']}
            </Button>
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

  :global(.account-intro) {
    max-width: 46ch;
  }

  form {
    display: grid;
    gap: 0.65rem;
  }

  dt {
    font-weight: 850;
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

  dl {
    display: grid;
    margin: 0;
    gap: var(--hv-space-panel);
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(8rem, 0.45fr) 1fr;
    gap: 0.8rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
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
     area across the panel. Cards with several destinations (contributions) stay button-only,
     so a card never looks tappable while routing only part of its surface. .card-link now
     renders through Button, so it needs its own :global() too; the positioned ancestor stays
     .account-destination (position: relative, above), unaffected by the Button migration. */
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
     accent actually directs attention instead of competing with two other tinted cards. */
  :global(.account-destination.impact) {
    --impact-tone: var(--hv-color-moss);

    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
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

  .destination-heading {
    display: flex;
    gap: 0.65rem;
    align-items: center;
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

    dl div {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
  }
</style>
