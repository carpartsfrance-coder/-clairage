# Matrice de réception

État au 18 octobre 2026, après les étapes 1 à 6 : analyse, architecture, design
system, header final, accueil, catalogue, parcours véhicule, fiche produit,
panier, tunnel de commande et paiement.

**La boutique n'est pas prête pour une ouverture commerciale.** L'espace client
et le back-office ne sont pas écrits, aucune facture n'est émise, et aucun
paiement réel n'a jamais été encaissé : le tunnel a été vérifié avec le pilote
de simulation, pas avec Stripe. Ce document dit où en est chaque fonction, sans
arrondi.

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
| Panier | ✅ | Ajout, quantités, retrait, composition du kit, totaux et TVA côté serveur, conflits véhicule signalés |
| Ajout au panier d'un kit | ✅ | Une ligne pour le kit, stock borné par le composant limitant |
| Accessoires nécessaires | ✅ | Proposés décochés, ajoutés seulement si le client les coche |
| Tunnel de commande | ✅ | Coordonnées, adresses livraison et facturation, mode de livraison, consentements, récapitulatif. Commande invité avec jeton de suivi |
| Totaux recalculés côté serveur | ✅ | Le formulaire ne transmet que des identifiants et un code de livraison |
| Numérotation des commandes | ✅ | Séquence PostgreSQL : jamais deux fois le même numéro, même sous concurrence (testé) |
| **Réservation de stock** | ✅ | Trois temps atomiques : réservé à la commande, décompté au paiement, rendu à l'échec. Condition évaluée par PostgreSQL à l'écriture |
| **Achats simultanés** | ✅ | Testé : 2 commandes sur la dernière pièce → 1 seule passe ; 12 commandes sur 5 unités → exactement 5 passent |
| Libération des commandes impayées | ✅ | `expireStaleOrders` au bout de 60 minutes, déclenché à chaque passage du cron (testé) |
| Paiement — pilote Stripe | 🔸 | Checkout Session hébergée, mode test déduit de la clé. **Écrit et typé, jamais exercé contre Stripe** faute de clé |
| Paiement — pilote de simulation | ✅ | Exercé de bout en bout : accepté, refusé, expiré. Marqué `simulated` en base et à l'écran. Refusé en production |
| Webhook vérifié | ✅ | Signature HMAC vérifiée sur le corps brut. Testé : sans signature, mauvais secret, corps modifié, horodatage rejoué → refus ; session non encaissée → non appliquée |
| Webhook idempotent | ✅ | Verrou atomique (`UPDATE … WHERE status = 'PENDING'`) dans la transaction. Testé : 3 rejeux séquentiels **et 3 appels simultanés** → un seul décompte. Un « payé » arrivant après un échec est refusé |
| Accès aux commandes | ✅ | Un jeton d'accès est émis à la création et voyage dans les URL de retour. Sans lui, les pages de paiement et de confirmation répondent 404 : l'identifiant seul ne donne plus accès à l'adresse, au téléphone ni au montant |
| Contrôle du montant | ✅ | Un montant reçu ≠ montant attendu n'est pas appliqué et laisse une trace `OrderEvent` |
| Tentatives répétées sans doublon | ✅ | Clé d'idempotence par commande côté Stripe ; page de paiement refusant de rejouer une commande déjà payée |
| E-mail de confirmation | ⚙️ | Émis à la confirmation, tracé dans `EmailLog`. Simulé tant qu'aucun prestataire n'est configuré, et la page de confirmation le dit |
| Zones et méthodes de livraison | 🔵 + ⚙️ | Deux méthodes de démonstration ; tarifs et délais réels à saisir |
| Remboursements | ⬜ | Modélisés (`Refund`, avec remise en stock explicite), aucun écran |
| Factures et avoirs | ⬜ | Modélisés (`Document`), non générés |
| Code promotionnel | ⬜ | Modélisé (`Promotion`), aucun champ affiché |
| TVA | 🔵 + ⚙️ | Taux 20 % en base, à valider avec le comptable. **`Order.taxCents` ne contient que la TVA des articles** : les frais de port n'en portent pas. Arbitrage comptable à rendre avant l'ouverture ; le récapitulatif dit « dont TVA sur les articles » pour ne rien masquer |
| Avertissement de stock avant paiement | ⬜ | Le tunnel lit `stockIssues` et `conflicts` mais ne les affiche pas : le client découvre une rupture au clic sur « Payer ». Rien n'est encaissé, mais la place de l'information est mauvaise |
| États de paiement partiels | ⬜ | `AUTHORIZED`, `PARTIALLY_REFUNDED` et `REFUNDED` n'affichent qu'un badge sur la page de paiement, sans message ni action |
| Reprise d'un paiement abandonné | ⬜ | Après un abandon, la commande reste en attente avec son stock réservé jusqu'à l'expiration (60 min). Pas de bouton « reprendre ce paiement » |

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

### Automatisées — `npm test` (58 tests, base PostgreSQL dédiée)

| Fichier | Ce qui est couvert |
| --- | --- |
| `tests/stock.test.ts` (15) | Disponibilité : stock réservé déduit, seuil d'alerte, vente à découvert ; kit divisé par la quantité du composant, composant limitant, composant facultatif ignoré, kit sans composant obligatoire ; accroche de livraison et franchise de port |
| `tests/reservation.test.ts` (13) | Réservation sur vraie base : vendable abaissé sans toucher au détenu, refus au-delà du stock, **2 commandes simultanées sur la dernière pièce → 1 seule passe**, **12 commandes sur 5 unités → exactement 5**, kit développé en composants, échec total si un composant manque, cycle réserver → payer → décompter, libération rejouée sans passer sous zéro, 20 numéros de commande concurrents tous distincts |
| `tests/orders.test.ts` (11) | Confirmation et décompte, **3 rejeux séquentiels sans effet**, **3 webhooks simultanés → un seul décompte** (vérifié : le test échoue si l'on retire le verrou), refus d'un « payé » après un échec, libération à l'échec, refus d'un montant incohérent avec trace, paiement inconnu ignoré, **seul le panier d'origine est vidé**, e-mail tracé comme simulé, expiration des commandes impayées |
| `tests/order-access.test.ts` (9) | Jeton d'accès : bon jeton accepté, jeton absent, faux jeton de même longueur, préfixe correct, commande sans jeton, propriétaire connecté ; lecture du paramètre, paramètre répété, valeur vide |
| `tests/webhook.test.ts` (10) | Refus sans signature, avec un autre secret, sur corps modifié, sur horodatage rejoué, sans secret configuré ; acceptation et normalisation d'une signature valide ; session non encaissée non retenue ; expiration normalisée ; type inconnu ignoré ; mode test déduit de la clé |

### À la main, dans le navigateur

1. `npm run build` — build de production réussi ; `tsc --noEmit` sans erreur.
2. `GET /api/health` → `{"status":"ok","database":"up"}`.
3. Accueil à 1280 px et 375 px, comparée aux trois maquettes, bloc par bloc.
4. Menu mobile — modale, piège de focus, Échap, retour du focus.
5. Parcours véhicule complet : Volkswagen → Golf → 2015 → étape d'équipement
   déclenchée d'elle-même → halogènes → résultats par emplacement, datés et sourcés.
6. Fiche produit avec véhicule compatible, incompatible, et sans véhicule.
7. Ajout au panier, conflit signalé au changement de véhicule.
8. **Commande complète** : formulaire rempli → commande `CMD-2026-00003` créée,
   stock réservé (1 paire d'ampoules, 2 adaptateurs, 2 décodeurs ; `stockOnHand`
   inchangé) → paiement simulé accepté → commande CONFIRMED/PAID, `stockOnHand`
   décompté, `stockReserved` à zéro, trois `StockMovement` à la référence de la
   commande, panier supprimé, e-mail tracé comme simulé.
9. **Garde du rejeu** : la page de paiement d'une commande déjà payée n'affiche
   aucun bouton d'issue et renvoie vers la confirmation.
9bis. **Contrôle d'accès** : la confirmation répond 404 sans jeton, 404 avec un
   mauvais jeton, 200 avec le bon. Seconde commande passée de bout en bout
   (`CMD-2026-00004`) pour vérifier que le jeton traverse tout le parcours.
10. Recherche sans résultat, facettes multi-sélection, prix respectant le filtre
    de conditionnement, compteurs de catégories cohérents avec les listes.
11. Fiche produit à 375 px : titre avant la galerie, barre d'achat fixe reflétant
    la sélection, aucun défilement horizontal.

## Ce qui n'a pas été vérifié

- **Un paiement réel, même en mode test Stripe** : aucune clé n'est configurée,
  le pilote Stripe n'a donc jamais parlé à Stripe. C'est le point le plus
  important de cette liste.
- Le webhook de bout en bout depuis Stripe (seule la vérification de signature
  est testée, hors réseau).
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
