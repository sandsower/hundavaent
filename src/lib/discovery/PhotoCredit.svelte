<script lang="ts">
  interface Props {
    attributionText: string;
    attributionUrl: string | null;
    sourceUrl: string | null;
    licenseReference: string;
    licenseUrl: string | null;
  }

  let { attributionText, attributionUrl, sourceUrl, licenseReference, licenseUrl }: Props =
    $props();
</script>

<span class="photo-credit">
  <!-- eslint-disable svelte/no-navigation-without-resolve -- externally supplied photo and license links -->
  {#if attributionUrl || sourceUrl}
    <a href={attributionUrl ?? sourceUrl ?? undefined} target="_blank" rel="noreferrer"
      >{attributionText}</a
    >
  {:else}
    <span>{attributionText}</span>
  {/if}
  <span aria-hidden="true">·</span>
  {#if licenseUrl}
    <a href={licenseUrl} target="_blank" rel="noreferrer">{licenseReference}</a>
  {:else}
    <span>{licenseReference}</span>
  {/if}
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</span>

<style>
  .photo-credit {
    display: flex;
    min-width: 0;
    gap: 0.25rem;
    align-items: baseline;
    color: var(--hv-color-basalt-muted);
    font-size: 0.68rem;
    line-height: 1.25;
  }

  a,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a {
    color: inherit;
  }
</style>
