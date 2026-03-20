# Design System — AkAna

> **Before writing any component, run the smell test at the bottom of this file.**

---

## Identity

**AkAna** (*ak ana* — "white mother") is the Turkish goddess of creative emergence and deity of water.

The app should feel like:
- **Still water with depth** — calm, clean, purposeful
- **Content flows like a river** — scrolling is downstream, filtering is choosing a current
- **Not**: loud, anxiety-inducing, social-media-brained

When unsure about a design decision, ask: *does this feel like still water, or like noise?*

---

## Color palette

### Light mode

| Token (Tailwind class) | Hex | Name | Usage |
|---|---|---|---|
| `bg-base` | `#F7FAFA` | Foam white | Page background |
| `bg-card` | `#FFFFFF` | White | Article cards |
| `bg-surface` | `#EEF4F5` | Mist | Filter bar, header, panels |
| `accent-primary` | `#0A7E8C` | Deep teal | Active tags, links, CTAs, "New" dots |
| `accent-soft` | `#C8EAED` | Pale aqua | Tag chip backgrounds |
| `text-primary` | `#111827` | Near black | Headlines |
| `text-secondary` | `#5C7380` | Slate | Descriptions, meta, timestamps |
| `border` | `#DDE8EA` | Cool grey | Card dividers, borders |

### Dark mode

| Token | Hex | Name | Usage |
|---|---|---|---|
| `bg-base` | `#0B1520` | Deep ocean | Page background |
| `bg-card` | `#132033` | Midnight water | Article cards |
| `bg-surface` | `#1A2D40` | Dark teal-grey | Filter bar, header, panels |
| `accent-primary` | `#3BB8C8` | Aqua | Active tags, links, CTAs, "New" dots |
| `accent-soft` | `#1E4A5A` | Deep teal | Tag chip backgrounds |
| `text-primary` | `#E8F4F6` | Off white | Headlines |
| `text-secondary` | `#8AA8B5` | Muted aqua | Descriptions, meta, timestamps |
| `border` | `#1F3347` | Dark steel | Card dividers |

### Configuring in Tailwind

```ts
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      'bg-base': 'var(--bg-base)',
      'bg-card': 'var(--bg-card)',
      'bg-surface': 'var(--bg-surface)',
      'accent-primary': 'var(--accent-primary)',
      'accent-soft': 'var(--accent-soft)',
      'text-primary': 'var(--text-primary)',
      'text-secondary': 'var(--text-secondary)',
      border: 'var(--border)',
    },
  },
}
```

CSS variables set on `:root` (light) and `.dark` (dark mode).

---

## Typography

**Font:** `Inter` (Google Fonts, or next/font for zero-layout-shift)

| Role | Class | Example |
|---|---|---|
| Article headline | `text-base font-semibold leading-snug` | "Hoarder is what happens when…" |
| Description / snippet | `text-sm leading-relaxed text-secondary` | "A cleaning sim from the co-creator of…" |
| Source name | `text-xs font-medium text-secondary` | "Rock Paper Shotgun" |
| Timestamp | `text-xs text-secondary` | "3 hours ago" |
| Tag chip | `text-xs font-medium` | "Games" |
| Filter chip (active) | `text-xs font-semibold` | "Film" |
| Header/nav label | `text-sm font-semibold` | "AkAna" |

**Rules:**
- Max **2 font weights** on any one screen: `400` (normal) and `600` (semibold)
- Never use decorative type — no italic headlines, no all-caps unless it's a label
- Line height: `leading-relaxed` (1.625) on body text, `leading-snug` (1.375) on headlines

---

## Spacing & layout

### Mobile (default)

Mirror Twitter's feed structure. Users already know this pattern.

```
┌─────────────────────────────┐
│ [Source name]  [time ago]   │  ← text-xs, text-secondary
│                             │
│ Headline of the article…    │  ← text-base, font-semibold
│                             │
│ Short description snippet   │  ← text-sm, leading-relaxed
│ that might wrap to 2 lines. │
│                             │
│ [Games] [Indie]   Read →    │  ← tag chips + link
├─────────────────────────────┤  ← border-b divider, no gap
│ [next article]              │
```

- Card padding: `p-4` (16px all sides)
- Between cards: `border-b` divider, NO gap/margin — items are flush like Twitter
- No card shadows on mobile
- Image (if present): full-width above the text block, `aspect-video`, `object-cover`

### Desktop (`md:` and up)

```
        ┌──────────────────────────┐
        │ [card content]           │   max-w-[620px], centered
        ├──────────────────────────┤
        │ [card content]           │
        └──────────────────────────┘
```

- Column: `max-w-[620px] mx-auto`
- Same card structure as mobile — no floating cards, no shadows (or very subtle: `shadow-sm` only)
- Card hover: `hover:translate-y-[-1px] hover:shadow-md transition-all duration-150` — subtle float

### Do not
- Do not create a grid/masonry layout
- Do not add a second content column
- Do not spread the column wider than 620px (becomes hard to scan)

---

## Components

### ArticleCard

```
┌──────────────────────────────────────┐
│ [image if available — full width]    │
├──────────────────────────────────────┤
│ [Source]          [3 hours ago]  [●] │  ← ● = teal "New" dot (8px, conditional)
│                                      │
│ Article headline text                │
│                                      │
│ Description snippet, max 2–3 lines   │
│ truncated with line-clamp-3          │
│                                      │
│ [Tag1] [Tag2]         Read →         │
└──────────────────────────────────────┘
```

- "New" dot: `w-2 h-2 rounded-full bg-accent-primary` — only shown for articles newer than the last reading point
- "Read →" is an `<a>` tag: `href={article.link} target="_blank" rel="noopener noreferrer"`
- Tags: `bg-accent-soft text-accent-primary text-xs font-medium px-2 py-0.5 rounded-full`

### TopicFilter (tag chips)

Horizontally scrollable row of filter chips. Sits below the header.

```
[All] [Games] [Indie] [Film] [TV] [Reviews] …
```

- Chips: `px-3 py-1 rounded-full text-xs font-medium`
- Inactive: `bg-bg-surface text-text-secondary`
- Active: `bg-accent-primary text-white`
- Transition: `transition-colors duration-150`
- Row: `flex gap-2 overflow-x-auto scrollbar-none px-4 py-2`

### ReadingPointsPanel

Slide-in drawer from the right (mobile) or a dropdown panel (desktop).

```
┌───────────────────────────────┐
│ Reading Points            ✕   │
├───────────────────────────────┤
│ AUTOSAVED                     │
│ ● Mar 19, 9:14pm              │
│   "Hoarder is what happens…"  │
│ ● Mar 18, 7:02pm              │
│   "Marathon's Cryo Archive…"  │
├───────────────────────────────┤
│ SAVED BY YOU             + Add│
│ ▸ Mar 17, 3:30pm              │
│   "Indie game roundup…"       │
└───────────────────────────────┘
```

- Each entry is a button — tap to jump to that position
- "✕" closes the panel
- "+ Add" saves current position as a manual point

### Header

```
┌─────────────────────────────────────┐
│  AkAna          [☾/☀] [📍 points]  │
└─────────────────────────────────────┘
```

- Title: `text-lg font-semibold`
- Dark mode toggle: icon button, `44×44px` tap target
- Reading points icon: `44×44px`, shows a badge count if points exist
- Background: `bg-surface`, `border-b border-border`
- Sticky: `sticky top-0 z-10`

---

## Motion

| Interaction | Animation |
|---|---|
| Tag filter change | `transition-colors duration-150 ease-in-out` |
| Card hover (desktop) | `hover:-translate-y-px hover:shadow-md transition-all duration-150` |
| ReadingPointsPanel open | Slide in from right: `translate-x-full → translate-x-0`, `duration-200 ease-out` |
| New content appended | No animation — just appends below, no layout shift |
| "New" dot | Appears immediately, no animation needed |

**Rules:**
- No bounce, spring, or elastic easing — water moves with intention, not with drama
- No scroll-hijacking, no parallax
- Prefer `duration-150` or `duration-200` — short and purposeful

---

## Dark mode

- Detect via `prefers-color-scheme: dark` on first load
- User can override with a toggle; preference saved in `localStorage` as `akana_theme` (`'light'` | `'dark'`)
- Implement via a `dark` class on `<html>` (Tailwind `darkMode: 'class'` strategy)

---

## Accessibility

- Minimum tap target: `44×44px` on all interactive elements (buttons, links, chips)
- Color contrast: WCAG AA minimum — `text-primary` on `bg-card` passes comfortably in both modes
- All `<img>` tags must have `alt` text; if article image has no meaningful alt, use `alt=""`
- Focus styles: do not remove `outline` without providing a custom `focus-visible` style
- Cards degrade gracefully if there is no image (image block simply doesn't render)

---

## Reader view typography

The article reader (`/article/[id]`) uses different type settings than the feed — optimised for sustained reading, not scanning.

### Text size setting

The reader has 5 font size levels, adjustable via `A-` / `A+` buttons in the reader header. The chosen size is saved to `localStorage` as `akana_reader_size` and applied on every subsequent article open.

| Level | Body size | Use case |
|---|---|---|
| `xs` | `15px` | Compact, fit more on screen |
| `sm` | `16px` | Small preference |
| `md` | `17px` | **Default** |
| `lg` | `19px` | Comfortable reading |
| `xl` | `21px` | Large text / accessibility |

Line height scales with font size — always `1.7` ratio regardless of level. Heading sizes scale proportionally.

**UI:** A `Aa` settings button in the sticky reader header opens a small popover panel with three controls:

```
┌─────────────────────────────┐
│  A-  ●──────○──○  A+        │  font size slider (5 stops)
│                             │
│  [Inter]  [Lora]            │  font family toggle
│                             │
│  [○ Default] [◑ Sepia] [● Night]  │  colour theme
└─────────────────────────────┘
```

**Implementation:** CSS custom properties on the reader page root, managed by `useReaderSettings`. No page reload needed.

```ts
// hooks/useReaderSettings.ts
// localStorage keys:
//   akana_reader_size  → 'xs'|'sm'|'md'|'lg'|'xl'
//   akana_reader_font  → 'inter'|'lora'
//   akana_reader_theme → 'default'|'sepia'|'night'
// returns { size, font, theme, increase, decrease, setFont, setTheme }
```

### Reading ergonomics (research-backed)

Sources: [Baymard Institute](https://baymard.com/blog/line-length-readability) · [Nielsen Norman Group](https://www.nngroup.com/articles/glanceable-fonts/) · [USWDS](https://designsystem.digital.gov/components/typography/) · [PMC Eye Strain Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11175232/) · [UX Movement — Pure Black](https://uxmovement.com/content/why-you-should-never-use-pure-black-for-text-or-backgrounds/)

#### Colours

| Principle | Why | Our implementation |
|---|---|---|
| Never pure black text (`#000`) on pure white | Extreme contrast causes halation — text appears to "bleed" | `#111827` (dark grey) on `#FFFFFF` |
| Never pure white text on pure black in dark mode | Same halation effect on inverted screens | `#E8F4F6` (off-white) on `#0B1520` (deep navy) |
| Warm/neutral off-white bg better than stark white | Reduces glare, closer to paper feel | `#F7FAFA` base bg in light mode |
| Avoid high blue-luminance backgrounds at night | Blue light suppresses melatonin, increases perceived glare | Dark mode navy palette avoids blue-dominant hues |
| WCAG AAA contrast for body text | Long-form reading warrants the highest contrast tier | `#111827` on `#FFFFFF` = 16:1 (AAA) |

#### Font

| Principle | Why | Our implementation |
|---|---|---|
| Sans-serif is equal or better on modern HD screens | Old "sans-serif for screens" rule was for low-res; on retina screens serif and sans-serif are equivalent — but sans is cleaner at small sizes | Inter (sans) as default |
| Offer a serif option for users who prefer it | Long-form reading preference is highly individual; some find serif more comfortable for sustained reading (Kindle-style) | Font toggle: **Inter** (sans) or **Lora** (serif) in reader settings |
| Never use light font weights (`300`) for body text | Thin strokes degrade on non-retina screens and for users with lower vision | `font-weight: 400` minimum for all body text |

#### Spacing & layout

| Principle | Recommendation | Our implementation |
|---|---|---|
| Line length | 45–90 chars; 60–70 optimal | `max-w-[68ch]` (adapts with font size) |
| Line height | 1.5–1.7× font size | `line-height: 1.7` |
| Paragraph spacing | ≥ 1 line height between paragraphs | `margin-bottom: 1.4em` per `<p>` |
| Letter spacing | `+0.01–0.02em` reduces reading fatigue | `letter-spacing: 0.01em` |
| Heading spacing | Large top margin before headings (breathing room) | `mt-10` on `h2`, `mt-7` on `h3` |

> **Why `ch` units for max-width?** `68ch` = 68 characters at the current font size. It automatically stays in the optimal range as the user adjusts text size — no recalculation needed.

#### Reader themes (colour schemes)

Three theme options available in reader settings, persisted in `localStorage` as `akana_reader_theme`:

| Theme | Background | Text | When to use |
|---|---|---|---|
| **Default** | `#FFFFFF` / `#0B1520` dark | `#111827` / `#E8F4F6` dark | Follows app dark mode toggle |
| **Sepia** | `#F5EDD6` (warm cream) | `#3B2F1E` (dark brown) | Warm, Kindle-like, easy on eyes in daylight |
| **Night** | `#161616` (near-black) | `#D4D4D4` (light grey) | Maximum eye comfort in dark environments |

Sepia and Night themes override the app-level dark mode toggle within the reader only.

### Base styles

| Element | Style |
|---|---|
| Body text | `font-size: var(--reader-font-size); line-height: 1.7; letter-spacing: 0.01em; color: text-primary` |
| Paragraphs | `margin-bottom: 1.4em` |
| `h1` (article title) | `text-2xl font-semibold leading-snug mb-6` |
| `h2` subheadings | `text-xl font-semibold mt-10 mb-3` |
| `h3` subheadings | `text-lg font-semibold mt-7 mb-2` |
| Blockquote | `border-l-4 border-accent-primary pl-4 italic text-secondary my-6` |
| `code` inline | `bg-bg-surface text-accent-primary font-mono text-sm px-1 rounded` |
| `pre` block | `bg-bg-surface p-4 rounded-lg overflow-x-auto font-mono text-sm` |
| Images | `w-full rounded-lg my-6` |
| Figcaption | `text-xs text-secondary text-center mt-2 mb-4` |
| Links | `text-accent-primary underline underline-offset-2` |

- Content column: `max-w-[68ch] mx-auto px-4` — adapts with font size
- Use `@tailwindcss/typography` as base, override with AkAna tokens

---

## Anti-AI-slop rules

> Sources: [Tech Bytes — Escape AI Slop](https://techbytes.app/posts/escape-ai-slop-frontend-design-guide/) · [Why AI Keeps Building Purple Gradient Sites](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) · [Medium — AI Gradient Bias](https://medium.com/@kai.ni/design-observation-why-do-ai-generated-websites-always-favour-blue-purple-gradients-ea91bf038d4c)

AI-generated UIs are statistically converged — they reflect the median of every Tailwind tutorial scraped from GitHub 2019–2024. The patterns below are the most recognisable tells. Treat this as a checklist before shipping any screen.

### Colour

| ❌ AI slop | ✅ AkAna |
|---|---|
| Purple-to-blue gradient on hero, cards, buttons | No gradients. Flat surfaces only. |
| Indigo/violet as accent because it's "modern" | Deep teal `#0A7E8C` — deliberate, water-coded, not a default |
| Accent colour smeared everywhere | Accent appears on: active tags, links, "New" dots, focus rings. Nowhere else. |
| `text-white` on coloured buttons everywhere | Restrained use of filled buttons — most actions are text or outline |
| Timid palette — 6 nearly-identical greys | Two greys maximum (`text-primary`, `text-secondary`), the rest is white/off-white |
| `bg-gradient-to-br from-purple-600 to-blue-500` on anything | Banned. If you see a gradient in a PR, remove it. |

### Borders & radius

| ❌ AI slop | ✅ AkAna |
|---|---|
| `rounded-lg` (`8px`) on literally everything — cards, inputs, modals, images, badges | Specific radius per component type — see table below |
| `rounded-full` on non-pill elements | Only on tag chips and avatar-sized elements |
| Shadow at exactly `rgba(0,0,0,0.1)` on every card | No shadow on feed cards. `shadow-sm` only on reader sticky header and modals. |
| `border border-gray-200` as a default everywhere | One border token (`border-border`) used only where separation earns its place |

**Border radius rules:**

| Element | Radius |
|---|---|
| Feed article cards (mobile) | `0` — flush, Twitter-style |
| Feed article cards (desktop hover) | `rounded-md` (`6px`) — subtle only |
| Tag chips, filter chips | `rounded-full` — pill shape |
| Buttons (primary) | `rounded-md` |
| Inputs, search bar | `rounded-md` |
| Modal / drawer | `rounded-xl` on top corners only |
| Images in reader | `rounded-lg` |
| "New" dot indicator | `rounded-full` |

### Typography

| ❌ AI slop | ✅ AkAna |
|---|---|
| Inter for everything with zero variation | Inter for UI + feed; Lora available as reader option — both deliberate, not defaults |
| `font-light` (`300`) body text — looks elegant in screenshots, unreadable on non-retina | `font-normal` (`400`) minimum for all body text |
| `tracking-tight` on everything | Only on display-size headings where it's earned |
| Every heading `font-bold` | Headlines `font-semibold` (`600`) only — `bold` (`700`) is reserved and rarely used |
| `uppercase tracking-widest` on section labels | Banned unless it's a deliberate brand moment (it isn't here) |
| Mixing 4+ font sizes on one screen | Max 3 sizes per screen |

### Layout & components

| ❌ AI slop | ✅ AkAna |
|---|---|
| Three-column icon + heading + text cards grid | Not in this app at all |
| Hero section with centred text and one big CTA | Not in this app |
| Floating cards with `shadow-md` in a grid | Feed is a flat bordered list, not a card grid |
| Every interactive element looks like a "button" | Most navigation is text-based; filled buttons used only for primary actions (e.g. login) |
| Sidebar with icons and labels for every possible feature | Single column, no persistent sidebar |
| Empty states with a large centred illustration | Empty states use a short text message only — no stock illustrations |
| Skeleton loaders with animated shimmer on everything | Simple spinner or nothing — shimmer loaders are overused AI-gen filler |

### Interaction & motion

| ❌ AI slop | ✅ AkAna |
|---|---|
| `transition-all duration-300` as a default on every element | Only elements that visually need it get transitions; exact properties named (`transition-colors`, `transition-transform`) |
| `hover:scale-105` on cards | Banned — cheap, feels toy-like |
| `animate-pulse` shimmer on everything loading | Reserve for intentional loading states only |
| Fade-in animations on page load for every section | No entrance animations on the feed — content just appears |
| Staggered `animation-delay` on list items | Banned — annoying in a feed with 20+ items |

### Copy & microcopy

| ❌ AI slop | ✅ AkAna |
|---|---|
| Section headers: "Discover the Future of Reading" | No marketing copy — this is a personal tool |
| Button labels: "Get Started", "Explore Now", "Learn More" | Direct labels: "Add feed", "Save", "Open", "Back" |
| Empty state: "No content yet. Start your journey!" | "No articles yet — add a feed in admin." |
| Tooltip: "Click here to perform this action" | If it needs a tooltip to explain itself, redesign it |
| Error message: "Something went wrong. Please try again." | "Couldn't load feed — check your connection." (specific) |

### The smell test

Before shipping any component, ask:
1. Could this have been the first result when you Google "Tailwind CSS card component"? If yes — make it more specific.
2. Does it use a purple or blue gradient? Remove it.
3. Are there more than two shadow values on the page? Reduce.
4. Does every interactive element have `rounded-lg`? Audit the radii.
5. Is the accent colour appearing more than 5 times on screen? Pull it back.
6. Does the empty state have an illustration? Remove it.
7. Does any text say "seamless", "powerful", "intuitive", or "next-level"? Delete it.

---

## Do / Don't

| Do | Don't |
|---|---|
| Use the 8 defined color tokens | Introduce new colors without updating this doc |
| Use `border-b` dividers between cards | Use floating cards with drop shadows on mobile |
| Keep the column at `max-w-[620px]` | Widen the column or add a second column |
| Follow Twitter's feed UX patterns on mobile | Reinvent the scroll/card interaction |
| Keep tags to 1–3 per article | Add more than 3 tags or keyword spam |
| Let images be full-width above the card | Inline small thumbnails next to text |
| Use `line-clamp-3` on descriptions | Show the full RSS description (can be very long) |
| Open links in new tab with `noopener` | Navigate the app away to read an article |
| Keep animations under `200ms` | Add spring/bounce effects or parallax |
