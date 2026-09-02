# Preset LE BON PLAN

Ce dossier contient la **configuration réelle de la boutique LE BON PLAN**,
extraite du moteur générique du Theme Master pour que celui-ci reste neutre
par défaut. Il ne s'agit pas de code : ce sont des instantanés de données
(JSON) à appliquer une fois, lors de la mise en place de la boutique
LE BON PLAN, ou à ressortir après une mise à jour du moteur générique.

## Pourquoi ce dossier existe

Shopify ne propose pas de mécanisme de "template alterné" pour :
- la page d'accueil (`templates/index.json` est toujours utilisé, jamais
  sélectionnable au cas par cas) ;
- le panier (`templates/cart.json` est unique pour toute la boutique).

Il est donc impossible de faire cohabiter, comme deux fichiers que Shopify
choisirait automatiquement, "la home LE BON PLAN" et "la home neutre du
Theme Master", ou "le panier LE BON PLAN avec SumUp" et "le panier neutre".
Le thème livré ne contient donc, par défaut (`templates/index.json`,
`templates/cart.json`, `sections/header-group.json`,
`sections/footer-group.json`), qu'une configuration **neutre et générique**,
sans SumUp, sans texte LE BON PLAN. La configuration réelle LE BON PLAN vit
ici, dans `presets/lebonplan/`, prête à être réappliquée.

(La fiche produit, elle, a un vrai mécanisme de template alterné natif
Shopify — voir `templates/product.lebonplan.json`, assignable par produit
depuis Admin. `presets/lebonplan/product.json` en est une copie de
référence, gardée ici pour que ce dossier soit un point d'entrée unique et
complet.)

## Contenu

| Fichier | Remplace | Contenu |
|---|---|---|
| `index.json` | `templates/index.json` | Page d'accueil réelle LE BON PLAN (hero, trust bar, bénéfices, offres, étapes, CTA, FAQ) |
| `cart.json` | `templates/cart.json` | Panier réel LE BON PLAN, avec le bloc "SumUp — Paiement panier" |
| `header-group.json` | `sections/header-group.json` | Bandeau d'annonce LE BON PLAN ("Paiement sécurisé · Accès immédiat · Aucun abonnement") |
| `footer-group.json` | `sections/footer-group.json` | Footer LE BON PLAN (newsletter en français) |
| `product.json` | *(assignation `templateSuffix` par produit, pas une copie de fichier — voir plus bas)* | Copie de référence de `templates/product.lebonplan.json` |

## Comment appliquer ce preset sur une boutique

**Étape 1 — Copier les 4 fichiers de page/section**, par l'une de ces méthodes :

- **Shopify CLI**, depuis la racine du thème :
  ```bash
  cp presets/lebonplan/index.json templates/index.json
  cp presets/lebonplan/cart.json templates/cart.json
  cp presets/lebonplan/header-group.json sections/header-group.json
  cp presets/lebonplan/footer-group.json sections/footer-group.json
  shopify theme push --only templates/index.json --only templates/cart.json \
    --only sections/header-group.json --only sections/footer-group.json
  ```
- **Ou manuellement dans l'admin** : Boutique en ligne → Thèmes → (⋯) →
  Modifier le code → ouvrir chacun des 4 fichiers ci-dessus dans
  `templates/`/`sections/` et coller le contenu du fichier correspondant de
  `presets/lebonplan/`.

**Étape 2 — Sélectionner le preset de style** "LE BON PLAN — Dark Electric
Blue" dans Personnaliser le thème → Réglages du thème (natif Shopify,
aucune manipulation de fichier requise).

**Étape 3 — Assigner le modèle produit alterné** aux produits concernés :
Admin → Produits → (chaque e-book) → section "Thème" → modèle
**"product.lebonplan"**. (Ou via la mutation GraphQL `productUpdate` avec
`templateSuffix: "lebonplan"` — voir le rapport final, §Actions externes.)

C'est la procédure complète, reproductible et 100% documentée pour faire
d'une nouvelle boutique une boutique "LE BON PLAN" — sans toucher au moteur
générique du Theme Master, et sans que le moteur générique n'hérite jamais
de ce contenu par défaut.
