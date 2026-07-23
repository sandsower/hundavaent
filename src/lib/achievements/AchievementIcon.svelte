<script lang="ts">
  import type { AchievementGroup } from '$server/achievements/achievements';

  interface Props {
    achievementKey: string;
    group: AchievementGroup;
  }

  let { achievementKey, group }: Props = $props();

  const motif = $derived(
    achievementKey === 'first_favourite'
      ? 'favourite'
      : achievementKey === 'first_rating'
        ? 'rating'
        : achievementKey === 'first_checkin'
          ? 'place'
          : achievementKey === 'explorer_ten_places'
            ? 'trail'
            : achievementKey === 'category_curious'
              ? 'categories'
              : achievementKey === 'capital_region_wanderer'
                ? 'map'
                : achievementKey === 'first_accepted_contribution'
                  ? 'contribution'
                  : achievementKey === 'sustained_quality_contributor'
                    ? 'quality'
                    : group === 'longevity'
                      ? 'longevity'
                      : 'paw'
  );
</script>

<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" data-achievement-icon data-motif={motif}>
  {#if motif === 'favourite'}
    <path
      d="M24 39S8.5 30.1 8.5 18.2c0-5 3.6-8.7 8.4-8.7 3 0 5.7 1.7 7.1 4.2 1.4-2.5 4.1-4.2 7.1-4.2 4.8 0 8.4 3.7 8.4 8.7C39.5 30.1 24 39 24 39Z"
    />
    <circle cx="20" cy="22" r="1.7" class="solid" />
    <circle cx="28" cy="22" r="1.7" class="solid" />
    <path d="M19.5 28.5c2.7 2.4 6.3 2.4 9 0" />
  {:else if motif === 'rating'}
    <path
      d="m24 7 4.8 9.8 10.8 1.6-7.8 7.6 1.8 10.8L24 31.7l-9.6 5.1L16.2 26l-7.8-7.6 10.8-1.6L24 7Z"
    />
    <path d="M19.5 24.6c3 2.4 6 2.4 9 0" />
  {:else if motif === 'place'}
    <path d="M36 20.5C36 29.5 24 40 24 40S12 29.5 12 20.5a12 12 0 1 1 24 0Z" />
    <circle cx="24" cy="20" r="4.2" />
  {:else if motif === 'trail'}
    <path d="M8 36c5-1 5-7 10-8s5 4 10 2 4-9 12-11" class="trail" />
    <circle cx="8" cy="36" r="2.5" class="solid" />
    <path d="M34 11h7v7" />
    <path d="m41 11-9 9" />
  {:else if motif === 'categories'}
    <rect x="8" y="8" width="12" height="12" rx="3" />
    <rect x="28" y="8" width="12" height="12" rx="6" />
    <path d="M8 40 14 27l6 13H8Z" />
    <path d="m34 27 7 7-7 7-7-7 7-7Z" />
  {:else if motif === 'map'}
    <path d="m7 12 10-4 14 4 10-4v28l-10 4-14-4-10 4V12Z" />
    <path d="M17 8v28M31 12v28" />
    <circle cx="24" cy="23" r="3" class="solid" />
  {:else if motif === 'contribution'}
    <path d="M13 7h16l7 7v27H13V7Z" />
    <path d="M29 7v8h7M18 25l4 4 8-9" />
  {:else if motif === 'quality'}
    <path d="M24 6c5 4 10 5 15 6v10c0 10-6.2 16.4-15 20-8.8-3.6-15-10-15-20V12c5-1 10-2 15-6Z" />
    <path d="m17 24 5 5 10-11" />
  {:else if motif === 'longevity'}
    <circle cx="24" cy="24" r="17" />
    <path d="M24 13v12l8 5" />
    <path d="M12 9.5 9 13M36 9.5l3 3.5" />
  {:else}
    <circle cx="17" cy="16" r="4" />
    <circle cx="31" cy="16" r="4" />
    <circle cx="11" cy="26" r="3.5" />
    <circle cx="37" cy="26" r="3.5" />
    <path d="M15 35c0-6 4-10 9-10s9 4 9 10c0 4-3 6-9 6s-9-2-9-6Z" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    stroke: currentColor;
    stroke-width: 2.15;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .solid {
    fill: currentColor;
    stroke: none;
  }

  .trail {
    stroke-dasharray: 3 4;
  }
</style>
