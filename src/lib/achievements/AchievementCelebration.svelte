<script lang="ts">
  import { onMount } from 'svelte';

  import type { Catalogue, Locale } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import PawMark from '$lib/member-activity/PawMark.svelte';
  import type { ClaimedAchievement } from '$server/achievements/achievements';
  import AchievementBadge from './AchievementBadge.svelte';
  import AchievementShare from './AchievementShare.svelte';
  import { collectionName, tierDescription, tierDisplayName } from './tier-copy';

  interface Props {
    achievement: ClaimedAchievement;
    lang: Locale;
    copy: Catalogue;
  }

  let { achievement, lang, copy }: Props = $props();
  let reducedMotion = $state(false);

  // A tier has no copy of its own, so its card is composed from the collection name, the tier label
  // and the threshold it closed.
  const name = $derived(
    achievement.entry === 'tier'
      ? tierDisplayName(collectionName(achievement, lang), achievement.tier, copy)
      : lang === 'is'
        ? achievement.nameIs
        : achievement.nameEn
  );
  const description = $derived(
    achievement.entry === 'tier'
      ? tierDescription(achievement.progressKind, achievement.progressTarget, copy)
      : lang === 'is'
        ? achievement.descriptionIs
        : achievement.descriptionEn
  );
  const regionLabel = $derived(copy['achievements.celebrationRegion'].replace('{name}', name));
  const earnedLine = $derived(
    copy['achievements.earned'].replace('{date}', formatLocalizedDate(achievement.earnedAt, lang))
  );
  const shareCard = $derived({
    achievementKey: achievement.key,
    collection: achievement.entry === 'tier' ? achievement.collection : null,
    group: achievement.group,
    tier: achievement.entry === 'tier' ? achievement.tier : null,
    name,
    description,
    brand: copy['site.name'],
    eyebrow: copy['achievements.share.cardEyebrow']
  });

  onMount(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
</script>

<section
  class="celebration"
  data-achievement-celebration
  data-reduced-motion={reducedMotion}
  aria-label={regionLabel}
>
  <div class="art" aria-hidden="true">
    <div class="scene">
      <span class="halo"></span>
      <span class="achievement-icon">
        <AchievementBadge
          achievementKey={achievement.key}
          collection={achievement.entry === 'tier' ? achievement.collection : null}
          group={achievement.group}
          tier={achievement.entry === 'tier' ? achievement.tier : null}
          state="earned"
        />
      </span>
      <span class="orbit"></span>
      <span class="paw"><PawMark active={true} /></span>
    </div>
  </div>
  <div class="copy">
    <p class="eyebrow">{copy['achievements.celebrationEyebrow']}</p>
    <h2>{name}</h2>
    <p class="description">{description}</p>
    <div class="celebration-meta">
      <p class="earned">{earnedLine}</p>
      <AchievementShare card={shareCard} {copy} />
    </div>
  </div>
</section>

<style>
  .celebration {
    position: relative;
    display: grid;
    grid-template-columns: minmax(10.5rem, 0.85fr) minmax(0, 1.15fr);
    gap: 1.5rem;
    align-items: center;
    min-height: 0;
    border: 1px solid color-mix(in srgb, var(--hv-color-brand-paw) 34%, transparent);
    border-radius: 1.5rem;
    padding: 1.6rem;
    overflow: hidden;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--hv-color-brand-paw) 10%, white),
      var(--hv-color-snow-raised) 64%
    );
    box-shadow: 0 1.15rem 2.8rem rgb(30 45 49 / 12%);
  }

  .art {
    display: grid;
    min-height: 10.5rem;
    place-items: center;
  }

  /* Every decorative layer shares this fixed coordinate system, now square and centred: the halo,
     the badge, the orbit and the paw are all measured from the scene's centre, so the card's grid
     can change shape without separating the paw from the ring it sits on. */
  .scene {
    position: relative;
    width: min(12.5rem, 100%);
    aspect-ratio: 1;
  }

  .halo {
    position: absolute;
    top: calc(50% - 3rem);
    left: 50%;
    width: 6rem;
    height: 6rem;
    border: 1px solid color-mix(in srgb, var(--hv-color-brand-paw) 24%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--hv-color-signal) 22%, white);
    box-shadow:
      0 0 0 0.8rem color-mix(in srgb, var(--hv-color-signal) 10%, transparent),
      0 0 0 1.6rem color-mix(in srgb, var(--hv-color-brand-paw) 5%, transparent);
    transform: translateX(-50%);
  }

  .achievement-icon {
    position: absolute;
    top: calc(50% - 2.55rem);
    left: 50%;
    width: 5.1rem;
    height: 5.1rem;
    transform: translateX(-50%);
  }

  /* A dashed orbit concentric with the halo, echoing the rosette's own dashed rings and the dashed
     locked tier cells. The wavy trail line it replaces spoke a different visual language from
     everything else on the page, and cut across the halo on its way past. */
  .orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 9.6rem;
    height: 9.6rem;
    border: 2px dashed color-mix(in srgb, var(--hv-color-fjord) 42%, transparent);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  /* On the orbit, lower right - the same ring the dashes travel, so the stamp reads as having
     walked it. */
  .paw {
    position: absolute;
    top: calc(50% + 3.4rem);
    left: calc(50% + 3.4rem);
    display: grid;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    padding: 0.34rem;
    place-items: center;
    transform: translate(-50%, -50%) rotate(9deg);
    transform-origin: center;
  }

  .paw :global(svg) {
    width: 100%;
    height: 100%;
  }

  .copy {
    display: grid;
    gap: 0.5rem;
    align-content: center;
    align-self: center;
    justify-items: start;
    max-width: 28rem;
    padding: 0.4rem 0.4rem 0.4rem 0;
  }

  .copy > :global(*) {
    margin: 0;
  }

  .eyebrow {
    color: var(--hv-color-brand-paw-ink);
    font-size: 0.74rem;
    font-weight: 900;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  h2 {
    margin-block-start: 0.1rem;
    font-family: var(--hv-font-display);
    font-size: clamp(1.5rem, 4vw, 2.25rem);
    line-height: 1.05;
    text-wrap: balance;
  }

  .description {
    max-width: 34ch;
    margin-block-start: 0.65rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.48;
  }

  /* Date and Share read as one caption row under the title, so the card ends on a single line
     instead of two stacked scraps. */
  .celebration-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--hv-space-actions);
    align-items: center;
    margin-block-start: 0.35rem;
  }

  .earned {
    margin: 0;
    font-size: 0.86rem;
    font-weight: 800;
  }

  /* The choreography rides the token families, so reduced motion collapses every travelling
     entry on its own while the fade halves keep breathing: the halo, icon, orbit and paw still
     appear, they just stop moving. Anything that both moves and fades runs as two entries,
     one per family (see tokens.css). The card and its words are transform-only. */
  .celebration {
    animation: achievement-card-arrives var(--hv-motion-considered) var(--hv-ease-settle) both;
  }

  .halo {
    animation:
      achievement-halo-swells var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 2)
        var(--hv-ease-settle) both,
      achievement-halo-brightens var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 2)
        var(--hv-ease-settle) both;
  }

  .achievement-icon {
    animation:
      achievement-icon-settles var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 2)
        var(--hv-ease-settle) both,
      achievement-icon-appears var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 2)
        var(--hv-ease-settle) both;
  }

  .orbit {
    animation:
      achievement-orbit-settles var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 4)
        var(--hv-ease-settle) both,
      achievement-icon-appears var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 4)
        var(--hv-ease-settle) both;
  }

  .paw {
    animation:
      achievement-paw-stamps var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 10)
        var(--hv-ease-settle) both,
      achievement-paw-appears var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 10)
        var(--hv-ease-settle) both;
  }

  @keyframes achievement-card-arrives {
    from {
      transform: translateY(0.7rem);
    }
    to {
      transform: translateY(0);
    }
  }

  @keyframes achievement-halo-swells {
    from {
      transform: translateX(-50%) scale(0.8);
    }
    to {
      transform: translateX(-50%) scale(1);
    }
  }

  @keyframes achievement-halo-brightens {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes achievement-icon-settles {
    from {
      transform: translateX(-50%) scale(0.72) rotate(-8deg);
    }
    to {
      transform: translateX(-50%) scale(1) rotate(0);
    }
  }

  @keyframes achievement-icon-appears {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes achievement-orbit-settles {
    from {
      transform: translate(-50%, -50%) scale(0.82) rotate(-12deg);
    }
    to {
      transform: translate(-50%, -50%) scale(1) rotate(0deg);
    }
  }

  @keyframes achievement-paw-stamps {
    from {
      transform: translate(-50%, -50%) scale(1.45) rotate(18deg);
    }
    to {
      transform: translate(-50%, -50%) scale(1) rotate(9deg);
    }
  }

  @keyframes achievement-paw-appears {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 34rem) {
    .celebration {
      grid-template-columns: 1fr;
      gap: 0.75rem;
      padding: 1.25rem;
    }

    .art {
      min-height: 9.5rem;
    }

    .copy {
      justify-items: center;
      max-width: none;
      padding: 0 0 0.5rem;
      text-align: center;
    }

    .celebration-meta {
      justify-content: center;
    }

    .description {
      margin-inline: auto;
    }
  }
</style>
