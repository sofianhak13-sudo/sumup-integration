# Rollback — Checkout V2 / scopes Storefront

Tout a été conçu pour être **réversible sans perte de données**. Le checkout
avancé est **désactivé par défaut** ; l'activer/désactiver est un toggle admin.

## Niveau 0 — désactiver le checkout avancé (aucun déploiement)

Admin Shopify → *Sumup integration → Checkout avancé* → décocher
**« Activer le checkout avancé »** → Enregistrer.

Effet immédiat : `advancedCheckoutEnabled=false`. Les boutons reprennent le
parcours rapide (panier → e‑mail → SumUp). Le filet serveur
(`apps.sumup-pay.cart.jsx` / `apps.sumup-pay.jsx`) ne redirige plus.
Idem pour **« Activer le calcul de livraison »** (`shippingEnabled`).

## Niveau 1 — revenir au backend précédent (Render)

Redéployer Render sur le commit **`b82f5ef`** (« Grant Storefront
unauthenticated scopes ») ou **`cf224c5`** (avant les scopes).

- `b82f5ef` : scopes Storefront en place, pas de Checkout V2.
- `cf224c5` : état d'avant l'incident panier (le bouton tiroir renvoie alors
  l'erreur « third‑party application » — cf. `horizon-cart-storefront-scopes`).

Les colonnes additives de la BDD restées en place sont **sans effet** sur ces
versions (elles ne les lisent pas). Aucune migration inverse nécessaire.

## Niveau 2 — retirer les scopes Storefront

Seulement si l'on renonce complètement à `cartCreate` serveur.

1. `shopify.app.toml` `[access_scopes]` → retirer
   `unauthenticated_read_product_listings,unauthenticated_write_checkouts`.
2. `shopify app deploy` → re‑consent marchand.
3. Aligner `SCOPES` sur Render.
4. Le parcours panier redevient cassé jusqu'à un autre correctif — ne faire
   ceci que sur décision explicite.

## Niveau 3 — base de données

Les migrations sont **purement additives** (aucun `DROP`, aucun renommage).
Un rollback de code n'exige **aucune** action BDD. Si l'on veut malgré tout
retirer les colonnes (déconseillé, destructif) :

```sql
ALTER TABLE "SumUpCartPayment"
  DROP COLUMN "checkoutMode", DROP COLUMN "firstName", DROP COLUMN "lastName",
  DROP COLUMN "phone", DROP COLUMN "company", DROP COLUMN "shippingAddress",
  DROP COLUMN "billingAddress", DROP COLUMN "shippingMethod",
  DROP COLUMN "shippingAmount", DROP COLUMN "taxAmount",
  DROP COLUMN "checkoutSnapshot";
ALTER TABLE "MerchantSettings"
  DROP COLUMN "advancedCheckoutEnabled", DROP COLUMN "shippingEnabled",
  DROP COLUMN "checkoutPreset", DROP COLUMN "checkoutFieldConfig",
  DROP COLUMN "checkoutAppearance", DROP COLUMN "buttonAppearance",
  DROP COLUMN "sumupMerchantName", DROP COLUMN "sumupMerchantEmail",
  DROP COLUMN "sumupApiKeyLast4", DROP COLUMN "sumupAccountStatus",
  DROP COLUMN "sumupAccountCheckedAt";
```

À ne faire qu'après un backup et hors trafic.

## Niveau 4 — extension de thème

Si la version d'extension avec le routage client `advancedCheckoutEnabled`
pose problème : republier la version précédente de `sumup-payments` depuis le
Partner Dashboard. Le **filet serveur** garde le checkout avancé fonctionnel
sans l'extension à jour (POST natif → 303).

## Ce qui n'est jamais touché par un rollback

`main`, `sumup-integration-reusable`, PayPal, les secrets SumUp, l'App Proxy,
`client_id`, `application_url`, le parcours produit rapide.
