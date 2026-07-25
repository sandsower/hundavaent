<script lang="ts">
  import { onMount } from 'svelte';

  import type { Catalogue, Locale } from '$i18n';
  import { formatLocalizedDate } from '$i18n/date';
  import PawMark from '$lib/member-activity/PawMark.svelte';
  import type { EarnedAchievement } from '$server/achievements/achievements';
  import AchievementIcon from './AchievementIcon.svelte';

  interface Props {
    achievement: EarnedAchievement;
    lang: Locale;
    copy: Catalogue;
  }

  let { achievement, lang, copy }: Props = $props();
  let reducedMotion = $state(false);

  const name = $derived(lang === 'is' ? achievement.nameIs : achievement.nameEn);
  const description = $derived(
    lang === 'is' ? achievement.descriptionIs : achievement.descriptionEn
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
    <span class="halo"></span>
    <span class="achievement-icon">
      <AchievementIcon achievementKey={achievement.key} group={achievement.group} />
    </span>
    <svg class="trail" viewBox="0 0 110 38" fill="none">
      <path d="M5 29c18 5 19-17 36-12s21 20 35 5c8-9 18-8 29-3" />
    </svg>
    <span class="paw"><PawMark active={true} /></span>
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
    position: relative;
    min-height: 12rem;
  }

  .halo {
    position: absolute;
    top: 1.2rem;
    left: 50%;
    width: 7rem;
    height: 7rem;
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
    top: 2.25rem;
    left: 50%;
    width: 4.8rem;
    height: 4.8rem;
    color: var(--hv-color-brand-paw);
    transform: translateX(-50%);
  }

  .trail {
    position: absolute;
    right: 0.4rem;
    bottom: 1.35rem;
    width: 78%;
    color: var(--hv-color-fjord);
    stroke: currentColor;
    stroke-width: 2;
    stroke-dasharray: 4 6;
    stroke-linecap: round;
  }

  .paw {
    position: absolute;
    right: 0.9rem;
    bottom: 1.1rem;
    display: grid;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    background: var(--hv-color-signal);
    color: var(--hv-color-basalt);
    padding: 0.34rem;
    place-items: center;
    transform: rotate(9deg);
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

  @media (prefers-reduced-motion: no-preference) {
    .celebration {
      animation: achievement-card-arrives 260ms ease-out both;
    }

    .halo {
      animation: achievement-halo-breathes 520ms 120ms ease-out both;
    }

    .achievement-icon {
      animation: achievement-icon-settles 420ms 120ms cubic-bezier(0.2, 0.85, 0.2, 1) both;
    }

    .trail path {
      animation: achievement-trail-draws 420ms 220ms ease-out both;
    }

    .paw {
      animation: achievement-paw-stamps 360ms 480ms cubic-bezier(0.2, 0.85, 0.2, 1) both;
    }

    @keyframes achievement-card-arrives {
      from {
        transform: translateY(0.7rem);
      }
      to {
        transform: translateY(0);
      }
    }

    @keyframes achievement-halo-breathes {
      from {
        opacity: 0.35;
        transform: translateX(-50%) scale(0.8);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) scale(1);
      }
    }

    @keyframes achievement-icon-settles {
      from {
        opacity: 0;
        transform: translateX(-50%) scale(0.72) rotate(-8deg);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) scale(1) rotate(0);
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
        opacity: 0;
        transform: scale(1.45) rotate(18deg);
      }
      to {
        opacity: 1;
        transform: scale(1) rotate(9deg);
      }
    }
  }

  .celebration[data-reduced-motion='true'],
  .celebration[data-reduced-motion='true'] .halo,
  .celebration[data-reduced-motion='true'] .achievement-icon,
  .celebration[data-reduced-motion='true'] .trail path,
  .celebration[data-reduced-motion='true'] .paw {
    animation: none;
  }

  @media (max-width: 34rem) {
    .celebration {
      grid-template-columns: 1fr;
    }

    .art {
      min-height: 9.5rem;
    }

    .halo {
      top: 0.9rem;
      width: 6rem;
      height: 6rem;
    }

    .achievement-icon {
      top: 1.65rem;
      width: 4.4rem;
      height: 4.4rem;
    }

    .trail {
      bottom: 0.8rem;
      width: 65%;
    }

    .paw {
      bottom: 0.6rem;
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
