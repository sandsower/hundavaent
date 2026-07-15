<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';

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
  const retryDelaysMs = [250, 1_000] as const;
  let refreshRequest: Promise<boolean> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryIndex = 0;
  let destroyed = false;
  let lastFailedUrl: string | null = null;

  onMount(() => {
    if (Date.parse(currentExpiry) <= Date.now()) void refreshUrl();
  });

  onDestroy(() => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
  });

  function refreshUrl(): Promise<boolean> {
    if (refreshRequest) return refreshRequest;
    const request = fetch(
      `/api/places/${encodeURIComponent(stablePlaceId)}/photos/${encodeURIComponent(stableMediaId)}`,
      { headers: { accept: 'application/json' } }
    )
      .then(async (response): Promise<boolean> => {
        if (!response.ok) return false;
        const payload = (await response.json()) as { url?: unknown; urlExpiresAt?: unknown };
        if (typeof payload.url !== 'string' || typeof payload.urlExpiresAt !== 'string')
          return false;
        if (!isHttpUrl(payload.url) || Date.parse(payload.urlExpiresAt) <= Date.now()) return false;
        currentUrl = payload.url;
        currentExpiry = payload.urlExpiresAt;
        return true;
      })
      .catch(() => false);
    refreshRequest = request;
    void request.then((refreshed) => {
      if (refreshRequest === request) refreshRequest = null;
      if (destroyed) return;
      if (refreshed) {
        retryIndex = 0;
        lastFailedUrl = null;
      } else {
        scheduleRetry();
      }
    });
    return request;
  }

  function scheduleRetry(): void {
    if (retryTimer || retryIndex >= retryDelaysMs.length) return;
    const delay = retryDelaysMs[retryIndex++];
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (!destroyed) void refreshUrl();
    }, delay);
  }

  function isHttpUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
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
