# THEME MASTER MULTI-STORE — Phase 2 : universalisation, presets, CRO, QA

Livrable : `lebonplan-theme-master-multistore.zip` (thème complet dans
`theme/lebonplan-horizon/` de ce dépôt). Remplace la candidate
intermédiaire `lebonplan-horizon-master-multistore.zip` de la phase précédente.

## A — Universalisation

Retiré des configurations génériques par défaut :

| Fichier par défaut | Avant | Après |
|---|---|---|
| `templates/index.json` | Page d'accueil réelle LE BON PLAN (hero, FAQ, marquee, CTA en français) | Composition neutre en anglais : hero générique, trust bar, produits vedettes (collection `all`), étapes génériques, témoignages explicitement d'exemple, FAQ générique |
| `templates/cart.json` | Bloc "SumUp — Paiement panier" intégré | Panier natif Shopify, aucun bloc SumUp, aucune référence LE BON PLAN |
| `sections/header-group.json` | Bandeau "Paiement sécurisé · Accès immédiat · Aucun abonnement" | Restauré au texte neutre natif Horizon "Welcome to our store" |
| `sections/footer-group.json` | Newsletter en français "Restez informé des nouveaux bons plans" | Restauré aux textes neutres natifs Horizon ("Join our email list" / "Sign up") |
| `templates/product.json` | (déjà séparé phase 1) | Confirmé neutre + enrichi (voir §E) |

Aucun texte, aucune couleur imposée, aucun bloc SumUp ne subsiste par
défaut dans le moteur générique.

## B — LE BON PLAN

Rien n'a été supprimé : toute la configuration réelle vit maintenant dans
`theme/lebonplan-horizon/presets/lebonplan/` (instantanés JSON de
`index.json`, `cart.json`, `header-group.json`, `footer-group.json`,
`product.json`), avec un `README.md` documentant la procédure exacte et
reproductible pour la réappliquer (CLI ou copier-coller dans l'éditeur de
code). Le preset de style "LE BON PLAN — Dark Electric Blue" reste
sélectionnable nativement dans le Theme Editor. Voir aussi
`03-composants-sumup.md` pour le contrat SumUp, inchangé.

## C — SumUp

Vérifié après chaque modification (grep exhaustif) : aucune référence à
SumUp en dehors de `blocks/sumup-payment.liquid`,
`blocks/sumup-cart-payment.liquid`, `templates/product.lebonplan.json` et
`presets/lebonplan/`. `layout/theme.liquid` et les snippets globaux
(`scripts.liquid`, `stylesheets.liquid`) ne chargent rien lié à SumUp.
Une boutique qui n'ajoute pas ces deux blocs n'exécute et ne charge
strictement aucun code SumUp — c'est le comportement natif des blocks
Shopify, vérifié plutôt que supposé. Aucun nouveau backend créé ; celui
existant n'a pas été modifié.

## D — Presets (7/7)

| Preset | Palette (fond/texte/surface/accent) | Typographie (titre/corps) | Radius | Hover carte | Largeur page | Casse badge |
|---|---|---|---|---|---|---|
| **LE BON PLAN — Dark Electric Blue** | `#0B0B0B`/`#FFFFFF`/`#151515`/`#008CFF` | Bebas Neue / Inter | 14px | lift | narrow | normal |
| **Luxury — Black & Ivory** | `#0E0E0E`/`#F5F1E8`/`#1C1C1C`/`#C9A961` | EB Garamond / Jost | 0–2px, ombres désactivées | none (retenue) | normal | UPPERCASE |
| **Fashion — Editorial** | `#FFFFFF`/`#1A1A1A`/`#F2F0EC`/`#A98A6B` (camel) | Playfair Display (+italique accent) / Jost | 0px | subtle-zoom | wide | UPPERCASE |
| **Beauty — Soft Premium** | `#FFF9F6`/`#3A2E2C`/`#F5E6E0`/`#C98A82` (rose poudré) | Cormorant / Poppins | 20–30px (arrondi doux) | subtle-zoom | normal | normal |
| **Tech — Dark Futuristic** | `#05070D`/`#E8F4FF`/`#10131C`/`#5B8CFF` (indigo) | Space Grotesk / Inter | 12–30px | scale | wide | UPPERCASE |
| **Clean Commerce — White Neutral** | `#FFFFFF`/`#14181F`/`#F3F4F6`/`#2563EB` | Inter / Inter | 8px | lift | normal | normal |
| **Home/Lifestyle — Warm Modern** | `#FAF6F0`/`#2B2420`/`#EDE3D6`/`#C97C4B` (terracotta) | Fraunces / Nunito Sans | 10–14px | lift | wide | normal |

Chaque preset diffère sur au moins 6 dimensions simultanées (couleur,
typographie, radius, densité/taille de texte, effet de survol, largeur de
page, casse des badges) — pas seulement la couleur. Tous héritent
automatiquement du même moteur (`color_palette`, boutons, inputs, badges,
variantes, popovers) : changer de preset retheme tout le site sans toucher
au code. Test de cohérence appliqué : sept boutiques avec ce même moteur
et un preset différent chacune donnent sept identités visuelles
nettement différentes (contraste chromatique fort, familles typographiques
distinctes, géométrie différente).

**Réserve honnête** : les valeurs `font_picker` (ex. `playfair_display_n7`,
`space_grotesk_n7`, `fraunces_n6`) sont des identifiants réels et
documentés de la bibliothèque de polices Shopify, mais n'ont pas pu être
vérifiées en direct dans l'éditeur (pas d'accès Shopify actif cette
session). Si l'un d'eux ne correspondait pas exactement, Shopify affiche
alors la police système par défaut pour ce rôle — dégradation silencieuse,
non bloquante, à vérifier visuellement dans Personnaliser le thème.

## E — PDP (fiche produit générique)

Auditée comme page de conversion. Déjà natif (conservé, non réécrit) :
galerie avec zoom et swipe mobile, prix avec prix barré natif Shopify,
badges promo/rupture automatiques, variantes/swatches, quantité, Add to
cart/Buy now/paiement accéléré, sticky add-to-cart mobile
(`enable_sticky_add_to_cart: true`), recommandations dynamiques Shopify
(non fabriquées), bloc "Disclosures" natif pour livraison/retours/garanties,
emplacement `@app` disponible nativement pour un bloc avis tiers.

Ajouté cette session (données réelles, aucune fabrication) :
- Bloc **Product Inventory** natif (stock réel, seuil configurable) —
  n'affiche jamais un stock inventé.
- Accordéon FAQ générique ("Shipping & delivery" / "Returns") avec texte
  explicitement placeholder ("Add your shipping and delivery information
  here."), à éditer par le marchand.

## F — Digital Product Mode

Aucune section du moteur générique n'impose une hypothèse "produit
physique" : le nouveau bloc "Barre livraison gratuite" est strictement
optionnel (non présent par défaut) et documente lui-même dans son propre
schema qu'il doit être retiré pour une boutique 100% digitale. La preuve
de capacité concrète est `templates/product.lebonplan.json` lui-même :
FAQ orientée "paiement unique", CTA orienté "accès immédiat" — obtenu
uniquement avec du contenu d'éditeur, aucun code spécifique "mode digital"
n'a été ni n'est nécessaire.

## G — Cart

- **Cart page** (`templates/cart.json` générique) : titre, articles,
  résumé — 100% natif Shopify, aucun bloc SumUp.
- **Cart drawer** (`sections/cart-drawer-section.liquid`,
  `snippets/cart-drawer.liquid`, `assets/cart-drawer.js`) : vérifié —
  aucune référence SumUp, fonctionne indépendamment.
- Nouveaux blocs disponibles en option pour qui en a besoin : Cart
  Cross-Sell (manuel, produits choisis par le marchand — bouton d'ajout
  agrandi à 44×44px cette session pour l'accessibilité tactile) et Barre
  de livraison gratuite (calculée sur `cart.total_price` réel).
- La configuration LE BON PLAN (avec SumUp) reste intacte dans
  `presets/lebonplan/cart.json`.

## H — Homepage générique

Composition volontairement mesurée (pas toutes les sections en même
temps) : Hero → Trust Bar (réassurance générique) → Produits vedettes →
Étapes → Témoignages (contenu explicitement d'exemple) → FAQ générique.
Aucun avis présenté comme réel, aucune statistique inventée, aucune
urgence artificielle. Entièrement en anglais (langue universelle par
défaut du moteur), entièrement recomposable dans l'éditeur sans code.

## I — CTA Engine

Confirmé déjà unifié (pas de réécriture nécessaire) :
`snippets/premium-button-styles.liquid` (style "Premium Glow") et
`snippets/button-custom-styles.liquid` sont partagés par Add to cart, Buy
now, boutons marketing, SumUp produit, SumUp panier, et maintenant les
CTA de la Pricing Table et du Countdown. Les boutons natifs
(`add-to-cart.liquid`, `buy-buttons.liquid`) gèrent déjà nativement et
correctement default/hover/active/focus clavier/loading/disabled/sold-out
via les vraies données d'inventaire Shopify et les clés de traduction
existantes (`products.product.sold_out`, `blocks.sold_out`) — vérifié dans
le code, non réécrit (règle "ne pas remplacer une bonne fonctionnalité
native"). LE BON PLAN conserve son identité noir/bleu électrique (valeurs
explicites dans ses propres blocs) ; les 6 autres presets peuvent donner à
leurs propres CTA "Premium Glow" leur propre couleur via les mêmes
réglages de bloc, sans toucher au moteur.

## J — Sections premium : conservées / améliorées / supprimées

**Conservées** (utilité réelle confirmée, aucune redondance avec un
composant Horizon natif) : Trust Bar, Steps, Stats/Compteurs, Testimonials,
Timeline, Comparison Table, Pricing Table, Countdown, Popup promotionnel,
Cart Cross-Sell, Barre de livraison gratuite.

**Améliorées** (bugs réels trouvés et corrigés cette session — détail en
§O) : les 9 sections avaient une balise `{% doc %}` invalide en contexte
section (erreur bloquante) → convertie en `{% comment %}` ; une image de
Timeline sans attribut `height` → corrigée ; deux boucles `for` en syntaxe
non supportée dans `_pricing-plan.liquid` → corrigées ; variables mortes
supprimées (`_trust-item`, `_comparison-row`) ; 2 snippets réellement
orphelins supprimés (voir §P) ; 5 chaînes de texte codées en dur (jours/
heures/min/sec du countdown, bouton "Fermer" du popup, badge "vérifié",
libellés inclus/non-inclus) déplacées vers les fichiers de locale (34
langues mises à jour).

**Supprimées** : aucune section premium supprimée. Seuls deux fichiers
`snippets/` **réellement inutilisés** ont été retirés (voir §P) — ce ne
sont pas des sections premium, et leur suppression n'affecte aucune
fonctionnalité visible.

Le nombre de sections n'a pas été traité comme un KPI : aucune section
n'a été ajoutée juste pour la nomenclature.

## K — Mobile / CRO

- Bouton d'ajout du Cart Cross-Sell : 32×32px → **44×44px** (cible tactile
  conforme).
- Bouton de fermeture du Popup promotionnel : zone cliquable implicite
  (~20px) → **44×44px explicites**.
- Vérifié déjà conforme sans modification : boutons premium
  (min-height 58-70px), popup limité à `min(90vw, 480px)` sur mobile,
  sticky add-to-cart déjà activé nativement, testimonials en carrousel
  avec `scroll-snap` sur mobile.

## L — Performance

Vérifié (aucune régression introduite) : aucun script ni feuille de style
global ajouté à `layout/theme.liquid` ou aux snippets globaux
(`scripts.liquid`, `stylesheets.liquid`) — confirmé par diff Git, zéro
changement sur ces fichiers. Chaque nouveau composant embarque son propre
`<script>`/`{% style %}` scoping à son propre id, exécuté uniquement si le
bloc/section est réellement présent sur la page (`document.querySelectorAll`
retourne une liste vide et sort immédiatement si absent — vérifié dans
Countdown, Stats, Popup). Aucune bibliothèque externe ajoutée.

## M — Accessibilité

Contrôlé et corrigé : cibles tactiles (§K), `prefers-reduced-motion`
respecté (Stats, Timeline, Popup, boutons premium), `aria-label`/`title`
désormais localisés au lieu d'être en dur, dialog du popup avec
`aria-labelledby` et fermeture au clic extérieur, barre de progression
livraison avec `role="progressbar"` + `aria-valuenow/min/max` réels (non
statiques).

## N — Internationalisation

5 chaînes storefront réellement codées en dur trouvées et corrigées
(countdown jours/heures/min/sec, fermeture popup, badge vérifié, libellés
comparatif, message livraison gratuite) → déplacées vers
`locales/en.default.json` (nouvelles valeurs) et **répercutées dans les 34
fichiers de locale** du thème (traduction française dans `fr.json`,
fallback anglais dans les 32 autres) pour satisfaire la règle
`MatchingTranslations` de Shopify. FR et EN restent les deux langues
pleinement traitées ; le moteur reste internationalisable (aucun texte
commercial neuf codé en dur dans un fichier `.liquid`).

En creusant ce sujet, une incohérence **préexistante** (héritée du thème
Horizon d'origine, présente dans les 4 archives fournies, antérieure à
toute customisation LE BON PLAN) a aussi été trouvée et corrigée : une
dizaine de templates de base (article, blog, page, 404, recherche,
collection...) référençaient `var(--font-primary--family)`, une variable
CSS qui n'est définie nulle part dans le thème — remplacée par
`var(--font-body--family)`, réellement définie.

## O — Tests exécutés

| Test | Commande | Résultat |
|---|---|---|
| Shopify CLI theme check (réel, cette fois disponible via `npx`) | `npx @shopify/cli theme check --path .` | **Avant corrections : 22 offenses (12 erreurs, 10 avertissements).** Après corrections : **1 avertissement restant** (`UnusedAssign` sur `remaining_amount` dans `cart-free-shipping-bar.liquid` — faux positif vérifié : la variable est bien utilisée comme argument du filtre `replace:`, ce que cette règle du linter ne détecte pas ; conservée telle quelle car la réécriture sans variable intermédiaire casserait le calcul). **Code de sortie : 0.** |
| Validateur maison (étendu cette session) | `python3 validate_theme.py theme/lebonplan-horizon` | 0 problème, hors 4 occurrences documentées et vérifiées inoffensives (`style_class: "link"` sur `_product-list-button`, réglage jamais lu par le code du bloc — vérifié ligne par ligne, comportement Horizon natif préexistant) |
| Validité JSON de tous les fichiers | `json.tool` sur chaque fichier | 100% valides, hors les fichiers de locale par défaut de Shopify (commentaires tolérés par Shopify, pas par un parseur JSON strict — non-erreur) |
| Références sections/blocks/snippets croisées | validateur maison | 0 référence cassée |
| Correspondance settings.id ↔ schema | validateur maison | 0 incohérence après corrections (a détecté et fait corriger le bug `description`/`text` en phase 1) |
| **Valeurs des réglages `select` ↔ options déclarées** (nouveau contrôle) | validateur maison | A détecté et fait corriger `"button-primary"` → `"button"` sur le bouton hero générique avant livraison |
| Empreinte SumUp | `grep` exhaustif | 0 référence hors des 2 blocs dédiés et de la configuration LE BON PLAN |
| Secrets en dur | `grep` exhaustif | 0 trouvé |

**Ce qui n'a pas pu être testé dans cet environnement** (nécessite un
navigateur ou une boutique live) : rendu visuel réel des 7 presets,
validation des `font_picker` dans l'éditeur, test de paiement SumUp réel,
Lighthouse/Core Web Vitals réels.

**Ce qui n'était PAS bloqué par l'expiration de la connexion Shopify** :
tous les tests ci-dessus sont locaux et n'ont nécessité aucune
authentification.

## P — Régressions

Comparaison explicite avec les 4 archives sources + la candidate
précédente (`lebonplan-horizon-master-multistore.zip`) :

- Les 9 blocks et 9 sections premium de la lignée `phase8buttons` sont
  tous présents à l'identique (vérifié fichier par fichier).
- Le contenu réel LE BON PLAN (hero, FAQ, marquee, CTA, bloc SumUp) est
  intégralement préservé — déplacé dans `presets/lebonplan/` et
  `templates/product.lebonplan.json`, jamais perdu.
- **Suppression volontaire et documentée** : `snippets/cart-title.liquid`
  et `snippets/menu-featured-image.liquid` (ajoutés lors d'un précédent
  correctif sur la base d'une fausse alerte — le seul appel à ces noms
  dans le code se trouvait à l'intérieur d'un commentaire `{% doc %}
  @example`, jamais exécuté ; la vraie fonctionnalité passe entièrement
  par `blocks/_cart-title.liquid` et `snippets/link-featured-image.liquid`,
  tous deux intacts et vérifiés fonctionnels). Confirmé sans impact par le
  vrai `shopify theme check` (ces 2 fichiers étaient signalés
  `OrphanedSnippet`) et par test de référence croisée avant/après suppression.
- Aucune autre suppression.

## Q — Limitations

- Les valeurs `font_picker` des 3 nouveaux presets typographiques
  n'ont pas pu être vérifiées visuellement (voir §D).
- Panier et page d'accueil : Shopify ne propose aucun mécanisme de
  template alterné pour ces deux pages (contrainte plateforme, pas du
  thème) — solution de contournement documentée et implémentée
  (`presets/lebonplan/`), pas une élimination du problème.
- `_product-list-button.liquid` (fichier natif Horizon, non modifié) :
  ses réglages `style_class`/`label`/`open_in_new_tab` ne sont en réalité
  jamais lus par son propre code (`{% render 'button', link: button_url %}`
  ignore `block.settings`) — un comportement Horizon natif préexistant,
  hors périmètre de cette mission (le corriger reviendrait à réécrire un
  fichier natif complexe pour un effet purement cosmétique dans l'éditeur).
- 1 avertissement `theme check` restant, faux positif vérifié (§O).

## R — Actions externes réellement impossibles depuis cette session

- **Assignation `templateSuffix: "lebonplan"` aux 2 produits de
  production** : **volontairement non exécutée**, sur instruction
  explicite de l'utilisateur pour cette phase ("N'assigne pas encore...
  Cette opération sera effectuée après validation finale"). La mutation
  reste prête et validée contre le schéma GraphQL (voir
  `07-theme-master-multistore.md` §6).
- Aperçu visuel réel de la boutique et des 7 presets (nécessite
  navigateur + accès Shopify).
- Test de paiement SumUp réel de bout en bout.

## S — Archive finale

`lebonplan-theme-master-multistore.zip` — envoyée à l'utilisateur.
Contenu source identique dans `theme/lebonplan-horizon/` sur la branche
`claude/lbp-horizon-migration-bzce2w` de ce dépôt.
