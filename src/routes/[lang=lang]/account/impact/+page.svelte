<script lang="ts">
  import { resolve } from '$app/paths';

  import AchievementIcon from '$lib/achievements/AchievementIcon.svelte';
  import ImpactPillarIcon from '$lib/impact/ImpactPillarIcon.svelte';
  import WeeklyRhythmTrail from '$lib/member-activity/WeeklyRhythmTrail.svelte';
  import { formatLocalizedDate } from '$i18n/date';
  import type { MessageKey } from '$i18n';
  import { collectionName, tierDisplayName } from '$lib/achievements/tier-copy';
  import type {
    EarnedAchievement,
    LockedTierAchievement,
    MyAchievement
  } from '$server/achievements/achievements';
  import type {
    ImpactContributionKind,
    ImpactOutcome,
    ImpactPlaceAvailability
  } from '$server/impact/impact-record';

  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const trustedVerificationFeedback = $derived(
    (
      data as typeof data & {
        trustedVerificationFeedback?:
          | {
              status: 'available';
              value: {
                hasUnread: boolean;
                latestConfirmedAt: string | null;
                latestTaskKind: 'access_freshness' | 'dog_amenities' | null;
                latestPlaceId: string | null;
              };
            }
          | { status: 'unavailable' };
      }
    ).trustedVerificationFeedback ?? ({ status: 'unavailable' } as const)
  );

  const number = (value: number): string => new Intl.NumberFormat(data.lang).format(value);
  const contributionKindKey = (kind: ImpactContributionKind): MessageKey =>
    `impact.outcome.kind.${kind}` as MessageKey;
  const availabilityKey = (availability: ImpactPlaceAvailability): MessageKey =>
    `impact.outcome.availability.${availability}` as MessageKey;
  const contributorKey = (status: string): MessageKey =>
    `contributor.status.${status}` as MessageKey;
  // A tier carries no copy of its own, so its label is composed from its collection and tier.
  const achievementName = (achievement: MyAchievement): string =>
    achievement.entry === 'tier'
      ? tierDisplayName(collectionName(achievement, data.lang), achievement.tier, data.copy)
      : data.lang === 'is'
        ? achievement.nameIs
        : achievement.nameEn;
  const outcomeName = (outcome: ImpactOutcome): string =>
    outcome.placeName ?? data.copy['impact.outcome.placeUnavailable'];
  const placeHref = (placeId: string): string =>
    `/${data.lang}?place=${encodeURIComponent(placeId)}`;

  // This strip shows four items. The catalogue read is deliberately uncapped, so the selection rule
  // lives here rather than depending on a database cap: at most two started tiers, closest to
  // closing first, then the most recently earned Achievements to fill the remaining slots. Without
  // an explicit cap, twelve locked tiers would fill the strip and hide every earned Achievement.
  const STRIP_SIZE = 4;
  const STRIP_MAX_UPCOMING = 2;

  const visibleAchievements = $derived.by(() => {
    if (data.achievements.status !== 'available' || !data.achievements.value.enabled) return [];

    const upcoming = data.achievements.value.achievements
      .filter(
        (achievement): achievement is LockedTierAchievement =>
          achievement.kind === 'locked' && achievement.progress.current > 0
      )
      .toSorted(
        (left, right) =>
          right.progress.current / right.progress.target -
          left.progress.current / left.progress.target
      )
      .slice(0, STRIP_MAX_UPCOMING);

    const recentEarned = data.achievements.value.achievements
      .filter((achievement): achievement is EarnedAchievement => achievement.kind === 'earned')
      .toSorted((left, right) => Date.parse(right.earnedAt) - Date.parse(left.earnedAt))
      .slice(0, Math.max(0, STRIP_SIZE - upcoming.length));

    return [...recentEarned, ...upcoming];
  });
</script>

<svelte:head>
  <title>{data.copy['impact.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main
  class="impact-shell hv-page-shell hv-stack"
  data-ui-mode="place"
  data-width="wide"
  data-impact-record
>
  <header class="impact-hero hv-panel" aria-labelledby="impact-title">
    <div class="hero-mark" aria-hidden="true">
      <ImpactPillarIcon kind="recognition" />
      <span class="orbit orbit-one"></span>
      <span class="orbit orbit-two"></span>
    </div>
    <div class="hero-copy">
      <p class="hv-eyebrow">{data.copy['impact.eyebrow']}</p>
      <h1 class="hv-page-title" id="impact-title">{data.copy['impact.title']}</h1>
      <p class="intro">{data.copy['impact.intro']}</p>
      <p class="private-note">
        <span aria-hidden="true">●</span>
        {data.copy['impact.privateNote']}
      </p>
    </div>
    <p class="member-since">
      {data.copy['impact.memberSince'].replace(
        '{date}',
        formatLocalizedDate(data.impact.memberSince, data.lang)
      )}
    </p>
  </header>

  {#if trustedVerificationFeedback.status === 'available' && trustedVerificationFeedback.value.hasUnread && trustedVerificationFeedback.value.latestConfirmedAt}
    <section
      class="trusted-celebration hv-panel"
      aria-labelledby="trusted-celebration-title"
      data-testid="trusted-verification-celebration"
    >
      <div class="trusted-celebration-mark" aria-hidden="true">
        <ImpactPillarIcon
          kind={trustedVerificationFeedback.value.latestTaskKind === 'access_freshness'
            ? 'knowledge'
            : 'contribution'}
        />
        <span class="spark spark-one"></span>
        <span class="spark spark-two"></span>
        <span class="spark spark-three"></span>
      </div>
      <div>
        <p class="hv-eyebrow">{data.copy['impact.trustedCelebrationEyebrow']}</p>
        <h2 id="trusted-celebration-title">{data.copy['impact.trustedCelebrationTitle']}</h2>
        <p>{data.copy['impact.trustedCelebrationBody']}</p>
        <div class="trusted-celebration-actions">
          {#if trustedVerificationFeedback.value.latestPlaceId}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a class="hv-control" href={placeHref(trustedVerificationFeedback.value.latestPlaceId)}>
              {data.copy['impact.trustedCelebrationOpenPlace']}
            </a>
          {/if}
          <form method="POST" action="?/markTrustedVerificationRead">
            <input
              type="hidden"
              name="readThrough"
              value={trustedVerificationFeedback.value.latestConfirmedAt}
            />
            <button class="hv-control" data-intent="primary" type="submit">
              {data.copy['impact.trustedCelebrationAcknowledge']}
            </button>
          </form>
        </div>
      </div>
    </section>
  {/if}

  <section class="pillar-grid" aria-label={data.copy['impact.pillarsLabel']}>
    <article class="pillar rhythm hv-panel" data-impact-pillar="rhythm">
      <header class="pillar-heading">
        <ImpactPillarIcon kind="rhythm" />
        <div>
          <p class="hv-eyebrow">{data.copy['impact.pillar.rhythm.eyebrow']}</p>
          <h2>{data.copy['impact.pillar.rhythm.title']}</h2>
        </div>
      </header>
      <p class="pillar-intro">{data.copy['impact.pillar.rhythm.body']}</p>
      <dl class="metrics two-up">
        <div>
          <dt>{data.copy['impact.metric.activeWeeks']}</dt>
          <dd>{number(data.impact.activeWeeks)}</dd>
        </div>
        <div>
          <dt>{data.copy['impact.metric.activeMonths']}</dt>
          <dd>{number(data.impact.activeMonths)}</dd>
        </div>
      </dl>
      <WeeklyRhythmTrail history={data.rhythm} lang={data.lang} copy={data.copy} />
    </article>

    <article class="pillar exploration hv-panel" data-impact-pillar="exploration">
      <header class="pillar-heading">
        <ImpactPillarIcon kind="exploration" />
        <div>
          <p class="hv-eyebrow">{data.copy['impact.pillar.exploration.eyebrow']}</p>
          <h2>{data.copy['impact.pillar.exploration.title']}</h2>
        </div>
      </header>
      <p class="pillar-intro">{data.copy['impact.pillar.exploration.body']}</p>
      <dl class="metrics">
        <div>
          <dt>{data.copy['impact.metric.places']}</dt>
          <dd>{number(data.impact.creditedPlaces)}</dd>
        </div>
        <div>
          <dt>{data.copy['impact.metric.categoryGroups']}</dt>
          <dd>{number(data.impact.creditedCategoryGroups)}</dd>
        </div>
        <div>
          <dt>{data.copy['impact.metric.municipalities']}</dt>
          <dd>{number(data.impact.creditedMunicipalities)}</dd>
        </div>
      </dl>
      <p class="integrity-note">{data.copy['impact.explorationIntegrity']}</p>
    </article>

    <article class="pillar knowledge hv-panel" data-impact-pillar="knowledge">
      <header class="pillar-heading">
        <ImpactPillarIcon kind="knowledge" />
        <div>
          <p class="hv-eyebrow">{data.copy['impact.pillar.knowledge.eyebrow']}</p>
          <h2>{data.copy['impact.pillar.knowledge.title']}</h2>
        </div>
      </header>
      <p class="pillar-intro">{data.copy['impact.pillar.knowledge.body']}</p>
      <dl class="metrics two-up">
        <div>
          <dt>{data.copy['impact.metric.validRatings']}</dt>
          <dd>{number(data.impact.validRatings)}</dd>
        </div>
        <div>
          <dt>{data.copy['impact.metric.submissions']}</dt>
          <dd>{number(data.impact.submissionsTotal)}</dd>
        </div>
      </dl>
      <dl class="outcome-summary">
        <div>
          <dt>{data.copy['impact.metric.pending']}</dt>
          <dd>{number(data.impact.pendingSubmissions)}</dd>
        </div>
        <div>
          <dt>{data.copy['impact.metric.rejected']}</dt>
          <dd>{number(data.impact.rejectedSubmissions)}</dd>
        </div>
        <div>
          <dt>{data.copy['impact.metric.resolved']}</dt>
          <dd>{number(data.impact.resolvedWithoutContribution)}</dd>
        </div>
      </dl>
    </article>

    <article class="pillar contribution hv-panel" data-impact-pillar="contribution">
      <header class="pillar-heading">
        <ImpactPillarIcon kind="contribution" />
        <div>
          <p class="hv-eyebrow">{data.copy['impact.pillar.contribution.eyebrow']}</p>
          <h2>{data.copy['impact.pillar.contribution.title']}</h2>
        </div>
      </header>
      <p class="pillar-intro">{data.copy['impact.pillar.contribution.body']}</p>
      <dl class="metrics two-up">
        <div>
          <dt>{data.copy['impact.metric.confirmed']}</dt>
          <dd>{number(data.impact.confirmedContributions)}</dd>
        </div>
        <div class="muted-metric">
          <dt>{data.copy['impact.metric.revoked']}</dt>
          <dd>{number(data.impact.revokedContributions)}</dd>
        </div>
      </dl>
      {#if data.contributor.status === 'available'}
        <div class="status-line">
          <span>{data.copy['impact.currentStatus']}</span>
          <strong
            class="hv-status"
            data-status={data.contributor.value.status === 'trusted_contributor'
              ? 'verified'
              : undefined}
          >
            {data.copy[contributorKey(data.contributor.value.status)]}
          </strong>
        </div>
      {:else}
        <p class="integrity-note">{data.copy['impact.statusUnavailable']}</p>
      {/if}
    </article>
  </section>

  <section class="recognition hv-panel" aria-labelledby="recognition-title">
    <header class="section-heading">
      <ImpactPillarIcon kind="recognition" size="small" />
      <div>
        <p class="hv-eyebrow">{data.copy['impact.recognitionEyebrow']}</p>
        <h2 id="recognition-title">{data.copy['impact.recognitionTitle']}</h2>
        <p>{data.copy['impact.recognitionIntro']}</p>
      </div>
    </header>

    {#if visibleAchievements.length > 0}
      <ul class="achievement-strip hv-list">
        {#each visibleAchievements as achievement (achievement.key)}
          <li>
            <span class="achievement-icon" aria-hidden="true">
              <AchievementIcon
                achievementKey={achievement.key}
                collection={achievement.entry === 'tier' ? achievement.collection : null}
                group={achievement.group}
              />
            </span>
            <span>
              <strong>{achievementName(achievement)}</strong>
              <small>
                {achievement.kind === 'earned'
                  ? data.copy['impact.recognitionEarned']
                  : data.copy['impact.recognitionNext']}
              </small>
            </span>
          </li>
        {/each}
      </ul>
    {:else if data.achievements.status === 'unavailable'}
      <p class="integrity-note">{data.copy['impact.achievementsUnavailable']}</p>
    {:else if !data.achievements.value.enabled}
      <p class="integrity-note">{data.copy['impact.achievementsDisabled']}</p>
    {:else}
      <p class="integrity-note">{data.copy['impact.achievementsEmpty']}</p>
    {/if}

    <a
      class="hv-control recognition-link"
      href={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}
    >
      {data.copy['impact.achievementsLink']}
    </a>
  </section>

  <section class="outcomes hv-stack" aria-labelledby="outcomes-title">
    <header class="section-heading">
      <ImpactPillarIcon kind="outcome" size="small" />
      <div>
        <p class="hv-eyebrow">{data.copy['impact.outcomesEyebrow']}</p>
        <h2 id="outcomes-title">{data.copy['impact.outcomesTitle']}</h2>
        <p>{data.copy['impact.outcomesIntro']}</p>
      </div>
    </header>

    {#if data.impact.recentOutcomes.length > 0}
      <ol class="outcome-list hv-list">
        {#each data.impact.recentOutcomes as outcome (outcome.contributionId)}
          <li class="outcome-card hv-panel" data-outcome-state={outcome.state}>
            <div class="outcome-mark" aria-hidden="true">
              {outcome.state === 'confirmed' ? '✓' : '↺'}
            </div>
            <div class="outcome-copy">
              <p class="outcome-kicker">
                <span
                  class="hv-status"
                  data-status={outcome.state === 'confirmed' ? 'verified' : undefined}
                >
                  {outcome.state === 'confirmed'
                    ? data.copy['impact.outcome.confirmed']
                    : data.copy['impact.outcome.revoked']}
                </span>
                <span>{data.copy[contributionKindKey(outcome.kind)]}</span>
              </p>
              <h3>{outcomeName(outcome)}</h3>
              <p class="outcome-date">
                {data.copy[
                  outcome.state === 'revoked'
                    ? 'impact.outcome.date.revoked'
                    : 'impact.outcome.date.confirmed'
                ].replace(
                  '{date}',
                  formatLocalizedDate(outcome.revokedAt ?? outcome.confirmedAt, data.lang)
                )}
              </p>
              <p class="availability">
                {data.copy[availabilityKey(outcome.availability)]}
              </p>
              {#if outcome.successorPlaceId && outcome.successorName && outcome.successorAvailable}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <a class="successor-link" href={placeHref(outcome.successorPlaceId)}>
                  {data.copy['impact.outcome.successor'].replace('{name}', outcome.successorName)}
                </a>
              {:else if outcome.successorPlaceId && outcome.successorName}
                <p class="successor-note">
                  {data.copy['impact.outcome.successorUnavailable'].replace(
                    '{name}',
                    outcome.successorName
                  )}
                </p>
              {:else if outcome.subjectPlaceId && outcome.availability === 'available'}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <a class="successor-link" href={placeHref(outcome.subjectPlaceId)}>
                  {data.copy['impact.outcome.openPlace']}
                </a>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="empty hv-notice" data-tone="info">{data.copy['impact.outcomesEmpty']}</p>
    {/if}
  </section>

  <a class="back-link hv-control" href={resolve('/[lang=lang]/account', { lang: data.lang })}>
    {data.copy['account.navSignedIn']}
  </a>
</main>

<style>
  .impact-shell {
    --impact-rhythm: var(--hv-color-fjord);
    --impact-exploration: #287a5d;
    --impact-knowledge: #a0651b;
    --impact-contribution: #8a4e72;
    max-width: 72rem;
  }

  .impact-hero {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: clamp(1rem, 3vw, 2rem);
    align-items: center;
    overflow: hidden;
    padding: clamp(1.35rem, 5vw, 3rem);
    border-color: color-mix(in srgb, var(--hv-color-moss) 28%, var(--hv-border-subtle));
    background: linear-gradient(
      135deg,
      rgb(79 143 104 / 14%) 0%,
      var(--hv-color-snow-raised) 38%,
      rgb(248 251 246) 100%
    );
  }

  .trusted-celebration {
    --impact-tone: var(--hv-color-moss);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: clamp(1rem, 3vw, 1.8rem);
    align-items: center;
    overflow: hidden;
    border-color: color-mix(in srgb, var(--hv-color-moss) 38%, var(--hv-border-subtle));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--hv-color-moss) 16%, var(--hv-color-snow-raised)) 0%,
      var(--hv-color-snow-raised) 30%
    );
  }

  .trusted-celebration h2,
  .trusted-celebration p {
    margin: 0;
  }

  .trusted-celebration > div:last-child {
    display: grid;
    gap: 0.45rem;
  }

  .trusted-celebration-mark {
    position: relative;
    display: grid;
    width: 4.5rem;
    height: 4.5rem;
    place-items: center;
    animation: trusted-confirmed 680ms cubic-bezier(0.2, 0.95, 0.25, 1.2) both;
  }

  .spark {
    position: absolute;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--hv-color-brand-paw);
    animation: trusted-spark 820ms 140ms ease-out both;
  }

  .spark-one {
    top: 0.15rem;
    right: 0.55rem;
  }

  .spark-two {
    right: 0;
    bottom: 0.75rem;
    animation-delay: 220ms;
  }

  .spark-three {
    bottom: 0.2rem;
    left: 0.45rem;
    animation-delay: 300ms;
  }

  .trusted-celebration-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 0.45rem;
  }

  @keyframes trusted-confirmed {
    from {
      opacity: 0;
      transform: translateY(0.75rem) rotate(-8deg) scale(0.72);
    }
    to {
      opacity: 1;
      transform: translateY(0) rotate(0) scale(1);
    }
  }

  @keyframes trusted-spark {
    from {
      opacity: 0;
      transform: scale(0.2);
    }
    55% {
      opacity: 1;
      transform: scale(1.35);
    }
    to {
      opacity: 0.75;
      transform: scale(1);
    }
  }

  .hero-mark {
    --impact-tone: var(--hv-color-moss);
    position: relative;
    display: grid;
    place-items: center;
    width: 5.5rem;
    height: 5.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .trusted-celebration-mark,
    .spark {
      animation: none;
    }
  }

  .hero-mark :global(.impact-icon) {
    position: relative;
    z-index: 1;
  }

  .orbit {
    position: absolute;
    border: 1px solid color-mix(in srgb, var(--hv-color-moss) 34%, transparent);
    border-radius: 999px;
  }

  .orbit-one {
    inset: 0;
  }

  .orbit-two {
    inset: 0.65rem;
    border-style: dashed;
  }

  .hero-copy h1,
  .hero-copy p,
  .pillar-heading p,
  .pillar-heading h2,
  .section-heading p,
  .section-heading h2 {
    margin: 0;
  }

  .hero-copy {
    display: grid;
    gap: 0.45rem;
  }

  .intro {
    max-width: 55ch;
    color: var(--hv-color-basalt-muted);
    font-size: 1.05rem;
    line-height: 1.55;
  }

  .private-note {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
    margin-top: 0.35rem;
    color: var(--hv-color-moss-ink);
    font-size: 0.9rem;
    font-weight: 800;
  }

  .private-note span {
    color: var(--hv-color-moss);
    font-size: 0.6rem;
  }

  .member-since {
    align-self: start;
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .pillar-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .pillar {
    display: grid;
    align-content: start;
    gap: 1rem;
    padding: clamp(1.2rem, 3vw, 1.75rem);
    border-top: 0.3rem solid var(--impact-tone);
  }

  .pillar.rhythm {
    --impact-tone: var(--impact-rhythm);
  }

  .pillar.exploration {
    --impact-tone: var(--impact-exploration);
  }

  .pillar.knowledge {
    --impact-tone: var(--impact-knowledge);
  }

  .pillar.contribution {
    --impact-tone: var(--impact-contribution);
  }

  .pillar-heading,
  .section-heading {
    display: flex;
    gap: 0.85rem;
    align-items: center;
  }

  .pillar-heading h2,
  .section-heading h2 {
    font-family: var(--hv-font-display);
    font-size: clamp(1.25rem, 3vw, 1.65rem);
  }

  .pillar-intro,
  .section-heading div > p:last-child {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    line-height: 1.5;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
    margin: 0;
  }

  .metrics.two-up {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metrics div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.9rem;
    border-radius: var(--hv-radius-control);
    background: color-mix(in srgb, var(--impact-tone) 8%, var(--hv-color-snow-raised));
  }

  .metrics dt {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
    line-height: 1.25;
  }

  .metrics dd {
    margin: 0;
    color: color-mix(in srgb, var(--impact-tone) 78%, black);
    font-family: var(--hv-font-display);
    font-size: clamp(1.7rem, 5vw, 2.4rem);
    font-weight: 900;
    line-height: 1;
  }

  .metrics .muted-metric dd {
    color: var(--hv-color-basalt-muted);
  }

  .outcome-summary {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }

  .outcome-summary div,
  .status-line {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: center;
    padding-block: 0.45rem;
    border-bottom: 1px solid var(--hv-border-subtle);
  }

  .outcome-summary dt,
  .status-line > span {
    color: var(--hv-color-basalt-muted);
    font-size: 0.88rem;
  }

  .outcome-summary dd {
    margin: 0;
    font-weight: 900;
  }

  .integrity-note {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.83rem;
    line-height: 1.45;
  }

  .recognition {
    --impact-tone: var(--hv-color-moss);
    display: grid;
    gap: 1rem;
    padding: clamp(1.2rem, 3vw, 1.75rem);
    background: color-mix(in srgb, var(--hv-color-moss) 5%, var(--hv-color-snow-raised));
  }

  .achievement-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .achievement-strip li {
    display: flex;
    min-width: 0;
    gap: 0.6rem;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
  }

  .achievement-strip strong,
  .achievement-strip small {
    display: block;
  }

  .achievement-strip strong {
    line-height: 1.2;
  }

  .achievement-strip small {
    margin-top: 0.2rem;
    color: var(--hv-color-basalt-muted);
  }

  .achievement-icon {
    width: 2rem;
    height: 2rem;
  }

  .recognition-link,
  .back-link {
    justify-self: start;
  }

  .outcomes {
    --impact-tone: var(--hv-color-fjord);
  }

  .outcome-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .outcome-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 1rem;
  }

  .outcome-card[data-outcome-state='revoked'] {
    background: color-mix(in srgb, var(--hv-color-basalt-muted) 4%, var(--hv-color-snow-raised));
  }

  .outcome-mark {
    display: grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--hv-color-moss) 14%, white);
    color: var(--hv-color-moss-ink);
    font-weight: 950;
  }

  [data-outcome-state='revoked'] .outcome-mark {
    background: color-mix(in srgb, var(--hv-color-basalt-muted) 12%, white);
    color: var(--hv-color-basalt-muted);
  }

  .outcome-copy {
    min-width: 0;
  }

  .outcome-copy h3,
  .outcome-copy p {
    margin: 0;
  }

  .outcome-copy h3 {
    margin-top: 0.4rem;
    font-family: var(--hv-font-display);
    font-size: 1.1rem;
  }

  .outcome-kicker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
  }

  .outcome-date,
  .availability {
    margin-top: 0.25rem !important;
    color: var(--hv-color-basalt-muted);
    font-size: 0.83rem;
  }

  .successor-link,
  .successor-note {
    display: inline-block;
    margin-top: 0.55rem;
    font-size: 0.88rem;
    font-weight: 850;
  }

  .successor-link {
    color: var(--hv-color-fjord);
  }

  .successor-note {
    color: var(--hv-color-basalt-muted);
  }

  @media (prefers-reduced-motion: no-preference) {
    .hero-mark {
      animation: arrive 650ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    .orbit-one {
      animation: orbit 18s linear infinite;
    }

    .orbit-two {
      animation: orbit 24s linear infinite reverse;
    }

    .pillar {
      animation: rise 500ms ease-out both;
    }

    .pillar:nth-child(2) {
      animation-delay: 60ms;
    }

    .pillar:nth-child(3) {
      animation-delay: 120ms;
    }

    .pillar:nth-child(4) {
      animation-delay: 180ms;
    }
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: scale(0.82) rotate(-8deg);
    }
  }

  @keyframes orbit {
    to {
      transform: rotate(1turn);
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(0.6rem);
    }
  }

  @media (max-width: 50rem) {
    .impact-hero {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .member-since {
      grid-column: 2;
    }

    .pillar-grid {
      grid-template-columns: 1fr;
    }

    .achievement-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 34rem) {
    .impact-hero {
      grid-template-columns: 1fr;
    }

    .hero-mark {
      width: 4.5rem;
      height: 4.5rem;
    }

    .member-since {
      grid-column: auto;
      white-space: normal;
    }

    .metrics {
      grid-template-columns: 1fr;
    }

    .metrics.two-up,
    .achievement-strip {
      grid-template-columns: 1fr 1fr;
    }

    .outcome-list {
      grid-template-columns: 1fr;
    }

    .achievement-strip li {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (max-width: 24rem) {
    .metrics.two-up,
    .achievement-strip {
      grid-template-columns: 1fr;
    }
  }
</style>
