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
  class="rating-summary"
  aria-labelledby="rating-summary-heading"
  data-rating-summary
  data-rating-visible={summary.visible}
>
  <h3 id="rating-summary-heading">{copy['rating.summary.heading']}</h3>

  {#if summary.visible}
    {#if summary.eligibleCount !== null}
      <p class="eligible-count">
        {copy['rating.summary.eligibleCount'].replace('{count}', String(summary.eligibleCount))}
      </p>
    {/if}
    {#if summary.trailingTwelveMonthCount !== null}
      <p class="recency">
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
    <a href={rateHref} class="rate-link">{copy['rating.summary.rateLink']}</a>
  {/if}
</section>

<style>
  .rating-summary {
    display: grid;
    gap: 0.5rem;
    margin: 0.85rem 0 0;
    border: 2px dashed var(--ink);
    border-radius: 0.9rem;
    background: rgb(241 163 59 / 18%);
    padding: 0.85rem;
  }
  h3 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .eligible-count,
  .recency,
  .not-yet-rated-detail,
  .overall-pending {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-soft);
    font-weight: 700;
  }
  .not-yet-rated {
    margin: 0;
    font-weight: 850;
  }
  .dimensions {
    display: grid;
    gap: 0.3rem;
    margin: 0.2rem 0;
  }
  .dimensions div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .dimensions dt {
    font-size: 0.82rem;
    font-weight: 800;
  }
  .dimensions dd {
    margin: 0;
    font-weight: 900;
  }
  .overall {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0.15rem 0 0;
    padding-top: 0.4rem;
    border-top: 1px solid rgb(25 59 69 / 28%);
    font-weight: 900;
  }
  .overall strong {
    font-size: 1.1rem;
  }
  .rate-link {
    justify-self: start;
    margin-top: 0.15rem;
    color: var(--coral-dark);
    font-size: 0.82rem;
    font-weight: 850;
  }
  .rate-link:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 2px;
  }
</style>
