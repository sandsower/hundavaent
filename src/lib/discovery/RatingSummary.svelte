<script lang="ts">
  import type { Catalogue, MessageKey } from '$i18n';
  import type { DogFriendlinessSummary } from '$server/dog-friendliness/dog-friendliness';

  interface Props {
    summary: DogFriendlinessSummary;
    copy: Catalogue;
    signedIn: boolean;
    rateHref: string;
  }

  let { summary, copy, signedIn, rateHref }: Props = $props();

  function formatMean(mean: number): string {
    return mean.toFixed(1);
  }
</script>

<section
  class="rating-summary hv-panel"
  aria-labelledby="rating-summary-heading"
  data-rating-summary
  data-rating-visible={summary.visible}
  data-surface="rating-evidence"
  data-tone="info"
>
  <h3 id="rating-summary-heading" class="hv-eyebrow">{copy['rating.summary.heading']}</h3>

  {#if summary.visible}
    {#if summary.eligibleCount !== null}
      <p class="eligible-count hv-status" data-status="info">
        {copy['rating.summary.eligibleCount'].replace('{count}', String(summary.eligibleCount))}
      </p>
    {/if}
    {#if summary.trailingTwelveMonthCount !== null}
      <p class="recency hv-status" data-status="info">
        {copy['rating.summary.recencyContext'].replace(
          '{count}',
          String(summary.trailingTwelveMonthCount)
        )}
      </p>
    {/if}
    {#if summary.dimensions.length > 0}
      <dl class="dimensions">
        {#each summary.dimensions as dimension (dimension.dimension)}
          <div>
            <dt>{copy[`rating.dimension.${dimension.dimension}.label` as MessageKey]}</dt>
            <dd>{formatMean(dimension.mean)}</dd>
          </div>
        {/each}
      </dl>
    {/if}
    {#if summary.overallVisible && summary.overallMean !== null}
      <p class="overall">
        <span>{copy['rating.summary.overall']}</span>
        <strong>{formatMean(summary.overallMean)}</strong>
      </p>
    {:else}
      <p class="overall-pending">{copy['rating.summary.overallNotYetAvailable']}</p>
    {/if}
  {:else}
    <p class="not-yet-rated">{copy['rating.summary.notYetRated']}</p>
    <p class="not-yet-rated-detail">{copy['rating.summary.notYetRatedDetail']}</p>
  {/if}

  {#if signedIn}
    <!-- Exact local return context is assembled by the discovery owner. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href={rateHref} class="rate-link hv-control" data-intent="primary"
      >{copy['rating.summary.rateLink']}</a
    >
  {/if}
</section>

<style>
  .rating-summary {
    display: grid;
    gap: 0.6rem;
    margin: 0.85rem 0 0;
    border-color: var(--hv-color-fjord);
    border-left-width: 4px;
    background: var(--hv-color-fjord-soft);
    padding: var(--hv-space-panel);
  }

  h3 {
    margin: 0;
    font-size: 0.76rem;
  }

  .eligible-count,
  .not-yet-rated-detail,
  .overall-pending {
    margin: 0;
    font-size: 0.8rem;
    color: var(--hv-color-basalt-muted);
    font-weight: 700;
  }

  .recency {
    margin: 0;
    color: var(--hv-color-basalt-muted);
    font-weight: 700;
  }

  .eligible-count.hv-status,
  .recency.hv-status {
    width: fit-content;
    border-color: var(--hv-color-fjord);
    background: var(--hv-color-snow-raised);
  }

  .not-yet-rated {
    margin: 0;
    font-weight: 850;
  }

  .dimensions {
    display: grid;
    gap: 0;
    margin: 0.2rem 0;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
  }

  .dimensions div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.65rem;
  }

  .dimensions div + div {
    border-top: 1px solid var(--hv-border-subtle);
  }

  .dimensions dt {
    font-size: 0.82rem;
    font-weight: 800;
  }

  .dimensions dd {
    margin: 0;
    color: var(--hv-color-fjord);
    font-weight: 900;
  }

  .overall {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0.15rem 0 0;
    padding-top: 0.4rem;
    border-top: 1px solid var(--hv-color-fjord);
    font-weight: 900;
  }

  .overall strong {
    color: var(--hv-color-fjord);
    font-size: 1.1rem;
  }

  .rate-link {
    justify-self: start;
    margin-top: 0.15rem;
    font-size: 0.82rem;
  }
</style>
