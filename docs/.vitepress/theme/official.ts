// The Official plugin badge beside "A smaltworks project" at the foot of pages with a sidebar, where the kit's stage.ts
// puts that one (its 'doc-footer-before' slot). This site's own file, not a kit file: the kit's are copied unchanged.
// The home page's footer gets the same badge from .vitepress/config.ts.
import { h } from 'vue'
import { withBase } from 'vitepress'

const OFFICIAL = 'https://stenhoor.github.io/smaltml/guide/plugins#smaltml-simd'

/** The badge, light and dark, linking to the plugin's entry on smaltml's plugin list. */
export function officialBadge() {
  return h('a', { class: 'sw-official', href: OFFICIAL }, [
    h('img', { class: 'sw-light', src: withBase('/official-smaltml.svg'), alt: 'smaltml official plugin', height: 28 }),
    h('img', { class: 'sw-dark', src: withBase('/official-smaltml-on-dark.svg'), alt: 'smaltml official plugin', height: 28 }),
  ])
}

/**
 * VitePress's Layout, with the badge after whatever the kit puts in 'doc-footer-before', in one row. Give it to the kit's
 * withSmaltworks() in place of DefaultTheme.Layout.
 */
export function withOfficialBadge(Layout: any) {
  return {
    setup(_props: unknown, { slots }: { slots: Record<string, (() => unknown) | undefined> }) {
      return () =>
        h(Layout, null, {
          ...slots,
          'doc-footer-before': () => h('div', { class: 'sw-footer-badges' }, [slots['doc-footer-before']?.(), officialBadge()]),
        })
    },
  }
}
