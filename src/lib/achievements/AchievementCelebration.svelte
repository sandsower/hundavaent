<script lang="ts">
  import { onMount } from 'svelte';

  import type { Catalogue, Locale } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import PawMark from '$lib/member-activity/PawMark.svelte';
  import type { ClaimedAchievement } from '$server/achievements/achievements';
  import AchievementBadge from './AchievementBadge.svelte';
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
      <svg class="trail" viewBox="0 0 240 144" fill="none">
        <path d="M12 109c28 17 36-10 60-5s40 28 64 9c18-16 43-12 74 12" />
      </svg>
      <span class="paw"><PawMark active={true} /></span>
    </div>
  </div>
  <div class="copy">
    <p class="eyebrow">{copy['achievements.celebrationEyebrow']}</p>
    <h2>{name}</h2>
    <p class="description">{description}</p>
    <p class="earned">{earnedLine}</p>
  </div>
</section>

<style>
  .celebration {
    position: relative;
    display: grid;
    grid-template-columns: minmax(7.5rem, 0.72fr) minmax(0, 1.28fr);
    min-height: 12rem;
    border: 1px solid color-mix(in srgb, var(--hv-color-brand-paw) 34%, transparent);
    border-radius: 1.5rem;
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
    min-height: 12rem;
    place-items: center;
  }

  /* Every decorative layer shares this fixed coordinate system. The card's grid can change shape
     without separating the trail endpoint from its paw or sliding the path through the badge. */
  .scene {
    position: relative;
    width: min(15rem, calc(100% - 1rem));
    aspect-ratio: 5 / 3;
  }

  .halo {
    position: absolute;
    top: 0.25rem;
    left: 40%;
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
    top: 0.7rem;
    left: 40%;
    width: 5.1rem;
    height: 5.1rem;
    transform: translateX(-50%);
  }

  .trail {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    color: var(--hv-color-fjord);
    stroke: currentColor;
    stroke-width: 3;
    stroke-dasharray: 5 7;
    stroke-linecap: round;
  }

  .paw {
    position: absolute;
    top: 86.8056%;
    left: 87.5%;
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
    align-self: center;
    padding: 2rem 2rem 2rem 1rem;
  }

  .eyebrow,
  h2,
  .description,
  .earned {
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
    margin-block-start: 0.35rem;
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

  .earned {
    margin-block-start: 0.8rem;
    font-size: 0.86rem;
    font-weight: 800;
  }

  /* The choreography rides the token families, so reduced motion collapses every travelling
     entry on its own while the fade halves keep breathing: the halo, icon, and paw still
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

  .trail path {
    animation: achievement-trail-draws var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 4)
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

  @keyframes achievement-trail-draws {
    from {
      stroke-dashoffset: 42;
    }
    to {
      stroke-dashoffset: 0;
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
    }

    .art {
      min-height: 9.5rem;
    }

    .copy {
      padding: 0.5rem 1.25rem 1.5rem;
      text-align: center;
    }

    .description {
      margin-inline: auto;
    }
  }
</style>
