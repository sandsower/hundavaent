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
  class="badge"
  data-achievement-badge
  data-badge-shape="woven-rosette"
  data-badge-state={state}
  data-badge-tier={tier ?? 'bespoke'}
  aria-hidden="true"
>
  <svg class="rosette" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path
      class="shell"
      class:raised={hasRaisedEdge}
      data-badge-raised-edge={hasRaisedEdge ? '' : undefined}
      d={rosettePath}
    />
    <g transform="translate(9 9) scale(.82)">
      <path class="face" d={rosettePath} />
    </g>

    {#if hasThirdRing}
      <g transform="translate(7 7) scale(.86)">
        <path class="ring tertiary" data-badge-ring d={rosettePath} />
      </g>
    {/if}
    {#if hasSecondRing}
      <g transform="translate(10.5 10.5) scale(.79)">
        <path class="ring secondary" data-badge-ring d={rosettePath} />
      </g>
    {/if}
    <g transform="translate(15 15) scale(.70)">
      <path class="ring primary" data-badge-ring d={rosettePath} />
    </g>

    {#if state === 'started'}
      <path
        class="progress"
        d={rosettePath}
        pathLength="100"
        stroke-dasharray={`${progressPercent} 100`}
      />
    {/if}
  </svg>

  <span class="motif" data-badge-motif>
    <AchievementIcon {achievementKey} {collection} {group} />
  </span>

  {#if sparks.length > 0}
    <span class="sparkles" data-badge-sparkles>
      {#each sparks as spark, index (index)}
        <i
          style:top={`${spark.top.toFixed(1)}%`}
          style:left={`${spark.left.toFixed(1)}%`}
          style:width={`${spark.size.toFixed(1)}%`}
          style:rotate={`${spark.spin}deg`}
        >
          <b
            class="rays"
            style:animation-delay={`${spark.delay.toFixed(2)}s`}
            style:animation-duration={`${spark.duration.toFixed(2)}s`}
          ></b>
          <b
            class="core"
            style:animation-delay={`${spark.delay.toFixed(2)}s`}
            style:animation-duration={`${spark.duration.toFixed(2)}s`}
          ></b>
          <b
            class="spark-ring"
            style:animation-delay={`${spark.delay.toFixed(2)}s`}
            style:animation-duration={`${spark.duration.toFixed(2)}s`}
          ></b>
        </i>
      {/each}
    </span>
  {/if}
</span>

<style>
  .badge {
    --badge-shell: var(--hv-color-moss-ink);
    --badge-shell-edge: color-mix(in srgb, var(--hv-color-moss-ink) 72%, black);
    --badge-face: var(--hv-color-moss);
    --badge-face-edge: color-mix(in srgb, var(--hv-color-moss) 48%, white);
    --badge-motif: var(--hv-color-snow-raised);
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    color: var(--badge-motif);
    filter: drop-shadow(
      0 0.24rem 0.24rem color-mix(in srgb, var(--hv-color-basalt) 18%, transparent)
    );
  }

  .rosette {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .shell,
  .face,
  .ring,
  .progress {
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .shell {
    fill: var(--badge-shell);
    stroke: var(--badge-shell-edge);
    stroke-width: 3;
  }

  .shell.raised {
    stroke-width: 5.5;
  }

  .face {
    fill: var(--badge-face);
    stroke: var(--badge-face-edge);
    stroke-width: 2;
  }

  .ring {
    fill: none;
    stroke: color-mix(in srgb, var(--badge-motif) 78%, transparent);
    vector-effect: non-scaling-stroke;
  }

  .ring.primary {
    stroke-width: 1.35;
    stroke-dasharray: 2.5 3.2;
  }

  .ring.secondary {
    stroke-width: 1;
    opacity: 0.7;
  }

  .ring.tertiary {
    stroke-width: 0.9;
    stroke-dasharray: 1.5 2.2;
    opacity: 0.85;
  }

  .progress {
    fill: none;
    stroke: var(--hv-color-fjord);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dasharray var(--hv-motion-quick) var(--hv-ease-settle);
  }

  .motif {
    position: absolute;
    top: 35%;
    left: 35%;
    display: block;
    width: 30%;
    height: 30%;
  }

  /* Each burst grows from a dot into a four-pointed star with long rays, then hands off to an
     expanding dashed ring as it fades - the same dashed language the rosette's own rings and the
     locked tier cells speak. Ambient scenery, so it rides the ambient token and stops entirely
     under reduced motion. */
  .sparkles {
    position: absolute;
    z-index: 3;
    inset: -14%;
    pointer-events: none;
  }

  .sparkles i {
    position: absolute;
    aspect-ratio: 1;
  }

  .sparkles b {
    position: absolute;
    inset: 0;
    display: block;
    opacity: 0;
  }

  .core {
    background: color-mix(in srgb, var(--badge-shell) 58%, var(--badge-face-edge));
    clip-path: polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%);
    animation: spark-core var(--hv-motion-ambient) var(--hv-ease-settle) infinite;
  }

  .rays {
    background: color-mix(in srgb, var(--badge-shell) 58%, var(--badge-face-edge));
    clip-path: polygon(
      50% 0%,
      51.4% 47%,
      100% 50%,
      51.4% 53%,
      50% 100%,
      48.6% 53%,
      0% 50%,
      48.6% 47%
    );
    animation: spark-rays var(--hv-motion-ambient) var(--hv-ease-settle) infinite;
  }

  .spark-ring {
    border: 0.14em dashed color-mix(in srgb, var(--badge-shell) 58%, var(--badge-face-edge));
    border-radius: 50%;
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

  @media (prefers-reduced-motion: reduce) {
    .sparkles {
      display: none;
    }
  }

  .badge[data-badge-state='earned'][data-badge-tier='bronze'] {
    --badge-shell: #704126;
    --badge-shell-edge: #59331f;
    --badge-face: #a96843;
    --badge-face-edge: #ce9a77;
  }

  .badge[data-badge-state='earned'][data-badge-tier='silver'] {
    --badge-shell: #466873;
    --badge-shell-edge: #34545e;
    --badge-face: #7899a3;
    --badge-face-edge: #b7ced4;
  }

  .badge[data-badge-state='earned'][data-badge-tier='gold'] {
    --badge-shell: #755834;
    --badge-shell-edge: #584128;
    --badge-face: #bf9560;
    --badge-face-edge: #e0c49d;
  }

  .badge[data-badge-state='earned'][data-badge-tier='platinum'] {
    --badge-shell: #456d73;
    --badge-shell-edge: #2f5157;
    --badge-face: #d6e8e8;
    --badge-face-edge: #f5ffff;
    --badge-motif: #315c62;
  }

  .badge[data-badge-state='started'] {
    --badge-shell: color-mix(in srgb, var(--hv-border-subtle) 74%, white);
    --badge-shell-edge: color-mix(in srgb, var(--hv-border-subtle) 74%, var(--hv-color-basalt));
    --badge-face: color-mix(in srgb, var(--hv-color-fjord-soft) 56%, white);
    --badge-face-edge: color-mix(in srgb, var(--hv-color-fjord) 38%, white);
    --badge-motif: var(--hv-color-fjord);
  }

  .badge[data-badge-state='locked'] {
    --badge-shell: color-mix(in srgb, var(--hv-border-subtle) 74%, white);
    --badge-shell-edge: color-mix(in srgb, var(--hv-border-subtle) 74%, var(--hv-color-basalt));
    --badge-face: color-mix(in srgb, var(--hv-color-snow) 74%, var(--hv-border-subtle));
    --badge-face-edge: color-mix(in srgb, var(--hv-border-subtle) 56%, white);
    --badge-motif: color-mix(in srgb, var(--hv-color-basalt-muted) 62%, white);
    filter: none;
  }

  .badge[data-badge-state='secret'] {
    --badge-shell: color-mix(in srgb, var(--hv-color-basalt) 78%, var(--hv-color-fjord));
    --badge-shell-edge: var(--hv-color-basalt);
    --badge-face: color-mix(in srgb, var(--hv-color-basalt) 82%, var(--hv-color-fjord));
    --badge-face-edge: color-mix(in srgb, var(--hv-color-basalt-muted) 76%, white);
    --badge-motif: color-mix(in srgb, var(--hv-color-basalt-muted) 68%, white);
  }

  .badge[data-badge-state='secret'] .motif {
    opacity: 0.54;
  }
</style>
