# LUMERA — boutique d'éclairage auto & moto

> **LUMERA est un nom de travail.** La marque, les coordonnées et les conditions
> commerciales sont centralisées dans [`src/lib/identity.ts`](src/lib/identity.ts)
> et dans la table `Setting` : les changer ne demande aucune retouche de gabarit.

État : **préproduction**. Le site affiche un bandeau « Préproduction · données de
démonstration » et reste en `noindex` tant que `NEXT_PUBLIC_DEMO_MODE` vaut `on`.
Voir [docs/matrice-reception.md](docs/matrice-reception.md) pour ce qui est fait,
ce qui reste à vérifier et ce qui manque.

**La boutique ne peut pas encore ouvrir**, et l'application le dit elle-même :
*Administration › Paramètres › État de l'installation* liste les points
bloquants, et `GET /api/health` en renvoie la version courte. Aujourd'hui :
paiement simulé (Mollie est branché et attend une clé), aucun envoi d'e-mail
réel, identité légale non renseignée, données de démonstration encore en base.

---

## Pile technique

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Rendu et routage | Next.js 16 (App Router), React 19, TypeScript strict | Rendu serveur pour le SEO des fiches produit, site public et back-office dans un seul service Render |
| Base de données | PostgreSQL + Prisma 6 | Le modèle de compatibilité est relationnel (configuration × emplacement × variante) ; les contraintes d'unicité et les transactions y sont indispensables |
| Styles | Tailwind CSS v4, jetons en CSS-first | Un seul fichier de jetons (`src/app/globals.css`) irrigue tout le site |
| Paiement | Adaptateur, Stripe en mode test par défaut | Mollie prévu en second pilote, même interface |
| E-mails | Adaptateur, pilote `log` par défaut | Aucun envoi réel tant que le domaine n'est pas authentifié ; chaque message est tracé et marqué « simulé » |
| Médias | Stockage objet S3-compatible | Le disque de Render est éphémère |
| Travaux de fond | Table `JobQueue` + cron Render | Évite un service Redis et un worker permanent |

### Pourquoi pas un moteur e-commerce existant

Medusa, Vendure et Saleor couvrent le panier, la commande et le paiement — mais
le cœur du projet est ailleurs : la compatibilité véhicule (génération, phase,
version, **équipement lumineux d'origine**, emplacement, référence de bloc
optique, accessoires obligatoires, restrictions de montage, source et date de
vérification), distincte de l'homologation routière, et les kits dont le stock
se calcule depuis des composants partagés. Aucun de ces moteurs ne le modélise :
il aurait fallu écrire un module de taille comparable, **plus** un second
service, un second schéma et un second back-office à maintenir. Le gain
disparaissait. En contrepartie, le panier, la commande et la facturation sont à
écrire ici — c'est le coût assumé de ce choix, et il est visible dans la matrice
de réception.

---

## Lancer en local

Prérequis : Node 20+ (testé sur 26) et PostgreSQL 14+.

```bash
git clone <dépôt> lumera && cd lumera
npm install
cp .env.example .env          # puis renseigner DATABASE_URL
createdb lumera_dev
npx prisma migrate deploy     # applique les migrations versionnées
npm run seed -- --demo        # référentiels + jeu de démonstration
npm run dev                   # http://localhost:3400
```

Sans `--demo`, la base ne reçoit que les référentiels indispensables (TVA,
emplacements lumineux, équipements d'origine, zones de livraison, paramètres) :
c'est ce qu'il faut pour partir d'un catalogue vide.

### Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement sur le port 3400 |
| `npm run build` | `prisma generate` puis build Next (commande utilisée par Render) |
| `npm start` | Serveur de production, écoute sur `$PORT` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Crée une migration à partir du schéma modifié |
| `npm run db:deploy` | Applique les migrations existantes (production) |
| `npm run seed` | Référentiels seuls |
| `npm run seed:demo` | Référentiels + démonstration |
| `npm run seed -- --purge-demo` | Retire tout ce qui porte `isDemo` |
| `npx tsx scripts/run-jobs.ts` | Dépile `JobQueue` une fois (le cron Render fait la même chose) |
| `npm run admin:create` | Crée un compte de l'équipe (aucun identifiant par défaut n'existe) |
| `npm test` | 171 tests sur une base PostgreSQL dédiée |
| `npm run test:db:setup` | Crée et migre `lumera_test`, à faire une fois |
| `./scripts/backup.sh sauvegarder` | Dump horodaté de la base |
| `./scripts/backup.sh verifier <dump>` | Restaure le dump dans une base jetable et compte les lignes |

### Données de démonstration

Tout ce que crée `--demo` porte `isDemo: true` et vit dans
[`prisma/demo-data.ts`](prisma/demo-data.ts) : catégories, un véhicule
(Volkswagen Golf VII, deux générations, trois équipements d'origine), six
produits dont un kit à composants partagés, et **six compatibilités volontairement
contrastées** — confirmée, inconnue, incompatible. Les visuels de
`public/demo/` sont des découpes des maquettes fournies : ce sont des
illustrations, enregistrées comme telles (`Media.nature = ILLUSTRATION`), jamais
des photos d'essai.

`npm run seed -- --purge-demo` les retire sans toucher au code.

---

## Organisation du code

```
prisma/
  schema.prisma        modèle complet, commenté par domaine
  demo-data.ts         le jeu de démonstration, isolé
  seed.ts              référentiels + démonstration + purge
src/
  app/                 routes (site public, API) et globals.css (jetons)
  components/
    brand/             logotype
    ui/                briques réutilisables : Button, Field, Badge, Surface, icons
    layout/            Header, Footer, MobileNav, recherche, panier, véhicule
    home/              les sections de la page d'accueil, une par fichier
    vehicle/           sélecteur de véhicule (marque → modèle → année)
    seo/               données structurées (schema.org), rien d'inventé
  lib/
    identity.ts        marque, coordonnées, conditions commerciales
    readiness.ts       état de l'installation : un seul endroit dit si on peut ouvrir
    navigation.ts      arborescence par défaut (la table MenuEntry la remplace)
    session.ts         véhicule et panier de la session
    media-nature.ts    photo réelle / illustration / essai : vocabulaire partagé
    queries/           lectures par page
    email.ts           envoi transactionnel, pilote `log` par défaut
    storage/           médias : pilote local (développement) ou S3 (production)
    payments/          Mollie, Stripe, simulation — même contrat pour les trois
    admin/             droits, garde d'accès, indicateurs du tableau de bord
    imports/           lecture CSV, formats, validation, écriture par lots
    email/             gabarit et modèles de messages
    auth/              mots de passe, sessions, limitation des tentatives
scripts/
  run-jobs.ts          dépilage de JobQueue
  create-admin.ts      création d'un compte de l'équipe
  backup.sh            sauvegarder / vérifier (restauration d'essai) / restaurer
tests/                 171 tests, base PostgreSQL dédiée (npm run test:db:setup)
docs/                  Render, administration, imports, matrice de réception
design-references/     les trois maquettes fournies
```

## Règles du projet

Trois règles ont dicté la plupart des arbitrages, et il faut les tenir :

1. **Une donnée manquante ne vaut jamais confirmation.** `FitmentStatus` a trois
   valeurs, et l'absence de ligne `Fitment` se lit `UNKNOWN`, jamais
   « compatible ». Seul `FitmentBadge` a le droit de dire qu'une pièce convient.
2. **La compatibilité de montage n'est pas l'homologation routière.** Deux
   champs, deux affichages, jamais déduits l'un de l'autre.
3. **Rien ne s'invente.** Pas d'avis, de note, de volume de ventes, de
   certification, de stock tendu ni de délai garanti qui ne vienne d'une donnée
   réelle. Quand l'information manque, la mention disparaît au lieu d'être
   comblée.

## Documentation

- [docs/render.md](docs/render.md) — déploiement, variables, sauvegarde et restauration
- [docs/administration.md](docs/administration.md) — rôles, premier administrateur, exploitation
- [docs/imports.md](docs/imports.md) — formats d'import, déroulé, reprise, exports
- [docs/matrice-reception.md](docs/matrice-reception.md) — état fonction par fonction
