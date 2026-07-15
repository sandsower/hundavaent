<script lang="ts">
  import { onMount, untrack } from 'svelte';

  interface Props {
    placeId: string;
    mediaId: string;
    url: string;
    urlExpiresAt: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
    loading?: 'eager' | 'lazy';
  }

  let {
    placeId,
    mediaId,
    url,
    urlExpiresAt,
    alt,
    width,
    height,
    className,
    loading = 'lazy'
  }: Props = $props();
  const stablePlaceId = untrack(() => placeId);
  const stableMediaId = untrack(() => mediaId);
  let currentUrl = $state(untrack(() => url));
  let currentExpiry = $state(untrack(() => urlExpiresAt));
  let refreshRequest: Promise<void> | null = null;
  let lastFailedUrl: string | null = null;

  onMount(() => {
    if (Date.parse(currentExpiry) <= Date.now()) void refreshUrl();
  });

  function refreshUrl(): Promise<void> {
    if (refreshRequest) return refreshRequest;
    refreshRequest = fetch(
      `/api/places/${encodeURIComponent(stablePlaceId)}/photos/${encodeURIComponent(stableMediaId)}`,
      { headers: { accept: 'application/json' } }
    )
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { url?: unknown; urlExpiresAt?: unknown };
        if (typeof payload.url !== 'string' || typeof payload.urlExpiresAt !== 'string') return;
        currentUrl = payload.url;
        currentExpiry = payload.urlExpiresAt;
      })
      .catch(() => undefined)
      .finally(() => {
        refreshRequest = null;
      });
    return refreshRequest;
  }

  function recoverExpiredUrl(): void {
    if (Date.parse(currentExpiry) > Date.now()) return;
    if (lastFailedUrl === currentUrl) return;
    lastFailedUrl = currentUrl;
    void refreshUrl();
  }
</script>

<img
  class={className}
  src={currentUrl}
  {alt}
  {width}
  {height}
  {loading}
  onerror={recoverExpiredUrl}
/>
