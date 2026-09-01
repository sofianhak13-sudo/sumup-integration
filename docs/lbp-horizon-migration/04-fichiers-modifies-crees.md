# Fichiers modifiés / créés — thème `theme/lebonplan-horizon`

Base de départ : `horizonpremiummultistorev1.2fixed.zip` fourni par
l'utilisateur (thème Horizon déjà personnalisé LE BON PLAN, V1.2 FIXED).

## Fichiers modifiés

| Fichier | Modification | Raison |
|---|---|---|
| `blocks/sumup-cart-payment.liquid` | Endpoint par défaut `/apps/sumup-pay.cart` → `/apps/sumup-pay/cart` (3 occurrences : `assign endpoint`, fallback JS, schema `default`/`info`) | **Bug critique** : ne correspondait pas à la route backend réelle (voir `03-composants-sumup.md`) — le bouton panier aurait échoué en production (404) |
| `templates/cart.json` | `app_proxy_endpoint` du bloc `sumup_cart_lbp` : `/apps/sumup-pay.cart` → `/apps/sumup-pay/cart` | Même bug, valeur explicitement enregistrée dans le template |
| `sections/header-group.json` | Texte du bandeau d'annonce : "Welcome to our store" → "🔒 Paiement sécurisé · Accès immédiat après achat · Aucun abonnement" | Contenu Horizon générique non francisé, non conforme à la Phase 7 (éviter un Horizon générique) |
| `sections/footer-group.json` | "Join our email list" → "Restez informé des nouveaux bons plans" ; "Get exclusive deals and early access to new products." → "Recevez nos meilleures offres et accès en avant-première." ; "Sign up" → "S'inscrire" | Idem — contenu générique en anglais sur une boutique française |
| `templates/product.json` | "You may also like " → "Vous aimerez aussi" (section recommandations) | Idem |
| `templates/index.json` | "View all" → "Voir tout" (bouton de la liste produits) ; ajout de `settings.image_1` sur la section hero (référence `shopify://shop_images/Boite_premium_Le_Bon_Plan_futuriste.png`, fichier déjà présent dans les Fichiers Shopify de la boutique) ; ajout des sections `benefits_lbp` et `steps_lbp` (voir ci-dessous) ; **3 liens `shopify://collections/all` → `shopify://collections/frontpage`** (bouton hero, section "Nos offres", bouton CTA) | Francisation + pré-remplissage de l'image hero avec un asset déjà uploadé + sections manquantes de la Phase 12 + **bug 404 confirmé en direct sur la boutique** (voir ci-dessous) |
| `templates/cart.json` | `"collection": "all"` → `"collection": "frontpage"` sur la section "produits recommandés" du panier | Même bug 404 |

## Bug 404 sur la page d'accueil — trouvé et corrigé après connexion à la boutique réelle

Signalé par l'utilisateur : "en cliquant sur un lien/bouton de la page
d'accueil (aperçu non publié), j'obtiens une erreur 404".

**Diagnostic** (effectué en interrogeant directement l'API Admin de la
boutique `lebonplan-ebook.com` connectée à cette session) :

- Le bouton hero ("🚀 Obtenir mon accès"), le bouton du bloc CTA
  ("💰 J'ARRÊTE DE PAYER PLEIN TARIF") et la section "Nos offres" de la page
  d'accueil pointaient tous vers `shopify://collections/all`.
- Vérification via GraphQL (`collectionByHandle(handle: "all")`) : **cette
  boutique n'a pas de collection avec le handle `all`** — la requête renvoie
  `null`. De nombreuses boutiques Shopify ont une collection automatique
  "Tous les produits" à `/collections/all`, mais ce n'est pas le cas de
  celle-ci.
- Résultat concret : cliquer sur n'importe lequel de ces 3 éléments envoie
  vers `/collections/all`, qui n'existe pas sur cette boutique → **404 réel**,
  reproductible, confirmé.
- La boutique possède en revanche une collection bien réelle et peuplée :
  **`frontpage`** ("Home page", handle `frontpage`, 2 produits actifs — les
  deux e-books LE BON PLAN confirmés via `search_products`).

**Correction appliquée** : les 3 occurrences dans `templates/index.json` et
la section "produits recommandés" du panier dans `templates/cart.json` ont
été repointées vers `shopify://collections/frontpage` / `"collection":
"frontpage"`.

**Ce qui n'était PAS le problème** (vérifié et écarté) :
- Le menu principal (`main-menu`) : ses 3 liens (Accueil, produit e-book,
  Contact) résolvent tous vers des ressources réelles et existantes
  (vérifié via `menus(first: 20)` — l'ID produit et l'ID page correspondent
  bien à des ressources actives).
- Le menu footer (politiques) : toutes les URLs de politiques référencent
  des `ShopPolicy` existants sur la boutique.
- Les deux produits eux-mêmes : confirmés `ACTIVE` avec un handle correct
  (`📖-le-bon-plan-e-book-acces-exclusif-aux-canaux-prives-a-vie-👑` et
  `📖-le-bon-plan-e-book-acces-prives-a-vie-👑-copie`).

**Point d'attention restant (non corrigé, nécessite une décision utilisateur)** :
les liens réseaux sociaux du footer (`facebook.com/`, `instagram.com/`,
`youtube.com/`, `tiktok.com/`, `x.com/`) sont les valeurs par défaut
génériques du thème Horizon — ce ne sont pas des 404, mais ils ne mènent nulle
part d'utile tant qu'ils ne sont pas remplacés par les vrais comptes LE BON
PLAN (ou masqués) dans Personnaliser → Pied de page.

## Fichiers créés (nouvelles sections dans `templates/index.json`)

Aucun nouveau fichier `.liquid` n'a été nécessaire : les deux sections
ajoutées réutilisent exclusivement des types de blocs déjà présents dans le
thème (`_blocks`, `group`, `text`), donc aucun schema Liquid n'a dû être
écrit.

- **`benefits_lbp`** — section "Pourquoi choisir Le Bon Plan", 4 cartes de
  bénéfices. Contenu repris **mot pour mot** des puces déjà validées dans le
  bloc FAQ existant (`✔️ Jusqu'à 80% d'économies`, `✔️ Accès à vie`, etc.) —
  aucune donnée inventée.
- **`steps_lbp`** — section "Comment ça marche", 3 étapes décrivant le
  parcours d'achat réel tel qu'implémenté par le backend SumUp (choix de
  l'offre → paiement sécurisé SumUp → accès immédiat).

## Ce qui n'a PAS été créé, et pourquoi

- **Section "Classique vs Premium"** (comparatif de fonctionnalités) : le
  prompt maître la demande explicitement, mais aucune fonctionnalité
  distinctive vérifiée entre les deux offres n'a été fournie cette session
  (l'export CSV des produits Shopify, qui aurait permis de connaître les
  vraies différences de contenu/prix, n'a pas été transmis). Plutôt que
  d'inventer un tableau de comparaison, ce point est documenté comme
  action restante nécessitant l'intervention de l'utilisateur.
- **Snippets `lbp-button.liquid` / `lbp-buttons.css` / `lbp-sumup-button.liquid`
  dédiés** (Phase 8) : le thème fourni implémente déjà l'équivalent exact de
  ce qui est demandé, mais sous forme de style de bloc natif Horizon
  (`style_class: "button-premium"` + `snippets/premium-button-styles.liquid`,
  entièrement configurable depuis l'éditeur de thème : couleur de bordure,
  glow, dégradé, pulse, shine, radius, etc.). Créer des snippets séparés en
  plus aurait dupliqué un système déjà fonctionnel et testé statiquement —
  jugé contre-productif au regard de la règle "ne rien casser" et de la
  Phase 16 (éviter la répétition de CSS).

## Éléments non modifiés (backend)

Aucun fichier du dossier `app/` (routes, `shopify.server.js`, `db.server.js`,
webhooks, `prisma/schema.prisma`) n'a été modifié. Conformément à la Phase 9,
le backend SumUp existant a uniquement été **lu et analysé** pour établir le
contrat exact que le thème doit respecter.
