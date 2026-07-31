// Orchestrator for the design-sync static preview cards. Run via `pnpm --filter
// @hundavaent/design-system design-sync:build` (see package.json), with this package's directory
// as cwd. Node loads this file directly (--experimental-strip-types, which needs Node 22.6 or
// newer), so its own relative imports must be real packages or Node builtins - render-entry.ts
// and everything it imports is instead loaded through Vite's ssrLoadModule below, which resolves
// .svelte/.ts the same way the rest of this package's Vite-powered tooling does.

import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build as viteBuild, createServer } from 'vite';

import type { RenderedCard } from './render-entry.ts';

const designSyncDir = import.meta.dirname;
const packageDir = path.resolve(designSyncDir, '..');
const distDir = path.join(designSyncDir, 'dist');

async function findCssFile(dir: string): Promise<string> {
  const found: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name.endsWith('.css')) {
        found.push(full);
      }
    }
  }
  if (found.length !== 1) {
    throw new Error(
      `Expected exactly one compiled CSS file under ${dir}, found ${found.length}: ${found.join(', ')}`
    );
  }
  return found[0];
}

// Compiles the token layer plus every generated Tailwind utility the component sources (and the
// card files under design-sync/) reference, into one flat stylesheet. Runs through Vite's build
// API rather than its dev-server transform pipeline: a plain rollup build with a CSS-only entry is
// a documented, stable way to get a single resolved stylesheet without an HTML/JS entry point.
async function compileUtilityCss(): Promise<string> {
  const outDir = await mkdtemp(path.join(tmpdir(), 'design-sync-css-'));
  try {
    await viteBuild({
      configFile: false,
      root: packageDir,
      logLevel: 'warn',
      plugins: [tailwindcss()],
      build: {
        outDir,
        emptyOutDir: true,
        cssCodeSplit: true,
        rollupOptions: {
          input: path.join(designSyncDir, 'preview-entry.css')
        }
      }
    });
    return await readFile(await findCssFile(outDir), 'utf8');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

// Embeds the latin woff2 subsets fontsource ships for these two families, so every card is fully
// self-contained (no network fetch for fonts once the Claude Design pipeline hosts the file).
async function readFontFaceCss(): Promise<string> {
  const readFontFile = async (family: string, file: string): Promise<Buffer> => {
    const fontPath = path.join(
      packageDir,
      'node_modules',
      '@fontsource-variable',
      family,
      'files',
      file
    );
    try {
      return await readFile(fontPath);
    } catch (error) {
      throw new Error(
        `Could not read ${fontPath} - the @fontsource-variable/${family} file layout changed; update the filename here to the package's current latin variable-weight woff2.`,
        { cause: error }
      );
    }
  };
  const [interData, serifData] = await Promise.all([
    readFontFile('inter', 'inter-latin-wght-normal.woff2'),
    readFontFile('source-serif-4', 'source-serif-4-latin-wght-normal.woff2')
  ]);

  return `
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${interData.toString('base64')}) format('woff2-variations');
}
@font-face {
  font-family: 'Source Serif 4 Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 200 900;
  src: url(data:font/woff2;base64,${serifData.toString('base64')}) format('woff2-variations');
}
`;
}

// SSR-renders every card through a dev-server-in-middleware-mode Vite instance rather than
// reusing the package's own vite.config.ts: that config leaves the Svelte compiler's `css` option
// at its default ('external'), which never surfaces scoped/component CSS in render()'s returned
// `head`. Setting css: 'injected' here is what makes Dialog's backdrop/entrance animation,
// PageShell's width recipe, Disclosure's chevron rotation, Rating's star styling, and every
// card's own layout chrome all arrive as <style> tags in `head` instead of being silently dropped.
async function renderAllCards(): Promise<RenderedCard[]> {
  const server = await createServer({
    configFile: false,
    root: packageDir,
    logLevel: 'warn',
    appType: 'custom',
    plugins: [svelte({ compilerOptions: { css: 'injected' } })],
    server: { middlewareMode: true }
  });
  try {
    const mod = await server.ssrLoadModule('/design-sync/render-entry.ts');
    return (await mod.renderCards()) as RenderedCard[];
  } finally {
    await server.close();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main(): Promise<void> {
  const [compiledCss, fontFaceCss, cards] = await Promise.all([
    compileUtilityCss(),
    readFontFaceCss(),
    renderAllCards()
  ]);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const sizes: { slug: string; bytes: number }[] = [];

  for (const card of cards) {
    const marker = `<!-- @dsCard group="${escapeHtml(card.group)}" name="${escapeHtml(card.name)}" subtitle="${escapeHtml(card.subtitle)}" -->`;

    // color-scheme and --font-sans have to be declared here because they are not otherwise
    // available below :root: tokens.css's --hv-font-ui reads var(--font-sans), and app.css (which
    // defines --font-sans) is never imported by this package. data-ui-mode is what makes
    // tokens.css's `:root, [data-ui-mode]` block apply to this div at all.
    const wrapperStyle = [
      'color-scheme: light',
      `--font-sans: 'Inter Variable', Inter, ui-rounded, 'Avenir Next Rounded', system-ui, sans-serif`,
      'padding: 24px',
      'background: var(--hv-color-snow)',
      `max-width: ${card.viewportWidth}px`
    ].join('; ');

    // Dialog only reaches showModal() through a client-side $effect, which never runs during SSR,
    // so any <dialog> renders with no `open` attribute and would be invisible as static markup.
    // Keyed on content, not card slug, so a future card composing a Dialog stays visible too.
    const body = card.bodyHtml.replaceAll('<dialog', '<dialog open');
    if (card.slug === 'dialog' && body === card.bodyHtml) {
      throw new Error('The dialog card rendered no <dialog> element to force open');
    }

    const html = [
      marker,
      `<title>${escapeHtml(card.name)}</title>`,
      `<style>${fontFaceCss}\n${compiledCss}</style>`,
      card.headHtml,
      `<div class="dsc-wrapper" data-ui-mode="${card.uiMode}" style="${wrapperStyle}">`,
      body,
      '</div>'
    ].join('\n');

    await writeFile(path.join(distDir, `${card.slug}.html`), html, 'utf8');
    sizes.push({ slug: card.slug, bytes: Buffer.byteLength(html) });
  }

  const nameWidth = Math.max(...sizes.map((entry) => entry.slug.length));
  console.log(`\nWrote ${sizes.length} cards to ${distDir}\n`);
  console.log('slug'.padEnd(nameWidth) + '  size');
  for (const { slug, bytes } of sizes) {
    console.log(`${slug.padEnd(nameWidth)}  ${(bytes / 1024).toFixed(1)} KB`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
