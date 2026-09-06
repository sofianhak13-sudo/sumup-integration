# SumUp cart payment — discount-aware flow

> Deux parcours : **rapide** (ci‑dessous) et **checkout avancé** (contact /
> adresse / livraison / récapitulatif). Voir **`CHECKOUT_V2.md`**. Le checkout
> avancé est désactivé par défaut ; ce document décrit le parcours rapide, qui
> reste inchangé.


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

Boutique **Le Bon Plan** : `taxesIncluded = true` (prix TTC), EUR, France,
produits numériques (`requiresShipping = false`), mono-variante.
→ `cart.cost.totalAmount` de la Storefront Cart API = **le prix TTC final**
affiché par Horizon (`/cart.js` `total_price`). La TVA n'est plus exposée par
la Cart API (dépréciée) et n'a pas à l'être ici.

`amountCharged = min(cart.cost.totalAmount, Σ prix catalogue × qté)` en cents.
- Sans remise : `= Σ catalogue` (identique au total Horizon).
- Avec remise : `= cart.cost.totalAmount` (total remisé Shopify).
- Si `cart.cost.totalAmount` dépasse le catalogue de plus d'1 cent
  (majoration / prix par marché) → **bloqué**.

`discountAmount = Σ catalogue − amountCharged`. La commande facture les lignes
au prix catalogue et applique `discountAmount` en remise fixe → le total de la
commande vaut exactement `amountCharged`. Vérifié via `draftOrderCalculate` :
`59,80 € − 10,00 € (FIXED_AMOUNT) = 49,80 €`.

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

## Remises de la boutique (audit)

- **Aucun code promo** configuré.
- **1 réduction automatique** : `DiscountAutomaticApp` « UpPromote discount
  function » (app d'affiliation). Ne s'applique **pas** inconditionnellement
  (vérifié : `draftOrderCalculate acceptAutomaticDiscounts:true` → 0 remise) ;
  elle se déclenche via un attribut de panier affilié. Les attributs du panier
  sont donc transmis à `cartCreate` (`CartInput.attributes`) pour que la
  fonction s'applique côté serveur comme au checkout.

## Limites V1

- **Répartition de la remise ligne par ligne** : non faite (remise globale
  `itemFixedDiscountCode`). Le total est exact ; l'imputation par ligne est
  approximative.
- **Réductions automatiques ciblant un client précis** : non prises en compte
  (acheteur anonyme ; `buyerIdentity.email` transmis mais pas d'auth client).
- **Multi-marché / prix par pays** : `cartCreate` sans `countryCode` utilise le
  marché principal (mono-marché ici) ; un autre marché serait bloqué par le
  contrôle croisé.
- **Détection des codes côté navigateur** : dépend de `/cart.js` exposant
  `discount_codes` (Horizon OK).
- **`itemFixedDiscountCode` sur `orderCreate`** : équivalence avec la remise
  order-level FIXED_AMOUNT testée via `draftOrderCalculate` ; un test webhook
  réel (offline token) confirmera le total commande au centime en conditions
  réelles.
