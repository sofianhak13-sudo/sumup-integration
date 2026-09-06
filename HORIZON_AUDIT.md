# Audit LIVE du thème Horizon — Le Bon Plan

Thème publié (MAIN) : **« Copie mise à jour de Copie mise à jour de Horizon »**
(`gid://shopify/OnlineStoreTheme/199008354678`, Horizon, theme store id 2481).
Audité via l'API Admin `theme.files` le 2026-09-06.

## Panier

| Réglage (`config/settings_data.json`) | Valeur |
|---|---|
| `cart_type` | **`drawer`** — le clic sur l'icône panier ouvre le tiroir |
| `show_add_discount_code` | `true` — champ code promo visible (page + tiroir) |
| `show_cart_note` | `false` |
| `show_accelerated_checkout_buttons` | (défaut schéma — Shop Pay & co affichés) |

### Page panier — `templates/cart.json` + `sections/main-cart.liquid`
- Section `main-cart`, schéma `blocks` accepte **`{ "type": "@app" }`** →
  **le bloc app « SumUp — Panier » peut être ajouté ici** via l'éditeur
  (Ajouter un bloc → Applications). Rendu dans `.cart-page__more-blocks`
  (`{% content_for 'blocks' %}`).
- Blocs statiques : `_cart-title`, `_cart-products`, `_cart-summary`.

### Cart drawer — `snippets/cart-drawer.liquid`
- **Snippet, pas de section / pas de `{% schema %}` / pas de `@app`** →
  **le tiroir n'accepte PAS les app blocks** (Cas B de la mission).
- `<theme-drawer id="cart-drawer">` › `<cart-drawer-component>` ; mises à jour
  par **Section Rendering API** (`section_id: 'cart-drawer-section'`).
- Résumé rendu par `{% render 'cart-summary', section_id: 'cart-drawer-section' %}`.
- `settings.auto_open_cart_drawer` peut ré-ouvrir le tiroir après ajout.

### CTA de paiement — `snippets/cart-summary.liquid` (page ET tiroir)
```html
<div class="cart__ctas">
  <button type="submit" id="checkout" name="checkout" form="cart-form"
          class="cart__checkout-button button"> … Checkout … </button>

  {% if additional_checkout_buttons and settings.show_accelerated_checkout_buttons %}
    <div class="additional-checkout-buttons"> {{ content_for_additional_checkout_buttons }} </div>
  {% endif %}
</div>
```
- **Bouton « Passer à la caisse »** : sélecteur stable `#checkout` /
  `button[name="checkout"].cart__checkout-button`. Pas de réglage natif pour le
  masquer → masquage CSS ciblé via **app embed** (`target: body`), réversible.
- **Boutons de paiement accéléré** (Shop Pay / PayPal / GPay) :
  `.additional-checkout-buttons`, pilotés par
  **`settings.show_accelerated_checkout_buttons`** → **réglage natif du thème**
  (Personnaliser → Paramètres du thème → Panier). Décochable, priorité 1 (§9).
- Le champ code promo est `<cart-discount-component>` avec
  `<form on:submit="/applyDiscount">` / `<input name="discount">` — Horizon
  utilise des liaisons d'évènements déclaratives (`on:submit`, `on:click`).

## Fiche produit — `blocks/buy-buttons.liquid`
- `<product-form-component on:submit="/handleSubmit">` enveloppant
  `{% form 'product' %}` (action `/cart/add`, `data-type="add-to-cart-form"`)
  avec `<input type="hidden" name="id" ref="variantId" value="…">`.
  → **le sélecteur natif utilisé par `sumup-pay.js`
  (`form[action*="/cart/add"] [name="id"]` / `[name="quantity"]`) est correct.**
- Sous-blocs statiques : `quantity` (`id:quantity`), `add-to-cart`
  (`id:add-to-cart`), **`accelerated-checkout`** (`id:accelerated-checkout`,
  type `accelerated-checkout`) = le bouton « Acheter maintenant » / paiement
  dynamique produit → masquable en retirant/désactivant ce sous-bloc dans
  l'éditeur (Bloc « Boutons d'achat » → sous-bloc « Paiement accéléré »).
- Produits Le Bon Plan : mono-variante (`Default Title`), numériques →
  pas de sélecteur de variante, quantité par défaut 1.

## Conclusions pour l'intégration SumUp (phase suivante)

1. **Page panier** : bloc app `sumup-payments/cart-button` — OK tel quel
   (`enabled_on templates ["cart"]`). Le rendre CTA principal pleine largeur.
2. **Cart drawer** : nouvel **app embed** (`blocks/sumup-storefront.liquid`,
   `target: body`) qui, quand `settings.cart_type == 'drawer'` :
   - injecte le CTA SumUp dans `.cart-drawer__summary` (au-dessus de `#checkout`),
   - se ré-accroche après chaque rendu Section Rendering API du tiroir,
   - re-lit `/cart.js` frais avant submit.
3. **Masquage des CTA concurrents** (réglages / app embed configurables) :
   - accéléré : réglage natif `show_accelerated_checkout_buttons` (doc manuelle),
   - `#checkout` : CSS ciblé de l'app embed, activable/désactivable en réglage,
   - produit : sous-bloc `accelerated-checkout` (doc manuelle).
4. **Ne pas** casser : `#cart-form`, `<cart-discount-component>`,
   `<cart-drawer-component>`, l'ouverture/fermeture du tiroir, le champ note.
