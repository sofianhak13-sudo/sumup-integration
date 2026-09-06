# Checkout V2 — parcours de paiement avancé

L'app supporte **deux parcours**, choisis par un seul interrupteur admin
(`advancedCheckoutEnabled`). Le Bon Plan reste en **mode rapide** par défaut ;
le checkout avancé est construit, configurable et testable mais **jamais activé
automatiquement**.

```
                         advancedCheckoutEnabled = false        = true
PRODUIT / PANIER / TIROIR ───────────────────────────────┬──────────────────────
   │  bouton SumUp                                        │
   ▼                                                      ▼
POST /apps/sumup-pay(.cart)                    GET /apps/sumup-pay/checkout
   │  e-mail                                              │  contact + adresse
   │                                                      │  + livraison + récap
   ▼                                                      ▼
cartCreate serveur (remises)                   POST /apps/sumup-pay/checkout
   │                                                      │  intent = quote / shipping / pay
   ▼                                                      ▼
SumUp Hosted Checkout  ◄───────────────────────  cartCreate + deliveryGroups
   │                                                      │  reconcileOrder (montant exact)
   ▼                                                      ▼
return_url → /api/sumup-cart-webhook (vérifie PAID auprès de SumUp)
   │
   ▼
orderCreate Shopify — lignes catalogue − remise fixe + shippingLine + adresses
```

## 1. Activation

`MerchantSettings.advancedCheckoutEnabled` (défaut **false**).
Admin : **Checkout avancé → Activer le checkout avancé**.

- **OFF** — le parcours rapide actuel est conservé **à l'octet près** (aucune
  route rapide n'est modifiée quand le flag est off ; le filet serveur ne
  s'arme que si le flag est on).
- **ON** — les boutons produit / page panier / tiroir mènent à la page
  `/apps/sumup-pay/checkout`.

Basculer entre les deux ne demande **aucune modification de code ni
redéploiement** : c'est un simple toggle admin (§30 du prompt maître).

## 2. Page checkout — `/apps/sumup-pay/checkout`

Route : `app/routes/apps.sumup-pay.checkout.jsx`.
Page : `app/lib/checkout-screens.server.js` (HTML/CSS/JS autonome, mobile‑first,
sans layout de thème, sans dépendance, sans syntaxe Liquid).

| Section | Contenu | Piloté par |
|---|---|---|
| Récapitulatif | image, titre, variante, quantité, prix, sous‑total, remises, livraison, TVA incluse, total, devise | `/cart.js` + `intent=quote` (serveur) |
| Contact | e‑mail (toujours), prénom, nom, téléphone, entreprise | `checkoutFieldConfig.fields` |
| Adresse de livraison | prénom, nom, entreprise, adresse 1/2, CP, ville, région, pays, téléphone | `shippingAddress` (`disabled`/`optional`/`required`) |
| Adresse de facturation | case « identique à la livraison » + formulaire distinct | `billingAddress` (`disabled`/`same_only`/`optional`/`required`) |
| Livraison | modes réels Shopify + tarifs, radio | `shippingEnabled` |
| Paiement | CTA « Payer avec SumUp » → Hosted Checkout | — |

**Aucune donnée bancaire** n'est saisie ni transmise par l'app.

## 3. Configuration des champs — presets

`MerchantSettings.checkoutPreset` + `checkoutFieldConfig` (JSON, override
partiel). `app/lib/checkout-config.js` → `resolveCheckoutConfig()` produit la
config **effective** que le serveur applique (le navigateur ne peut jamais
élargir).

| Preset | email | prénom/nom | téléphone | entreprise | adresse livr. | facturation | livraison |
|---|---|---|---|---|---|---|---|
| `digital` (défaut) | obligatoire | désactivé | désactivé | désactivé | désactivée | désactivée | off |
| `ecommerce` | obligatoire | obligatoire | optionnel | optionnel | obligatoire | identique | on |
| `custom` | obligatoire | optionnel | optionnel | désactivé | optionnel | désactivée | off |

Chaque champ est ensuite surchargeable individuellement
(`disabled` / `optional` / `required`) via l'admin **Checkout avancé → Données
client**. `email` ne peut jamais être désactivé.

Validation **client ET serveur** avec les **mêmes règles**
(`validateContact`, `validateAddress`) — région obligatoire pour
US/CA/AU/IE/IT/ES/JP/BR/MX/IN/CN/AR.

## 4. Livraison — **à valider en conditions réelles**

`shippingEnabled` (défaut **false**). Quand ON :

1. `recalcCart` (`app/lib/storefront-cart.server.js`) envoie l'adresse dans
   `CartInput.delivery.addresses[].address.deliveryAddress`
   (schéma Storefront **2026‑07**).
2. Lecture de `cart.deliveryGroups.nodes[].deliveryOptions` → renvoyées au
   client (`intent=shipping`).
3. Au paiement, si le mode choisi ≠ mode auto‑sélectionné →
   `cartSelectedDeliveryOptionsUpdate(cartId, …)` puis relecture du coût.
4. `cart.cost.totalAmount` (remises + livraison + taxes, calculé par Shopify)
   est la source du montant SumUp.

> ⚠️ **Ce chemin a été écrit contre le schéma 2026‑07 mais pas encore exécuté
> contre une boutique réelle.** Points à confirmer lors du premier test avec
> `shippingEnabled=ON` :
> - forme exacte acceptée par `CartInput.delivery` / `CartDeliveryAddressInput` ;
> - présence de `deliveryGroups` sur un panier de produits numériques (Le Bon
>   Plan : `requiresShipping=false` → probablement aucun groupe → message
>   « Aucun mode de livraison ») ;
> - `cartSelectedDeliveryOptionsUpdate` sur un cart fraîchement créé.
> Si échec runtime : récupérer le log exact et ajuster `storefront-cart.server.js`
> **avant** d'activer `shippingEnabled` sur le live.

Aucun tarif de livraison n'est codé en dur. Pas de mode de livraison
disponible → message clair, paiement bloqué tant que rien n'est sélectionné.

## 5. Moteur financier — `app/lib/checkout-totals.js`

```
SOUS-TOTAL CATALOGUE  (API Admin, prix × qté)
  − REMISES            (cartCreate : codes + automatiques + allocations)
  + LIVRAISON          (deliveryOption.estimatedCost)
  + TAXES              (incluses dans le total pour une boutique TTC)
  = TOTAL FINAL        = cart.cost.totalAmount
```

`reconcileOrder()` garantit **par construction** :

```
catalogSubtotal − orderDiscount + shipping  ==  amountCharged  ==  cart.cost.totalAmount
                                             ==  montant SumUp  ==  montant PAID
                                             ==  total de la commande Shopify
```

Garde‑fous **fail‑closed** : total ≤ 0, total > catalogue + 1 c (majoration
non modélisable), dérive de reconciliation, code promo rejeté, divergence
navigateur/serveur > 1 c, variante indisponible → **paiement bloqué**, jamais
de facturation silencieuse plus chère.

**Limite connue (héritée V1)** : `taxesIncluded` n'est pas transmis à
`orderCreate` → Shopify applique le réglage TVA de la boutique. Exact pour une
boutique **prix TTC** (Le Bon Plan). Pour une boutique prix HT, la ventilation
TVA de la commande demandera un ajustement (voir `PAYMENT_FLOW.md`).

## 6. Persistance — `SumUpCartPayment` (colonnes additives)

`checkoutMode` (`fast`|`advanced`), `firstName`, `lastName`, `phone`,
`company`, `shippingAddress` (JSON), `billingAddress` (JSON), `shippingMethod`
(JSON), `shippingAmount`, `taxAmount`, `checkoutSnapshot` (JSON audit complet).
Migration `prisma/migrations/20260907000000_checkout_v2/` — **additive**, aucun
DROP, les lignes existantes restent valides. Déploiement via `prisma db push`.

## 7. Commande Shopify après PAID

`api.sumup-cart-webhook.jsx` → `buildOrderInput()` (`app/lib/order-input.js`) :

- `email`, `phone`, `customer { firstName, lastName, phone }` ;
- `lineItems` au **prix catalogue** ;
- `discountCode.itemFixedDiscountCode` = remise globale (= `discountAmount`) ;
- `shippingLines[0]` = mode + `priceSet` (= `shippingAmount`) ;
- `shippingAddress`, `billingAddress` (repli sur la livraison si « identique ») ;
- `transactions[0]` SALE = montant encaissé.

Inchangé : vérification `PAID` directe SumUp, contrôle référence + montant +
devise, verrou `processing`, idempotence (`orderId`), commande unique.

## 8. Reprise / robustesse

- Refresh / retour navigateur : la page recharge `/cart.js` + un `quote`
  serveur ; le total affiché n'est jamais obsolète (recalcul serveur au
  paiement).
- Double clic : CTA désactivé au submit ; le webhook a le verrou `processing`
  + `orderId`.
- Panier modifié : divergence > 1 c → blocage.
- Checkout SumUp expiré / déjà payé / déjà traité : géré par
  `/apps/sumup-pay/cart/return` (polling `SumUpCartPayment.statusPageUrl`).
- `?add=<variantId>&qty=` (produit → checkout) : ajout via `/cart/add.js` puis
  `history.replaceState` pour qu'un reload ne ré‑ajoute pas.

## 9. Sécurité (rappel)

Secrets serveur uniquement · prix navigateur jamais fiable · validation
serveur · webhook PAID · idempotence · aucune donnée bancaire · aucun secret
en logs / en réponse API · clé SumUp masquée (4 derniers caractères) ·
protection double‑clic · `publicStorefrontConfig` = whitelist stricte pour
`/apps/sumup-pay/config` (ne fuite jamais l'identité SumUp).

## 10. Admin V2

| Page | Rôle |
|---|---|
| Tableau de bord (`/app`) | état de l'intégration, parcours actif, liens |
| Paiement panier (`/app/settings`) | `cartPaymentsEnabled`, `cartDrawerEnabled`, `hideShopifyCheckout` |
| Checkout avancé (`/app/checkout`) | activation, preset, données client, adresses, livraison, apparence |
| Compte SumUp (`/app/sumup`) | identité marchand, « Vérifier le compte SumUp », clé masquée |
| Diagnostic (`/app/diagnostics`) | tests Admin / Storefront / SumUp / config |
