# ACTIONS HUMAINES — activer SumUp sur le panier Horizon

Le code est prêt et vérifié (lint / typecheck / build / 21 tests verts).
Rien n'est déployé. Les étapes ci-dessous demandent **ta session / ton
navigateur** et **rien n'est actif tant qu'elles ne sont pas faites**
(« construire ≠ activer »).

---

## 1. Déployer l'app (extension de thème + serveur)

**Pourquoi Claude ne peut pas :** `shopify app deploy` exige une auth Partner
interactive ; le redéploiement serveur passe par ton workflow Git → Render.

**Étapes :**
1. `cd sumup-integration` puis `git checkout fix/horizon-sumup-theme-extension`.
2. `npm run deploy` — accepte la nouvelle version de l'app + l'extension
   `sumup-payments` (blocs *SumUp — Panier*, *SumUp — Bouton produit* et
   app embed *SumUp — Storefront*). **Vérifie qu'aucune ligne `Delete` n'apparaît.**
3. Redéploie le serveur (push de la branche vers l'environnement Render
   habituel). Le démarrage (`npm run setup` = `prisma db push`) crée les
   colonnes / tables additives : `SumUpPayment.quantity`,
   `SumUpCartPayment.*` (discount…), `MerchantSettings`.

**À NE PAS modifier :** `client_id`, `application_url`, `[app_proxy]` de
`shopify.app.toml`, variables d'env SumUp, scopes.

**Résultat attendu :** version de l'app à jour ; l'éditeur de thème propose
les 2 blocs + l'app embed.

---

## 2. Régler les interrupteurs dans l'app (admin)

**Où :** admin Shopify → *Applications → Sumup integration → Réglages SumUp*.

| Réglage | Recommandation de départ |
|---|---|
| Paiement du panier avec SumUp | **ON** |
| Bouton SumUp dans le tiroir de panier | ON si tu veux le tiroir |
| Masquer le bouton « Passer à la caisse » de Shopify | **OFF** au début, ON quand tout est validé |

Enregistre. (Défauts si tu ne touches à rien : paiement panier ON, tiroir OFF,
masquage OFF.)

---

## 3. Éditeur de thème Horizon

**Où :** *Boutique en ligne → Thèmes → Horizon → Personnaliser*.

### a) Page panier
Modèle **Panier** → section du panier → *Ajouter un bloc → Applications →
SumUp — Panier*. Le placer au-dessus du bouton « Passer à la caisse ».
Régler texte / couleur / pleine largeur.

### b) Cart drawer (tiroir)
Le tiroir n'accepte pas les blocs d'app → on passe par l'**app embed** :
*Paramètres du thème (⚙️) → App embeds → activer « SumUp — Storefront »*.
Le bouton SumUp apparaîtra dans le tiroir dès que le réglage admin
« Bouton SumUp dans le tiroir » est ON. Rien à placer manuellement.

### c) Fiche produit
Déjà en place — ne pas y toucher (le bloc *SumUp — Bouton produit* existe).

### d) Boutons de paiement accéléré (Shop Pay, PayPal, GPay…)
Réglage **natif** Horizon : *Paramètres du thème → Panier → décocher
« Afficher les boutons de paiement accéléré »* si tu veux les retirer du
panier. (Non géré par notre app — c'est le mécanisme officiel.)

### e) Bouton « Acheter maintenant » sur la fiche produit
Bloc *Boutons d'achat* → sous-bloc *Paiement accéléré* → le masquer/retirer
si tu veux forcer le passage par le panier.

**Enregistrer.** M'envoyer des captures : fiche produit, page panier, tiroir
(desktop + mobile).

---

## 4. Tests storefront (sans paiement)

Après 1–3, prévenir Claude : je repasse la checklist §12 (panier, tiroir,
masquage, remises) sur la preview. **Aucun paiement live.**

---

## 5. Test de paiement final

⚠️ **Ne déclenche aucun paiement LIVE sans accord explicite.** Pour valider le
tunnel : carte de test / sandbox SumUp, ou s'arrêter à la page de checkout
hébergée SumUp (preuve que la redirection fonctionne).
