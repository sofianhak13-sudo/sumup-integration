# ACTION HUMAINE REQUISE — remettre SumUp sur Horizon

Le code est prêt et vérifié (build / lint / typecheck verts). Trois étapes
demandent **ta session / ton navigateur** et ne peuvent pas être faites depuis
le code.

---

## 1. Déployer l'app (extension de thème + route produit mise à jour)

**Objectif :** publier la nouvelle *theme app extension* `sumup-payments` et la
route `/apps/sumup-pay` mise à jour.

**Pourquoi Claude ne peut pas le faire :** `shopify app deploy` exige une
authentification interactive au Partner account, et le push Render est déclenché
par ton workflow habituel (Git → Render).

**Étapes exactes :**
1. `cd sumup-integration`
2. `npm run deploy` (= `shopify app deploy`) — accepte la création de
   l'extension `sumup-payments` et la nouvelle version de l'app.
3. Pousse la branche sur `origin/main` pour que Render redéploie le serveur
   (la commande de démarrage `npm run setup` exécute `prisma db push` et crée
   automatiquement la colonne `SumUpPayment.quantity`).

**Valeurs à NE PAS modifier :** `client_id`, `application_url`, le bloc
`[app_proxy]` de `shopify.app.toml`, les variables d'env SumUp sur Render.

**Résultat attendu :** dans l'admin Shopify → *Paramètres → Applications*, la
version de « Sumup integration » est à jour ; l'éditeur de thème propose un
bloc d'app « SumUp — Bouton produit » / « SumUp — Panier ».

**À me renvoyer :** la sortie de `npm run deploy` (URL de la version) + confirmation
que Render a fini le redéploiement.

---

## 2. Ajouter les blocs dans le thème Horizon

**Objectif :** faire réapparaître le bouton SumUp sur la fiche produit (et sur
le panier si le paiement panier est voulu).

**Pourquoi Claude ne peut pas le faire :** l'éditeur de thème Shopify nécessite
ta session admin ; aucune API n'ajoute un bloc d'app à un thème à ma place de
façon fiable.

**Étapes exactes :**
1. Admin Shopify → *Boutique en ligne → Thèmes → Horizon → Personnaliser*.
2. En haut, choisir le modèle **Produit**.
3. Dans la colonne de gauche, sous la section d'infos produit :
   *Ajouter un bloc → Applications → SumUp — Bouton produit*.
4. Le glisser juste sous/à côté de « Ajouter au panier » / « Acheter
   maintenant ». Régler le libellé / la couleur si besoin.
5. Choisir le modèle **Panier**, répéter avec *SumUp — Panier* (le placer
   sous le récapitulatif / bouton *Commander*).
6. **Cart drawer :** ouvrir la section du tiroir de panier ; si
   *Ajouter un bloc → Applications* propose *SumUp — Panier*, l'ajouter aussi.
   Si Horizon ne l'autorise pas dans le tiroir, laisser seulement la page
   panier (voir « Limites » dans le rapport).
7. **Enregistrer.**

**Valeurs à saisir :** aucune valeur sensible. Les libellés/couleurs sont
cosmétiques.

**Résultat attendu :** sur une fiche produit publique, le bloc SumUp
(champ e-mail + bouton) s'affiche près des boutons d'achat ; sur `/cart`, le
bloc panier s'affiche.

**À me renvoyer :** une capture de la fiche produit + du panier avec le bloc
visible (desktop et mobile si possible).

---

## 3. (Optionnel) Reconnecter le MCP Shopify pour l'audit live

**Objectif :** me permettre d'inspecter la boutique et le thème Horizon en
direct (produits mono/multi-variantes, structure du cart drawer) et de valider
le parcours sans paiement réel.

**Pourquoi Claude ne peut pas le faire :** le jeton MCP « claude.ai Shopify » a
expiré ; la ré-autorisation passe par ton compte.

**Étapes exactes :** relancer l'autorisation du connecteur Shopify dans Claude,
puis me le signaler.

**À me renvoyer :** « MCP reconnecté » — je reprends l'audit live et la
checklist de tests §11/§12.

---

## Test de paiement

⚠️ **Ne pas déclencher de paiement LIVE** sans accord explicite. Pour valider
le tunnel, utiliser une carte de test SumUp / le mode sandbox, ou s'arrêter à
la page de checkout hébergée SumUp (preuve que la redirection fonctionne).
