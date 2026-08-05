<script lang="ts">
  import type { AchievementGroup, AchievementTier } from '$server/achievements/achievements';
  import AchievementIcon from './AchievementIcon.svelte';

  type AchievementBadgeState = 'earned' | 'started' | 'locked' | 'secret';

  interface Props {
    achievementKey: string;
    group: AchievementGroup;
    collection?: string | null;
    tier?: AchievementTier | null;
    state?: AchievementBadgeState;
    progress?: number;
  }

  let {
    achievementKey,
    group,
    collection = null,
    tier = null,
    state = 'earned',
    progress = 0
  }: Props = $props();

  const progressPercent = $derived(Math.round(Math.min(1, Math.max(0, progress)) * 100));
  const hasSecondRing = $derived(tier === 'silver' || tier === 'gold' || tier === 'platinum');
  const hasThirdRing = $derived(tier === 'platinum');
  const hasRaisedEdge = $derived(tier === 'gold' || tier === 'platinum');

  // One broad, eight-lobed outline keeps the rosette calm at compact sizes. The path is static so
  // every state, surface and animation shares exactly the same silhouette.
  const rosettePath =
    'M43.112 10.87 Q50 5 56.888 10.87 Q63.777 16.74 72.798 17.46 Q81.82 18.18 82.54 27.202 Q83.26 36.223 89.13 43.112 Q95 50 89.13 56.888 Q83.26 63.777 82.54 72.798 Q81.82 81.82 72.798 82.54 Q63.777 83.26 56.888 89.13 Q50 95 43.112 89.13 Q36.223 83.26 27.202 82.54 Q18.18 81.82 17.46 72.798 Q16.74 63.777 10.87 56.888 Q5 50 10.87 43.112 Q16.74 36.223 17.46 27.202 Q18.18 18.18 27.202 17.46 Q36.223 16.74 43.112 10.87 Z';

  interface Spark {
    top: number;
    left: number;
    size: number;
    spin: number;
    delay: number;
    duration: number;
  }

  // An earned medal catches the light. Each badge gets its own scatter of four or five bursts,
  // placed polar-fashion around the rim so they never bury the motif, at different sizes and
  // tempos and free to overlap. Seeded from the achievement's own key so the arrangement is
  // stable across re-renders and identical between server and client render.
  const sparks = $derived.by((): Spark[] => {
    if (state !== 'earned') return [];
    const key = `${achievementKey}:${tier ?? 'bespoke'}`;
    let seed = 0;
    for (let index = 0; index < key.length; index += 1) {
      seed = (seed * 31 + key.charCodeAt(index)) % 100000;
    }
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const scatter: Spark[] = [];
    const count = 4 + Math.floor(random() * 2);
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 0.34 + random() * 0.2;
      const size = 12 + random() * 26;
      scatter.push({
        top: 50 + Math.sin(angle) * radius * 100 - size / 2,
        left: 50 + Math.cos(angle) * radius * 100 - size / 2,
        size,
        spin: Math.round(random() * 90),
        delay: random() * 4.5,
        duration: 3.4 + random() * 2.6
      });
    }
    return scatter;
  });
</script>

<span
  class="badge group [--badge-shell:var(--hv-color-moss-ink)] [--badge-shell-edge:color-mix(in_srgb,var(--hv-color-moss-ink)_72%,black)] [--badge-face:var(--hv-color-moss)] [--badge-face-edge:color-mix(in_srgb,var(--hv-color-moss)_48%,white)] [--badge-motif:var(--hv-color-snow-raised)] relative block w-full aspect-square text-[var(--badge-motif)] drop-shadow-[0_0.24rem_0.24rem_color-mix(in_srgb,var(--hv-color-basalt)_18%,transparent)] data-[badge-state=earned]:data-[badge-tier=bronze]:[--badge-shell:#704126] data-[badge-state=earned]:data-[badge-tier=bronze]:[--badge-shell-edge:#59331f] data-[badge-state=earned]:data-[badge-tier=bronze]:[--badge-face:#a96843] data-[badge-state=earned]:data-[badge-tier=bronze]:[--badge-face-edge:#ce9a77] data-[badge-state=earned]:data-[badge-tier=silver]:[--badge-shell:#466873] data-[badge-state=earned]:data-[badge-tier=silver]:[--badge-shell-edge:#34545e] data-[badge-state=earned]:data-[badge-tier=silver]:[--badge-face:#7899a3] data-[badge-state=earned]:data-[badge-tier=silver]:[--badge-face-edge:#b7ced4] data-[badge-state=earned]:data-[badge-tier=gold]:[--badge-shell:#755834] data-[badge-state=earned]:data-[badge-tier=gold]:[--badge-shell-edge:#584128] data-[badge-state=earned]:data-[badge-tier=gold]:[--badge-face:#bf9560] data-[badge-state=earned]:data-[badge-tier=gold]:[--badge-face-edge:#e0c49d] data-[badge-state=earned]:data-[badge-tier=platinum]:[--badge-shell:#456d73] data-[badge-state=earned]:data-[badge-tier=platinum]:[--badge-shell-edge:#2f5157] data-[badge-state=earned]:data-[badge-tier=platinum]:[--badge-face:#d6e8e8] data-[badge-state=earned]:data-[badge-tier=platinum]:[--badge-face-edge:#f5ffff] data-[badge-state=earned]:data-[badge-tier=platinum]:[--badge-motif:#315c62] data-[badge-state=started]:[--badge-shell:color-mix(in_srgb,var(--hv-border-subtle)_74%,white)] data-[badge-state=started]:[--badge-shell-edge:color-mix(in_srgb,var(--hv-border-subtle)_74%,var(--hv-color-basalt))] data-[badge-state=started]:[--badge-face:color-mix(in_srgb,var(--hv-color-fjord-soft)_56%,white)] data-[badge-state=started]:[--badge-face-edge:color-mix(in_srgb,var(--hv-color-fjord)_38%,white)] data-[badge-state=started]:[--badge-motif:var(--hv-color-fjord)] data-[badge-state=locked]:[--badge-shell:color-mix(in_srgb,var(--hv-border-subtle)_74%,white)] data-[badge-state=locked]:[--badge-shell-edge:color-mix(in_srgb,var(--hv-border-subtle)_74%,var(--hv-color-basalt))] data-[badge-state=locked]:[--badge-face:color-mix(in_srgb,var(--hv-color-snow)_74%,var(--hv-border-subtle))] data-[badge-state=locked]:[--badge-face-edge:color-mix(in_srgb,var(--hv-border-subtle)_56%,white)] data-[badge-state=locked]:[--badge-motif:color-mix(in_srgb,var(--hv-color-basalt-muted)_62%,white)] data-[badge-state=locked]:[filter:none] data-[badge-state=secret]:[--badge-shell:color-mix(in_srgb,var(--hv-color-basalt)_78%,var(--hv-color-fjord))] data-[badge-state=secret]:[--badge-shell-edge:var(--hv-color-basalt)] data-[badge-state=secret]:[--badge-face:color-mix(in_srgb,var(--hv-color-basalt)_82%,var(--hv-color-fjord))] data-[badge-state=secret]:[--badge-face-edge:color-mix(in_srgb,var(--hv-color-basalt-muted)_76%,white)] data-[badge-state=secret]:[--badge-motif:color-mix(in_srgb,var(--hv-color-basalt-muted)_68%,white)]"
  data-achievement-badge
  data-badge-shape="woven-rosette"
  data-badge-state={state}
  data-badge-tier={tier ?? 'bespoke'}
  aria-hidden="true"
>
  <svg
    class="rosette block w-full h-full overflow-visible"
    viewBox="0 0 100 100"
    fill="none"
    aria-hidden="true"
  >
    <path
      class="shell fill-[var(--badge-shell)] stroke-[var(--badge-shell-edge)] [stroke-width:3] [stroke-linecap:round] [stroke-linejoin:round] [&.raised]:[stroke-width:5.5]"
      class:raised={hasRaisedEdge}
      data-badge-raised-edge={hasRaisedEdge ? '' : undefined}
      d={rosettePath}
    />
    <g transform="translate(9 9) scale(.82)">
      <path
        class="face fill-[var(--badge-face)] stroke-[var(--badge-face-edge)] [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]"
        d={rosettePath}
      />
    </g>

    {#if hasThirdRing}
      <g transform="translate(7 7) scale(.86)">
        <path
          class="ring tertiary fill-none stroke-[color-mix(in_srgb,var(--badge-motif)_78%,transparent)] [vector-effect:non-scaling-stroke] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:0.9] [stroke-dasharray:1.5_2.2] opacity-85"
          data-badge-ring
          d={rosettePath}
        />
      </g>
    {/if}
    {#if hasSecondRing}
      <g transform="translate(10.5 10.5) scale(.79)">
        <path
          class="ring secondary fill-none stroke-[color-mix(in_srgb,var(--badge-motif)_78%,transparent)] [vector-effect:non-scaling-stroke] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1] opacity-70"
          data-badge-ring
          d={rosettePath}
        />
      </g>
    {/if}
    <g transform="translate(15 15) scale(.70)">
      <path
        class="ring primary fill-none stroke-[color-mix(in_srgb,var(--badge-motif)_78%,transparent)] [vector-effect:non-scaling-stroke] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.35] [stroke-dasharray:2.5_3.2]"
        data-badge-ring
        d={rosettePath}
      />
    </g>

    {#if state === 'started'}
      <path
        class="progress fill-none stroke-fjord [stroke-width:5] [stroke-linecap:round] [stroke-linejoin:round] transition-[stroke-dasharray] duration-[var(--hv-motion-quick)] ease-settle"
        d={rosettePath}
        pathLength="100"
        stroke-dasharray={`${progressPercent} 100`}
      />
    {/if}
  </svg>

  <span
    class="motif absolute block top-[35%] left-[35%] w-[30%] h-[30%] group-data-[badge-state=secret]:opacity-54"
    data-badge-motif
  >
    <AchievementIcon {achievementKey} {collection} {group} />
  </span>

  {#if sparks.length > 0}
    <!-- Each burst grows from a dot into a four-pointed star with long rays, then hands off to an
         expanding dashed ring as it fades - the same dashed language the rosette's own rings and the
         locked tier cells speak. Ambient scenery, so it rides the ambient token and stops entirely
         under reduced motion. -->
    <span
      class="sparkles absolute z-[3] inset-[-14%] pointer-events-none motion-reduce:hidden"
      data-badge-sparkles
    >
      {#each sparks as spark, index (index)}
        <i
          class="absolute aspect-square"
          style:top={`${spark.top.toFixed(1)}%`}
          style:left={`${spark.left.toFixed(1)}%`}
          style:width={`${spark.size.toFixed(1)}%`}
          style:rotate={`${spark.spin}deg`}
        >
          <b
            class="rays absolute inset-0 block opacity-0 bg-[color-mix(in_srgb,var(--badge-shell)_58%,var(--badge-face-edge))] [clip-path:polygon(50%_0%,51.4%_47%,100%_50%,51.4%_53%,50%_100%,48.6%_53%,0%_50%,48.6%_47%)]"
            style:animation-delay={`${spark.delay.toFixed(2)}s`}
            style:animation-duration={`${spark.duration.toFixed(2)}s`}
          ></b>
          <b
            class="core absolute inset-0 block opacity-0 bg-[color-mix(in_srgb,var(--badge-shell)_58%,var(--badge-face-edge))] [clip-path:polygon(50%_0%,58%_42%,100%_50%,58%_58%,50%_100%,42%_58%,0%_50%,42%_42%)]"
            style:animation-delay={`${spark.delay.toFixed(2)}s`}
            style:animation-duration={`${spark.duration.toFixed(2)}s`}
          ></b>
          <b
            class="spark-ring absolute inset-0 block opacity-0 border-[0.14em] border-dashed border-[color-mix(in_srgb,var(--badge-shell)_58%,var(--badge-face-edge))] rounded-[50%]"
            style:animation-delay={`${spark.delay.toFixed(2)}s`}
            style:animation-duration={`${spark.duration.toFixed(2)}s`}
          ></b>
        </i>
      {/each}
    </span>
  {/if}
</span>

<style>
  .core {
    animation: spark-core var(--hv-motion-ambient) var(--hv-ease-settle) infinite;
  }

  .rays {
    animation: spark-rays var(--hv-motion-ambient) var(--hv-ease-settle) infinite;
  }

  .spark-ring {
    animation: spark-ring var(--hv-motion-ambient) var(--hv-ease-settle) infinite;
  }

  @keyframes spark-core {
    0% {
      opacity: 0;
      transform: scale(0.12);
    }
    3% {
      opacity: 1;
      transform: scale(0.2);
    }
    8% {
      opacity: 1;
      transform: scale(0.72) rotate(-6deg);
    }
    13% {
      opacity: 1;
      transform: scale(1) rotate(0deg);
    }
    20% {
      opacity: 0.85;
      transform: scale(0.66) rotate(6deg);
    }
    27% {
      opacity: 0;
      transform: scale(0.22) rotate(10deg);
    }
    100% {
      opacity: 0;
      transform: scale(0.12);
    }
  }

  @keyframes spark-rays {
    0%,
    5% {
      opacity: 0;
      transform: scale(0.2) rotate(45deg);
    }
    10% {
      opacity: 0.75;
      transform: scale(1.25) rotate(45deg);
    }
    15% {
      opacity: 0.9;
      transform: scale(1.55) rotate(45deg);
    }
    23% {
      opacity: 0.3;
      transform: scale(1.15) rotate(45deg);
    }
    29%,
    100% {
      opacity: 0;
      transform: scale(0.5) rotate(45deg);
    }
  }

  @keyframes spark-ring {
    0%,
    12% {
      opacity: 0;
      transform: scale(0.35) rotate(0deg);
    }
    17% {
      opacity: 0.7;
      transform: scale(0.85) rotate(12deg);
    }
    24% {
      opacity: 0.45;
      transform: scale(1.35) rotate(26deg);
    }
    33%,
    100% {
      opacity: 0;
      transform: scale(1.8) rotate(40deg);
    }
  }
</style>
