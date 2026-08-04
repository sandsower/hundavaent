<script lang="ts">
  import { resolve } from '$app/paths';

  import AchievementBadge from '$lib/achievements/AchievementBadge.svelte';
  import ImpactPillarIcon from '$lib/impact/ImpactPillarIcon.svelte';
  import WeeklyRhythmTrail from '$lib/member-activity/WeeklyRhythmTrail.svelte';
  import {
    Button,
    Eyebrow,
    Notice,
    Panel,
    PageShell,
    PageTitle,
    Status
  } from '@hundavaent/design-system';
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

<PageShell class="impact-shell grid gap-context" data-impact-record>
  <a
    class="top-back-link"
    data-impact-back
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
  >
    <span aria-hidden="true">←</span>
    {data.copy['account.navSignedIn']}
  </a>

  <Panel as="header" class="impact-hero" aria-labelledby="impact-title">
    <div class="hero-mark" aria-hidden="true">
      <ImpactPillarIcon kind="recognition" />
      <span class="orbit orbit-one"></span>
      <span class="orbit orbit-two"></span>
    </div>
    <div class="hero-copy">
      <PageTitle id="impact-title">{data.copy['impact.title']}</PageTitle>
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
  </Panel>

  {#if trustedVerificationFeedback.status === 'available' && trustedVerificationFeedback.value.hasUnread && trustedVerificationFeedback.value.latestConfirmedAt}
    <Panel
      as="section"
      class="trusted-celebration"
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
        <Eyebrow>{data.copy['impact.trustedCelebrationEyebrow']}</Eyebrow>
        <h2 id="trusted-celebration-title">{data.copy['impact.trustedCelebrationTitle']}</h2>
        <p>{data.copy['impact.trustedCelebrationBody']}</p>
        <div class="trusted-celebration-actions">
          {#if trustedVerificationFeedback.value.latestPlaceId}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <Button href={placeHref(trustedVerificationFeedback.value.latestPlaceId)}>
              {data.copy['impact.trustedCelebrationOpenPlace']}
            </Button>
          {/if}
          <form method="POST" action="?/markTrustedVerificationRead">
            <input
              type="hidden"
              name="readThrough"
              value={trustedVerificationFeedback.value.latestConfirmedAt}
            />
            <Button intent="primary" type="submit">
              {data.copy['impact.trustedCelebrationAcknowledge']}
            </Button>
          </form>
        </div>
      </div>
    </Panel>
  {/if}

  <section class="outcomes grid gap-context" aria-labelledby="outcomes-title" data-impact-outcomes>
    <header class="section-heading">
      <ImpactPillarIcon kind="outcome" size="small" />
      <div>
        <h2 id="outcomes-title">{data.copy['impact.outcomesTitle']}</h2>
        <p>{data.copy['impact.outcomesIntro']}</p>
      </div>
    </header>

    {#if data.impact.recentOutcomes.length > 0}
      <ol class="outcome-list grid gap-context m-0 p-0 list-none">
        {#each data.impact.recentOutcomes as outcome (outcome.contributionId)}
          <Panel as="li" class="outcome-card" data-outcome-state={outcome.state}>
            <div class="outcome-mark" aria-hidden="true">
              {outcome.state === 'confirmed' ? '✓' : '↺'}
            </div>
            <div class="outcome-primary">
              <Status tone={outcome.state === 'confirmed' ? 'verified' : undefined}>
                {outcome.state === 'confirmed'
                  ? data.copy['impact.outcome.confirmed']
                  : data.copy['impact.outcome.revoked']}
              </Status>
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
          </Panel>
        {/each}
      </ol>
    {:else}
      <Notice tone="info" as="p" class="empty">{data.copy['impact.outcomesEmpty']}</Notice>
    {/if}
  </section>

  <section
    class="participation grid gap-context"
    aria-labelledby="participation-title"
    data-impact-participation
  >
    <header class="section-heading participation-heading">
      <ImpactPillarIcon kind="rhythm" size="small" />
      <div>
        <h2 id="participation-title">{data.copy['impact.participationTitle']}</h2>
        <p>{data.copy['impact.participationIntro']}</p>
      </div>
    </header>

    <div class="pillar-grid" aria-label={data.copy['impact.pillarsLabel']}>
      <Panel as="details" class="pillar rhythm" data-impact-pillar="rhythm">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="rhythm" />
            <span>
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
      </Panel>

      <Panel as="details" class="pillar exploration" data-impact-pillar="exploration">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="exploration" />
            <span>
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
      </Panel>

      <Panel as="details" class="pillar knowledge" data-impact-pillar="knowledge">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="knowledge" />
            <span>
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
      </Panel>

      <Panel as="details" class="pillar contribution" data-impact-pillar="contribution">
        <summary>
          <span class="pillar-heading">
            <ImpactPillarIcon kind="contribution" />
            <span>
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
          <!-- The row itself is the door to the status page. It sits outside the availability
               branch: this is the only navigation entry, and its own load handles a degraded
               status fact. -->
          <a
            class="status-line"
            href={resolve('/[lang=lang]/account/contributor-status', { lang: data.lang })}
          >
            <span>{data.copy['impact.currentStatus']}</span>
            <span class="status-line-value">
              {#if data.contributor.status === 'available'}
                <Status
                  tone={data.contributor.value.status === 'trusted_contributor'
                    ? 'verified'
                    : undefined}
                >
                  {data.copy[contributorKey(data.contributor.value.status)]}
                </Status>
              {/if}
              <span class="status-line-chevron" aria-hidden="true">→</span>
            </span>
          </a>
          {#if data.contributor.status !== 'available'}
            <p class="integrity-note">{data.copy['impact.statusUnavailable']}</p>
          {/if}
        </div>
      </Panel>
    </div>
  </section>

  <Panel as="section" class="recognition" aria-labelledby="recognition-title">
    <header class="section-heading">
      <ImpactPillarIcon kind="recognition" size="small" />
      <div>
        <h2 id="recognition-title">{data.copy['impact.recognitionTitle']}</h2>
        <p>{data.copy['impact.recognitionIntro']}</p>
      </div>
    </header>

    {#if visibleAchievements.length > 0}
      <div class="achievement-groups">
        {#if earnedAchievements.length > 0}
          <section class="achievement-group" data-achievement-kind="earned">
            <h3>{data.copy['impact.recognitionEarned']}</h3>
            <ul class="achievement-strip grid gap-context m-0 p-0 list-none">
              {#each earnedAchievements as achievement (achievement.key)}
                <li>
                  <span class="achievement-icon" aria-hidden="true">
                    <AchievementBadge
                      achievementKey={achievement.key}
                      collection={achievement.entry === 'tier' ? achievement.collection : null}
                      group={achievement.group}
                      tier={achievement.entry === 'tier' ? achievement.tier : null}
                      state="earned"
                      progress={1}
                    />
                  </span>
                  <span class="achievement-copy"
                    ><strong>{achievementName(achievement)}</strong></span
                  >
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if upcomingAchievements.length > 0}
          <section class="achievement-group" data-achievement-kind="upcoming">
            <h3>{data.copy['impact.recognitionNext']}</h3>
            <ul class="achievement-strip grid gap-context m-0 p-0 list-none">
              {#each upcomingAchievements as achievement (achievement.key)}
                <li>
                  <span class="achievement-icon" aria-hidden="true">
                    <AchievementBadge
                      achievementKey={achievement.key}
                      collection={achievement.collection}
                      group={achievement.group}
                      tier={achievement.tier}
                      state="started"
                      progress={achievement.progress.current / achievement.progress.target}
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

    <Button
      href={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}
      intent="quiet"
      class="recognition-link"
    >
      {data.copy['impact.achievementsLink']}
    </Button>
  </Panel>

  <Button
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
    intent="quiet"
    class="impact-back-link"
  >
    {data.copy['account.navSignedIn']}
  </Button>
</PageShell>

<style>
  /* .impact-shell now lives on PageShell's class prop: the literal element never appears in
     this template, so the selector needs :global to survive scoping (the Notice-precedent
     pattern already used below for .hero-mark :global(.impact-icon)). */
  :global(.impact-shell) {
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

  /* Re-anchored: .impact-hero now sits on the header Panel's class prop. */
  :global(.impact-hero) {
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

  /* The headline number is the page's whole point, so the block gets one measure and one left
     edge: the numeral is optically aligned to the text below it (a lining digit's side bearing
     otherwise leaves it looking indented), and the provenance caption sits under a rule rather
     than floating as a third ragged paragraph. */
  .impact-summary {
    display: grid;
    min-width: 13rem;
    max-width: 15.5rem;
    align-self: stretch;
    align-content: center;
    padding-left: clamp(1.25rem, 3vw, 2.25rem);
    border-left: 1px solid color-mix(in srgb, var(--hv-color-moss) 25%, transparent);
  }

  .impact-summary strong {
    margin-left: -0.055em;
    color: var(--hv-color-moss-ink);
    font-family: var(--hv-font-display);
    font-size: clamp(3.25rem, 6vw, 4.5rem);
    font-weight: 950;
    line-height: 0.85;
    letter-spacing: -0.03em;
  }

  .impact-summary span {
    max-width: none;
    margin-top: 0.45rem;
    color: var(--hv-color-moss-ink);
    font-size: 0.92rem;
    font-weight: 850;
    line-height: 1.25;
    text-wrap: pretty;
  }

  .impact-summary small {
    max-width: none;
    margin-top: 0.85rem;
    padding-top: 0.7rem;
    border-top: 1px solid color-mix(in srgb, var(--hv-color-moss) 22%, transparent);
    color: var(--hv-color-basalt-muted);
    font-size: 0.76rem;
    line-height: 1.4;
    text-wrap: pretty;
  }

  /* Re-anchored: .trusted-celebration now sits on the section Panel's class prop. */
  :global(.trusted-celebration) {
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

  :global(.trusted-celebration) h2,
  :global(.trusted-celebration) p {
    margin: 0;
  }

  :global(.trusted-celebration) > div:last-child {
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

  /* .hero-copy h1 dropped: the title is now PageTitle, which owns its own m-0 already, and no
     literal h1 remains in this template for the selector to match. */
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

  /* Each pillar keeps its own height. Grid otherwise stretched a closed pillar to match the
     open one beside it, which reads as a large empty card rather than as whitespace. */
  .pillar-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: start;
  }

  /* Re-anchored: .pillar (and its per-kind modifiers) now sit on each details Panel's class
     prop, so every selector rooted on it needs :global; summary/the chevron stay literal local
     elements and keep their normal scoping. */
  :global(.pillar) {
    overflow: clip;
    padding: 0;
    border-top: 0.3rem solid var(--impact-tone);
  }

  :global(.pillar) summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 1rem;
    align-items: center;
    padding: clamp(1rem, 2.5vw, 1.35rem);
    cursor: pointer;
    list-style: none;
  }

  :global(.pillar) summary::-webkit-details-marker {
    display: none;
  }

  :global(.pillar) summary:focus-visible {
    border-radius: calc(var(--hv-radius-panel) - 2px);
    outline: 3px solid color-mix(in srgb, var(--impact-tone) 38%, transparent);
    outline-offset: -3px;
  }

  :global(.pillar[open]) summary {
    border-bottom: 1px solid var(--hv-border-subtle);
    background: color-mix(in srgb, var(--impact-tone) 4%, var(--hv-color-snow-raised));
  }

  :global(.pillar.rhythm) {
    --impact-tone: var(--impact-rhythm);
  }

  :global(.pillar.exploration) {
    --impact-tone: var(--impact-exploration);
  }

  :global(.pillar.knowledge) {
    --impact-tone: var(--impact-knowledge);
  }

  :global(.pillar.contribution) {
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

  /* One chip shape for all four pillars. The labels run from "active weeks" to "confirmed
     useful", so letting each chip size to its own text gave four cards with four different chip
     widths and no shared edge - a fixed width and centred content line the numerals up across
     the grid instead, and stretch keeps the rhythm pillar's pair matched when one label wraps. */
  .pillar-snapshot {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    align-items: stretch;
  }

  .pillar-snapshot > span {
    display: grid;
    width: 7rem;
    flex: 0 0 auto;
    gap: 0.35rem;
    align-content: center;
    justify-items: center;
    padding: 0.8rem 0.75rem;
    border-radius: var(--hv-radius-control);
    background: color-mix(in srgb, var(--impact-tone) 8%, var(--hv-color-snow-raised));
    text-align: center;
  }

  .pillar-snapshot strong {
    color: color-mix(in srgb, var(--impact-tone) 78%, black);
    font-family: var(--hv-font-display);
    font-size: 1.55rem;
    font-weight: 950;
    line-height: 1;
  }

  /* Two label lines are always reserved, so a chip whose label wraps stays the same height as
     one whose label does not - the pair in the rhythm pillar and the two cards in each row all
     match. */
  .pillar-snapshot small {
    display: grid;
    min-height: 2.5em;
    place-content: center;
    color: var(--hv-color-basalt-muted);
    font-size: 0.7rem;
    font-weight: 750;
    line-height: 1.25;
    text-wrap: balance;
  }

  .summary-chevron {
    color: var(--impact-tone);
    font-size: 1.45rem;
    font-weight: 900;
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  :global(.pillar[open]) .summary-chevron {
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

  /* The metric tiles read the same way round as the snapshot chips - figure first, label under
     it, centred - so the page has one stat treatment instead of two. The dl keeps dt before dd
     for semantics; column-reverse only swaps the paint order. A lone metric sizes to a sensible
     tile rather than taking a third of the row or stretching across the whole of it. */
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
    margin: 0;
  }

  .metrics:has(> div:only-child) {
    grid-template-columns: minmax(9rem, 13rem);
  }

  .metrics.two-up {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metrics div {
    display: flex;
    min-width: 0;
    flex-direction: column-reverse;
    gap: 0.45rem;
    align-items: center;
    justify-content: center;
    padding: 1.05rem 0.9rem;
    border-radius: var(--hv-radius-control);
    background: color-mix(in srgb, var(--impact-tone) 8%, var(--hv-color-snow-raised));
    text-align: center;
  }

  .metrics dt {
    display: grid;
    min-height: 2.5em;
    place-content: center;
    color: var(--hv-color-basalt-muted);
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.25;
    text-wrap: balance;
  }

  .metrics dd {
    margin: 0;
    color: color-mix(in srgb, var(--impact-tone) 78%, black);
    font-family: var(--hv-font-display);
    font-size: clamp(1.9rem, 4vw, 2.2rem);
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

  /* The status row is itself the door to the contributor-status page; it keeps .status-line's
     shared layout rule above. */
  .status-line {
    color: inherit;
    text-decoration: none;
  }

  .status-line-value {
    display: flex;
    gap: 0.55rem;
    align-items: center;
  }

  .status-line-chevron {
    color: var(--hv-color-fjord);
    font-weight: 900;
    transition: transform var(--hv-motion-quick) var(--hv-ease-settle);
  }

  .status-line:hover .status-line-chevron {
    transform: translateX(0.15rem);
  }

  .status-line:focus-visible {
    border-radius: var(--hv-radius-control);
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 2px;
  }

  .integrity-note {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.83rem;
    line-height: 1.45;
  }

  /* Re-anchored: .recognition now sits on the section Panel's class prop. */
  :global(.recognition) {
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

  /* Each group titles itself and draws its own rule, so the split between what is earned and
     what is still ahead reads as two labelled shelves rather than two loose piles of cards. The
     0.78rem uppercase micro-label it replaces was quieter than the card names beneath it. */
  .achievement-group {
    display: grid;
    min-width: 0;
    gap: 0.85rem;
    align-content: start;
  }

  .achievement-group h3 {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    margin: 0;
    padding-bottom: 0.55rem;
    border-bottom: 1px solid var(--hv-border-subtle);
    color: var(--hv-color-basalt);
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .achievement-group h3::before {
    flex: 0 0 auto;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--hv-color-moss);
    content: '';
    transform: translateY(-0.1em);
  }

  .achievement-group[data-achievement-kind='upcoming'] h3::before {
    background: none;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--hv-color-moss) 55%, white);
  }

  /* All four cards are one size. Left to itself the strip sized each card to its own content,
     so an earned card (name only) sat shorter than an upcoming one (name, bar, count) and a
     name that wrapped made its card taller than its neighbour. Every card now reserves two name
     lines and a shared height, whether or not it has a progress bar to show. */
  .achievement-strip {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .achievement-strip li {
    display: flex;
    min-width: 0;
    min-height: 6.6rem;
    gap: 0.8rem;
    align-items: center;
    padding: 0.9rem 1rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
  }

  .achievement-strip small {
    display: block;
    color: var(--hv-color-basalt-muted);
  }

  .achievement-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 0.35rem;
    align-content: center;
  }

  /* Two name lines are reserved in BOTH kinds of card, so the earned strip and the upcoming
     strip line up rung for rung. */
  .achievement-copy strong {
    display: grid;
    min-height: 2.4em;
    align-content: center;
    line-height: 1.2;
    text-wrap: pretty;
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

  /* Scoped to .recognition so it cannot reach the achievements page's icons. */
  :global(.recognition) .achievement-icon {
    flex: 0 0 auto;
    width: 2.8rem;
    height: 2.8rem;
  }

  /* Both render through Button (a child component), so the layout hooks need :global(). */
  :global(.recognition-link),
  :global(.impact-back-link) {
    justify-self: start;
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

  /* The li is now a Panel, so no literal <li> tag exists in this template for the compiler to
     anchor "li:first-child" to; the ancestor .outcome-list stays a real ol, so only the
     descendant compound needs :global. */
  .outcome-list > :global(li:first-child) {
    background: color-mix(in srgb, var(--hv-color-moss) 4%, var(--hv-color-snow-raised));
  }

  /* Re-anchored: .outcome-card now sits on each row's Panel class prop. */
  .outcome-list :global(.outcome-card) {
    display: grid;
    grid-template-columns: auto minmax(0, 1.15fr) minmax(14rem, 0.85fr);
    gap: clamp(0.8rem, 2.5vw, 1.35rem);
    align-items: start;
    min-height: 7.15rem;
    padding: 0.95rem 1.05rem;
  }

  .outcome-list :global(.outcome-card[data-outcome-state='revoked']) {
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

  :global([data-outcome-state='revoked']) .outcome-mark {
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
  :global(.pillar) {
    animation: rise var(--hv-motion-celebrate) var(--hv-ease-settle) both;
  }

  :global(.pillar:nth-child(2)) {
    animation-delay: var(--hv-motion-stagger);
  }

  :global(.pillar:nth-child(3)) {
    animation-delay: calc(var(--hv-motion-stagger) * 2);
  }

  :global(.pillar:nth-child(4)) {
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

    .outcome-list :global(.outcome-card) {
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
    :global(.impact-hero) {
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

    :global(.pillar) summary {
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
  }

  @media (max-width: 24rem) {
    .metrics.two-up,
    .achievement-strip {
      grid-template-columns: 1fr;
    }
  }
</style>
