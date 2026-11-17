import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './smaltdb.css'
import { withSmaltworks } from './stage'
import { enablePlaygrounds } from './playground'
import { simdRunner } from './simd'
import { withOfficialBadge } from './official'
import './official.css'

export default {
  extends: DefaultTheme,
  // The kit's badges, with the Official plugin badge beside "A smaltworks project" (theme/official.ts).
  Layout: withSmaltworks({ Layout: withOfficialBadge(DefaultTheme.Layout) }),
  enhanceApp() {
    // Every ts example runs where it stands (BRAND.md, Documentation, rule 7), in one scope per page (theme/simd.ts).
    if (typeof document !== 'undefined') enablePlaygrounds({ runners: { ts: simdRunner() } })
  },
} satisfies Theme
