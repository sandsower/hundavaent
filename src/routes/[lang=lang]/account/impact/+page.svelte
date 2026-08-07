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

<!-- .impact-shell now lives on PageShell's class prop: the literal element never appears in
     this template, so the selector needs :global to survive scoping (the Notice-precedent
     pattern already used below for .hero-mark :global(.impact-icon)). -->
<PageShell
  class="impact-shell grid max-w-288 gap-context [--impact-rhythm:var(--hv-color-fjord)] [--impact-exploration:#287a5d] [--impact-knowledge:#a0651b] [--impact-contribution:#8a4e72]"
  data-impact-record
>
  <!-- The hover offset carries `!`: app.css's `a { text-underline-offset: 0.18em }` is unlayered
       and would otherwise out-rank any utility, which the retired scoped rule never had to fight. -->
  <a
    class="top-back-link inline-flex items-center justify-self-start gap-[0.45rem] text-[0.9rem] font-[850] text-fjord no-underline hover:underline hover:underline-offset-[0.2em]!"
    data-impact-back
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
  >
    <span aria-hidden="true">←</span>
    {data.copy['account.navSignedIn']}
  </a>

  <!-- Re-anchored: .impact-hero now sits on the header Panel's class prop. -->
  <Panel
    as="header"
    class="impact-hero relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden gap-[clamp(1rem,3vw,2rem)] p-[clamp(1.35rem,5vw,3rem)] border-[color-mix(in_srgb,var(--hv-color-moss)_28%,var(--hv-border-subtle))]! [background:linear-gradient(135deg,rgb(79_143_104_/_14%)_0%,var(--hv-color-snow-raised)_38%,rgb(248_251_246)_100%)] max-[34rem]:grid-cols-[1fr]"
    aria-labelledby="impact-title"
  >
    <div
      class="hero-mark relative grid place-items-center size-22 [--impact-tone:var(--hv-color-moss)] max-[34rem]:size-18"
      aria-hidden="true"
    >
      <ImpactPillarIcon kind="recognition" />
      <span
        class="orbit orbit-one absolute inset-0 border border-[color-mix(in_srgb,var(--hv-color-moss)_34%,transparent)] rounded-[999px]"
      ></span>
      <span
        class="orbit orbit-two absolute inset-[0.65rem] border border-dashed border-[color-mix(in_srgb,var(--hv-color-moss)_34%,transparent)] rounded-[999px]"
      ></span>
    </div>
    <div class="hero-copy grid gap-[0.45rem]">
      <!-- .hero-copy h1 dropped: the title is now PageTitle, which owns its own m-0 already, and no
           literal h1 remains in this template for the selector to match. -->
      <PageTitle id="impact-title">{data.copy['impact.title']}</PageTitle>
      <p class="intro m-0 max-w-[55ch] text-[1.05rem] leading-[1.55] text-basalt-muted">
        {data.copy['impact.intro']}
      </p>
      <!-- The source declared margin-top: 0.35rem here, but it never rendered: `.hero-copy p`
           out-ranks the bare `.private-note` class, so the offset was dead CSS. Converted to the
           rendered value (m-0) to keep pixel parity. -->
      <p
        class="private-note m-0 inline-flex items-center gap-[0.45rem] text-[0.9rem] font-extrabold text-moss-ink"
      >
        <span class="text-[0.6rem] text-moss" aria-hidden="true">●</span>
        {data.copy['impact.privateNote']}
      </p>
    </div>
    <!-- The headline number is the page's whole point, so the block gets one measure and one left
         edge: the numeral is optically aligned to the text below it (a lining digit's side bearing
         otherwise leaves it looking indented), and the provenance caption sits under a rule rather
         than floating as a third ragged paragraph. -->
    <aside
      class="impact-summary grid min-w-52 max-w-62 self-stretch content-center pl-[clamp(1.25rem,3vw,2.25rem)] border-l border-l-[color-mix(in_srgb,var(--hv-color-moss)_25%,transparent)] max-[34rem]:min-w-0 max-[34rem]:pt-4 max-[34rem]:pl-0 max-[34rem]:border-t max-[34rem]:border-t-[color-mix(in_srgb,var(--hv-color-moss)_25%,transparent)] max-[34rem]:border-l-0"
      data-impact-summary
      aria-label={`${number(data.impact.confirmedContributions)} ${primaryConfirmedLabel}`}
    >
      <strong
        class="ml-[-0.055em] font-display text-[clamp(3.25rem,6vw,4.5rem)] font-[950] leading-[0.85] tracking-[-0.03em] text-moss-ink"
        >{number(data.impact.confirmedContributions)}</strong
      >
      <span
        class="max-w-none mt-[0.45rem] text-[0.92rem] font-[850] leading-[1.25] text-moss-ink text-pretty"
        >{primaryConfirmedLabel}</span
      >
      <small
        class="max-w-none mt-[0.85rem] pt-[0.7rem] border-t border-t-[color-mix(in_srgb,var(--hv-color-moss)_22%,transparent)] text-[0.76rem] leading-[1.4] text-basalt-muted text-pretty"
      >
        {data.copy['impact.memberSince'].replace(
          '{date}',
          formatLocalizedDate(data.impact.memberSince, data.lang)
        )}
      </small>
    </aside>
  </Panel>

  {#if trustedVerificationFeedback.status === 'available' && trustedVerificationFeedback.value.hasUnread && trustedVerificationFeedback.value.latestConfirmedAt}
    <!-- Re-anchored: .trusted-celebration now sits on the section Panel's class prop. -->
    <Panel
      as="section"
      class="trusted-celebration grid grid-cols-[auto_minmax(0,1fr)] items-center overflow-hidden gap-[clamp(1rem,3vw,1.8rem)] border-[color-mix(in_srgb,var(--hv-color-moss)_38%,var(--hv-border-subtle))]! [background:linear-gradient(135deg,color-mix(in_srgb,var(--hv-color-moss)_16%,var(--hv-color-snow-raised))_0%,var(--hv-color-snow-raised)_30%)] [--impact-tone:var(--hv-color-moss)]"
      aria-labelledby="trusted-celebration-title"
      data-testid="trusted-verification-celebration"
    >
      <div
        class="trusted-celebration-mark relative grid place-items-center size-18"
        aria-hidden="true"
      >
        <ImpactPillarIcon
          kind={trustedVerificationFeedback.value.latestTaskKind === 'access_freshness'
            ? 'knowledge'
            : 'contribution'}
        />
        <span
          class="spark spark-one absolute top-[0.15rem] right-[0.55rem] size-[0.45rem] rounded-[50%] bg-brand-paw"
        ></span>
        <span
          class="spark spark-two absolute right-0 bottom-[0.75rem] size-[0.45rem] rounded-[50%] bg-brand-paw"
        ></span>
        <span
          class="spark spark-three absolute bottom-[0.2rem] left-[0.45rem] size-[0.45rem] rounded-[50%] bg-brand-paw"
        ></span>
      </div>
      <div class="grid gap-[0.45rem]">
        <Eyebrow>{data.copy['impact.trustedCelebrationEyebrow']}</Eyebrow>
        <h2 id="trusted-celebration-title" class="m-0">
          {data.copy['impact.trustedCelebrationTitle']}
        </h2>
        <p class="m-0">{data.copy['impact.trustedCelebrationBody']}</p>
        <div class="trusted-celebration-actions flex flex-wrap mt-[0.45rem] gap-[0.65rem]">
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

  <section
    class="outcomes grid gap-context [--impact-tone:var(--hv-color-fjord)]"
    aria-labelledby="outcomes-title"
    data-impact-outcomes
  >
    <header class="section-heading flex min-w-0 items-center gap-[0.85rem]">
      <ImpactPillarIcon kind="outcome" size="small" />
      <div>
        <h2 id="outcomes-title" class="m-0 font-display text-[clamp(1.25rem,3vw,1.65rem)]">
          {data.copy['impact.outcomesTitle']}
        </h2>
        <p class="m-0 leading-[1.5] text-basalt-muted">{data.copy['impact.outcomesIntro']}</p>
      </div>
    </header>

    {#if data.impact.recentOutcomes.length > 0}
      <ol
        class="outcome-list grid grid-cols-[minmax(0,1fr)] auto-rows-[1fr] gap-[0.65rem] m-0 p-0 list-none max-[50rem]:auto-rows-auto"
      >
        {#each data.impact.recentOutcomes as outcome (outcome.contributionId)}
          <!-- The li is now a Panel, so no literal <li> tag exists in this template for the compiler
               to anchor "li:first-child" to; the ancestor .outcome-list stays a real ol, so only the
               descendant compound needs :global. -->
          <!-- Re-anchored: .outcome-card now sits on each row's Panel class prop. -->
          <Panel
            as="li"
            class="outcome-card group/outcome grid grid-cols-[auto_minmax(0,1.15fr)_minmax(14rem,0.85fr)] items-start min-h-[7.15rem] gap-[clamp(0.8rem,2.5vw,1.35rem)] py-[0.95rem] px-[1.05rem] first:bg-[color-mix(in_srgb,var(--hv-color-moss)_4%,var(--hv-color-snow-raised))] data-[outcome-state=revoked]:bg-[color-mix(in_srgb,var(--hv-color-basalt-muted)_4%,var(--hv-color-snow-raised))] max-[50rem]:grid-cols-[auto_minmax(0,1fr)] max-[50rem]:min-h-0"
            data-outcome-state={outcome.state}
          >
            <div
              class="outcome-mark grid place-items-center size-[2.2rem] rounded-[999px] bg-[color-mix(in_srgb,var(--hv-color-moss)_14%,white)] font-[950] text-moss-ink group-data-[outcome-state=revoked]/outcome:bg-[color-mix(in_srgb,var(--hv-color-basalt-muted)_12%,white)] group-data-[outcome-state=revoked]/outcome:text-basalt-muted"
              aria-hidden="true"
            >
              {outcome.state === 'confirmed' ? '✓' : '↺'}
            </div>
            <div class="outcome-primary min-w-0">
              <Status tone={outcome.state === 'confirmed' ? 'verified' : undefined}>
                {outcome.state === 'confirmed'
                  ? data.copy['impact.outcome.confirmed']
                  : data.copy['impact.outcome.revoked']}
              </Status>
              <h3 class="m-0 mt-[0.4rem] font-display text-[1.1rem]">{outcomeName(outcome)}</h3>
              <p class="outcome-date m-0 mt-[0.25rem] text-[0.83rem] text-basalt-muted">
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
            <div class="outcome-context flex h-full min-w-0 flex-col items-start max-[50rem]:col-2">
              <p class="outcome-kind m-0 text-[0.78rem] font-[750] text-basalt-muted">
                {data.copy[contributionKindKey(outcome.kind)]}
              </p>
              <p class="availability m-0 mt-[0.25rem] text-[0.83rem] text-basalt-muted">
                {data.copy[availabilityKey(outcome.availability)]}
              </p>
              {#if outcome.successorPlaceId && outcome.successorName && outcome.successorAvailable}
                <!-- eslint-disable svelte/no-navigation-without-resolve -->
                <a
                  class="successor-link inline-block mt-auto pt-[0.55rem] text-[0.88rem] font-[850] text-fjord"
                  href={placeHref(outcome.successorPlaceId)}
                >
                  {data.copy['impact.outcome.successor'].replace('{name}', outcome.successorName)}
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              {:else if outcome.successorPlaceId && outcome.successorName}
                <!-- margin-top: auto is dead on this one: `.outcome-context p` out-ranks the bare
                     `.successor-note` class, so only the sibling anchor above ever pushed itself
                     to the bottom. Converted to the rendered value (m-0). -->
                <p
                  class="successor-note inline-block m-0 pt-[0.55rem] text-[0.88rem] font-[850] text-basalt-muted"
                >
                  {data.copy['impact.outcome.successorUnavailable'].replace(
                    '{name}',
                    outcome.successorName
                  )}
                </p>
              {:else if outcome.subjectPlaceId && outcome.availability === 'available'}
                <!-- eslint-disable svelte/no-navigation-without-resolve -->
                <a
                  class="successor-link inline-block mt-auto pt-[0.55rem] text-[0.88rem] font-[850] text-fjord"
                  href={placeHref(outcome.subjectPlaceId)}
                >
                  {data.copy['impact.outcome.openPlace']}
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
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
    class="participation grid gap-context [--impact-tone:var(--hv-color-fjord)]"
    aria-labelledby="participation-title"
    data-impact-participation
  >
    <header class="section-heading participation-heading flex min-w-0 items-center gap-[0.85rem]">
      <ImpactPillarIcon kind="rhythm" size="small" />
      <div>
        <h2 id="participation-title" class="m-0 font-display text-[clamp(1.25rem,3vw,1.65rem)]">
          {data.copy['impact.participationTitle']}
        </h2>
        <p class="m-0 leading-[1.5] text-basalt-muted">{data.copy['impact.participationIntro']}</p>
      </div>
    </header>

    <!-- Each pillar keeps its own height. Grid otherwise stretched a closed pillar to match the
         open one beside it, which reads as a large empty card rather than as whitespace. -->
    <div
      class="pillar-grid grid grid-cols-2 items-start gap-4 max-[50rem]:grid-cols-[1fr]"
      aria-label={data.copy['impact.pillarsLabel']}
    >
      <!-- Re-anchored: .pillar (and its per-kind modifiers) now sit on each details Panel's class
           prop, so every selector rooted on it needs :global; summary/the chevron stay literal local
           elements and keep their normal scoping. -->
      <Panel
        as="details"
        class="pillar rhythm group/pillar overflow-clip p-0 border-t-[0.3rem] border-t-[var(--impact-tone)] [--impact-tone:var(--impact-rhythm)]"
        data-impact-pillar="rhythm"
      >
        <summary
          class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 p-[clamp(1rem,2.5vw,1.35rem)] cursor-pointer list-none focus-visible:rounded-[calc(var(--hv-radius-panel)_-_2px)] focus-visible:[outline:3px_solid_color-mix(in_srgb,var(--impact-tone)_38%,transparent)] focus-visible:outline-offset-[-3px] group-open/pillar:border-b group-open/pillar:border-b-border-subtle group-open/pillar:bg-[color-mix(in_srgb,var(--impact-tone)_4%,var(--hv-color-snow-raised))] max-[34rem]:grid-cols-[minmax(0,1fr)_auto]"
        >
          <span class="pillar-heading flex min-w-0 items-center gap-[0.85rem]">
            <ImpactPillarIcon kind="rhythm" />
            <span class="grid min-w-0 gap-[0.15rem]">
              <span
                class="pillar-title font-display text-[clamp(1.15rem,2vw,1.4rem)] font-black leading-[1.1]"
                role="heading"
                aria-level="3"
              >
                {data.copy['impact.pillar.rhythm.title']}
              </span>
            </span>
          </span>
          <!-- One chip shape for all four pillars. The labels run from "active weeks" to "confirmed
               useful", so letting each chip size to its own text gave four cards with four different
               chip widths and no shared edge - a fixed width and centred content line the numerals up
               across the grid instead, and stretch keeps the rhythm pillar's pair matched when one
               label wraps. -->
          <span
            class="pillar-snapshot flex items-stretch justify-end gap-2 max-[34rem]:col-span-full max-[34rem]:row-2 max-[34rem]:justify-start"
            data-pillar-snapshot
          >
            <span
              class="grid w-28 flex-none content-center justify-items-center gap-[0.35rem] py-[0.8rem] px-3 rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <strong
                class="font-display text-[1.55rem] font-[950] leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
                >{number(data.impact.activeWeeks)}</strong
              >
              <!-- Two label lines are always reserved, so a chip whose label wraps stays the same
                   height as one whose label does not - the pair in the rhythm pillar and the two
                   cards in each row all match. -->
              <small
                class="grid min-h-[2.5em] place-content-center text-[0.7rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
                >{data.copy['impact.metric.activeWeeks']}</small
              >
            </span>
            <span
              class="grid w-28 flex-none content-center justify-items-center gap-[0.35rem] py-[0.8rem] px-3 rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <strong
                class="font-display text-[1.55rem] font-[950] leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
                >{number(data.impact.activeMonths)}</strong
              >
              <small
                class="grid min-h-[2.5em] place-content-center text-[0.7rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
                >{data.copy['impact.metric.activeMonths']}</small
              >
            </span>
          </span>
          <span
            class="summary-chevron text-[1.45rem] font-black text-[var(--impact-tone)] transition-transform duration-[var(--hv-motion-quick)] ease-settle group-open/pillar:transform-[rotate(180deg)] max-[34rem]:col-2 max-[34rem]:row-1"
            aria-hidden="true">⌄</span
          >
        </summary>
        <div class="pillar-detail grid gap-4 p-[clamp(1rem,2.5vw,1.35rem)]">
          <p class="pillar-intro m-0 leading-[1.5] text-basalt-muted">
            {data.copy['impact.pillar.rhythm.body']}
          </p>
          <WeeklyRhythmTrail history={data.rhythm} lang={data.lang} copy={data.copy} />
        </div>
      </Panel>

      <Panel
        as="details"
        class="pillar exploration group/pillar overflow-clip p-0 border-t-[0.3rem] border-t-[var(--impact-tone)] [--impact-tone:var(--impact-exploration)]"
        data-impact-pillar="exploration"
      >
        <summary
          class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 p-[clamp(1rem,2.5vw,1.35rem)] cursor-pointer list-none focus-visible:rounded-[calc(var(--hv-radius-panel)_-_2px)] focus-visible:[outline:3px_solid_color-mix(in_srgb,var(--impact-tone)_38%,transparent)] focus-visible:outline-offset-[-3px] group-open/pillar:border-b group-open/pillar:border-b-border-subtle group-open/pillar:bg-[color-mix(in_srgb,var(--impact-tone)_4%,var(--hv-color-snow-raised))] max-[34rem]:grid-cols-[minmax(0,1fr)_auto]"
        >
          <span class="pillar-heading flex min-w-0 items-center gap-[0.85rem]">
            <ImpactPillarIcon kind="exploration" />
            <span class="grid min-w-0 gap-[0.15rem]">
              <span
                class="pillar-title font-display text-[clamp(1.15rem,2vw,1.4rem)] font-black leading-[1.1]"
                role="heading"
                aria-level="3"
              >
                {data.copy['impact.pillar.exploration.title']}
              </span>
            </span>
          </span>
          <span
            class="pillar-snapshot flex items-stretch justify-end gap-2 max-[34rem]:col-span-full max-[34rem]:row-2 max-[34rem]:justify-start"
            data-pillar-snapshot
          >
            <span
              class="grid w-28 flex-none content-center justify-items-center gap-[0.35rem] py-[0.8rem] px-3 rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <strong
                class="font-display text-[1.55rem] font-[950] leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
                >{number(data.impact.creditedPlaces)}</strong
              >
              <small
                class="grid min-h-[2.5em] place-content-center text-[0.7rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
                >{data.copy['impact.metric.places']}</small
              >
            </span>
          </span>
          <span
            class="summary-chevron text-[1.45rem] font-black text-[var(--impact-tone)] transition-transform duration-[var(--hv-motion-quick)] ease-settle group-open/pillar:transform-[rotate(180deg)] max-[34rem]:col-2 max-[34rem]:row-1"
            aria-hidden="true">⌄</span
          >
        </summary>
        <div class="pillar-detail grid gap-4 p-[clamp(1rem,2.5vw,1.35rem)]">
          <p class="pillar-intro m-0 leading-[1.5] text-basalt-muted">
            {data.copy['impact.pillar.exploration.body']}
          </p>
          <!-- The metric tiles read the same way round as the snapshot chips - figure first, label
               under it, centred - so the page has one stat treatment instead of two. The dl keeps dt
               before dd for semantics; column-reverse only swaps the paint order. A lone metric sizes
               to a sensible tile rather than taking a third of the row or stretching across the whole
               of it. -->
          <dl
            class="metrics two-up grid grid-cols-2 gap-[0.65rem] m-0 max-[34rem]:grid-cols-[1fr_1fr] max-[24rem]:grid-cols-[1fr]"
          >
            <div
              class="flex min-w-0 flex-col-reverse items-center justify-center gap-[0.45rem] py-[1.05rem] px-[0.9rem] rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <dt
                class="grid min-h-[2.5em] place-content-center text-[0.75rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
              >
                {data.copy['impact.metric.categoryGroups']}
              </dt>
              <dd
                class="m-0 font-display text-[clamp(1.9rem,4vw,2.2rem)] font-black leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
              >
                {number(data.impact.creditedCategoryGroups)}
              </dd>
            </div>
            <div
              class="flex min-w-0 flex-col-reverse items-center justify-center gap-[0.45rem] py-[1.05rem] px-[0.9rem] rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <dt
                class="grid min-h-[2.5em] place-content-center text-[0.75rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
              >
                {data.copy['impact.metric.municipalities']}
              </dt>
              <dd
                class="m-0 font-display text-[clamp(1.9rem,4vw,2.2rem)] font-black leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
              >
                {number(data.impact.creditedMunicipalities)}
              </dd>
            </div>
          </dl>
          <p class="integrity-note m-0 text-[0.83rem] leading-[1.45] text-basalt-muted">
            {data.copy['impact.explorationIntegrity']}
          </p>
        </div>
      </Panel>

      <Panel
        as="details"
        class="pillar knowledge group/pillar overflow-clip p-0 border-t-[0.3rem] border-t-[var(--impact-tone)] [--impact-tone:var(--impact-knowledge)]"
        data-impact-pillar="knowledge"
      >
        <summary
          class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 p-[clamp(1rem,2.5vw,1.35rem)] cursor-pointer list-none focus-visible:rounded-[calc(var(--hv-radius-panel)_-_2px)] focus-visible:[outline:3px_solid_color-mix(in_srgb,var(--impact-tone)_38%,transparent)] focus-visible:outline-offset-[-3px] group-open/pillar:border-b group-open/pillar:border-b-border-subtle group-open/pillar:bg-[color-mix(in_srgb,var(--impact-tone)_4%,var(--hv-color-snow-raised))] max-[34rem]:grid-cols-[minmax(0,1fr)_auto]"
        >
          <span class="pillar-heading flex min-w-0 items-center gap-[0.85rem]">
            <ImpactPillarIcon kind="knowledge" />
            <span class="grid min-w-0 gap-[0.15rem]">
              <span
                class="pillar-title font-display text-[clamp(1.15rem,2vw,1.4rem)] font-black leading-[1.1]"
                role="heading"
                aria-level="3"
              >
                {data.copy['impact.pillar.knowledge.title']}
              </span>
            </span>
          </span>
          <span
            class="pillar-snapshot flex items-stretch justify-end gap-2 max-[34rem]:col-span-full max-[34rem]:row-2 max-[34rem]:justify-start"
            data-pillar-snapshot
          >
            <span
              class="grid w-28 flex-none content-center justify-items-center gap-[0.35rem] py-[0.8rem] px-3 rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <strong
                class="font-display text-[1.55rem] font-[950] leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
                >{number(data.impact.validRatings)}</strong
              >
              <small
                class="grid min-h-[2.5em] place-content-center text-[0.7rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
                >{data.copy['impact.metric.validRatings']}</small
              >
            </span>
          </span>
          <span
            class="summary-chevron text-[1.45rem] font-black text-[var(--impact-tone)] transition-transform duration-[var(--hv-motion-quick)] ease-settle group-open/pillar:transform-[rotate(180deg)] max-[34rem]:col-2 max-[34rem]:row-1"
            aria-hidden="true">⌄</span
          >
        </summary>
        <div class="pillar-detail grid gap-4 p-[clamp(1rem,2.5vw,1.35rem)]">
          <p class="pillar-intro m-0 leading-[1.5] text-basalt-muted">
            {data.copy['impact.pillar.knowledge.body']}
          </p>
          <!-- A lone metric keeps the :has(> div:only-child) measure at every width: that rule
               out-ranks the narrow-viewport `.metrics { grid-template-columns: 1fr }` on specificity,
               and a media query adds none - so the single-tile columns never became 1fr and the
               responsive step is pinned dead here. -->
          <dl class="metrics grid grid-cols-[minmax(9rem,13rem)] gap-[0.65rem] m-0">
            <div
              class="flex min-w-0 flex-col-reverse items-center justify-center gap-[0.45rem] py-[1.05rem] px-[0.9rem] rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <dt
                class="grid min-h-[2.5em] place-content-center text-[0.75rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
              >
                {data.copy['impact.metric.submissions']}
              </dt>
              <dd
                class="m-0 font-display text-[clamp(1.9rem,4vw,2.2rem)] font-black leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
              >
                {number(data.impact.submissionsTotal)}
              </dd>
            </div>
          </dl>
          <dl class="outcome-summary grid gap-[0.45rem] m-0">
            <div
              class="flex items-center justify-between gap-4 py-[0.45rem] border-b border-b-border-subtle"
            >
              <dt class="text-[0.88rem] text-basalt-muted">{data.copy['impact.metric.pending']}</dt>
              <dd class="m-0 font-black">{number(data.impact.pendingSubmissions)}</dd>
            </div>
            <div
              class="flex items-center justify-between gap-4 py-[0.45rem] border-b border-b-border-subtle"
            >
              <dt class="text-[0.88rem] text-basalt-muted">
                {data.copy['impact.metric.rejected']}
              </dt>
              <dd class="m-0 font-black">{number(data.impact.rejectedSubmissions)}</dd>
            </div>
            <div
              class="flex items-center justify-between gap-4 py-[0.45rem] border-b border-b-border-subtle"
            >
              <dt class="text-[0.88rem] text-basalt-muted">
                {data.copy['impact.metric.resolved']}
              </dt>
              <dd class="m-0 font-black">{number(data.impact.resolvedWithoutContribution)}</dd>
            </div>
          </dl>
        </div>
      </Panel>

      <Panel
        as="details"
        class="pillar contribution group/pillar overflow-clip p-0 border-t-[0.3rem] border-t-[var(--impact-tone)] [--impact-tone:var(--impact-contribution)]"
        data-impact-pillar="contribution"
      >
        <summary
          class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 p-[clamp(1rem,2.5vw,1.35rem)] cursor-pointer list-none focus-visible:rounded-[calc(var(--hv-radius-panel)_-_2px)] focus-visible:[outline:3px_solid_color-mix(in_srgb,var(--impact-tone)_38%,transparent)] focus-visible:outline-offset-[-3px] group-open/pillar:border-b group-open/pillar:border-b-border-subtle group-open/pillar:bg-[color-mix(in_srgb,var(--impact-tone)_4%,var(--hv-color-snow-raised))] max-[34rem]:grid-cols-[minmax(0,1fr)_auto]"
        >
          <span class="pillar-heading flex min-w-0 items-center gap-[0.85rem]">
            <ImpactPillarIcon kind="contribution" />
            <span class="grid min-w-0 gap-[0.15rem]">
              <span
                class="pillar-title font-display text-[clamp(1.15rem,2vw,1.4rem)] font-black leading-[1.1]"
                role="heading"
                aria-level="3"
              >
                {data.copy['impact.pillar.contribution.title']}
              </span>
            </span>
          </span>
          <span
            class="pillar-snapshot flex items-stretch justify-end gap-2 max-[34rem]:col-span-full max-[34rem]:row-2 max-[34rem]:justify-start"
            data-pillar-snapshot
          >
            <span
              class="grid w-28 flex-none content-center justify-items-center gap-[0.35rem] py-[0.8rem] px-3 rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <strong
                class="font-display text-[1.55rem] font-[950] leading-none text-[color-mix(in_srgb,var(--impact-tone)_78%,black)]"
                >{number(data.impact.confirmedContributions)}</strong
              >
              <small
                class="grid min-h-[2.5em] place-content-center text-[0.7rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
                >{data.copy['impact.metric.confirmed']}</small
              >
            </span>
          </span>
          <span
            class="summary-chevron text-[1.45rem] font-black text-[var(--impact-tone)] transition-transform duration-[var(--hv-motion-quick)] ease-settle group-open/pillar:transform-[rotate(180deg)] max-[34rem]:col-2 max-[34rem]:row-1"
            aria-hidden="true">⌄</span
          >
        </summary>
        <div class="pillar-detail grid gap-4 p-[clamp(1rem,2.5vw,1.35rem)]">
          <p class="pillar-intro m-0 leading-[1.5] text-basalt-muted">
            {data.copy['impact.pillar.contribution.body']}
          </p>
          <dl class="metrics grid grid-cols-[minmax(9rem,13rem)] gap-[0.65rem] m-0">
            <div
              class="muted-metric flex min-w-0 flex-col-reverse items-center justify-center gap-[0.45rem] py-[1.05rem] px-[0.9rem] rounded-control bg-[color-mix(in_srgb,var(--impact-tone)_8%,var(--hv-color-snow-raised))] text-center"
            >
              <dt
                class="grid min-h-[2.5em] place-content-center text-[0.75rem] font-[750] leading-[1.25] text-basalt-muted text-balance"
              >
                {data.copy['impact.metric.revoked']}
              </dt>
              <dd
                class="m-0 font-display text-[clamp(1.9rem,4vw,2.2rem)] font-black leading-none text-basalt-muted"
              >
                {number(data.impact.revokedContributions)}
              </dd>
            </div>
          </dl>
          <!-- The row itself is the door to the status page. It sits outside the availability
               branch: this is the only navigation entry, and its own load handles a degraded
               status fact. -->
          <!-- The status row is itself the door to the contributor-status page; it keeps
               .status-line's shared layout rule above. -->
          <a
            class="status-line group/status flex items-center justify-between gap-4 py-[0.45rem] border-b border-b-border-subtle text-inherit no-underline focus-visible:rounded-control focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-2"
            href={resolve('/[lang=lang]/account/contributor-status', { lang: data.lang })}
          >
            <span class="text-[0.88rem] text-basalt-muted">{data.copy['impact.currentStatus']}</span
            >
            <span
              class="status-line-value flex items-center gap-[0.55rem] text-[0.88rem] text-basalt-muted"
            >
              {#if data.contributor.status === 'available'}
                <Status
                  tone={data.contributor.value.status === 'trusted_contributor'
                    ? 'verified'
                    : undefined}
                >
                  {data.copy[contributorKey(data.contributor.value.status)]}
                </Status>
              {/if}
              <span
                class="status-line-chevron font-black text-fjord transition-transform duration-[var(--hv-motion-quick)] ease-settle group-hover/status:transform-[translateX(0.15rem)]"
                aria-hidden="true">→</span
              >
            </span>
          </a>
          {#if data.contributor.status !== 'available'}
            <p class="integrity-note m-0 text-[0.83rem] leading-[1.45] text-basalt-muted">
              {data.copy['impact.statusUnavailable']}
            </p>
          {/if}
        </div>
      </Panel>
    </div>
  </section>

  <!-- Re-anchored: .recognition now sits on the section Panel's class prop. -->
  <Panel
    as="section"
    class="recognition grid gap-4 p-[clamp(1.2rem,3vw,1.75rem)] [background:color-mix(in_srgb,var(--hv-color-moss)_5%,var(--hv-color-snow-raised))] [--impact-tone:var(--hv-color-moss)]"
    aria-labelledby="recognition-title"
  >
    <header class="section-heading flex min-w-0 items-center gap-[0.85rem]">
      <ImpactPillarIcon kind="recognition" size="small" />
      <div>
        <h2 id="recognition-title" class="m-0 font-display text-[clamp(1.25rem,3vw,1.65rem)]">
          {data.copy['impact.recognitionTitle']}
        </h2>
        <p class="m-0 leading-[1.5] text-basalt-muted">{data.copy['impact.recognitionIntro']}</p>
      </div>
    </header>

    {#if visibleAchievements.length > 0}
      <div class="achievement-groups grid grid-cols-2 gap-4 max-[50rem]:grid-cols-[1fr]">
        {#if earnedAchievements.length > 0}
          <!-- Each group titles itself and draws its own rule, so the split between what is earned
               and what is still ahead reads as two labelled shelves rather than two loose piles of
               cards. The 0.78rem uppercase micro-label it replaces was quieter than the card names
               beneath it. -->
          <section
            class="achievement-group grid min-w-0 content-start gap-[0.85rem]"
            data-achievement-kind="earned"
          >
            <h3
              class="flex items-baseline gap-[0.6rem] m-0 pb-[0.55rem] border-b border-b-border-subtle text-[1.05rem] font-extrabold tracking-[-0.01em] leading-[1.2] text-basalt before:content-[''] before:flex-none before:size-[0.4rem] before:rounded-[999px] before:bg-moss before:transform-[translateY(-0.1em)]"
            >
              {data.copy['impact.recognitionEarned']}
            </h3>
            <!-- All four cards are one size. Left to itself the strip sized each card to its own
                 content, so an earned card (name only) sat shorter than an upcoming one (name, bar,
                 count) and a name that wrapped made its card taller than its neighbour. Every card
                 now reserves two name lines and a shared height, whether or not it has a progress
                 bar to show. -->
            <ul
              class="achievement-strip grid grid-cols-2 gap-[0.7rem] m-0 p-0 list-none max-[50rem]:grid-cols-2 max-[34rem]:grid-cols-[1fr_1fr] max-[24rem]:grid-cols-[1fr]"
            >
              {#each earnedAchievements as achievement (achievement.key)}
                <li
                  class="flex min-w-0 min-h-[6.6rem] items-center gap-[0.8rem] py-[0.9rem] px-4 border border-border-subtle rounded-control bg-snow-raised"
                >
                  <!-- Scoped to .recognition so it cannot reach the achievements page's icons. -->
                  <span class="achievement-icon flex-none size-[2.8rem]" aria-hidden="true">
                    <AchievementBadge
                      achievementKey={achievement.key}
                      collection={achievement.entry === 'tier' ? achievement.collection : null}
                      group={achievement.group}
                      tier={achievement.entry === 'tier' ? achievement.tier : null}
                      state="earned"
                      progress={1}
                    />
                  </span>
                  <!-- Two name lines are reserved in BOTH kinds of card, so the earned strip and the
                       upcoming strip line up rung for rung. -->
                  <span class="achievement-copy grid min-w-0 flex-1 content-center gap-[0.35rem]"
                    ><strong class="grid min-h-[2.4em] content-center leading-[1.2] text-pretty"
                      >{achievementName(achievement)}</strong
                    ></span
                  >
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if upcomingAchievements.length > 0}
          <section
            class="achievement-group grid min-w-0 content-start gap-[0.85rem]"
            data-achievement-kind="upcoming"
          >
            <h3
              class="flex items-baseline gap-[0.6rem] m-0 pb-[0.55rem] border-b border-b-border-subtle text-[1.05rem] font-extrabold tracking-[-0.01em] leading-[1.2] text-basalt before:content-[''] before:flex-none before:size-[0.4rem] before:rounded-[999px] before:shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--hv-color-moss)_55%,white)] before:transform-[translateY(-0.1em)]"
            >
              {data.copy['impact.recognitionNext']}
            </h3>
            <ul
              class="achievement-strip grid grid-cols-2 gap-[0.7rem] m-0 p-0 list-none max-[50rem]:grid-cols-2 max-[34rem]:grid-cols-[1fr_1fr] max-[24rem]:grid-cols-[1fr]"
            >
              {#each upcomingAchievements as achievement (achievement.key)}
                <li
                  class="flex min-w-0 min-h-[6.6rem] items-center gap-[0.8rem] py-[0.9rem] px-4 border border-border-subtle rounded-control bg-snow-raised"
                >
                  <span class="achievement-icon flex-none size-[2.8rem]" aria-hidden="true">
                    <AchievementBadge
                      achievementKey={achievement.key}
                      collection={achievement.collection}
                      group={achievement.group}
                      tier={achievement.tier}
                      state="started"
                      progress={achievement.progress.current / achievement.progress.target}
                    />
                  </span>
                  <span class="achievement-copy grid min-w-0 flex-1 content-center gap-[0.35rem]">
                    <strong class="grid min-h-[2.4em] content-center leading-[1.2] text-pretty">
                      {achievementName(achievement)}
                    </strong>
                    <progress
                      class="w-full h-[0.45rem] overflow-hidden border-0 rounded-[999px] bg-[color-mix(in_srgb,var(--hv-color-moss)_14%,white)] accent-moss"
                      aria-label={achievementName(achievement)}
                      max={achievement.progress.target}
                      value={achievement.progress.current}
                    ></progress>
                    <small class="block text-basalt-muted">
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
      <p class="integrity-note m-0 text-[0.83rem] leading-[1.45] text-basalt-muted">
        {data.copy['impact.achievementsUnavailable']}
      </p>
    {:else if !data.achievements.value.enabled}
      <p class="integrity-note m-0 text-[0.83rem] leading-[1.45] text-basalt-muted">
        {data.copy['impact.achievementsDisabled']}
      </p>
    {:else}
      <p class="integrity-note m-0 text-[0.83rem] leading-[1.45] text-basalt-muted">
        {data.copy['impact.achievementsEmpty']}
      </p>
    {/if}

    <!-- Both render through Button (a child component), so the layout hooks ride Button's own
         class prop. -->
    <Button
      href={resolve('/[lang=lang]/account/achievements', { lang: data.lang })}
      intent="quiet"
      class="recognition-link justify-self-start"
    >
      {data.copy['impact.achievementsLink']}
    </Button>
  </Panel>

  <Button
    href={resolve('/[lang=lang]/account', { lang: data.lang })}
    intent="quiet"
    class="impact-back-link justify-self-start"
  >
    {data.copy['account.navSignedIn']}
  </Button>
</PageShell>

<style>
  .hero-mark :global(.impact-icon) {
    position: relative;
    z-index: 1;
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

  .trusted-celebration-mark {
    /* Moves and fades, so it runs as two entries, one per family (see tokens.css): reduced
       motion stills the tumble while the mark keeps appearing. */
    animation:
      trusted-confirmed var(--hv-motion-celebrate) var(--hv-ease-overshoot) both,
      trusted-appears var(--hv-fade-considered) var(--hv-ease-settle) both;
  }

  .spark {
    animation:
      trusted-spark var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 3)
        var(--hv-ease-settle) both,
      trusted-spark-glints var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 3)
        var(--hv-ease-settle) both;
  }

  .spark-two {
    animation-delay: calc(var(--hv-motion-stagger) * 4);
  }

  .spark-three {
    animation-delay: calc(var(--hv-motion-stagger) * 6);
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

  /* stays: no Tailwind variant reaches ::-webkit-details-marker, and an arbitrary `&` variant is
     unusable in a static Svelte class. */
  :global(.pillar) summary::-webkit-details-marker {
    display: none;
  }

  /* stays: no Tailwind variant reaches the ::-webkit-progress-* shadow tree. */
  .achievement-strip progress::-webkit-progress-bar {
    border-radius: 999px;
    background: color-mix(in srgb, var(--hv-color-moss) 14%, white);
  }

  .achievement-strip progress::-webkit-progress-value {
    border-radius: 999px;
    background: var(--hv-color-moss);
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
</style>
