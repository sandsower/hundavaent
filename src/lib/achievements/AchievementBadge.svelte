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
  const hasSecondRing = $derived(
    tier === 'silver' || tier === 'gold' || tier === 'platinum'
  );
  const hasThirdRing = $derived(tier === 'platinum');
  const hasRaisedEdge = $derived(tier === 'gold' || tier === 'platinum');

  // One broad, eight-lobed outline keeps the rosette calm at compact sizes. The path is static so
  // every state, surface and animation shares exactly the same silhouette.
  const rosettePath =
    'M43.112 10.87 Q50 5 56.888 10.87 Q63.777 16.74 72.798 17.46 Q81.82 18.18 82.54 27.202 Q83.26 36.223 89.13 43.112 Q95 50 89.13 56.888 Q83.26 63.777 82.54 72.798 Q81.82 81.82 72.798 82.54 Q63.777 83.26 56.888 89.13 Q50 95 43.112 89.13 Q36.223 83.26 27.202 82.54 Q18.18 81.82 17.46 72.798 Q16.74 63.777 10.87 56.888 Q5 50 10.87 43.112 Q16.74 36.223 17.46 27.202 Q18.18 18.18 27.202 17.46 Q36.223 16.74 43.112 10.87 Z';
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
