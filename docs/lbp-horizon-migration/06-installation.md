# Instructions d'installation — thème LE BON PLAN × Horizon

## 1. Où se trouve le thème

Le thème complet, prêt à l'emploi, se trouve dans ce dépôt sous
`theme/lebonplan-horizon/`. Une archive ZIP installable est également fournie
séparément (voir message accompagnant cette livraison).

## 2. Installer le thème SANS toucher au thème publié (Phase 22)

**Ne jamais utiliser "Publier" directement.** Procédure recommandée :

1. Dans l'admin Shopify : **Boutique en ligne → Thèmes**.
2. Cliquer sur **Ajouter un thème → Importer depuis un fichier zip**, puis
   sélectionner le fichier `lebonplan-horizon.zip` fourni.
3. Le thème apparaît dans la liste sous "Bibliothèque de thèmes", **non
   publié**. C'est l'état attendu — il reste invisible pour vos clients tant
   que vous ne cliquez pas sur "Publier".
4. Cliquer sur **Aperçu** (Preview) pour l'ouvrir en visualisation live sans
   l'activer.

Alternative avec Shopify CLI (si disponible sur votre poste) :

```bash
cd theme/lebonplan-horizon
shopify theme push --unpublished
```

## 3. Vérifications à faire dans l'éditeur de thème avant publication

1. **Boutons SumUp** : ouvrir la fiche produit et la page panier dans
   l'aperçu, vérifier que les deux formulaires SumUp s'affichent
   correctement (champ e-mail + bouton premium).
2. **App Proxy** : confirmer dans l'admin Shopify de l'app
   (Apps → Sumup integration → Configuration) que l'App Proxy est bien
   configurée sur `/apps/sumup-pay` pour la boutique cible. Sans cela, les
   deux boutons SumUp renverront une erreur "Boutique non autorisée."
3. **Variables d'environnement backend** : `SUMUP_API_KEY` et
   `SUMUP_MERCHANT_CODE` doivent être configurées côté serveur (déploiement
   Render actuel : `sumup-integration-dwm1.onrender.com`). Ce sont des
   secrets serveur — ils ne doivent jamais être ajoutés au thème.
4. **Images** : dans Personnaliser le thème, assigner manuellement les
   médias listés comme "DISPONIBLE - NON PRE-ASSIGNE" dans
   `02-mapping-medias.csv` aux sections souhaitées (hero secondaire,
   bannières, etc.) via les champs image sélectionnables.
5. **Réseaux sociaux** : le footer contient des liens vers
   facebook.com/instagram.com/etc. génériques (valeurs par défaut du thème
   Horizon) — à remplacer par les vrais comptes LE BON PLAN dans
   Personnaliser → Pied de page → Réseaux sociaux, si applicable.

## 4. Tester un paiement SumUp avant mise en production

1. Sur le thème en aperçu (non publié), ouvrir une fiche produit, renseigner
   une adresse e-mail de test, cliquer sur le bouton SumUp.
2. Vérifier la redirection vers la page de paiement hébergée SumUp
   (`hosted_checkout_url`).
3. Effectuer un paiement de test conformément à votre configuration SumUp
   (sandbox ou compte réel selon votre setup).
4. Vérifier le retour sur `/apps/sumup-pay/return` (produit) ou
   `/apps/sumup-pay/cart/return` (panier), puis la création de la commande
   dans Shopify Admin → Commandes.
5. Répéter la même procédure pour le panier (ajouter un produit, aller sur
   `/cart`, utiliser le bouton SumUp panier).

**Aucun de ces tests n'a pu être exécuté dans cette session** (pas d'accès à
une boutique Shopify live ni à des identifiants SumUp réels) : ils
nécessitent votre intervention directe, conformément à la Phase 23 du
prompt maître (validation visuelle et test de paiement réel = actions
réservées à l'utilisateur).

## 5. Publication

Une fois les vérifications ci-dessus validées :

Boutique en ligne → Thèmes → (menu ⋯ sur le thème LE BON PLAN Horizon) →
**Publier**.

Le thème actuellement publié n'est jamais modifié par cette livraison — il
reste intact jusqu'à ce que vous choisissiez explicitement de publier le
nouveau thème.
