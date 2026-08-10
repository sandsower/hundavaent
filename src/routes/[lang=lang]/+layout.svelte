<script lang="ts">
  import '../../app.css';

  import { afterNavigate, invalidateAll, onNavigate, replaceState } from '$app/navigation';
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
  import AchievementUnreadIndicator from '$lib/achievements/AchievementUnreadIndicator.svelte';
  import { shouldViewTransition } from '$lib/design-system/navigation';
  import { subscribeToAchievementAcknowledged } from '$lib/achievements/client';
  import {
    publishDeferredFavouriteRecognition,
    publishWeeklyRhythmActivation,
    publishWeeklyRhythmInvalidation,
    subscribeToWeeklyRhythmActivation,
    subscribeToWeeklyRhythmInvalidation
  } from '$lib/member-activity/client';
  import WeeklyRhythmIndicator from '$lib/member-activity/WeeklyRhythmIndicator.svelte';
  import type { WeeklyRhythm } from '$lib/member-activity/types';
  import { replaceLocaleInUrl } from '$i18n/url';

  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  // The server renders <html lang> exactly once (app.html's %lang%), so a client-side switch
  // between /is and /en leaves assistive tech announcing in the previous language. The document
  // element sits above every component, and this layout is the locale boundary, so it owns the
  // attribute after hydration.
  $effect(() => {
    document.documentElement.lang = data.lang;
  });

  let currentHash = $state('');
  let hydrated = $state(false);
  let translationModeRequested = $state(false);
  let TranslationModeComponent = $state<
    (typeof import('$lib/translations/TranslationMode.svelte'))['default'] | null
  >(null);
  let weeklyRhythm = $state<WeeklyRhythm>({ status: 'unavailable' });
  let achievementUnread = $state(false);
  let isDiscovery = $derived(page.route.id === '/[lang=lang]');
  let isModeration = $derived(page.route.id?.startsWith('/[lang=lang]/moderation') === true);
  let northStarMode = $derived(isModeration ? 'operations' : 'place');
  let translationPageId = $derived.by(() => {
    const routeId = page.route.id;
    if (!routeId || !routeId.startsWith('/[lang=lang]')) return null;
    const pageId = routeId === '/[lang=lang]' ? '/' : routeId.slice('/[lang=lang]'.length);
    return pageId === '/auth' || pageId.startsWith('/auth/') ? null : pageId;
  });
  let translationContextPath = $derived(`${page.url.pathname}${page.url.search}`);
  const currentBrowserUrl = $derived.by(() => {
    const currentUrl = new URL(page.url.href);
    currentUrl.hash = currentHash;
    return currentUrl;
  });
  const accountReturnTo = $derived(
    `${currentBrowserUrl.pathname}${currentBrowserUrl.search}${currentBrowserUrl.hash}`
  );
  const accountAccessibleLabel = $derived.by(() => {
    const parts = [data.signedIn ? data.copy['account.navSignedIn'] : data.copy['nav.account']];
    if (data.signedIn && achievementUnread) {
      parts.push(data.copy['achievements.accountUnread']);
    }
    if (data.signedIn && weeklyRhythm.status === 'available') {
      parts.push(
        weeklyRhythm.currentWeek.active
          ? data.copy['weeklyRhythm.accountActive']
          : data.copy['weeklyRhythm.accountOpen']
      );
    }
    return parts.join(' ');
  });

  $effect(() => {
    const loadedWeeklyRhythm = (
      data as typeof data & {
        weeklyRhythm?: WeeklyRhythm;
      }
    ).weeklyRhythm;
    weeklyRhythm = loadedWeeklyRhythm ?? { status: 'unavailable' };
    achievementUnread =
      (
        data as typeof data & {
          achievementStatus?: { enabled: boolean; hasUnread: boolean };
        }
      ).achievementStatus?.hasUnread ?? false;
  });

  $effect(() => {
    if (!data.translation || TranslationModeComponent || translationModeRequested) return;
    translationModeRequested = true;
    void import('$lib/translations/TranslationMode.svelte').then(({ default: component }) => {
      TranslationModeComponent = component;
    });
  });

  afterNavigate(() => {
    setTimeout(captureAuthResult, 0);
  });

  onNavigate((navigation) => {
    if (
      !shouldViewTransition({
        fromRouteId: navigation.from?.route.id ?? null,
        toRouteId: navigation.to?.route.id ?? null,
        prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        supported: typeof document.startViewTransition === 'function'
      })
    ) {
      return;
    }
    return new Promise((navigationReady) => {
      const transition = document.startViewTransition(async () => {
        navigationReady();
        await navigation.complete;
      });
      // A skipped transition (rapid double navigation, hidden tab, duplicate name) and a
      // failed load both reject these promises as their normal outcome; leaving them
      // unhandled would feed spurious unhandledrejection events to browser error tracking.
      transition.ready.catch(() => undefined);
      transition.finished.catch(() => undefined);
    });
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
    const stopWeeklyRhythmActivation = data.signedIn
      ? subscribeToWeeklyRhythmActivation((currentWeek) => {
          weeklyRhythm = { status: 'available', currentWeek };
        })
      : () => undefined;
    const stopWeeklyRhythmInvalidation = data.signedIn
      ? subscribeToWeeklyRhythmInvalidation(() => void invalidateAll())
      : () => undefined;
    const stopAchievementAcknowledgement = data.signedIn
      ? subscribeToAchievementAcknowledged(() => {
          achievementUnread = false;
        })
      : () => undefined;
    return () => {
      stopBrowserErrorTracking();
      stopWeeklyRhythmActivation();
      stopWeeklyRhythmInvalidation();
      stopAchievementAcknowledgement();
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
    if (pendingAction === 'favourite' && pendingResult === 'completed') {
      const placeId = url.searchParams.get('pendingPlaceId');
      const startsOn = url.searchParams.get('pendingCurrentWeekStartsOn');
      const endsOn = url.searchParams.get('pendingCurrentWeekEndsOn');
      const firstTimeForPlace = parseQueryBoolean(url.searchParams.get('pendingFirstTimeForPlace'));
      const activatedCurrentWeek = parseQueryBoolean(
        url.searchParams.get('pendingActivatedCurrentWeek')
      );
      const active = parseQueryBoolean(url.searchParams.get('pendingCurrentWeekActive'));
      if (
        placeId &&
        isDateOnlyQuery(startsOn) &&
        isDateOnlyQuery(endsOn) &&
        firstTimeForPlace === true &&
        activatedCurrentWeek !== null &&
        active !== null
      ) {
        const recognition = {
          action: 'favourite' as const,
          recognized: true,
          firstTimeForPlace,
          activatedCurrentWeek,
          currentWeek: { startsOn, endsOn, active }
        };
        const target =
          url.searchParams.get('place') === placeId && url.searchParams.get('view') !== 'list'
            ? 'selected'
            : 'list';
        publishDeferredFavouriteRecognition(placeId, target, recognition);
        if (activatedCurrentWeek) {
          publishWeeklyRhythmActivation(recognition.currentWeek);
          publishWeeklyRhythmInvalidation();
        }
      }
    }

    const namesToRemove = [
      'authResult',
      'authMethod',
      'pendingAction',
      'pendingRetryResolved',
      'pendingPlaceId',
      'pendingFirstTimeForPlace',
      'pendingActivatedCurrentWeek',
      'pendingCurrentWeekStartsOn',
      'pendingCurrentWeekEndsOn',
      'pendingCurrentWeekActive'
    ];
    if (pendingResult !== 'retryable') {
      namesToRemove.push('pendingResult', 'pendingIntent');
    }
    for (const name of namesToRemove) {
      url.searchParams.delete(name);
    }
    const cleanedUrl = `${url.pathname}${url.search}${url.hash}` as `/${string}`;
    replaceState(resolve(cleanedUrl), page.state);
  }

  function parseQueryBoolean(value: string | null): boolean | null {
    if (value === '1') return true;
    if (value === '0') return false;
    return null;
  }

  function isDateOnlyQuery(value: string | null): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

{#snippet languageNav()}
  <nav
    class="language-switcher flex gap-[0.15rem] p-[0.15rem] border border-border-subtle rounded-control bg-snow-raised group-data-[floating-chrome=true]/header:p-0 group-data-[floating-chrome=true]/header:border-0 group-data-[floating-chrome=true]/header:bg-transparent max-narrow:hidden"
    aria-label={data.copy['nav.language']}
  >
    <a
      class="px-[0.6rem] py-[0.25rem] border border-transparent rounded-control font-extrabold text-basalt aria-[current=page]:border-fjord aria-[current=page]:bg-fjord-soft aria-[current=page]:no-underline aria-[current=page]:shadow-[inset_0_-2px_0_var(--hv-color-fjord)] aria-[current=page]:focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] group-data-[floating-chrome=true]/header:px-[0.45rem] group-data-[floating-chrome=true]/header:py-[0.2rem] group-data-[floating-chrome=true]/header:rounded-none group-data-[floating-chrome=true]/header:text-[0.82rem] group-data-[floating-chrome=true]/header:font-[750] group-data-[floating-chrome=true]/header:text-basalt-muted group-data-[floating-chrome=true]/header:no-underline group-data-[floating-chrome=true]/header:aria-[current=page]:border-transparent group-data-[floating-chrome=true]/header:aria-[current=page]:bg-transparent group-data-[floating-chrome=true]/header:aria-[current=page]:text-basalt group-data-[floating-chrome=true]/header:aria-[current=page]:focus-visible:shadow-[inset_0_-2px_0_var(--hv-color-fjord)]"
      href={resolve(replaceLocaleInUrl(currentBrowserUrl, 'is'))}
      onclick={(event) => refreshLanguageHref(event, 'is')}
      lang="is"
      aria-current={data.lang === 'is' ? 'page' : undefined}
    >
      {data.copy['language.is']}
    </a>
    <a
      class="px-[0.6rem] py-[0.25rem] border border-transparent rounded-control font-extrabold text-basalt aria-[current=page]:border-fjord aria-[current=page]:bg-fjord-soft aria-[current=page]:no-underline aria-[current=page]:shadow-[inset_0_-2px_0_var(--hv-color-fjord)] aria-[current=page]:focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)] group-data-[floating-chrome=true]/header:px-[0.45rem] group-data-[floating-chrome=true]/header:py-[0.2rem] group-data-[floating-chrome=true]/header:rounded-none group-data-[floating-chrome=true]/header:text-[0.82rem] group-data-[floating-chrome=true]/header:font-[750] group-data-[floating-chrome=true]/header:text-basalt-muted group-data-[floating-chrome=true]/header:no-underline group-data-[floating-chrome=true]/header:aria-[current=page]:border-transparent group-data-[floating-chrome=true]/header:aria-[current=page]:bg-transparent group-data-[floating-chrome=true]/header:aria-[current=page]:text-basalt group-data-[floating-chrome=true]/header:aria-[current=page]:focus-visible:shadow-[inset_0_-2px_0_var(--hv-color-fjord)]"
      href={resolve(replaceLocaleInUrl(currentBrowserUrl, 'en'))}
      onclick={(event) => refreshLanguageHref(event, 'en')}
      lang="en"
      aria-current={data.lang === 'en' ? 'page' : undefined}
    >
      {data.copy['language.en']}
    </a>
  </nav>
{/snippet}

<!-- On discovery the header dissolves into floating pills over the map. -->
<!-- The narrow media query restated the header's own height/min-height verbatim, so only the
     gap actually changes below 42rem. -->
<header
  class="site-header group/header relative z-10 flex w-full h-[var(--hv-app-header-height)] min-h-[var(--hv-app-header-height)] items-center justify-between gap-4 px-edge py-0 border-b border-border-subtle bg-snow-raised data-[floating-chrome=true]:absolute data-[floating-chrome=true]:z-30 data-[floating-chrome=true]:top-0 data-[floating-chrome=true]:right-0 data-[floating-chrome=true]:left-0 data-[floating-chrome=true]:border-b-0 data-[floating-chrome=true]:bg-transparent data-[floating-chrome=true]:pointer-events-none max-narrow:gap-[clamp(0.35rem,2vw,0.6rem)]"
  data-ui-mode={northStarMode}
  data-app-hydrated={hydrated}
  data-floating-chrome={isDiscovery}
>
  <div
    class="brand-cluster contents group-data-[floating-chrome=true]/header:inline-flex group-data-[floating-chrome=true]/header:min-w-0 group-data-[floating-chrome=true]/header:items-center group-data-[floating-chrome=true]/header:gap-[0.4rem] group-data-[floating-chrome=true]/header:pt-[0.3rem] group-data-[floating-chrome=true]/header:pr-[0.6rem] group-data-[floating-chrome=true]/header:pb-[0.3rem] group-data-[floating-chrome=true]/header:pl-[0.9rem] group-data-[floating-chrome=true]/header:border group-data-[floating-chrome=true]/header:border-border-subtle group-data-[floating-chrome=true]/header:rounded-[999px] group-data-[floating-chrome=true]/header:bg-snow-raised group-data-[floating-chrome=true]/header:shadow-raised group-data-[floating-chrome=true]/header:pointer-events-auto max-narrow:group-data-[floating-chrome=true]/header:pt-[0.25rem] max-narrow:group-data-[floating-chrome=true]/header:pr-[0.55rem] max-narrow:group-data-[floating-chrome=true]/header:pb-[0.25rem] max-narrow:group-data-[floating-chrome=true]/header:pl-[0.55rem]"
  >
    <a
      class="brand inline-flex items-center gap-[0.55rem] px-[0.7rem] py-[0.4rem] border border-transparent rounded-control font-display text-[1.4rem] font-[650] tracking-[-0.02em] text-basalt no-underline group-data-[floating-chrome=true]/header:px-0 group-data-[floating-chrome=true]/header:py-[0.2rem] max-narrow:min-w-0 max-narrow:gap-[clamp(0.3rem,1.5vw,0.5rem)] max-narrow:text-[clamp(1rem,5vw,1.25rem)] max-narrow:whitespace-nowrap"
      href={resolve('/[lang=lang]', { lang: data.lang })}
      aria-label={data.copy['site.name']}
    >
      <svg
        class="brand-mark w-[1.45rem] h-[1.45rem] flex-none fill-brand-paw max-narrow:w-[clamp(1.15rem,5vw,1.35rem)] max-narrow:h-[clamp(1.15rem,5vw,1.35rem)]"
        viewBox="0 0 256 256"
        aria-hidden="true"
      >
        <path
          d="M240,108a28,28,0,1,1-28-28A28,28,0,0,1,240,108ZM72,108a28,28,0,1,0-28,28A28,28,0,0,0,72,108ZM92,88A28,28,0,1,0,64,60,28,28,0,0,0,92,88Zm72,0a28,28,0,1,0-28-28A28,28,0,0,0,164,88Zm23.12,60.86a35.3,35.3,0,0,1-16.87-21.14,44,44,0,0,0-84.5,0A35.25,35.25,0,0,1,69,148.82,40,40,0,0,0,88,224a39.48,39.48,0,0,0,15.52-3.13,64.09,64.09,0,0,1,48.87,0,40,40,0,0,0,34.73-72Z"
        />
      </svg>
      {#if isDiscovery}
        <h1
          class="m-0 [font-family:inherit] [font-style:inherit] [font-stretch:inherit] [font-variant:inherit] [line-height:inherit] text-[1.4rem] font-[650] max-narrow:text-[clamp(1rem,5vw,1.25rem)]"
        >
          {data.copy['site.name']}
        </h1>
      {:else}
        <span>{data.copy['site.name']}</span>
      {/if}
    </a>
    {#if isDiscovery}
      {@render languageNav()}
    {/if}
  </div>
  <div
    class="header-actions flex items-center justify-end gap-[0.4rem] max-narrow:flex-none max-narrow:gap-[clamp(0.2rem,1.5vw,0.4rem)]"
  >
    <a
      class="about-link px-[0.7rem] py-[0.4rem] border border-transparent rounded-control font-extrabold text-basalt group-data-[floating-chrome=true]/header:border-border-subtle group-data-[floating-chrome=true]/header:bg-snow-raised group-data-[floating-chrome=true]/header:no-underline group-data-[floating-chrome=true]/header:shadow-raised group-data-[floating-chrome=true]/header:pointer-events-auto max-narrow:hidden"
      data-translation-key="nav.about"
      href={resolve('/[lang=lang]/about', { lang: data.lang })}
    >
      {data.copy['nav.about']}
    </a>
    {#if !isDiscovery}
      {@render languageNav()}
    {/if}
    <details
      class="mobile-menu hidden group-data-[floating-chrome=true]/header:pointer-events-auto max-narrow:relative max-narrow:block"
    >
      <summary
        class="group-data-[floating-chrome=true]/header:shadow-raised max-narrow:px-[clamp(0.45rem,2vw,0.7rem)] max-narrow:py-[0.35rem] max-narrow:border max-narrow:border-basalt max-narrow:rounded-control max-narrow:bg-snow-raised max-narrow:text-[clamp(0.8rem,4vw,0.95rem)] max-narrow:font-[850] max-narrow:leading-[1.05] max-narrow:whitespace-nowrap max-narrow:list-none max-narrow:cursor-pointer"
        >{data.copy['nav.menu']}</summary
      >
      <div
        class="mobile-menu-panel max-narrow:absolute max-narrow:z-20 max-narrow:top-[calc(100%_+_0.4rem)] max-narrow:right-0 max-narrow:grid max-narrow:min-w-[13rem] max-narrow:gap-[0.55rem] max-narrow:p-3 max-narrow:border max-narrow:border-basalt max-narrow:rounded-control max-narrow:bg-snow-raised max-narrow:shadow-raised"
      >
        <a
          class="px-[0.7rem] py-[0.4rem] border border-transparent rounded-control font-extrabold text-basalt"
          href={resolve('/[lang=lang]/about', { lang: data.lang })}>{data.copy['nav.about']}</a
        >
        <nav
          class="flex gap-[0.15rem] p-[0.15rem] border border-border-subtle rounded-control bg-snow-raised"
          aria-label={data.copy['nav.language']}
        >
          <a
            class="px-[0.6rem] py-[0.25rem] border border-transparent rounded-control font-extrabold text-basalt aria-[current=page]:border-fjord aria-[current=page]:bg-fjord-soft aria-[current=page]:no-underline aria-[current=page]:shadow-[inset_0_-2px_0_var(--hv-color-fjord)] aria-[current=page]:focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
            href={resolve(replaceLocaleInUrl(currentBrowserUrl, 'is'))}
            onclick={(event) => refreshLanguageHref(event, 'is')}
            lang="is"
            aria-current={data.lang === 'is' ? 'page' : undefined}
          >
            {data.copy['language.is']}
          </a>
          <a
            class="px-[0.6rem] py-[0.25rem] border border-transparent rounded-control font-extrabold text-basalt aria-[current=page]:border-fjord aria-[current=page]:bg-fjord-soft aria-[current=page]:no-underline aria-[current=page]:shadow-[inset_0_-2px_0_var(--hv-color-fjord)] aria-[current=page]:focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
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
      class="account-link group/account relative inline-flex items-center gap-[0.35rem] px-[0.7rem] py-[0.4rem] border border-basalt rounded-control bg-basalt font-extrabold text-snow-raised no-underline group-data-[floating-chrome=true]/header:shadow-raised group-data-[floating-chrome=true]/header:pointer-events-auto max-narrow:max-w-[9.5rem] max-narrow:px-[clamp(0.45rem,2vw,0.7rem)] max-narrow:py-[0.35rem] max-narrow:text-[clamp(0.8rem,4vw,0.95rem)] max-narrow:leading-[1.05] max-narrow:text-center max-narrow:whitespace-nowrap"
      data-signed-in={data.signedIn}
      aria-label={accountAccessibleLabel}
      onclick={openSignIn}
      href={page.route.id === '/[lang=lang]/account'
        ? resolve('/[lang=lang]/account', { lang: data.lang })
        : `${resolve('/[lang=lang]/account', { lang: data.lang })}?returnTo=${encodeURIComponent(accountReturnTo)}`}
    >
      <span class="account-label-default max-narrow:group-data-[signed-in=true]/account:hidden">
        {data.signedIn ? data.copy['account.navSignedIn'] : data.copy['nav.account']}
      </span>
      {#if data.signedIn}
        <span
          class="account-label-compact hidden max-narrow:group-data-[signed-in=true]/account:inline"
          aria-hidden="true"
        >
          {data.copy['account.navSignedInCompact']}
        </span>
        <AchievementUnreadIndicator
          visible={achievementUnread}
          label={data.copy['achievements.accountUnread']}
        />
      {/if}
      {#if data.signedIn && weeklyRhythm.status === 'available'}
        <WeeklyRhythmIndicator active={weeklyRhythm.currentWeek.active} />
        <span class="visually-hidden sr-only [clip:rect(0_0_0_0)]">
          {weeklyRhythm.currentWeek.active
            ? data.copy['weeklyRhythm.accountActive']
            : data.copy['weeklyRhythm.accountOpen']}
        </span>
      {/if}
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

{#if data.translation && TranslationModeComponent && translationPageId}
  <TranslationModeComponent
    active={data.translation.active}
    locale={data.lang}
    pageId={translationPageId}
    contextPath={translationContextPath}
    access={data.translation.access}
  />
{/if}

<style>
  /* The folded Focus state compresses the brand pill to its wordmark. */
  :global(body:has(.map-list-shell[data-focus-fold='true']))
    .site-header[data-floating-chrome='true']
    .brand-cluster
    nav {
    display: none;
  }

  /* Without JavaScript the header returns to a solid in-flow bar. */
  :global(body:has(.noscript-results)) .site-header[data-floating-chrome='true'] {
    position: relative;
    border-bottom: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
    pointer-events: auto;
  }

  :global(body:has(.noscript-results)) .site-header[data-floating-chrome='true'] .brand-cluster {
    display: contents;
  }

  :global(body:has(.noscript-results))
    .site-header[data-floating-chrome='true']
    .brand-cluster
    nav {
    padding: 0.15rem;
    border: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow-raised);
  }

  @media (max-width: 42rem) {
    /* stays: ::-webkit-details-marker has no Tailwind variant, and an arbitrary `&` variant
       cannot be written in a static Svelte class attribute. */
    .mobile-menu summary::-webkit-details-marker {
      display: none;
    }

    .account-link :global([data-weekly-rhythm-indicator]) {
      top: -0.42rem;
      right: -0.42rem;
    }
  }
</style>
