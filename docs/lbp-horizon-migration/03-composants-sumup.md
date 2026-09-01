# Composants SumUp — thème Horizon LE BON PLAN

Le backend SumUp (ce dépôt `sumup-integration`) n'a **pas été modifié**. Ce document
décrit le contrat exact identifié dans le code backend et comment le thème
Horizon s'y conforme.

## 1. Configuration App Proxy (référence)

Depuis `shopify.app.toml` :

```
[app_proxy]
url = "/apps/sumup-pay"
prefix = "apps"
subpath = "sumup-pay"
```

Le préfixe storefront est donc **`/apps/sumup-pay`**. Les routes React Router
(fichiers à points = segments de chemin) confirment les chemins réels :

| Fichier route backend | URL storefront réelle |
|---|---|
| `app/routes/apps.sumup-pay.jsx` | `POST /apps/sumup-pay` |
| `app/routes/apps.sumup-pay.cart.jsx` | `POST /apps/sumup-pay/cart` |
| `app/routes/apps.sumup-pay.return.jsx` | `GET /apps/sumup-pay/return?reference=...` |
| `app/routes/apps.sumup-pay.cart.return.jsx` | `GET /apps/sumup-pay/cart/return?reference=...` |

Le backend lui-même construit ses URLs de redirection avec des slashes
(`https://lebonplan-ebook.com/apps/sumup-pay/cart/return?reference=...`,
voir `apps.sumup-pay.cart.jsx` ligne ~179), ce qui confirme sans ambiguïté le
format `/apps/sumup-pay/cart` (et non `/apps/sumup-pay.cart`).

## 2. Paiement produit — `blocks/sumup-payment.liquid`

- **Endpoint** : `POST /apps/sumup-pay`
- **Champs envoyés par le thème** : `email`, `productId` (ID Shopify du
  produit), `variantId` (envoyé mais **actuellement ignoré par le backend** —
  voir limite ci-dessous).
- **Champs lus par le backend** (`apps.sumup-pay.jsx`) : `productId`, `email`
  uniquement. Le backend récupère toujours la **première variante**
  (`variants(first: 1)`) du produit pour calculer le prix — il n'accepte pas
  de `variantId` explicite.
- **Aucune donnée de prix n'est calculée côté thème** : le thème n'envoie que
  l'identité du produit, jamais un montant.
- **Limite héritée du backend (non modifiée)** : si un produit a plusieurs
  variantes à des prix différents, le paiement SumUp utilisera toujours le
  prix de la première variante, quelle que soit la variante sélectionnée par
  le client dans le sélecteur Horizon. Ce comportement existait déjà avant
  cette migration ; il n'a pas été modifié conformément à la consigne
  "ne pas réécrire le backend". À signaler à l'utilisateur si les produits
  LE BON PLAN ont plusieurs variantes de prix différents.

## 3. Paiement panier — `blocks/sumup-cart-payment.liquid`

- **Endpoint (corrigé)** : `POST /apps/sumup-pay/cart`
  — **était `POST /apps/sumup-pay.cart` dans le thème fourni : bug corrigé**
  (voir `04-fichiers-modifies-crees.md`).
- **Champs envoyés** : `email`, `cart` (le JSON complet retourné par
  `/cart.js`, envoyé tel quel).
- **Champs lus par le backend** (`apps.sumup-pay.cart.jsx`) : `cart.items[].variant_id`,
  `cart.items[].quantity`, `email`. Le backend revérifie chaque prix via
  l'Admin GraphQL API (`ProductVariant.price`) — aucun prix n'est fait
  confiance côté client, conformément à la Phase 10 du prompt maître.
- **États gérés côté thème** : chargement (`Chargement...`), désactivation du
  bouton pendant la requête, alerte si panier vide ou e-mail invalide.

## 4. Pages de retour

Les deux pages de retour (`/apps/sumup-pay/return` et
`/apps/sumup-pay/cart/return`) sont **entièrement backend** (elles renvoient
du Liquid généré par `authenticate.public.appProxy(...).liquid(...)`, pas des
fichiers du thème). Elles n'ont pas été touchées.

## 5. Séparation frontend / backend (Phase 11)

Vérifié : aucun secret, token, clé API SumUp ou access token Shopify Admin
n'apparaît dans le thème. Les seules informations transmises par le
navigateur sont l'e-mail du client et l'identité du produit/panier — jamais
un montant ni des identifiants d'API. Le calcul et la vérification des prix
restent entièrement côté serveur (`app/routes/apps.sumup-pay*.jsx`).

## 6. Ce qui reste à tester en conditions réelles (Phase 20)

Déjà validé statiquement dans cette session :
- Les deux endpoints appelés par le thème correspondent exactement aux
  routes backend existantes.
- Les champs de formulaire envoyés correspondent aux champs lus par le
  backend (aucun champ inventé ou supprimé).
- Aucun calcul de prix ni secret côté thème.

Nécessite un test réel sur boutique (ne peut pas être simulé sans accès
live) :
- Soumission réelle du formulaire produit → réception de la redirection
  `303` vers `hosted_checkout_url` SumUp.
- Soumission réelle du panier → même vérification.
- Paiement test SumUp de bout en bout → retour sur `/apps/sumup-pay/return`
  ou `/apps/sumup-pay/cart/return` → confirmation de commande Shopify.
- Vérification que l'App Proxy est bien configurée sur la boutique cible
  (`shopify.app.toml` déployé, scopes `write_app_proxy` actifs).

**Aucun paiement n'a été effectué ni validé dans cette session.**
