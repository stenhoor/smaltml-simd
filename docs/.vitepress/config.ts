import { defineConfig } from 'vitepress'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { smaltLight, smaltDark } from './theme/shiki'
import { smaltworksMenu, smaltworksFooter } from './theme/smaltworks'
import { playgroundPlugin } from './theme/playground'
import { agentDocs, packageVersion } from './theme/agents'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = 'https://github.com/stenhoor/smaltml-simd'
// GitHub Pages serves the site under the repository's name.
const BASE = process.env.SMALTML_SIMD_BASE ?? '/smaltml-simd/'
// The Official plugin badge, beside "A smaltworks project" in the footer (theme/official.ts does the same on pages with
// a sidebar). It links to the plugin's entry on smaltml's plugin list (smalt-brand BRAND.md, "Plugins").
const OFFICIAL = 'https://stenhoor.github.io/smaltml/guide/plugins#smaltml-simd'
const officialBadge = (file: string, cls: string) => `<img class="${cls}" src="${BASE}${file}" alt="smaltml official plugin" height="28">`
const footer = smaltworksFooter(BASE)
footer.message += ` <a href="${OFFICIAL}">${officialBadge('official-smaltml.svg', 'sw-light')}${officialBadge('official-smaltml-on-dark.svg', 'sw-dark')}</a>`

// smaltml SIMD is an infrastructure plugin: smaltml's brand and a plain name, no mark or colour of its own
// (smaltml ADR 0035, item 10; smalt-brand BRAND.md, "Plugins").
export default defineConfig({
  title: 'smaltml SIMD',
  description: 'WebAssembly SIMD kernels for smaltml, written by TypeScript.',
  base: BASE,
  cleanUrls: true,
  lastUpdated: false,
  // Markdown for AI agents beside the pages: a twin of each page, /llms.txt and /agents.md (BRAND.md, Documentation).
  buildEnd: (config) => {
    agentDocs(config, {
      product: 'smaltml SIMD',
      version: packageVersion(path.resolve(here, '../../package.json')),
      url: `https://stenhoor.github.io${BASE}`,
      intro: 'guide/agents.md',
      guide: ['reference/'],
    })
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}favicon-32.svg` }],
    ['meta', { property: 'og:title', content: 'smaltml SIMD' }],
    ['meta', { property: 'og:description', content: 'WebAssembly SIMD kernels for smaltml, written by TypeScript.' }],
    ['meta', { property: 'og:image', content: 'https://raw.githubusercontent.com/stenhoor/smalt-brand/main/social/smaltml.png' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&family=Martian+Mono:wght@400;600&display=swap' }],
  ],
  vite: { worker: { format: 'es' } },
  markdown: {
    theme: { light: smaltLight, dark: smaltDark },
    config(md) {
      // Every ts example runs where it stands (BRAND.md, Documentation, rule 7; theme/simd.ts).
      md.use(playgroundPlugin, { languages: ['ts'] })
      // Links that leave docs/ point at the file on GitHub.
      const fallback = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const href = tokens[idx].attrGet('href')
        if (href && !/^[a-z]+:|^#|^\//i.test(href) && env?.relativePath) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(env.relativePath), href))
          if (target.startsWith('../')) {
            tokens[idx].attrSet('href', `${REPO}/blob/HEAD/${target.slice(3)}`)
            tokens[idx].attrSet('target', '_blank')
            tokens[idx].attrSet('rel', 'noreferrer')
          }
        }
        return fallback(tokens, idx, options, env, self)
      }
    },
  },
  themeConfig: {
    logo: { light: '/lockup.svg', dark: '/lockup-on-dark.svg', alt: 'smaltml' },
    siteTitle: 'SIMD',
    // A plugin site's sections (BRAND.md, Documentation, rule 1): Quick start, a user guide, and a reference.
    nav: [
      { text: 'Quick start', link: '/guide/quick-start' },
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Playground', link: '/playground' },
      smaltworksMenu(),
    ],
    sidebar: [
      { text: 'Quick start', items: [{ text: 'Quick start', link: '/guide/quick-start' }] },
      {
        text: 'User guide',
        items: [
          { text: 'Using the plugin', link: '/guide/' },
          { text: 'Threads and bundlers', link: '/guide/threads' },
          { text: 'How it works', link: '/guide/how-it-works' },
          { text: 'Benchmarks', link: '/guide/benchmarks' },
          { text: 'For AI agents', link: '/guide/agents' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Overview', link: '/reference/' },
          { text: 'useSimd', link: '/reference/use-simd' },
          { text: 'simdSupport', link: '/reference/simd-support' },
          { text: 'The kernels module', link: '/reference/kernels' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: REPO }],
    footer,
    search: { provider: 'local' },
    outline: { level: [2, 3] },
  },
})
