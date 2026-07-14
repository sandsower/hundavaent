<script lang="ts">
  import '../../app.css';

  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { env } from '$env/dynamic/public';
  import { onMount } from 'svelte';

  import {
    initializePostHog,
    postHogAnalytics,
    resolvePostHogConfig
  } from '$lib/analytics/posthog';
  import { replaceLocaleInUrl } from '$i18n/url';

  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
  let currentHash = $state('');
  let hydrated = $state(false);
  let isDiscovery = $derived(page.route.id === '/[lang=lang]');
  let isPlaceStatus = $derived(page.route.id === '/[lang=lang]/places/[id]');
  let isMemberOrContribution = $derived(
    page.route.id?.startsWith('/[lang=lang]/account') === true ||
      page.route.id === '/[lang=lang]/saved' ||
      page.route.id === '/[lang=lang]/history' ||
      page.route.id === '/[lang=lang]/suggest' ||
      page.route.id === '/[lang=lang]/places/[id]/correct' ||
      page.route.id === '/[lang=lang]/places/[id]/report' ||
      page.route.id === '/[lang=lang]/places/[id]/rate'
  );
  let isModeration = $derived(page.route.id?.startsWith('/[lang=lang]/moderation') === true);
  let northStarMode = $derived(
    isDiscovery || isPlaceStatus || isMemberOrContribution
      ? 'place'
      : isModeration
        ? 'operations'
        : undefined
  );
  const currentBrowserUrl = $derived.by(() => {
    const currentUrl = new URL(page.url.href);
    currentUrl.hash = currentHash;
    return currentUrl;
  });
  const accountReturnTo = $derived(
    `${currentBrowserUrl.pathname}${currentBrowserUrl.search}${currentBrowserUrl.hash}`
  );

  onMount(() => {
    const postHogEnvironment = {
      PUBLIC_POSTHOG_TOKEN: env.PUBLIC_POSTHOG_TOKEN,
      PUBLIC_POSTHOG_HOST: env.PUBLIC_POSTHOG_HOST
    };

    let stopBrowserErrorTracking: () => void = () => undefined;
    if (resolvePostHogConfig(postHogEnvironment)) {
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
</script>

<svelte:head>
  <title>{data.copy['site.name']}</title>
  <meta name="description" content={data.copy['meta.description']} />
</svelte:head>

<header
  class="site-header"
  class:north-star={northStarMode !== undefined}
  data-ui-mode={northStarMode}
  data-app-hydrated={hydrated}
>
  <a
    class="brand"
    href={resolve('/[lang=lang]', { lang: data.lang })}
    aria-label={data.copy['site.name']}
  >
    <img src="/favicon.svg" alt="" width="42" height="42" />
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
      onclick={refreshAccountHref}
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

<style>
  .site-header {
    position: relative;
    z-index: 10;
    display: flex;
    width: min(100% - 2rem, 72rem);
    margin: 0 auto;
    padding-top: 1rem;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    display: inline-flex;
    gap: 0.55rem;
    align-items: center;
    color: var(--ink);
    font-size: 1.2rem;
    font-weight: 950;
    letter-spacing: -0.03em;
    text-decoration: none;
  }

  .brand h1 {
    margin: 0;
    font: inherit;
  }

  .brand img {
    filter: drop-shadow(0.13rem 0.16rem 0 var(--ink));
    transform: rotate(-4deg);
  }

  /* A bordered segmented toggle so the current language reads as a state, not a button. */
  nav {
    display: flex;
    gap: 0.15rem;
    padding: 0.15rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--paper-light, #fffaef);
  }

  nav a {
    padding: 0.25rem 0.6rem;
    border: 2px solid transparent;
  }

  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    justify-content: flex-end;
  }

  .mobile-menu {
    display: none;
  }

  a {
    padding: 0.4rem 0.7rem;
    border: 2px solid transparent;
    border-radius: 999px;
    color: var(--ink);
    font-weight: 800;
  }

  a[aria-current='page'] {
    border-color: var(--ink);
    background: var(--sun);
    text-decoration: none;
  }

  .account-link {
    border-color: var(--ink);
    background: var(--teal);
    color: white;
    text-decoration: none;
    box-shadow: 0 0.18rem 0 var(--ink);
  }

  a:focus-visible {
    outline: 4px solid var(--focus);
    outline-offset: 3px;
  }

  .site-header.north-star {
    width: min(100% - 2rem, 96rem);
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--hv-border-subtle);
  }

  .site-header.north-star .brand {
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: 1.4rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .site-header.north-star .brand img {
    filter: none;
    transform: none;
  }

  .site-header.north-star nav {
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
  }

  .site-header.north-star a {
    border-width: 1px;
    border-radius: var(--hv-radius-control);
    color: var(--hv-color-basalt);
  }

  .site-header.north-star a[aria-current='page'] {
    border-color: var(--hv-color-basalt);
    background: var(--hv-color-signal);
  }

  .site-header.north-star .account-link {
    border-color: var(--hv-color-basalt);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    box-shadow: none;
  }

  .site-header.north-star a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  @media (max-width: 34rem) {
    .site-header {
      display: grid;
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
      border: 2px solid var(--ink);
      border-radius: 999px;
      background: var(--paper-light);
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
      border: 2px solid var(--ink);
      border-radius: 1rem;
      background: var(--paper-light);
      padding: 0.75rem;
      box-shadow: var(--shadow-offset) var(--shadow-offset) 0 var(--amber);
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

    .site-header.north-star .mobile-menu summary,
    .site-header.north-star .mobile-menu-panel {
      border-width: 1px;
      border-radius: var(--hv-radius-control);
      border-color: var(--hv-color-basalt);
      background: var(--hv-color-snow-raised);
      box-shadow: var(--hv-shadow-raised);
    }
  }
</style>
