# Matrice de réception

État au 18 octobre 2026, après la première étape : analyse, architecture,
design system, header final et page d'accueil.

**La boutique n'est pas prête pour une ouverture commerciale.** Le panier, la
commande, le paiement, l'espace client et le back-office ne sont pas écrits.
Ce document dit où en est chaque fonction, sans arrondi.

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
| Recherche du header | 🔸 | Champ, suggestions (`/api/recherche/suggestions`), navigation aux flèches, combobox ARIA. La page `/recherche` n'existe pas : la soumission mène à une page « non construite » |
| Compteur de panier | ✅ | Lit la session réelle (cookie + base), vaut 0 tant qu'aucune ligne n'existe |
| Véhicule dans le header | 🔸 | Lit la session réelle, ouvre le sélecteur en modale. Le choix aboutit à `/vehicule/resultats`, page non construite |
| Page d'accueil, 13 blocs dans l'ordre | ✅ | Comparée aux maquettes sur ordinateur (1280) et mobile (375) |
| Pied de page | ✅ | Masque toute mention légale non renseignée et le signale |
| Absence de défilement horizontal | ✅ | Vérifié à 375 px : `scrollWidth === clientWidth` |
| Page 404 | 🔸 | Écrite, avec des sorties réelles ; non exercée |
| Pages liées mais non construites | ⬜ | 24 routes rendent une page « non construite » qui dit ce qui est prévu. Aucun lien ne tombe sur une erreur, mais aucune n'est utile |

## Catalogue et parcours véhicule

| Fonction | État | Détail |
| --- | --- | --- |
| Modèle catégories / produits / variantes / kits | ✅ | Stock porté par la variante, jamais par le kit |
| Catalogue de démonstration | 🔵 | 6 produits, dont un kit à composants partagés, 7 catégories |
| Sélecteur marque → modèle → année | 🔸 | Composant et trois API écrits et répondant ; parcours complet non exercé faute de page de résultats |
| Étape « équipement d'origine » | 🔸 | Le serveur redirige vers elle quand une génération en expose plusieurs ; la page n'est pas construite |
| Modèle de compatibilité | ✅ | Configuration × emplacement × variante, trois statuts, accessoires obligatoires, restrictions, source et date |
| Compatibilité / homologation distinctes | ✅ | Deux champs, deux affichages, jamais déduits l'un de l'autre |
| Compatibilités de démonstration | 🔵 | 6 lignes contrastées : confirmée, inconnue, incompatible |
| Pages catégorie, recherche, résultats véhicule | ⬜ | — |
| Fiche produit (maquette 02) | ⬜ | Le modèle et les visuels sont prêts, la page n'est pas écrite |
| Filtres, tri, pagination | ⬜ | — |

## Commerce

| Fonction | État | Détail |
| --- | --- | --- |
| Modèle panier / commande / paiement / livraison | ✅ | Y compris l'instantané d'achat (`OrderLine.snapshot`) qui fige ce qui a été acheté |
| Panier, commande, paiement | ⬜ | — |
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

Faites dans cette session, sur le serveur de développement et la base PostgreSQL
locale :

1. `prisma validate`, `prisma migrate dev` — schéma valide, migrations appliquées.
2. `npm run seed -- --demo` — 6 produits, 6 compatibilités, 7 catégories.
3. `tsc --noEmit` — aucune erreur sur l'ensemble du dépôt.
4. `npm run build` — build de production réussi, 31 routes.
5. `GET /api/health` → `{"status":"ok","database":"up","latencyMs":3}`.
6. Page d'accueil à 1280 px — comparée aux trois maquettes, bloc par bloc.
7. Page d'accueil à 375 px — composition mobile, `scrollWidth === clientWidth`.
8. Menu mobile — ouverture, `role="dialog"`, `aria-modal`, piège de focus,
   Échap, retour du focus au déclencheur, défilement du corps rétabli.
9. `GET /api/vehicules/marques?type=CAR` — répond depuis la base.
10. Images de démonstration — vérifiées une à une pour s'assurer qu'aucun texte
    de maquette n'y est incrusté.

## Ce qui n'a pas été vérifié

- Le déploiement Render lui-même : rien n'a été déployé.
- La restauration d'une sauvegarde.
- Le pilote de stockage S3 (non écrit).
- Un envoi d'e-mail réel.
- Un paiement, même en mode test.
- La navigation au clavier ailleurs que sur le menu mobile et la recherche.
- Les contrastes, au-delà de l'œil.

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
