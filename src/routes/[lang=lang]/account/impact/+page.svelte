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
  const primaryConfirmedLabel = $derived(
    data.impact.confirmedContributions === 1
      ? data.copy['impact.primaryConfirmedOne']
      : data.copy['impact.primaryConfirmed']
  );
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

  const earnedAchievements = $derived(
    visibleAchievements.filter(
      (achievement): achievement is EarnedAchievement => achievement.kind === 'earned'
    )
  );
  const upcomingAchievements = $derived(
    visibleAchievements.filter(
      (achievement): achievement is LockedTierAchievement => achievement.kind === 'locked'
    )
  );
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
  <a
    class="top-back-link"
    data-impact-back
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
  >
    <span aria-hidden="true">←</span>
    {data.copy['account.navSignedIn']}
  </a>

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
    <aside
      class="impact-summary"
      data-impact-summary
      aria-label={`${number(data.impact.confirmedContributions)} ${primaryConfirmedLabel}`}
    >
      <strong>{number(data.impact.confirmedContributions)}</strong>
      <span>{primaryConfirmedLabel}</span>
      <small>
        {data.copy['impact.memberSince'].replace(
          '{date}',
          formatLocalizedDate(data.impact.memberSince, data.lang)
        )}
      </small>
    </aside>
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

  <section class="outcomes hv-stack" aria-labelledby="outcomes-title" data-impact-outcomes>
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
            <div class="outcome-primary">
              <span
                class="hv-status"
                data-status={outcome.state === 'confirmed' ? 'verified' : undefined}
              >
                {outcome.state === 'confirmed'
                  ? data.copy['impact.outcome.confirmed']
                  : data.copy['impact.outcome.revoked']}
              </span>
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
            </div>
            <div class="outcome-context">
              <p class="outcome-kind">{data.copy[contributionKindKey(outcome.kind)]}</p>
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

  <section
    class="participation hv-stack"
    aria-labelledby="participation-title"
    data-impact-participation
  >
    <header class="section-heading participation-heading">
      <ImpactPillarIcon kind="rhythm" size="small" />
      <div>
        <p class="hv-eyebrow">{data.copy['impact.participationEyebrow']}</p>
        <h2 id="participation-title">{data.copy['impact.participationTitle']}</h2>
        <p>{data.copy['impact.participationIntro']}</p>
      </div>
    </header>

    <div class="pillar-grid" aria-label={data.copy['impact.pillarsLabel']}>
      <details class="pillar rhythm hv-panel" data-impact-pillar="rhythm">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="rhythm" />
            <span>
              <span class="hv-eyebrow">{data.copy['impact.pillar.rhythm.eyebrow']}</span>
              <span class="pillar-title" role="heading" aria-level="3">
                {data.copy['impact.pillar.rhythm.title']}
              </span>
            </span>
          </span>
          <span class="pillar-snapshot" data-pillar-snapshot>
            <span>
              <strong>{number(data.impact.activeWeeks)}</strong>
              <small>{data.copy['impact.metric.activeWeeks']}</small>
            </span>
            <span>
              <strong>{number(data.impact.activeMonths)}</strong>
              <small>{data.copy['impact.metric.activeMonths']}</small>
            </span>
          </span>
          <span class="summary-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="pillar-detail">
          <p class="pillar-intro">{data.copy['impact.pillar.rhythm.body']}</p>
          <WeeklyRhythmTrail history={data.rhythm} lang={data.lang} copy={data.copy} />
        </div>
      </details>

      <details class="pillar exploration hv-panel" data-impact-pillar="exploration">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="exploration" />
            <span>
              <span class="hv-eyebrow">{data.copy['impact.pillar.exploration.eyebrow']}</span>
              <span class="pillar-title" role="heading" aria-level="3">
                {data.copy['impact.pillar.exploration.title']}
              </span>
            </span>
          </span>
          <span class="pillar-snapshot" data-pillar-snapshot>
            <span>
              <strong>{number(data.impact.creditedPlaces)}</strong>
              <small>{data.copy['impact.metric.places']}</small>
            </span>
          </span>
          <span class="summary-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="pillar-detail">
          <p class="pillar-intro">{data.copy['impact.pillar.exploration.body']}</p>
          <dl class="metrics two-up">
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
        </div>
      </details>

      <details class="pillar knowledge hv-panel" data-impact-pillar="knowledge">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="knowledge" />
            <span>
              <span class="hv-eyebrow">{data.copy['impact.pillar.knowledge.eyebrow']}</span>
              <span class="pillar-title" role="heading" aria-level="3">
                {data.copy['impact.pillar.knowledge.title']}
              </span>
            </span>
          </span>
          <span class="pillar-snapshot" data-pillar-snapshot>
            <span>
              <strong>{number(data.impact.validRatings)}</strong>
              <small>{data.copy['impact.metric.validRatings']}</small>
            </span>
          </span>
          <span class="summary-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="pillar-detail">
          <p class="pillar-intro">{data.copy['impact.pillar.knowledge.body']}</p>
          <dl class="metrics">
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
        </div>
      </details>

      <details class="pillar contribution hv-panel" data-impact-pillar="contribution">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="contribution" />
            <span>
              <span class="hv-eyebrow">{data.copy['impact.pillar.contribution.eyebrow']}</span>
              <span class="pillar-title" role="heading" aria-level="3">
                {data.copy['impact.pillar.contribution.title']}
              </span>
            </span>
          </span>
          <span class="pillar-snapshot" data-pillar-snapshot>
            <span>
              <strong>{number(data.impact.confirmedContributions)}</strong>
              <small>{data.copy['impact.metric.confirmed']}</small>
            </span>
          </span>
          <span class="summary-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div class="pillar-detail">
          <p class="pillar-intro">{data.copy['impact.pillar.contribution.body']}</p>
          <dl class="metrics">
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
          <!-- Outside the availability branch: this is the only navigation entry to the status
               page, and its own load handles a degraded status fact. -->
          <a
            class="hv-control status-detail-link"
            href={resolve('/[lang=lang]/account/contributor-status', { lang: data.lang })}
          >
            {data.copy['contributor.nav']}
          </a>
        </div>
      </details>
    </div>
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
      <div class="achievement-groups">
        {#if earnedAchievements.length > 0}
          <section class="achievement-group" data-achievement-kind="earned">
            <h3>{data.copy['impact.recognitionEarned']}</h3>
            <ul class="achievement-strip hv-list">
              {#each earnedAchievements as achievement (achievement.key)}
                <li>
                  <span class="achievement-icon" aria-hidden="true">
                    <AchievementIcon
                      achievementKey={achievement.key}
                      collection={achievement.entry === 'tier' ? achievement.collection : null}
                      group={achievement.group}
                    />
                  </span>
                  <strong>{achievementName(achievement)}</strong>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if upcomingAchievements.length > 0}
          <section class="achievement-group" data-achievement-kind="upcoming">
            <h3>{data.copy['impact.recognitionNext']}</h3>
            <ul class="achievement-strip hv-list">
              {#each upcomingAchievements as achievement (achievement.key)}
                <li>
                  <span class="achievement-icon" aria-hidden="true">
                    <AchievementIcon
                      achievementKey={achievement.key}
                      collection={achievement.collection}
                      group={achievement.group}
                    />
                  </span>
                  <span class="achievement-copy">
                    <strong>{achievementName(achievement)}</strong>
                    <progress
                      aria-label={achievementName(achievement)}
                      max={achievement.progress.target}
                      value={achievement.progress.current}
                    ></progress>
                    <small>
                      {number(achievement.progress.current)} / {number(achievement.progress.target)}
                    </small>
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
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

  .top-back-link {
    display: inline-flex;
    justify-self: start;
    gap: 0.45rem;
    align-items: center;
    color: var(--hv-color-fjord);
    font-size: 0.9rem;
    font-weight: 850;
    text-decoration: none;
  }

  .top-back-link:hover {
    text-decoration: underline;
    text-underline-offset: 0.2em;
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

  .impact-summary {
    display: grid;
    min-width: 11.5rem;
    gap: 0.25rem;
    align-self: stretch;
    align-content: center;
    padding-left: clamp(1rem, 2.5vw, 2rem);
    border-left: 1px solid color-mix(in srgb, var(--hv-color-moss) 25%, transparent);
  }

  .impact-summary strong {
    color: var(--hv-color-moss-ink);
    font-family: var(--hv-font-display);
    font-size: clamp(3rem, 7vw, 4.75rem);
    font-weight: 950;
    line-height: 0.9;
  }

  .impact-summary span {
    max-width: 15ch;
    color: var(--hv-color-moss-ink);
    font-size: 0.9rem;
    font-weight: 850;
    line-height: 1.2;
  }

  .impact-summary small {
    max-width: 19ch;
    margin-top: 0.55rem;
    color: var(--hv-color-basalt-muted);
    font-size: 0.76rem;
    line-height: 1.35;
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
    /* Moves and fades, so it runs as two entries, one per family (see tokens.css): reduced
       motion stills the tumble while the mark keeps appearing. */
    animation:
      trusted-confirmed var(--hv-motion-celebrate) var(--hv-ease-overshoot) both,
      trusted-appears var(--hv-fade-considered) var(--hv-ease-settle) both;
  }

  .spark {
    position: absolute;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--hv-color-brand-paw);
    animation:
      trusted-spark var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 3)
        var(--hv-ease-settle) both,
      trusted-spark-glints var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 3)
        var(--hv-ease-settle) both;
  }

  .spark-one {
    top: 0.15rem;
    right: 0.55rem;
  }

  .spark-two {
    right: 0;
    bottom: 0.75rem;
    animation-delay: calc(var(--hv-motion-stagger) * 4);
  }

  .spark-three {
    bottom: 0.2rem;
    left: 0.45rem;
    animation-delay: calc(var(--hv-motion-stagger) * 6);
  }

  .trusted-celebration-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 0.45rem;
  }

  @keyframes trusted-confirmed {
    from {
      transform: translateY(0.75rem) rotate(-8deg) scale(0.72);
    }
    to {
      transform: translateY(0) rotate(0) scale(1);
    }
  }

  @keyframes trusted-appears {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes trusted-spark {
    from {
      transform: scale(0.2);
    }
    55% {
      transform: scale(1.35);
    }
    to {
      transform: scale(1);
    }
  }

  @keyframes trusted-spark-glints {
    from {
      opacity: 0;
    }
    55% {
      opacity: 1;
    }
    to {
      opacity: 0.75;
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

  .participation {
    --impact-tone: var(--hv-color-fjord);
  }

  .pillar-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .pillar {
    overflow: clip;
    padding: 0;
    border-top: 0.3rem solid var(--impact-tone);
  }

  .pillar summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 1rem;
    align-items: center;
    padding: clamp(1rem, 2.5vw, 1.35rem);
    cursor: pointer;
    list-style: none;
  }

  .pillar summary::-webkit-details-marker {
    display: none;
  }

  .pillar summary:focus-visible {
    border-radius: calc(var(--hv-radius-panel) - 2px);
    outline: 3px solid color-mix(in srgb, var(--impact-tone) 38%, transparent);
    outline-offset: -3px;
  }

  .pillar[open] summary {
    border-bottom: 1px solid var(--hv-border-subtle);
    background: color-mix(in srgb, var(--impact-tone) 4%, var(--hv-color-snow-raised));
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
    min-width: 0;
    gap: 0.85rem;
    align-items: center;
  }

  .section-heading h2 {
    font-family: var(--hv-font-display);
    font-size: clamp(1.25rem, 3vw, 1.65rem);
  }

  .pillar-heading > span:last-child {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .pillar-title {
    font-family: var(--hv-font-display);
    font-size: clamp(1.15rem, 2vw, 1.4rem);
    font-weight: 900;
    line-height: 1.1;
  }

  .pillar-snapshot {
    display: flex;
    gap: 0.55rem;
    justify-content: flex-end;
  }

  .pillar-snapshot > span {
    display: grid;
    min-width: 5.25rem;
    gap: 0.15rem;
    padding: 0.65rem 0.8rem;
    border-radius: var(--hv-radius-control);
    background: color-mix(in srgb, var(--impact-tone) 8%, var(--hv-color-snow-raised));
  }

  .pillar-snapshot strong {
    color: color-mix(in srgb, var(--impact-tone) 78%, black);
    font-family: var(--hv-font-display);
    font-size: 1.65rem;
    font-weight: 950;
    line-height: 0.9;
  }

  .pillar-snapshot small {
    color: var(--hv-color-basalt-muted);
    font-size: 0.7rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .summary-chevron {
    color: var(--impact-tone);
    font-size: 1.45rem;
    font-weight: 900;
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  .pillar[open] .summary-chevron {
    transform: rotate(180deg);
  }

  .pillar-detail {
    display: grid;
    gap: 1rem;
    padding: clamp(1rem, 2.5vw, 1.35rem);
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

  .achievement-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .achievement-group {
    display: grid;
    min-width: 0;
    gap: 0.65rem;
    align-content: start;
  }

  .achievement-group h3 {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .achievement-strip {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .achievement-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 0.25rem;
  }

  .achievement-strip small {
    color: var(--hv-color-basalt-muted);
  }

  .achievement-strip progress {
    width: 100%;
    height: 0.45rem;
    overflow: hidden;
    border: 0;
    border-radius: 999px;
    accent-color: var(--hv-color-moss);
    background: color-mix(in srgb, var(--hv-color-moss) 14%, white);
  }

  .achievement-strip progress::-webkit-progress-bar {
    border-radius: 999px;
    background: color-mix(in srgb, var(--hv-color-moss) 14%, white);
  }

  .achievement-strip progress::-webkit-progress-value {
    border-radius: 999px;
    background: var(--hv-color-moss);
  }

  .achievement-icon {
    width: 2rem;
    height: 2rem;
  }

  .recognition-link,
  .back-link {
    justify-self: start;
  }

  .status-detail-link {
    justify-self: start;
    margin-top: 0.8rem;
  }

  .outcomes {
    --impact-tone: var(--hv-color-fjord);
  }

  .outcome-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: 1fr;
    gap: 0.65rem;
  }

  .outcome-list > li:first-child {
    background: color-mix(in srgb, var(--hv-color-moss) 4%, var(--hv-color-snow-raised));
  }

  .outcome-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1.15fr) minmax(14rem, 0.85fr);
    gap: clamp(0.8rem, 2.5vw, 1.35rem);
    align-items: start;
    min-height: 7.15rem;
    padding: 0.95rem 1.05rem;
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

  .outcome-primary,
  .outcome-context {
    min-width: 0;
  }

  .outcome-primary h3,
  .outcome-primary p,
  .outcome-context p {
    margin: 0;
  }

  .outcome-primary h3 {
    margin-top: 0.4rem;
    font-family: var(--hv-font-display);
    font-size: 1.1rem;
  }

  .outcome-context {
    display: flex;
    height: 100%;
    flex-direction: column;
    align-items: flex-start;
  }

  .outcome-kind {
    color: var(--hv-color-basalt-muted);
    font-size: 0.78rem;
    font-weight: 750;
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
    margin-top: auto;
    padding-top: 0.55rem;
    font-size: 0.88rem;
    font-weight: 850;
  }

  .successor-link {
    color: var(--hv-color-fjord);
  }

  .successor-note {
    color: var(--hv-color-basalt-muted);
  }

  .hero-mark {
    animation:
      arrive var(--hv-motion-celebrate) var(--hv-ease-settle) both,
      hero-appears var(--hv-fade-considered) var(--hv-ease-settle) both;
  }

  /* The orbits are scenery that runs indefinitely, so they ride the ambient token. Ambient sits
     outside the reduce contract on purpose - an infinite animation at zero duration restarts
     every frame - so reduced motion stops them here instead. */
  .orbit-one {
    animation: orbit var(--hv-motion-ambient) linear infinite;
  }

  .orbit-two {
    animation: orbit calc(var(--hv-motion-ambient) * 4 / 3) linear infinite reverse;
  }

  @media (prefers-reduced-motion: reduce) {
    .orbit-one,
    .orbit-two {
      animation: none;
    }
  }

  /* The pillars carry text, so their rise is transform-only: words arrive at full contrast
     and move into place (see the fade-family limit in tokens.css). */
  .pillar {
    animation: rise var(--hv-motion-celebrate) var(--hv-ease-settle) both;
  }

  .pillar:nth-child(2) {
    animation-delay: var(--hv-motion-stagger);
  }

  .pillar:nth-child(3) {
    animation-delay: calc(var(--hv-motion-stagger) * 2);
  }

  .pillar:nth-child(4) {
    animation-delay: calc(var(--hv-motion-stagger) * 3);
  }

  @keyframes arrive {
    from {
      transform: scale(0.82) rotate(-8deg);
    }
  }

  @keyframes hero-appears {
    from {
      opacity: 0;
    }
  }

  @keyframes orbit {
    to {
      transform: rotate(1turn);
    }
  }

  @keyframes rise {
    from {
      transform: translateY(0.6rem);
    }
  }

  @media (max-width: 50rem) {
    .pillar-grid {
      grid-template-columns: 1fr;
    }

    .outcome-list {
      grid-auto-rows: auto;
    }

    .outcome-card {
      grid-template-columns: auto minmax(0, 1fr);
      min-height: 0;
    }

    .outcome-context {
      grid-column: 2;
    }

    .achievement-groups {
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

    .impact-summary {
      min-width: 0;
      padding-top: 1rem;
      padding-left: 0;
      border-top: 1px solid color-mix(in srgb, var(--hv-color-moss) 25%, transparent);
      border-left: 0;
    }

    .impact-summary span,
    .impact-summary small {
      max-width: none;
    }

    .hero-mark {
      width: 4.5rem;
      height: 4.5rem;
    }

    .pillar summary {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .pillar-snapshot {
      grid-column: 1 / -1;
      grid-row: 2;
      justify-content: flex-start;
    }

    .summary-chevron {
      grid-column: 2;
      grid-row: 1;
    }

    .metrics {
      grid-template-columns: 1fr;
    }

    .metrics.two-up,
    .achievement-strip {
      grid-template-columns: 1fr 1fr;
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
