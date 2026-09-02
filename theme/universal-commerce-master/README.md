# Universal Commerce Master Theme

A Shopify Online Store 2.0 theme built from scratch as a single, reusable
foundation for multiple stores with different visual identities, product
types (physical, digital, single-product), and optional payment
integrations — rather than a new theme build per store.

This is a **v0.1 foundation**: Gates 0–5 (see below) are solid and
validated; Gates 6–9 are real but narrower in scope than a mature
commercial theme. See `docs/08-*` in the parent repo for the full,
honest status of every area.

## Architecture

```
config/      Design-system settings (settings_schema.json) + 7 store
             profiles (settings_data.json)
layout/      theme.liquid (site chrome), password.liquid
locales/     en (default) + fr, both storefront strings and editor labels
sections/    One file per page type (main-*.liquid) + reusable CRO/content
             sections (hero, trust-bar, testimonials, steps, faq, ...)
             + section groups (header-group.json, footer-group.json)
blocks/      Reusable theme blocks (text, button, image, trust_item,
             testimonial_item, step_item, faq_item, footer_menu,
             footer_newsletter, cross_sell)
snippets/    Shared logic: design-tokens (the token system itself),
             product-card, product-form, product-gallery, price,
             cart-items, header-nav, mobile-menu, predictive-search,
             meta-tags (SEO), sumup-*-adapter (optional payment adapter)
assets/      base.css (every visual primitive) + global.js, product-form.js,
             cart.js, collection.js, sumup-adapter.js (only loaded when
             the SumUp setting is on)
templates/   One JSON template per required Shopify page type
```

### Why this shape

- **Design System**: every color, radius, spacing, and typography value
  in the entire theme flows from `config/settings_schema.json` through
  `snippets/design-tokens.liquid` into CSS custom properties consumed by
  `assets/base.css`. No section hardcodes a color or a pixel radius.
- **Commerce Engine**: `snippets/product-form.liquid` (variant selection
  + Add to Cart + Buy Now) and `snippets/product-card.liquid` (the one
  product-card implementation used by the collection grid, featured
  collection, search results, and cart cross-sell) are the only places
  that know how to sell a product. Nothing duplicates that logic.
- **CTA Engine**: one `.btn` primitive (`assets/base.css`) drives every
  call to action on the site — Add to Cart, Buy Now, hero buttons,
  marketing buttons, the SumUp adapter buttons. It handles
  default/hover/active/focus/loading/disabled states in one place.
- **Store Profiles**: `config/settings_data.json`'s native Shopify
  `presets` mechanism holds 7 named visual identities. Switching between
  them in Theme Settings changes color, typography, radius, density,
  hover behavior, and header behavior everywhere at once — no code
  change, no per-store fork of this repository.
- **Integration Adapters**: `snippets/sumup-*-adapter.liquid` +
  `assets/sumup-adapter.js` are the only SumUp-aware files in the theme.
  They are only rendered/loaded when `settings.enable_sumup` is on.
  Shopify Payments, PayPal, and Sezzle need no theme code at all — they
  render automatically wherever the theme uses `{{ form | payment_button }}`
  (dynamic checkout buttons) or `shop.enabled_payment_types` (footer
  payment icons), which is Shopify's own native mechanism.

## Installing on a store

1. Zip the contents of this folder (not the folder itself).
2. Shopify admin → Online Store → Themes → Add theme → Upload zip.
3. Open it in **Preview** — it is not published automatically.
4. Customize → Theme settings → pick a store profile, add your logo.
5. Do not click Publish until you've completed a launch check (see the
   "New store in 15 minutes" guide).

## Theme Editor

Settings are grouped by purpose (Colors, Typography, Layout, Shape &
Effects, Product cards, Motion, Header, Cart, Commerce mode, Payment
integrations, Social media) rather than presented as one long list.
Every section/block exposes only what a merchant would plausibly want to
change — internal implementation details (e.g. which CSS class a hover
effect maps to) are not settings.

## Store profiles (presets)

Seven named presets exist in Theme Settings, each a full combination of
palette, typography (heading + body font pairing), corner radius, card
hover behavior, density, and header behavior — not just three swapped
colors:

| Preset | Direction |
|---|---|
| LE BON PLAN — Dark Electric Blue | Premium, high-tech, dark, electric blue, controlled glow |
| Luxury — Black & Ivory | Elegant, minimal, editorial, sharp corners, no motion |
| Fashion — Editorial | Serif display type, large imagery, wide layout, zoom-on-hover |
| Beauty — Soft Premium | Soft serif + rounded sans, generous radius, delicate |
| Tech — Dark Futuristic | Geometric sans, dense, glow, scale-on-hover |
| Clean Commerce — White Neutral | Neutral, high-conversion, universal default |
| Home / Lifestyle — Warm Modern | Warm serif, wide imagery, relaxed spacing |

Adding an 8th profile means adding one entry to `config/settings_data.json`
under `presets` — no Liquid changes.

## Sections available

Homepage/content: Hero, Trust Bar, Featured Collection, Steps, Testimonials,
FAQ, Newsletter, Rich Text, Custom Liquid, Countdown (real merchant-set
date only). Commerce: header, footer, product page, collection page,
cart page + drawer, search, blog, article, list-collections, 404,
password, gift card.

This is intentionally a **focused** set, not an exhaustive catalogue —
see the parent repo's Phase 3 report for what was deliberately left out
of this v0.1 and why.

## Product page (PDP)

Composed from blocks in `templates/product.json`: title (+ vendor toggle),
price, buy box (gallery is separate, rendered by the section itself),
shipping note (auto-hidden in Commerce mode > Digital-first store),
trust items, description, plus an `@app` slot for a reviews app and an
`accordion` block type for any additional detail (shipping, returns,
size guide) the merchant wants to add. The SumUp block, when enabled, is
a separate block placed wherever the merchant wants it.

## Digital commerce mode

Theme Settings → Commerce mode → "Digital-first store" hides the
shipping note on the product page and the free-shipping progress bar in
the cart. Nothing else changes: variant/inventory logic still comes from
each product's own Shopify data, so a store selling a mix of physical
and digital products is not forced into one mode — this toggle only
removes messaging that would be actively wrong for an all-digital catalog.

## Cart

Drawer (`sections/cart-drawer.liquid`) and page (`sections/main-cart.liquid`)
share one line-item implementation (`snippets/cart-items.liquid`) so
there is exactly one place that knows how to render a cart line. Updates
go through Shopify's AJAX Cart API (`/cart/add.js`, `/cart/change.js`)
and the Section Rendering API (`?sections=cart-drawer`) — never a
hand-rolled client-side cart-state model.

## Payment integrations

- **Shopify Payments / PayPal / Sezzle**: no theme configuration needed.
  Enable them in Shopify admin → Settings → Payments; they appear
  automatically via `{{ form | payment_button }}` (dynamic checkout
  buttons on the product page and cart) and `shop.enabled_payment_types`
  (footer payment icons).
- **SumUp** (optional adapter): Theme Settings → Payment integrations →
  "Enable SumUp adapter". Talks only to the existing, already-deployed
  SumUp backend (this theme creates no backend of its own) through its
  App Proxy. See `snippets/sumup-product-adapter.liquid`,
  `snippets/sumup-cart-adapter.liquid`, and `assets/sumup-adapter.js`.
  Zero SumUp code loads or runs when the setting is off.
- **Adding a future payment provider**: follow the same adapter pattern —
  an isolated snippet + (if needed) an isolated, conditionally-loaded JS
  file, gated by its own settings toggle. Never touch `product-form.js`
  or `cart.js` to add a payment method.

## Development

No build step: plain Liquid, CSS, and vanilla JS. To work on this theme
with Shopify CLI:

```bash
shopify theme dev --store <your-dev-store>.myshopify.com
```

## Tests

See the parent repository's `docs/lbp-horizon-migration/09-*.md` report
for exactly what was validated automatically (JSON/Liquid/schema
integrity, `shopify theme check`, locale-key coverage), what could only
be partially tested, and what needs a human in a real Shopify environment.

## Troubleshooting

- **A section doesn't show up in Theme Editor**: check its `{% schema %}`
  has a `"presets"` entry — Shopify only lists sections with a preset
  under "Add section".
- **A block type shows as unavailable**: it must exist as either a file
  in `blocks/<type>.liquid`, or be declared inline in the section's own
  `"blocks"` schema array.
- **SumUp button does nothing**: confirm both the theme setting
  (`enable_sumup`) is on AND the App Proxy path matches what's configured
  in the SumUp backend app (`Theme Settings → Payment integrations`).
- **A locale string shows as its raw key** (e.g. `products.product.foo`):
  the key is missing from `locales/en.default.json` — add it there and
  to `locales/fr.json` with the same path.
