# Déploiement sur Render

Trois ressources décrites dans [`render.yaml`](../render.yaml) : une base
PostgreSQL, un service web, un cron. Rien d'autre n'est nécessaire — la file de
travaux vit dans PostgreSQL, ce qui évite un Redis et un worker permanent.

```
┌──────────────┐        ┌───────────────────────────┐
│ lumera-jobs  │        │ lumera-web                │
│ cron /10 min │───────▶│ site public + back-office │
└──────────────┘        │ + API + webhooks          │
       │                └────────────┬──────────────┘
       │                             │
       └──────────────┬──────────────┘
                      ▼
            ┌───────────────────┐     ┌──────────────────────┐
            │ lumera-db         │     │ stockage objet       │
            │ PostgreSQL        │     │ S3-compatible        │
            └───────────────────┘     │ (photos, PDF, pièces)│
                                      └──────────────────────┘
```

## 1. Première mise en ligne

1. Pousser le dépôt sur GitHub.
2. Render › **New +** › **Blueprint**, sélectionner le dépôt. Render lit
   `render.yaml` et propose les trois ressources.
3. Renseigner les variables marquées `sync: false` (liste ci-dessous). Les
   autres sont générées ou câblées automatiquement.
4. Lancer le déploiement. Le build exécute, dans cet ordre :
   `npm ci` → `npx prisma migrate deploy` → `npm run build`.
5. Vérifier `https://<service>.onrender.com/api/health` : la réponse doit être
   `{"status":"ok","database":"up",…}`. Un `503` signifie que l'application
   répond mais que PostgreSQL est injoignable — c'est volontairement un échec,
   pour que Render ne déclare pas saine une instance incapable de servir.
6. Créer le premier administrateur : voir [administration.md](administration.md).

### Pourquoi `migrate deploy` et pas `db push`

`migrate deploy` n'applique que des migrations déjà écrites et versionnées dans
`prisma/migrations/`. Il n'invente aucun changement de schéma et ne supprime
jamais de colonne de son propre chef. Une migration oubliée en local ne partira
donc pas en production par accident : le déploiement échouera, ce qui est le bon
comportement.

## 2. Variables à renseigner

| Variable | Où la trouver | Sans elle |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Le domaine définitif, avec `https://` | URL canoniques et liens d'e-mail faux |
| `MEDIA_ENDPOINT`, `MEDIA_REGION`, `MEDIA_BUCKET`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_HOST` | Console du stockage objet | Aucun envoi de média possible |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe › Développeurs › Clés d'API (**mode test** d'abord) | Paiement indisponible en production, simulé en développement |
| `EMAIL_FROM`, `EMAIL_API_KEY` | Prestataire e-mail | Les envois restent simulés et tracés comme tels |

Générées par Render : `JOB_RUNNER_TOKEN`, `DATABASE_URL`.

Il n'y a **aucun secret de session à définir** : le cookie porte un jeton
aléatoire de 32 octets dont la base ne garde que le condensé SHA-256. Rien n'est
signé, donc il n'y a pas de clé à faire tourner.

`AUTH_SCRYPT_LOG_N` (coût du hachage des mots de passe, `2^N`) vaut 15, calibré
pour une instance de 512 Mo. À relever si vous passez à une offre plus grande.

Un contrôle de tout cela est disponible en ligne : **Administration ›
Paramètres › État de l'installation**, et `GET /api/health` en donne la version
courte (`configuration.readyToOpen`, `configuration.blocking`). Les deux lisent
le même code, `src/lib/readiness.ts` — il n'y a pas deux listes à tenir à jour.

`NEXT_PUBLIC_DEMO_MODE` reste à `on` tant que des données de démonstration sont
en base. Le passer à `off` retire le bandeau et lève le `noindex` : c'est
littéralement le geste d'ouverture du site, à ne faire qu'une fois la matrice de
réception verte sur les fonctions essentielles.

## 3. Stockage des médias

Le système de fichiers d'une instance Render est éphémère : il repart à zéro à
chaque déploiement et n'est pas partagé entre instances. Une photo produit
téléversée y disparaîtrait au déploiement suivant.

Les médias vont donc dans un stockage objet S3-compatible. Trois options testées
pour un site français :

| Service | Remarque |
| --- | --- |
| **Cloudflare R2** | Pas de frais de sortie, compatible S3, domaine public simple à brancher. Recommandé. |
| **Backblaze B2** | Moins cher au stockage, sortie gratuite via Cloudflare. |
| **AWS S3** | Le plus courant, mais la sortie est facturée. |

Un disque persistant Render (`disk:`) est possible mais déconseillé : il
attache le service à une seule instance et empêche la montée en charge.

Mettre `MEDIA_DRIVER=local` uniquement en développement : **le code refuse ce
pilote quand `NODE_ENV` vaut `production`** plutôt que d'écrire un fichier qui
disparaîtra. L'écran `/admin/medias` affiche l'état du stockage avant le
formulaire de dépôt, et désactive ce dernier tant qu'il n'est pas opérationnel.

Les clés de stockage portent une empreinte du contenu, ce qui permet de servir
les médias avec `Cache-Control: public, max-age=31536000, immutable` : une URL
ne désigne jamais deux fichiers différents. Les six variables `MEDIA_*` sont
aussi transmises au cron, qui peut avoir à écrire un média.

## 4. Paiement

### Mise en route, en mode test

1. Créer un compte Stripe et rester en **mode test** (l'interrupteur est en haut
   du tableau de bord).
2. Développeurs › Clés d'API : copier la clé secrète `sk_test_…` dans
   `STRIPE_SECRET_KEY`.
3. Développeurs › Webhooks › Ajouter un point de terminaison :
   - URL : `https://<domaine>/api/paiement/webhook`
   - Événements : `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Copier le secret de signature `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
4. Redéployer, puis passer une commande avec la carte de test `4242 4242 4242 4242`
   (date future, CVC quelconque).

Le mode test n'est pas déduit d'une variable mais de la clé elle-même
(`sk_test_` → test). Impossible de croire qu'on est en test alors que la clé est
celle de production.

### Ce qui se passe sans clé

En développement, et seulement là, un pilote de **simulation** prend le relais.
Il n'imite que l'encaissement : la commande, la réservation de stock, les
mouvements de stock, les statuts et les e-mails passent par exactement le même
code qu'un paiement réel. Chaque `Payment` ainsi créé porte
`provider = 'simulation'`, et les écrans le disent.

En production, l'absence de `STRIPE_SECRET_KEY` fait **échouer** l'ouverture du
paiement au lieu de basculer en simulation. Une boutique qui confirme des
commandes jamais payées est un problème plus grave qu'un tunnel en erreur.

### Webhook

Le corps est vérifié contre `STRIPE_WEBHOOK_SECRET` avant toute lecture. Sans
secret configuré, la route répond 400 : un webhook non signé permettrait à
n'importe qui de marquer une commande payée.

Le traitement est idempotent — les prestataires rejouent leurs événements, c'est
normal. Un événement déjà appliqué est ignoré, le stock n'est jamais décompté
deux fois. Un montant reçu différent du montant attendu n'est pas appliqué : il
est tracé dans `OrderEvent` pour que le back-office le voie.

### Cohérence des stocks

Trois temps, chacun atomique :

| Moment | `stockOnHand` | `stockReserved` | Vendable |
| --- | --- | --- | --- |
| Commande créée | inchangé | **+ n** | **− n** |
| Paiement confirmé | **− n** | **− n** | inchangé |
| Échec / abandon / expiration | inchangé | **− n** | **+ n** |

La réservation s'appuie sur une condition évaluée par PostgreSQL au moment de
l'écriture (`UPDATE … WHERE "stockOnHand" - "stockReserved" >= n`), pas par Node
avant. Deux commandes simultanées sur la dernière pièce ne peuvent donc pas
passer toutes les deux : la seconde voit zéro ligne modifiée et sa transaction
est annulée en entier. C'est vérifié par les tests
(`tests/reservation.test.ts`), dont une rafale de douze commandes concurrentes
sur cinq unités.

Un kit n'a pas de stock : ce sont ses composants qui sont réservés, à hauteur de
la quantité commandée multipliée par leur quantité dans le kit. Si un seul
composant manque, toute la réservation échoue.

Les commandes restées impayées sont libérées par le cron au bout de 60 minutes
(`order.paymentWindowMinutes`), ce qui rend le stock disponible.

## 5. Travaux de fond

`lumera-jobs` exécute `scripts/run-jobs.ts` toutes les dix minutes : il prend un
lot dans `JobQueue`, traite chaque entrée, et se termine. Les garde-fous sont
dans le script — verrou par instance, verrou orphelin repris au bout de quinze
minutes, report exponentiel borné à une heure, abandon après `maxAttempts`.

Augmenter la fréquence n'a d'intérêt que si les envois d'e-mails deviennent
sensibles au délai. Les imports volumineux, eux, se reprennent d'un tour à
l'autre grâce au curseur de `ImportJob`.

## 6. Sauvegarde et restauration

### Ce que couvre Render

Les offres payantes de Render PostgreSQL incluent des sauvegardes quotidiennes
automatiques avec restauration à un instant donné (*point-in-time recovery*),
conservées selon l'offre. **L'offre gratuite n'en a pas, et la base expire au
bout de 30 jours** : elle ne convient pas à une boutique.

### Sauvegarde manuelle

`scripts/backup.sh` enveloppe les trois gestes. À faire avant toute migration
structurante :

```bash
# L'URL externe se récupère dans Render › lumera-db › Connect › External
./scripts/backup.sh sauvegarder "$DATABASE_EXTERNAL_URL"
```

Le stockage objet se sauvegarde séparément (`rclone sync` vers un second
bucket) : il n'est pas couvert par la sauvegarde PostgreSQL, et une base
restaurée sans ses médias affiche des fiches sans photo.

### Restauration

```bash
# 1. Mettre le service web en pause (Render › lumera-web › Settings › Suspend)
# 2. Restaurer — le script demande une confirmation explicite
./scripts/backup.sh restaurer sauvegardes/lumera-20260101-1200.dump "$DATABASE_EXTERNAL_URL"
# 3. Vérifier que le schéma correspond au code déployé
npx prisma migrate status
# 4. Réactiver le service, puis contrôler /api/health
```

`migrate status` à l'étape 3 n'est pas facultatif : restaurer une sauvegarde
plus ancienne que le code déployé laisse une base en retard d'une ou plusieurs
migrations, et l'application échouera sur les colonnes manquantes.

### Répétition

Une restauration qui n'a jamais été essayée n'est pas une sauvegarde : c'est un
fichier. La commande `verifier` fait l'essai **sans toucher à quoi que ce soit**
— elle crée une base jetable, y restaure le dump, compte les lignes des cinq
tables qui comptent, puis supprime la base :

```bash
./scripts/backup.sh verifier sauvegardes/lumera-20260101-1200.dump
```

À faire une fois avant l'ouverture, puis après chaque changement de schéma
important. **Cela n'a pas encore été fait sur une base réelle** : il n'y en a
pas encore.

## 7. Journaux et diagnostic

- Render › service › **Logs** pour le flux en direct.
- Les erreurs applicatives sont préfixées par leur domaine : `[accueil]`,
  `[vehicule]`, `[recherche/suggestions]`, `[email]`, `[jobs]`, `[health]`.
- La table `EmailLog` trace tous les e-mails, réels comme simulés
  (colonne `simulated`).
- La table `AuditLog` trace les actions d'administration sensibles.

## 8. Points à surveiller

- **Toutes les pages sont rendues à la demande.** Le header lit le cookie de
  session (véhicule, panier), ce qui rend le rendu dynamique. C'est voulu, mais
  cela met le temps de réponse de PostgreSQL sur le chemin critique de chaque
  page. Si cela devient gênant pour le SEO des fiches produit, la piste est de
  sortir le panier et le véhicule du rendu serveur du header.
- **Démarrage à froid** sur les offres d'entrée de gamme : la première requête
  après une période d'inactivité est lente. L'offre `starter` ne se met pas en
  veille, contrairement à l'offre gratuite.
- **Les variables Render ne sont pas dans le dépôt.** Les changer demande un
  redéploiement, et c'est une action manuelle côté tableau de bord.
