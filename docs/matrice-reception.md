# Matrice de réception

État au 18 octobre 2026, après les étapes 1 à 5 : analyse, architecture, design
system, header final, accueil, catalogue, parcours véhicule et fiche produit.

**La boutique n'est pas prête pour une ouverture commerciale.** La commande, le
paiement, l'espace client et le back-office ne sont pas écrits : on peut
remplir un panier, pas le payer. Ce document dit où en est chaque fonction,
sans arrondi.

## Légende

| Marque | Sens |
| --- | --- |
| ✅ **Opérationnelle et testée** | Écrite, et vérifiée ici (navigateur, build, requête réelle) |
| 🔸 **Implémentée, vérification restante** | Écrite, mais non exercée de bout en bout |
| 🔵 **Démonstration** | Fonctionne sur des données d'exemple identifiées, à remplacer |
| ⚙️ **À configurer** | Le code est là, il attend une clé, un compte ou une décision |
| ⬜ **Manquante** | Pas écrite |

---

## Socle

| Fonction | État | Détail |
| --- | --- | --- |
| Modèle de données complet (5 domaines) | ✅ | `prisma/schema.prisma`, migration appliquée, `prisma validate` passe |
| Migrations versionnées | ✅ | `prisma migrate deploy` au build Render |
| Design system (jetons, composants) | ✅ | `globals.css` + `ui/` : Button, Field, Badge, Surface, icons |
| Build de production | ✅ | `npm run build` passe, 31 routes |
| Contrôle de types strict | ✅ | `tsc --noEmit` sans erreur |
| Route de santé | ✅ | `/api/health` teste PostgreSQL, renvoie 503 si la base est à terre |
| Journaux de diagnostic | ✅ | Préfixes par domaine ; `AuditLog`, `EmailLog`, `OrderEvent`, `StockMovement` |
| Tests automatisés | ⬜ | Aucun test écrit. Vérifications faites à la main, listées plus bas |

## Présentation

| Fonction | État | Détail |
| --- | --- | --- |
| Header final, ordinateur | ✅ | Les trois étages de `03-header-final.png`, mesurés au pixel (52 / 125 / 75 px, champ 589×60, conteneur 1400 px) |
| Header, mobile et tablette | ✅ | Composition propre au mobile : menu, logo, panier ; recherche sur sa ligne ; véhicule en bandeau |
| Menu mobile au clavier | ✅ | Vérifié : modale, piège de focus, Échap ferme, focus rendu au déclencheur, défilement du corps rétabli |
| Recherche du header | ✅ | Champ, suggestions (`/api/recherche/suggestions`), navigation aux flèches, combobox ARIA, et la page `/recherche` qui reçoit la requête |
| Compteur de panier | ✅ | Lit la session réelle (cookie + base), vaut 0 tant qu'aucune ligne n'existe |
| Véhicule dans le header | ✅ | Lit la session réelle, ouvre le sélecteur en modale, et le choix aboutit sur les résultats par emplacement |
| Page d'accueil, 13 blocs dans l'ordre | ✅ | Comparée aux maquettes sur ordinateur (1280) et mobile (375) |
| Pied de page | ✅ | Masque toute mention légale non renseignée et le signale |
| Absence de défilement horizontal | ✅ | Vérifié à 375 px : `scrollWidth === clientWidth` |
| Page 404 | 🔸 | Écrite, avec des sorties réelles ; non exercée |
| Pages liées mais non construites | ⬜ | 17 routes rendent encore une page « non construite » qui dit ce qui est prévu (compte, commande, contenus légaux, guides, FAQ, contact). Aucun lien ne tombe sur une erreur |

## Catalogue et parcours véhicule

| Fonction | État | Détail |
| --- | --- | --- |
| Modèle catégories / produits / variantes / kits | ✅ | Stock porté par la variante, jamais par le kit |
| Catalogue de démonstration | 🔵 | 6 produits, dont un kit à composants partagés, 7 catégories |
| Index des catégories `/c` | ✅ | Arborescence, sous-catégories, nombre de produits publiés |
| Liste de catégorie `/c/[slug]` | ✅ | Facettes culot / température / conditionnement avec comptes, tri en `<form method="get">`, retrait d'un filtre à l'unité, réinitialisation, pagination par liens |
| Recherche `/recherche` | ✅ | Par nom, référence (SKU) et culot ; résultat vide avec alternatives réelles (culots et catégories du catalogue) |
| URL de filtre partageables, sans doublon SEO | ✅ | Canonique sans paramètres, `noindex` dès qu'un filtre ou une page > 1 est actif |
| Sélecteur marque → modèle → année | ✅ | Trois API en cascade, exercé de bout en bout dans le navigateur |
| Étape « équipement d'origine » | ✅ | Déclenchée automatiquement quand une génération en expose plusieurs ; aucun choix fait à la place du client |
| Résultats par emplacement `/vehicule/resultats` | ✅ | Groupés par emplacement, triés confirmé → à vérifier → incompatible, avec restrictions, source et date de vérification |
| Modèle de compatibilité | ✅ | Configuration × emplacement × variante, trois statuts, accessoires obligatoires, restrictions, source et date |
| Compatibilité / homologation distinctes | ✅ | Deux champs, deux affichages, jamais déduits l'un de l'autre |
| Compatibilités de démonstration | 🔵 | 6 lignes contrastées : confirmée, inconnue, incompatible |
| Fiche produit (maquette 02) | ✅ | Galerie à 4 vignettes, choix du conditionnement, composition du kit, accessoires manquants proposés, total, achat, onglets, FAQ |
| Barre d'achat fixe sur mobile | ✅ | Reflète le conditionnement choisi et son verdict de compatibilité |
| Conflit au changement de véhicule | ✅ | Le panier signale l'article devenu incompatible et ne retire rien |

## Commerce

| Fonction | État | Détail |
| --- | --- | --- |
| Modèle panier / commande / paiement / livraison | ✅ | Y compris l'instantané d'achat (`OrderLine.snapshot`) qui fige ce qui a été acheté |
| Panier | ✅ | Ajout, quantités, retrait, composition du kit dépliable, totaux et TVA calculés côté serveur, conflits véhicule signalés |
| Ajout au panier d'un kit | ✅ | Une ligne pour le kit, sa composition affichée ; stock borné par le composant limitant |
| Accessoires nécessaires | ✅ | Proposés décochés sur la fiche, ajoutés seulement si le client les coche, retirés avec l'article qui les exigeait |
| Commande et paiement | ⬜ | Le bouton « Passer la commande » mène à une page qui dit que le tunnel n'est pas ouvert |
| Code promotionnel | ⬜ | Modélisé (`Promotion`), aucun champ affiché |
| Zones et méthodes de livraison | 🔵 + ⚙️ | Deux méthodes de démonstration en base ; les tarifs et délais réels sont à saisir |
| Stripe | ⚙️ | Adaptateur et clés prévus, mode test par défaut. Aucune clé renseignée, aucun appel écrit |
| Factures et avoirs | ⬜ | Modélisés (`Document`), non générés |
| TVA | 🔵 + ⚙️ | Taux 20 % en base, à valider avec le comptable |

## Espace client et SAV

| Fonction | État | Détail |
| --- | --- | --- |
| Modèle utilisateur, sessions, adresses, véhicules | ✅ | — |
| Inscription, connexion, récupération | ⬜ | Modèle prêt (`Session`, `PasswordReset`), écrans non écrits |
| Commandes, documents, suivi | ⬜ | — |
| Modèle SAV et retours | ✅ | Tickets, messages, notes internes séparées des messages visibles |
| Écrans SAV | ⬜ | — |

## Back-office

| Fonction | État | Détail |
| --- | --- | --- |
| Rôles et permissions | 🔸 | Cinq rôles modélisés ; aucun écran ne les applique encore |
| Création du premier administrateur | ✅ | `npm run admin:create`, scrypt, mot de passe sans écho, tracé dans `AuditLog`. Aucun compte par défaut dans le dépôt |
| Tableau de bord, clients, catalogue, commandes, SAV, promotions, contenus, paramètres | ⬜ | — |
| Imports catalogue et compatibilités | 🔸 | Modélisés avec correspondance de colonnes, prévisualisation, rapport par ligne et reprise par curseur. Moteur non écrit |
| Journal des actions | ✅ | `AuditLog` en place, alimenté par la création de compte |

## Infrastructure Render

| Fonction | État | Détail |
| --- | --- | --- |
| `render.yaml` | 🔸 | Trois ressources décrites ; jamais déployé |
| Commandes de build et de démarrage | ✅ | `npm run build` vérifié en local ; `npm start` écoute sur `$PORT` |
| `.env.example` sans secret | ✅ | Chaque variable documentée avec ce qu'elle casse si elle manque |
| Route de santé | ✅ | — |
| Stockage durable des médias | ⚙️ | Pilote `local` en développement ; le pilote S3 est décrit mais non écrit |
| Travaux de fond | 🔸 | `scripts/run-jobs.ts` écrit, avec verrous et report exponentiel ; non exercé |
| Sauvegarde et restauration | 🔸 | Procédure écrite ([render.md](render.md)) ; **jamais répétée** |
| E-mails transactionnels | ⚙️ | Adaptateur écrit, pilote `log`, trace systématique. Aucun modèle de message rédigé |

## Qualité et conformité

| Fonction | État | Détail |
| --- | --- | --- |
| Responsive ordinateur et mobile | ✅ | Vérifié à 1280 et 375 px |
| Navigation au clavier | 🔸 | Vérifiée sur le menu mobile et la recherche. Non vérifiée partout |
| Contrastes | 🔸 | Travaillés (voiles de lisibilité sur les bandeaux sombres) ; aucune mesure automatique |
| Titres et métadonnées | ✅ | Un seul `h1`, sections titrées, `metadataBase`, titres par page |
| `noindex` en préproduction | ✅ | Actif tant que `NEXT_PUBLIC_DEMO_MODE` vaut `on` |
| Données structurées | ⬜ | À écrire avec la fiche produit, et seulement à partir de données réelles |
| Consentement et cookies | ⬜ | À écrire quand les services réellement utilisés seront connus |
| Aucune affirmation inventée | ✅ | Aucun avis, note, volume, certification, stock tendu ni délai garanti. `Review` existe et reste vide |
| Illustrations signalées | ✅ | `Media.nature = ILLUSTRATION`, mentions reprises des maquettes |

---

## Vérifications effectuées

Faites dans cette session, sur le serveur de développement et la base
PostgreSQL locale :

1. `prisma validate`, `prisma migrate dev` — schéma valide, migrations appliquées.
2. `npm run seed -- --demo` — 6 produits, 6 compatibilités, 7 catégories.
3. `tsc --noEmit` — aucune erreur sur l'ensemble du dépôt.
4. `npm run build` — build de production réussi.
5. `npx vitest run` — 15 tests sur le calcul de disponibilité d'un kit et sur
   l'accroche de livraison (division par la quantité du composant, composant
   limitant, composant facultatif ignoré, stock réservé, franchise de port).
6. `GET /api/health` → `{"status":"ok","database":"up"}`.
7. Accueil à 1280 px et 375 px — comparée aux trois maquettes, bloc par bloc.
8. Menu mobile — modale, piège de focus, Échap, retour du focus, défilement rétabli.
9. Les 11 routes du catalogue et du parcours véhicule répondent en 200.
10. **Parcours véhicule complet dans le navigateur** : Volkswagen → Golf → 2015 →
    l'étape d'équipement se déclenche d'elle-même (deux équipements documentés)
    → « Phares halogènes » → résultats groupés par emplacement, avec date de
    vérification et source.
11. **Fiche produit avec véhicule halogène** : encadré vert « La configuration
    pour votre Golf VII », conditionnement recommandé, composition du kit,
    « Livraison offerte · estimation 2 à 3 jours ouvrés ».
12. **Fiche produit avec véhicule xénon** : incompatibilité affichée avec son
    motif, achat bloqué, aucune recommandation, lien vers ce qui convient.
13. **Fiche produit sans véhicule** : aucune compatibilité affirmée, aucun
    conditionnement recommandé, invitation à renseigner le véhicule.
14. **Ajout au panier** : kit ajouté en une ligne à 99,90 €, compteur du header
    à 1, composition dépliable, TVA 16,65 € calculée côté serveur.
15. **Changement de véhicule avec le panier rempli** : le panier signale
    l'article devenu incompatible, explique pourquoi, et ne retire rien.
16. **Recherche sans résultat** (`?q=zzzz`) : alternatives réelles proposées
    (culots et catégories présents au catalogue).
17. **Facettes et filtres** : cocher un culot laisse les autres cochables
    (sélection multiple réellement possible), le prix affiché respecte le
    conditionnement filtré, les compteurs de `/c` correspondent à ce que la
    page de catégorie liste.
18. Fiche produit à 375 px : titre avant la galerie, barre d'achat fixe qui
    reflète le conditionnement choisi et son verdict de compatibilité,
    `scrollWidth === clientWidth`.

## Ce qui n'a pas été vérifié

- Le déploiement Render lui-même : rien n'a été déployé.
- La restauration d'une sauvegarde.
- Le pilote de stockage S3 (non écrit).
- Un envoi d'e-mail réel.
- Un paiement, même en mode test.
- La navigation au clavier ailleurs que sur le menu mobile, la recherche et la
  galerie produit.
- Les contrastes, au-delà de l'œil.
- Le comportement sous achats simultanés : le stock est borné à l'ajout, mais
  rien ne réserve encore une quantité entre le panier et la commande.
- Les imports, les e-mails et le back-office, qui n'existent pas.

## Deux décisions qui vous reviennent

1. **Le rouge.** Les maquettes utilisent `#EC2525`, le cahier des charges
   demandait « un rouge proche de `#C82E28` ». C'est le rouge des maquettes qui
   a été retenu, par fidélité. Une ligne de `src/app/globals.css` bascule.
2. **Le vert.** Le cahier des charges le réserve aux compatibilités confirmées ;
   les maquettes l'emploient aussi pour les puces de réassurance du bandeau
   d'ouverture. Les deux usages ont été gardés, avec une règle écrite dans les
   jetons : seul `FitmentBadge` fait de ce vert une affirmation de
   compatibilité. Si vous préférez la règle stricte, les puces du bandeau
   passent en blanc.
