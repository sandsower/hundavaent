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

<span
  class="photo-credit flex min-w-0 items-baseline gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.68rem] leading-[1.25] text-basalt-muted"
>
  <!-- eslint-disable svelte/no-navigation-without-resolve -- externally supplied photo and license links -->
  {#if attributionUrl || sourceUrl}
    <a
      class="overflow-hidden text-ellipsis whitespace-nowrap text-inherit"
      href={attributionUrl ?? sourceUrl ?? undefined}
      target="_blank"
      rel="noreferrer">{attributionText}</a
    >
  {:else}
    <span class="overflow-hidden text-ellipsis whitespace-nowrap">{attributionText}</span>
  {/if}
  <span class="overflow-hidden text-ellipsis whitespace-nowrap" aria-hidden="true">·</span>
  {#if licenseUrl}
    <a
      class="overflow-hidden text-ellipsis whitespace-nowrap text-inherit"
      href={licenseUrl}
      target="_blank"
      rel="noreferrer">{licenseReference}</a
    >
  {:else}
    <span class="overflow-hidden text-ellipsis whitespace-nowrap">{licenseReference}</span>
  {/if}
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</span>
