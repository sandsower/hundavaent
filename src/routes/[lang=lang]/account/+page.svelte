<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { SubmitFunction } from '@sveltejs/kit';

  import { formatLocalizedDate } from '$i18n/date';
  import ImpactPillarIcon from '$lib/impact/ImpactPillarIcon.svelte';
  import WeeklyRhythmTrail from '$lib/member-activity/WeeklyRhythmTrail.svelte';
  import type { WeeklyRhythmHistory } from '$lib/member-activity/types';

  import type { AccountFacts } from './+page.server';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let settingsOpen = $state(false);
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

<main
  class="account-shell hv-page-shell"
  data-ui-mode="place"
  data-width="narrow"
  data-motion="tokenized"
>
  {#if data.member}
    <section class="account-card hv-panel hv-stack" aria-labelledby="account-title">
      <header class="hv-page-header">
        <p class="eyebrow hv-eyebrow">{data.copy['site.name']}</p>
        <h1 class="hv-page-title" id="account-title">{data.copy['account.signedInTitle']}</h1>
        <p class="intro hv-meta">{data.copy['account.signedInIntro']}</p>
      </header>

      {#if errorCode}
        <p class="message error hv-notice" data-tone="error" role="alert">
          {errorCode === 'authentication_required'
            ? data.copy['account.authenticationRequired']
            : data.copy['account.authUnavailable']}
        </p>
      {/if}

      <WeeklyRhythmTrail
        history={weeklyRhythmHistory}
        lang={data.lang}
        copy={data.copy}
        achievementsHref={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}
        achievementsLabel={achievementsDoorLabel}
      />

      <div class="account-home hv-stack">
        <section
          class="account-destination impact hv-panel hv-list-card"
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
                <span class="hv-status">{data.copy['account.newBadge']}</span>
              {/if}
            </div>
            <p>{data.copy['account.impactIntro']}</p>
            <a
              class="hv-control card-link"
              href={resolve('/[lang=lang]/account/impact', { lang: data.lang })}
            >
              {data.copy['account.impactLink']}
            </a>
          </div>
        </section>

        {#if trustedVerification.status === 'available'}
          <section
            class="account-destination trusted-verification hv-panel hv-list-card"
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
              <a
                class="hv-control card-link"
                href={resolve('/[lang=lang]/account/keep-current', { lang: data.lang })}
              >
                {data.copy['account.trustedVerificationLink']}
              </a>
            </div>
          </section>
        {/if}

        <section
          class="account-destination places hv-panel hv-list-card"
          data-linked
          aria-labelledby="places-heading"
        >
          <h2 id="places-heading">{data.copy['account.placesHeading']}</h2>
          {#if placesFact}
            <p class="destination-fact">{placesFact}</p>
          {/if}
          <p>{data.copy['account.placesIntro']}</p>
          <a
            class="hv-control card-link"
            href={resolve('/[lang=lang]/history', { lang: data.lang })}
          >
            {data.copy['account.placesLink']}
          </a>
        </section>

        <section
          class="account-destination contributions hv-panel hv-list-card"
          aria-labelledby="contributions-heading"
        >
          <h2 id="contributions-heading">{data.copy['account.contributionsHeading']}</h2>
          {#each suggestionFacts as factLine (factLine)}
            <p class="destination-fact">{factLine}</p>
          {/each}
          <p>{data.copy['account.contributionsIntro']}</p>
          <div class="destination-links hv-page-actions">
            <a
              class="hv-control"
              data-intent="primary"
              href={resolve('/[lang=lang]/suggest', { lang: data.lang })}
            >
              {data.copy['suggestion.nav']}
            </a>
            <a
              class="hv-control"
              href={resolve('/[lang=lang]/account/suggestions', { lang: data.lang })}
            >
              {data.copy['suggestion.myTitle']}
            </a>
          </div>
        </section>

        {#if data.canModerate}
          <section
            class="account-destination moderation hv-panel hv-list-card"
            data-linked
            aria-labelledby="moderation-heading"
          >
            <h2 id="moderation-heading">{data.copy['account.moderationHeading']}</h2>
            <p>{data.copy['account.moderationIntro']}</p>
            <a
              class="hv-control card-link"
              href={resolve('/[lang=lang]/moderation', { lang: data.lang })}
            >
              {data.copy['account.moderationLink']}
            </a>
          </section>
        {/if}
      </div>

      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="back-link discovery-link hv-control" href={data.returnTo}
        >{data.copy['account.backToPlace']}</a
      >

      <div class="settings">
        <button
          type="button"
          class="settings-toggle"
          aria-expanded={settingsOpen}
          onclick={() => (settingsOpen = !settingsOpen)}
        >
          {data.copy['account.settingsHeading']}
        </button>
        {#if settingsOpen}
          <div class="settings-body hv-stack">
            <section class="identity hv-form-section hv-panel" aria-labelledby="identity-heading">
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
            </section>

            <form method="POST" action="?/signOut" use:enhance={enhanceAction}>
              <input type="hidden" name="returnTo" value={data.returnTo} />
              <button class="secondary hv-control" type="submit" disabled={submitting}
                >{data.copy['account.signOut']}</button
              >
            </form>

            <section class="deletion hv-form-section hv-panel" aria-labelledby="deletion-heading">
              <h2 id="deletion-heading">{data.copy['account.deletionHeading']}</h2>
              <p>{data.copy['account.deletionExplanation']}</p>
              {#if deletionRequested}
                <p class="message success hv-notice" data-tone="success" role="status">
                  {data.copy['account.deletionRequested']}
                </p>
              {:else if !deletionArmed}
                <button
                  type="button"
                  class="danger hv-control"
                  onclick={() => (deletionArmed = true)}
                >
                  {data.copy['account.requestDeletion']}
                </button>
              {:else}
                <form method="POST" action="?/requestDeletion" use:enhance={enhanceAction}>
                  <div class="deletion-actions hv-page-actions">
                    <button class="danger hv-control" type="submit" disabled={submitting}>
                      {data.copy['account.confirmDeletion']}
                    </button>
                    <button
                      type="button"
                      class="secondary hv-control"
                      onclick={() => (deletionArmed = false)}
                    >
                      {data.copy['account.keepAccount']}
                    </button>
                  </div>
                </form>
              {/if}
            </section>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</main>

<style>
  .account-shell {
    display: grid;
    min-height: calc(100dvh - 5.5rem);
    place-items: start center;
  }

  .account-card {
    width: min(100%, 42rem);
    padding: clamp(var(--hv-space-context), 5vw, 2.5rem);
  }

  .eyebrow {
    margin: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  .intro {
    max-width: 46ch;
  }

  form {
    display: grid;
    gap: 0.65rem;
  }

  dt {
    font-weight: 850;
  }

  button,
  .back-link {
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .secondary,
  .back-link {
    border-color: var(--hv-color-fjord);
    color: var(--hv-color-fjord);
  }

  .danger {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-snow-raised);
    color: var(--hv-color-danger);
  }

  .message {
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

  .account-destination {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    transition:
      border-color var(--hv-fade-quick) ease,
      background-color var(--hv-fade-quick) ease;
  }

  .account-destination h2,
  .account-destination p {
    margin: 0;
  }

  .account-destination p {
    margin-top: 0.4rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.45;
  }

  .account-destination .destination-fact {
    color: var(--hv-color-basalt);
    font-size: 0.92rem;
    font-weight: 800;
  }

  /* Paired cards stretch to the row's tallest sibling; the auto margin pins each card's
     control to the bottom edge so the pair reads aligned. The preceding paragraph owns the
     minimum gap, because an auto margin collapses to zero in a content-sized card. */
  .account-destination .card-link,
  .destination-links {
    margin-top: auto;
  }

  .account-destination p:last-of-type {
    margin-bottom: var(--hv-space-panel);
  }

  /* The whole card is one link target: the card's single control stretches an invisible hit
     area across the panel. Cards with several destinations (contributions) stay button-only,
     so a card never looks tappable while routing only part of its surface. */
  .account-destination[data-linked] .card-link::after {
    position: absolute;
    inset: 0;
    border-radius: var(--hv-radius-panel);
    content: '';
  }

  .account-destination[data-linked]:focus-within {
    border-color: color-mix(in srgb, var(--hv-color-fjord) 55%, var(--hv-border-subtle));
  }

  @media (hover: hover) {
    .account-destination[data-linked]:hover {
      border-color: color-mix(in srgb, var(--hv-color-fjord) 55%, var(--hv-border-subtle));
      background-color: color-mix(in srgb, var(--hv-color-fjord) 4%, var(--hv-color-snow-raised));
    }
  }

  /* Impact is the one featured card; every other destination renders as a plain panel so the
     accent actually directs attention instead of competing with two other tinted cards. */
  .account-destination.impact {
    --impact-tone: var(--hv-color-moss);

    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    border-color: color-mix(in srgb, var(--hv-color-moss) 30%, var(--hv-border-subtle));
    background: linear-gradient(105deg, rgb(79 143 104 / 12%) 0%, var(--hv-color-snow-raised) 38%);
  }

  .account-destination.trusted-verification {
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

  .account-destination.moderation {
    background: var(--hv-color-fjord-soft);
  }

  .discovery-link {
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

  .deletion p {
    color: var(--hv-color-basalt-muted);
    line-height: 1.5;
  }

  @media (max-width: 32rem) {
    .account-card {
      padding: var(--hv-space-context);
    }

    dl div {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
  }
</style>
