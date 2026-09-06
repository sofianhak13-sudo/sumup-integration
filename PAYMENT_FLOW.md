# SumUp cart payment — discount-aware flow

## Principle

```
Panier Shopify (Horizon)              ← le client gère son panier + ses codes
        │  /cart.js (indicatif)
        ▼
POST /apps/sumup-pay/cart             ← notre App Proxy
        │  Storefront Cart API : cartCreate(lines + discountCodes)
        ▼
Shopify recalcule (remises ligne/panier, codes, réductions auto)
        │  cart.cost.totalAmount  ← SOURCE DE VÉRITÉ
        ▼
Contrôle serveur + garde-fous
        │
        ▼
SumUp checkout = cart.cost.totalAmount, exactement
        ▼
SumUp hosted checkout → paiement
        ▼
return_url → /api/sumup-cart-webhook  ← vérifie PAID auprès de SumUp
        │  orderCreate (lignes catalogue + remise FIXED_AMOUNT globale)
        ▼
Commande Shopify : total = montant SumUp encaissé, au centime
```

Le navigateur ne fixe jamais un prix. `cart.total_price` de `/cart.js` sert
**uniquement** de contrôle croisé : si le total serveur Shopify en diffère de
plus d'un centime, le parcours est **bloqué** (page « Actualisez votre panier »),
jamais corrigé silencieusement.

## Ce que le navigateur transmet (tout est revalidé)

| Champ | Rôle |
|---|---|
| `cart` (`{items:[{variant_id, quantity}]}`) | lignes — revalidées via Admin `nodes` |
| `discountCodes` (JSON array) | **indice** — Shopify revalide chaque code (`discountCodes { applicable }`) |
| `cartToken` | audit uniquement |
| `cartTotal` (cents) | **indicatif** — contrôle croisé, jamais facturé |
| `email` | validé regex + serveur |

## Garde-fous (route `apps.sumup-pay.cart.jsx`)

1. Variante inconnue / quantité invalide → **bloqué**.
2. `variant.availableForSale === false` → **bloqué**.
3. `cartCreate` renvoie `userErrors` ou pas de `cart` → **bloqué**.
4. Un code soumis absent de la réponse ou `applicable:false` → **bloqué**
   (« Cette réduction n'est plus applicable. »). *(Option B validée.)*
5. `|total serveur − cartTotal| > 1 cent` → **bloqué**
   (« Le montant de votre panier a changé. »).
6. `total ≤ 0` → **bloqué**.
7. Sinon → checkout SumUp au montant `cart.cost.totalAmount`.

## Montant facturé

`amount = cart.cost.totalAmount` de la Storefront Cart API.
La TVA n'est plus exposée par la Cart API (dépréciée) : `totalAmount` est le
total du panier tel que Shopify le calcule pour le contexte panier — identique à
ce qu'affiche Horizon pour une boutique en prix TTC. Le contrôle croisé (§5)
garantit qu'aucun écart avec le panier affiché ne part vers SumUp.

## Commande Shopify (webhook, après `PAID` confirmé auprès de SumUp)

- `lineItems` : variantes + quantités au **prix catalogue**.
- Si `discountAmount > 0` :
  `discountCode.itemFixedDiscountCode { code: <codes joints ou "Remise">,
  amountSet: discountAmount }` → remise globale FIXED_AMOUNT.
- Transaction `SALE` = `payment.amount`.
- Objectif : `order.currentTotalPrice == payment.amount == checkout SumUp == montant PAID`.
  Les champs `currentTotalPriceSet` / `totalDiscountsSet` sont loggés pour contrôle.

Inchangé : vérification `PAID` directe auprès de SumUp, corrélation `checkoutId`,
contrôle montant + devise, verrou `processing`, idempotence (`orderId`), commande
unique. La redirection navigateur depuis SumUp n'est jamais une preuve de paiement.

## Persistance (`SumUpCartPayment`, champs additifs)

`subtotalAmount`, `discountAmount`, `discountCodes[]`, `cartToken`, `snapshot`
(source, cost, allocations, items, total indicatif). Migration
`20260906120000_add_cart_payment_discounts` — additive, non destructive.

## Limites V1 (à valider en test réel)

- **Config TVA de la boutique** : à confirmer que « prix TTC inclus » est actif
  (cas normal FR). Sinon `totalAmount` pourrait exclure une taxe ajoutée au
  checkout ; le contrôle croisé bloque en cas d'écart, mais le parcours ne
  fonctionnerait pas pour cette config → revoir.
- **Répartition de la remise ligne par ligne** : non faite (remise globale). Le
  total est exact, l'imputation par ligne est approximative.
- **Réductions automatiques ciblant un client précis** : non prises en compte
  (acheteur anonyme dans l'App Proxy — `buyerIdentity.email` transmis mais pas
  d'authentification client).
- **Multi-marché / prix par pays** : `cartCreate` sans `countryCode` utilise le
  marché principal ; un acheteur sur un autre marché serait bloqué par le
  contrôle croisé.
- **Détection des codes côté navigateur** : dépend de `/cart.js` exposant
  `discount_codes` (thèmes récents / Horizon : OK).
- **`itemFixedDiscountCode`** : le comportement exact d'`orderCreate` (total
  final au centime) doit être confirmé par un test webhook réel.
