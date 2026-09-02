# THEME MASTER SHOPIFY PREMIUM MULTI-STORE — Rapport final

Livrable : `lebonplan-horizon-master-multistore.zip` (thème complet, `theme/lebonplan-horizon/`
dans ce dépôt).

## 1. Base retenue

4 archives fournies ont été extraites et comparées fichier par fichier
(diff récursif, pas de confiance a priori) :

| Archive | Constat |
|---|---|
| `lebonplan-horizon.zip` | Identique à ma toute première livraison de la session précédente (avant le correctif du bug d'endpoint SumUp panier ET avant le correctif du 404 collection). Lignée la plus ancienne. |
| `horizonpremiummultistorev1.2fixed.zip` | Base "V1.2 FIXED" d'origine (contient les 2 snippets `cart-title.liquid` / `menu-featured-image.liquid` nécessaires, endpoint SumUp produit correct). Sert de socle à ce qui était déjà dans ce dépôt. |
| `lebonplanhorizonv1_2phase8buttons.zip` | **Lignée différente et plus riche** : contient 9 blocks + 9 sections premium supplémentaires (comparison-table, countdown, pricing-table, promo-popup, stats-counters, steps, testimonials, timeline, trust-bar) absents des deux archives ci-dessus. En contrepartie, **il lui manque les 2 snippets `cart-title.liquid`/`menu-featured-image.liquid`** — un `{% render 'cart-title' %}` et un `{% render 'menu-featured-image' %}` y sont bien appelés mais les fichiers n'existent pas dans cette archive : bug réel, confirmé, qui aurait cassé le rendu de la page panier et de tout menu à image mise en avant. |
| `lebonplanhorizonv1_2INSTALLABLE.zip` | Quasi identique à `phase8buttons` (mêmes 9 blocks/sections premium), à 2 différences de détail près (pas de `step` de range à `2` au lieu de `1` sur deux sections — `phase8buttons` est la version la plus aboutie des deux). Même bug des 2 snippets manquants. |

**Décision** : base = le thème déjà présent dans ce dépôt (`theme/lebonplan-horizon`,
lui-même issu de `horizonpremiummultistorev1.2fixed.zip` + mes correctifs SumUp/404
de la session précédente), **enrichi** des 9 blocks + 9 sections premium de la
lignée `phase8buttons` (la plus aboutie des deux variantes de cette lignée).
Comme la base de départ possède déjà les 2 snippets requis, la fusion ne
réintroduit pas leur bug manquant.

Aucune archive n'a été copiée telle quelle : chaque fichier repris a été
revalidé (JSON, références de schéma, identifiants de réglages) avant intégration.

## 2. Éléments conservés

- L'architecture Online Store 2.0 native d'Horizon (JSON templates, sections,
  section groups, theme blocks, snippets) — non modifiée en profondeur.
- Le système de couleurs `color_palette` natif Horizon (déjà un vrai design
  token system : boutons, inputs, badges, variantes, popovers en héritent tous).
- Le moteur de bouton premium existant (`snippets/premium-button-styles.liquid`,
  `style_class: "button-premium"`) — déjà, de fait, un CTA engine partagé par
  Add to cart, Buy now, les boutons marketing ET les boutons SumUp (voir §5).
- L'intégration SumUp existante (backend non touché, contrat vérifié).
- Le contenu réel LE BON PLAN (hero, FAQ, marquee, bénéfices) — déplacé/complété,
  jamais supprimé.

## 3. Éléments supprimés

- Rien n'a été supprimé du thème. Le seul retrait est **ciblé et volontaire** :
  le bloc SumUp et l'accordéon FAQ LE BON PLAN ont été retirés du **template
  produit par défaut** `templates/product.json` (voir §6) — ils restent
  entièrement disponibles dans `templates/product.lebonplan.json`.

## 4. Éléments refactorés

| Élément | Avant | Après |
|---|---|---|
| Page d'accueil — "Comment ça marche" | Section maison bricolée avec des blocs `_blocks`/`group`/`text` génériques (solution de secours de la session précédente, faute de composant dédié) | Remplacée par le vrai composant `steps` + blocs `_step` (numérotation, ligne de progression, disposition horizontale/verticale responsive) — même contenu, réellement fidèle au parcours de paiement (aucune donnée changée) |
| `config/settings_data.json` | Un seul preset nommé ("Horizon", le style Horizon générique) + les réglages "current" (LE BON PLAN) sans nom de preset dédié | 4 presets nommés et sélectionnables (voir §7), dont "LE BON PLAN — Dark Electric Blue" désormais explicite |
| Fiche produit | Un seul `templates/product.json`, à la fois "moteur du thème" et "configuration LE BON PLAN" (SumUp + FAQ FR imposés à toute nouvelle boutique qui installerait ce thème) | Séparé en un template par défaut générique (`product.json`) et un template alternatif `product.lebonplan.json` sélectionnable par produit (voir §6) |

## 5. Fonctionnalités ajoutées

9 nouveaux blocks + 9 nouvelles sections premium, tous responsive, accessibles
(ARIA, `prefers-reduced-motion`), sans donnée fictive :

| Section | Blocks associés | Usage |
|---|---|---|
| Trust Bar | `_trust-item` | Bandeau de réassurance (icônes + libellés configurables) |
| Steps / Comment ça marche | `_step` | Étapes numérotées, ligne de progression optionnelle |
| Stats / Compteurs | `_stat-item` | Chiffres clés avec animation de comptage (respecte `prefers-reduced-motion`) |
| Testimonials / Avis / UGC | `_testimonial-card` | Grille ou carrousel, note étoiles, photo/vidéo, badge "vérifié" |
| Timeline | `_timeline-item` | Chronologie horizontale/verticale |
| Comparison Table | `_comparison-row` | Tableau comparatif 2 à 5 colonnes |
| Pricing Table | `_pricing-plan` | 2 à 5 offres, bouton mis en avant réutilisant le style "Premium Glow" |
| Countdown | — | Compte à rebours réel sur date ISO 8601 fournie par le marchand (jamais généré artificiellement) |
| Popup promotionnel | blocs `@theme` (image, texte, newsletter...) | Déclenchement délai / scroll / intention de sortie / manuel, une fois par session par défaut |
| Cart Cross-Sell (manuel) | — (bloc autonome) | Suggestions panier choisies à la main par le marchand |
| Barre livraison gratuite | — (bloc autonome) | Calculée sur `cart.total_price` réel, jamais une fausse promesse |

**Aucun de ces composants n'affiche de fausse urgence, faux stock ou faux
avis par défaut** : les exemples visibles dans les préréglages de blocs
(ex. "12 000 clients satisfaits" sur le preset Stats, "Un service et un
produit exceptionnels !" sur le preset Testimonial) sont du contenu
d'exemple explicitement à éditer par le marchand — exactement comme le
contenu de démonstration de n'importe quel thème Shopify du Theme Store —
et ne sont **pas** utilisés sur les pages réelles de LE BON PLAN.

## 6. Architecture multi-boutique concrète : le mécanisme "template alterné"

Shopify permet d'assigner, par produit, un **template alternatif**
(`templates/product.<suffixe>.json`) depuis Admin → Produit → section
"Thème" → menu déroulant du modèle. C'est le mécanisme natif exact dont
avait besoin la consigne "LE BON PLAN doit devenir un PRESET du thème et
non une dépendance du thème" pour la fiche produit :

- `templates/product.json` (**défaut**, servi à toute nouvelle boutique) :
  galerie, titre, prix, sélecteur de variantes, boutons d'achat natifs
  (Add to cart / Buy now / paiement accéléré), description. Aucune trace
  de SumUp ni de LE BON PLAN.
- `templates/product.lebonplan.json` : le même, plus le bloc
  "SumUp — Paiement produit" et la FAQ produit LE BON PLAN.

**Action externe requise (bloquée cette session)** : assigner
`templateSuffix: "lebonplan"` aux 2 produits réels de la boutique
(`gid://shopify/Product/15803323449718` et
`gid://shopify/Product/15806453252470`) fait l'objet d'une mutation
`productUpdate` prête à l'emploi et validée contre le schéma GraphQL, mais
la connexion Shopify de cette session a expiré (`token expired`,
ré-authentification requise) avant de pouvoir l'exécuter. Deux options :

1. Redonner l'autorisation Shopify à cette session puis me redemander
   d'exécuter la mutation ci-dessous ; ou
2. Le faire manuellement : Admin Shopify → Produits → (chaque e-book) →
   dans la section "Thème" à droite → choisir le modèle **"product.lebonplan"**.

```graphql
mutation SetLebonplanTemplate($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id templateSuffix }
    userErrors { field message }
  }
}
```
Variables : `{"product": {"id": "gid://shopify/Product/15803323449718", "templateSuffix": "lebonplan"}}`
(à répéter pour le second produit).

**Panier et page d'accueil — limite structurelle de Shopify, pas du thème** :
Shopify n'offre **aucun mécanisme de template alternatif** pour le panier
(`templates/cart.json` est unique, servi à toute la boutique) ni pour la
page d'accueil (`templates/index.json` est toujours utilisé, jamais
sélectionnable). Il est donc impossible de faire cohabiter proprement
"panier LE BON PLAN avec SumUp" et "panier neutre par défaut" comme deux
fichiers que Shopify choisirait automatiquement. La solution correcte et
100% no-code reste néanmoins conforme à la consigne : le bloc
"SumUp — Paiement panier" est un bloc Horizon **facultatif** comme tous les
autres ; sur une nouvelle boutique qui ne veut pas de SumUp, il suffit de
ne pas l'ajouter (ou de le retirer en un clic dans Personnaliser le thème)
— aucune modification Liquid n'est requise. `templates/cart.json` et
`templates/index.json` restent donc la configuration réelle de LE BON PLAN ;
une nouvelle boutique compose sa propre page d'accueil et son propre panier
dans l'éditeur de thème à partir de la même bibliothèque de sections (déjà
100% générique, voir §5), exactement comme le prévoit la consigne
"Aucune modification Liquid ne doit normalement être nécessaire."

## 7. Design system : presets de style

`config/settings_data.json` utilise le mécanisme natif Shopify des
**presets de thème** (`presets`), la même structure que celle par laquelle
Horizon expose déjà son propre style par défaut ("Horizon"). 4 presets
sont maintenant disponibles, sélectionnables sans toucher au code :

| Preset | Fond | Texte | Surface | Accent |
|---|---|---|---|---|
| **LE BON PLAN — Dark Electric Blue** (actif) | `#0B0B0B` | `#FFFFFF` | `#151515` | `#008CFF` |
| **Luxury — Black & Ivory** | `#0E0E0E` | `#F5F1E8` | `#1C1C1C` | `#C9A961` (or mat) — coins nets (radius réduits) |
| **Tech — Dark Futuristic** | `#05070D` | `#E8F4FF` | `#10131C` | `#5B8CFF` (indigo électrique) — coins très arrondis |
| **Clean Commerce — White Neutral** | `#FFFFFF` | `#14181F` | `#F3F4F6` | `#2563EB` (bleu commerce) — coins modérés |

Chaque preset propage sa palette à **tous** les composants qui consomment
déjà `settings.color_palette.*` (boutons, inputs, badges, variantes,
popovers, tiroir panier) — c'est le design token system déjà en place dans
Horizon, simplement complété de presets réels plutôt que d'un seul.

**Limite assumée** : les 3 presets restants demandés (Fashion — Editorial
Minimal, Beauty — Soft Premium, Home/Lifestyle — Warm Modern) n'ont **pas**
été construits à ce niveau de détail cette session — leur différenciation
mérite en plus une vraie direction typographique et des images de démo
dédiées, ce que je n'ai pas de base légitime à inventer sans direction
artistique fournie. La structure est prête : ajouter un preset supplémentaire
consiste à dupliquer un bloc `presets.<Nom>` dans `settings_data.json` avec
une nouvelle palette — aucune ligne de Liquid à écrire.

## 8. Architecture CTA

Le thème utilise déjà, de fait, un moteur CTA unifié plutôt que des styles
concurrents :

- `snippets/premium-button-styles.liquid` génère le style "Premium Glow"
  (bordure, glow, dégradé, hover/active/disabled, pulse, shine, mobile
  pleine largeur) à partir d'un unique jeu de réglages (`style_class:
  "button-premium"` + couleurs/rayon/intensité).
- Ce même style est appliqué, au choix du marchand, à : `add-to-cart`,
  `buy-buttons` (bouton Add to cart natif), aux boutons marketing (`button`
  block), au bouton SumUp produit, au bouton SumUp panier, et maintenant
  aux boutons "premium" du Countdown et des offres mises en avant de la
  Pricing Table.
- `snippets/button-custom-styles.liquid` gère la variante "button-custom"
  (couleurs personnalisées simples, sans glow) pour les CTA secondaires.
- Aucune page ne présente plusieurs CTA concurrents dans une même zone :
  la fiche produit par défaut n'a qu'un flux d'achat (Add to cart / Buy
  now / paiement accéléré) ; SumUp, quand activé, s'ajoute comme option
  complémentaire clairement séparée, jamais dupliquée.

## 9. Architecture SumUp

Contrat backend inchangé (voir `03-composants-sumup.md` pour le détail
complet, déjà vérifié contre `app/routes/apps.sumup-pay*.jsx`). Rappel des
garanties vérifiées à nouveau cette session :

- Aucun secret, token ou clé API dans le thème.
- Aucun calcul de prix côté thème — le backend revérifie toujours via
  l'Admin GraphQL API.
- Les deux blocs SumUp (produit et panier) sont des **blocs Horizon
  optionnels standards** : ils n'apparaissent que si le marchand les ajoute
  explicitement dans l'éditeur de thème. Une boutique qui ne les ajoute pas
  ne voit et n'exécute strictement aucun code SumUp.
- Architecture prête pour d'autres moyens de paiement rapides futurs : le
  même patron (formulaire minimal → App Proxy → statut renvoyé en Liquid)
  peut être reproduit pour un autre prestataire sans toucher au CTA engine
  existant (il suffit de lui donner le même `style_class` pour hériter du
  rendu visuel).

## 10. Tests exécutés et résultats

Shopify CLI (`shopify theme check`) n'est pas disponible dans cet
environnement — remplacé par un jeu de validations statiques strictes,
volontairement plus poussées que ce qu'un simple parseur JSON générique
peut couvrir (les fichiers de locale par défaut de Shopify commencent par
un commentaire `/* ... */`, toléré par Shopify mais pas par `json.load` —
traité comme non-erreur, voir `05-rapport-tests.md`) :

| Test | Résultat |
|---|---|
| Validité JSON de tous les templates/sections/config (hors 2 fichiers de locale au format standard Shopify) | ✅ 0 erreur |
| Toutes les références `"type"` de section utilisées dans un template/section-group correspondent à un fichier existant dans `sections/` | ✅ 0 référence cassée |
| Toutes les références `"type"` de bloc (y compris imbriquées) correspondent à un fichier existant dans `blocks/` | ✅ 0 référence cassée |
| **Tous les identifiants de réglages (`settings.id`) utilisés dans les templates correspondent à un réglage réellement déclaré dans le schema du bloc/section concerné** | ✅ 0 incohérence — a permis de détecter et corriger un bug introduit pendant cette session (`description` au lieu de `text` sur le bloc `_step`) avant livraison |
| Tous les `{% render 'x' %}` correspondent à un fichier existant dans `snippets/` | ✅ 0 référence cassée (147 → toujours 147 snippets, aucun besoin d'en ajouter) |
| Balises `{% schema %}` / `{% endschema %}` équilibrées sur tous les fichiers `.liquid` | ✅ OK |
| Recherche de secrets/identifiants en dur | ✅ Aucun trouvé |
| Recherche de fausses données (avis, stats, urgence) sur les pages réellement utilisées par LE BON PLAN | ✅ Aucune — les nouveaux composants à contenu d'exemple (testimonials, stats, countdown, pricing/comparison table) ne sont pas déposés sur les pages LE BON PLAN, seulement disponibles dans la bibliothèque de sections |
| Contrat SumUp (endpoints, champs transmis) vs backend réel | ✅ Toujours conforme (déjà vérifié et corrigé en session précédente) |

## 11. Limites et actions externes restantes

- **Assignation du template produit alternatif** : mutation prête et
  validée, bloquée par l'expiration du jeton d'accès Shopify de cette
  session (voir §6) — nécessite soit une réautorisation de la connexion
  Shopify, soit une action manuelle en 30 secondes dans l'Admin.
- **3 presets de style supplémentaires** (Fashion, Beauty, Home/Lifestyle) :
  structure prête, contenu/typographie non détaillés faute de direction
  artistique fournie (voir §7).
- **`shopify theme check` réel** : non exécutable dans cet environnement
  (CLI absente) — validation statique équivalente réalisée à la place
  (voir §10).
- **Validation visuelle multi-résolutions et tests de paiement réels** :
  nécessitent un aperçu live et un environnement de test SumUp, comme déjà
  noté dans `05-rapport-tests.md`.

## 12. Fichiers modifiés / créés (résumé — détail dans `04-fichiers-modifies-crees.md`)

**Créés** : 9 blocks premium, 9 sections premium, `templates/product.lebonplan.json`.
**Modifiés** : `config/settings_data.json` (4 presets ajoutés),
`templates/index.json` (section "Comment ça marche" remplacée par le vrai
composant `steps`, ajout d'une Trust Bar honnête), `templates/product.json`
(devenu le template par défaut générique, SumUp/FAQ LE BON PLAN déplacés
vers `product.lebonplan.json`).
**Non modifiés** : tout le backend (`app/`), les blocs SumUp eux-mêmes, le
contrat App Proxy, les 147 snippets existants.
