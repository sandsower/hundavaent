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
  class="celebration relative grid overflow-hidden grid-cols-[minmax(10.5rem,_0.85fr)_minmax(0,_1.15fr)] items-center min-h-0 gap-6 p-[1.6rem] border border-[color-mix(in_srgb,_var(--hv-color-brand-paw)_34%,_transparent)] rounded-[1.5rem] bg-[linear-gradient(135deg,_color-mix(in_srgb,_var(--hv-color-brand-paw)_10%,_white),_var(--hv-color-snow-raised)_64%)] shadow-[0_1.15rem_2.8rem_rgb(30_45_49_/_12%)] max-[34rem]:grid-cols-[1fr] max-[34rem]:gap-3 max-[34rem]:p-5"
  data-achievement-celebration
  data-reduced-motion={reducedMotion}
  aria-label={regionLabel}
>
  <div class="art grid place-items-center min-h-42 max-[34rem]:min-h-38" aria-hidden="true">
    <!-- Every decorative layer shares this fixed coordinate system, now square and centred: the halo,
         the badge, the orbit and the paw are all measured from the scene's centre, so the card's grid
         can change shape without separating the paw from the ring it sits on. -->
    <div class="scene relative w-[min(12.5rem,_100%)] aspect-square">
      <span
        class="halo absolute top-[calc(50%_-_3rem)] left-1/2 w-24 h-24 border border-[color-mix(in_srgb,_var(--hv-color-brand-paw)_24%,_transparent)] rounded-full bg-[color-mix(in_srgb,_var(--hv-color-signal)_22%,_white)] shadow-[0_0_0_0.8rem_color-mix(in_srgb,_var(--hv-color-signal)_10%,_transparent),_0_0_0_1.6rem_color-mix(in_srgb,_var(--hv-color-brand-paw)_5%,_transparent)] transform-[translateX(-50%)]"
      ></span>
      <span
        class="achievement-icon absolute top-[calc(50%_-_2.55rem)] left-1/2 w-[5.1rem] h-[5.1rem] transform-[translateX(-50%)]"
      >
        <AchievementBadge
          achievementKey={achievement.key}
          collection={achievement.entry === 'tier' ? achievement.collection : null}
          group={achievement.group}
          tier={achievement.entry === 'tier' ? achievement.tier : null}
          state="earned"
        />
      </span>
      <!-- A dashed orbit concentric with the halo, echoing the rosette's own dashed rings and the dashed
           locked tier cells. The wavy trail line it replaces spoke a different visual language from
           everything else on the page, and cut across the halo on its way past. -->
      <span
        class="orbit absolute top-1/2 left-1/2 w-[9.6rem] h-[9.6rem] border-2 border-dashed border-[color-mix(in_srgb,_var(--hv-color-fjord)_42%,_transparent)] rounded-full transform-[translate(-50%,-50%)]"
      ></span>
      <!-- On the orbit, lower right - the same ring the dashes travel, so the stamp reads as having
           walked it. -->
      <span
        class="paw absolute top-[calc(50%_+_3.4rem)] left-[calc(50%_+_3.4rem)] grid place-items-center w-[1.8rem] h-[1.8rem] p-[0.34rem] rounded-full bg-signal text-basalt origin-center transform-[translate(-50%,-50%)_rotate(9deg)]"
        ><PawMark active={true} /></span
      >
    </div>
  </div>
  <div
    class="copy grid content-center self-center justify-items-start max-w-112 gap-2 p-[0.4rem] pl-0 max-[34rem]:justify-items-center max-[34rem]:max-w-none max-[34rem]:p-0 max-[34rem]:pb-2 max-[34rem]:text-center"
  >
    <p class="eyebrow m-0 text-[0.74rem] font-black tracking-[0.11em] uppercase text-brand-paw-ink">
      {copy['achievements.celebrationEyebrow']}
    </p>
    <!-- The source declared a 0.1rem margin-block-start here, but it never rendered: the old
         .copy > * { margin: 0 } out-ranked the bare h2 selector, so the offset was dead CSS.
         Converted to the rendered value (m-0) to keep pixel parity. -->
    <h2 class="m-0 font-display text-[clamp(1.5rem,_4vw,_2.25rem)] leading-[1.05] text-balance">
      {name}
    </h2>
    <p
      class="description m-0 max-w-[34ch] [margin-block-start:0.65rem] leading-[1.48] text-basalt-muted max-[34rem]:[margin-inline:auto]"
    >
      {description}
    </p>
    <!-- Date and Share read as one caption row under the title, so the card ends on a single line
         instead of two stacked scraps. -->
    <div
      class="celebration-meta m-0 flex flex-wrap items-center gap-actions [margin-block-start:0.35rem] max-[34rem]:justify-center"
    >
      <p class="earned m-0 text-[0.86rem] font-extrabold">{earnedLine}</p>
      <AchievementShare card={shareCard} {copy} />
    </div>
  </div>
</section>

<style>
  .paw :global(svg) {
    width: 100%;
    height: 100%;
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
</style>
