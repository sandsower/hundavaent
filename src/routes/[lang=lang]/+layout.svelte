<script lang="ts">
  import '../../app.css';

  import { afterNavigate, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { env } from '$env/dynamic/public';
  import { onMount } from 'svelte';

  import {
    initializePostHog,
    postHogAnalytics,
    resolvePostHogConfig
  } from '$lib/analytics/posthog';
  import AuthDialog from '$lib/auth/AuthDialog.svelte';
  import { requestAuthentication } from '$lib/auth/controller';
  import { replaceLocaleInUrl } from '$i18n/url';

  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
  let currentHash = $state('');
  let hydrated = $state(false);
  let isDiscovery = $derived(page.route.id === '/[lang=lang]');
  let isModeration = $derived(page.route.id?.startsWith('/[lang=lang]/moderation') === true);
  let northStarMode = $derived(isModeration ? 'operations' : 'place');
  const currentBrowserUrl = $derived.by(() => {
    const currentUrl = new URL(page.url.href);
    currentUrl.hash = currentHash;
    return currentUrl;
  });
  const accountReturnTo = $derived(
    `${currentBrowserUrl.pathname}${currentBrowserUrl.search}${currentBrowserUrl.hash}`
  );

  afterNavigate(() => {
    setTimeout(captureAuthResult, 0);
  });

  onMount(() => {
    const postHogEnvironment = {
      PUBLIC_POSTHOG_TOKEN: env.PUBLIC_POSTHOG_TOKEN,
      PUBLIC_POSTHOG_HOST: env.PUBLIC_POSTHOG_HOST
    };

    let stopBrowserErrorTracking: () => void = () => undefined;
    if (resolvePostHogConfig(postHogEnvironment)) {
      postHogAnalytics.prepare();
      stopBrowserErrorTracking = postHogAnalytics.startBrowserErrorTracking(window);
      void import('posthog-js').then(
        ({ default: posthog }) => initializePostHog(postHogEnvironment, posthog),
        () => undefined
      );
    }

    hydrated = true;
    const syncHash = () => {
      currentHash = window.location.hash;
    };

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => {
      stopBrowserErrorTracking();
      window.removeEventListener('hashchange', syncHash);
    };
  });

  function captureAuthResult(): void {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('authResult');
    const retryResolved = url.searchParams.get('pendingRetryResolved') === '1';
    if (!result && !retryResolved) return;

    if (result) {
      postHogAnalytics.capture('auth completed', {
        method: url.searchParams.get('authMethod') === 'facebook' ? 'facebook' : 'email',
        outcome: result === 'success' ? 'success' : 'failed'
      });
    }
    const pendingAction = url.searchParams.get('pendingAction');
    const pendingResult = url.searchParams.get('pendingResult');
    if (pendingAction === 'favourite' || pendingAction === 'rating') {
      postHogAnalytics.capture('auth pending action completed', {
        action: pendingAction,
        outcome: pendingResult === 'completed' ? 'completed' : 'queued'
      });
    }

    const namesToRemove = ['authResult', 'authMethod', 'pendingAction', 'pendingRetryResolved'];
    if (pendingResult !== 'retryable') {
      namesToRemove.push('pendingResult', 'pendingIntent');
    }
    for (const name of namesToRemove) {
      url.searchParams.delete(name);
    }
    const cleanedUrl = `${url.pathname}${url.search}${url.hash}` as `/${string}`;
    replaceState(resolve(cleanedUrl), page.state);
  }

  function refreshLanguageHref(event: MouseEvent, targetLocale: 'is' | 'en'): void {
    if (!(event.currentTarget instanceof HTMLAnchorElement)) return;
    event.currentTarget.href = resolve(replaceLocaleInUrl(window.location.href, targetLocale));
  }

  function refreshAccountHref(event: MouseEvent): void {
    if (
      !(event.currentTarget instanceof HTMLAnchorElement) ||
      page.route.id === '/[lang=lang]/account'
    ) {
      return;
    }
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    event.currentTarget.href = `${resolve('/[lang=lang]/account', { lang: data.lang })}?returnTo=${encodeURIComponent(returnTo)}`;
  }

  function openSignIn(event: MouseEvent): void {
    if (data.signedIn) {
      refreshAccountHref(event);
      return;
    }
    event.preventDefault();
    requestAuthentication({ origin: 'header' });
  }
</script>

<svelte:head>
  <title>{data.copy['site.name']}</title>
  <meta name="description" content={data.copy['meta.description']} />
</svelte:head>

<header class="site-header" data-ui-mode={northStarMode} data-app-hydrated={hydrated}>
  <a
    class="brand"
    href={resolve('/[lang=lang]', { lang: data.lang })}
    aria-label={data.copy['site.name']}
  >
    <svg class="brand-mark" viewBox="0 0 256 256" aria-hidden="true">
      <path
        d="M240,108a28,28,0,1,1-28-28A28,28,0,0,1,240,108ZM72,108a28,28,0,1,0-28,28A28,28,0,0,0,72,108ZM92,88A28,28,0,1,0,64,60,28,28,0,0,0,92,88Zm72,0a28,28,0,1,0-28-28A28,28,0,0,0,164,88Zm23.12,60.86a35.3,35.3,0,0,1-16.87-21.14,44,44,0,0,0-84.5,0A35.25,35.25,0,0,1,69,148.82,40,40,0,0,0,88,224a39.48,39.48,0,0,0,15.52-3.13,64.09,64.09,0,0,1,48.87,0,40,40,0,0,0,34.73-72Z"
      />
    </svg>
    {#if isDiscovery}
      <h1>{data.copy['site.name']}</h1>
    {:else}
      <span>{data.copy['site.name']}</span>
    {/if}
  </a>
  <div class="header-actions">
    <a class="about-link" href={resolve('/[lang=lang]/about', { lang: data.lang })}>
      {data.copy['nav.about']}
    </a>
    <nav class="language-switcher" aria-label={data.copy['nav.language']}>
      <a
        href={resolve(replaceLocaleInUrl(currentBrowserUrl, 'is'))}
        onclick={(event) => refreshLanguageHref(event, 'is')}
        lang="is"
        aria-current={data.lang === 'is' ? 'page' : undefined}
      >
        {data.copy['language.is']}
      </a>
      <a
        href={resolve(replaceLocaleInUrl(currentBrowserUrl, 'en'))}
        onclick={(event) => refreshLanguageHref(event, 'en')}
        lang="en"
        aria-current={data.lang === 'en' ? 'page' : undefined}
      >
        {data.copy['language.en']}
      </a>
    </nav>
    <details class="mobile-menu">
      <summary>{data.copy['nav.menu']}</summary>
      <div class="mobile-menu-panel">
        <a href={resolve('/[lang=lang]/about', { lang: data.lang })}>{data.copy['nav.about']}</a>
        <nav aria-label={data.copy['nav.language']}>
          <a
            href={resolve(replaceLocaleInUrl(currentBrowserUrl, 'is'))}
            onclick={(event) => refreshLanguageHref(event, 'is')}
            lang="is"
            aria-current={data.lang === 'is' ? 'page' : undefined}
          >
            {data.copy['language.is']}
          </a>
          <a
            href={resolve(replaceLocaleInUrl(currentBrowserUrl, 'en'))}
            onclick={(event) => refreshLanguageHref(event, 'en')}
            lang="en"
            aria-current={data.lang === 'en' ? 'page' : undefined}
          >
            {data.copy['language.en']}
          </a>
        </nav>
      </div>
    </details>
    <!-- The dynamic query preserves a server-validated local return path. -->
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      class="account-link"
      onclick={openSignIn}
      href={page.route.id === '/[lang=lang]/account'
        ? resolve('/[lang=lang]/account', { lang: data.lang })
        : `${resolve('/[lang=lang]/account', { lang: data.lang })}?returnTo=${encodeURIComponent(accountReturnTo)}`}
    >
      {data.signedIn ? data.copy['account.navSignedIn'] : data.copy['nav.account']}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </div>
</header>

{@render children()}

{#if !data.signedIn}
  <AuthDialog
    lang={data.lang}
    copy={data.copy}
    providers={data.providers ?? { email: false, facebook: false }}
    initialRequest={data.pendingAuthRequest ?? null}
  />
{/if}

<style>
  .site-header {
    position: relative;
    z-index: 10;
    display: flex;
    width: 100%;
    height: var(--hv-app-header-height);
    min-height: var(--hv-app-header-height);
    padding: 0 clamp(1rem, 2vw, 1.5rem);
    border-bottom: 1px solid var(--hv-border-subtle);
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
    background: var(--hv-color-snow-raised);
  }

  .brand {
    display: inline-flex;
    gap: 0.55rem;
    align-items: center;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: 1.4rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .brand h1 {
    margin: 0;
    font: inherit;
  }

  .brand-mark {
    width: 1.45rem;
    height: 1.45rem;
    flex: 0 0 auto;
    fill: var(--hv-color-brand-paw);
  }

  nav {
    display: flex;
    gap: 0.15rem;
    padding: 0.15rem;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
  }

  nav a {
    padding: 0.25rem 0.6rem;
    border: 1px solid transparent;
  }

  .header-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: flex-end;
  }

  .mobile-menu {
    display: none;
  }

  a {
    padding: 0.4rem 0.7rem;
    border: 1px solid transparent;
    border-radius: var(--hv-radius-control);
    color: var(--hv-color-basalt);
    font-weight: 800;
  }

  a[aria-current='page'] {
    border-color: var(--hv-color-fjord);
    background: var(--hv-color-fjord-soft);
    box-shadow: inset 0 -2px 0 var(--hv-color-fjord);
    text-decoration: none;
  }

  .account-link {
    border-color: var(--hv-color-basalt);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    text-decoration: none;
  }

  a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  @media (max-width: 42rem) {
    .site-header {
      display: grid;
      height: var(--hv-app-header-height);
      padding-block: 0.7rem;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.55rem;
    }

    .header-actions {
      display: contents;
    }

    .brand {
      grid-row: 1;
      grid-column: 1;
      justify-self: start;
    }

    .about-link {
      display: none;
    }

    .language-switcher {
      display: none;
    }

    .mobile-menu {
      position: relative;
      display: block;
      grid-row: 2;
      grid-column: 1 / -1;
      justify-self: end;
    }

    .mobile-menu summary {
      border: 1px solid var(--hv-color-basalt);
      border-radius: var(--hv-radius-control);
      background: var(--hv-color-snow-raised);
      padding: 0.4rem 0.8rem;
      font-weight: 850;
      cursor: pointer;
      list-style: none;
    }

    .mobile-menu summary::-webkit-details-marker {
      display: none;
    }

    .mobile-menu-panel {
      position: absolute;
      z-index: 20;
      top: calc(100% + 0.4rem);
      right: 0;
      display: grid;
      min-width: 13rem;
      gap: 0.55rem;
      border: 1px solid var(--hv-color-basalt);
      border-radius: var(--hv-radius-control);
      background: var(--hv-color-snow-raised);
      padding: 0.75rem;
      box-shadow: var(--hv-shadow-raised);
    }

    .mobile-menu-panel nav {
      display: flex;
    }

    .account-link {
      grid-row: 1;
      grid-column: 2;
      max-width: 9.5rem;
      line-height: 1.05;
      text-align: center;
    }
  }
</style>
