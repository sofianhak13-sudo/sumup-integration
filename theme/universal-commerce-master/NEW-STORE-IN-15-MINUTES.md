# New store in 15 minutes

This walks through turning the Universal Commerce Master Theme into a new
store's storefront. No Liquid editing required for any step below.

## 1. Install (2 min)
Admin → Online Store → Themes → Add theme → Upload zip
(`shopify-universal-commerce-master-theme.zip`). Open **Preview**.

## 2. Choose a store profile (1 min)
Customize → Theme settings (top of the settings list) → pick one of the
7 presets closest to the new brand (Fashion, Beauty, Tech, Luxury, Clean
Commerce, Home/Lifestyle, or LE BON PLAN). You can fine-tune any
individual color/font/radius afterward without leaving the preset.

## 3. Logo (1 min)
Theme settings → Header → upload the logo image, set its height.

## 4. Colors & typography (2 min, optional)
Already set by the preset. Adjust only if the brand needs an exact hex
match — Theme settings → Colors / Typography.

## 5. Navigation (2 min)
Admin → Online Store → Navigation → edit "Main menu" and "Footer menu".
The theme's header and footer already read these two menus automatically.

## 6. Products (5 min)
Add products as usual in Admin → Products. No product-level theme
configuration is required — the product page and product cards render
any product automatically (physical or digital; see step 9 for digital
stores).

## 7. Collections (2 min)
Admin → Products → Collections → create at least one collection. Point
the homepage's "Featured products" section at it: Customize → click the
Featured Collection section → Collection.

## 8. Homepage (3 min)
Customize → the default homepage already ships with Hero, Trust Bar,
Featured Products, Steps, Testimonials, and FAQ. Edit each block's text
to match the new brand (the shipped copy is generic placeholder text,
not brand claims) or add/remove sections from the same library used
everywhere else in the theme — no new section types need to be built.

## 9. Payment configuration (2 min)
- **Standard store**: Admin → Settings → Payments → activate Shopify
  Payments and any of PayPal/Sezzle you want. Nothing else to do — they
  appear automatically at checkout and as dynamic checkout buttons.
- **Digital-only store**: Theme settings → Commerce mode → turn on
  "Digital-first store" to hide shipping messaging.
- **Store using SumUp**: Theme settings → Payment integrations → enable
  the SumUp adapter, confirm the App Proxy path matches the backend's
  configuration, then add the "SumUp adapter" block to the product page
  and/or the "SumUp — Paiement panier" equivalent block to the cart.

## 10. Launch checks (2 min)
- Preview the homepage, one product page, the collection page, and the
  cart on both a phone-width viewport and desktop.
- Add a product to the cart and confirm the drawer opens and the item is
  correct.
- Confirm the footer shows the right payment icons (reflects step 9
  automatically).
- Only then: Themes → Publish.

That's the whole path from a blank theme install to a store-specific,
launch-ready storefront — branding, products, collections, content, and
payment configuration, with zero new theme development.
