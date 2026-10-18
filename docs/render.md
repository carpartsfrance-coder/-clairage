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
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe › Développeurs › Clés d'API (**mode test** d'abord) | Paiement indisponible |
| `EMAIL_FROM`, `EMAIL_API_KEY` | Prestataire e-mail | Les envois restent simulés et tracés comme tels |

Générées par Render : `SESSION_SECRET`, `JOB_RUNNER_TOKEN`, `DATABASE_URL`.

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

Mettre `MEDIA_DRIVER=local` uniquement en développement.

## 4. Travaux de fond

`lumera-jobs` exécute `scripts/run-jobs.ts` toutes les dix minutes : il prend un
lot dans `JobQueue`, traite chaque entrée, et se termine. Les garde-fous sont
dans le script — verrou par instance, verrou orphelin repris au bout de quinze
minutes, report exponentiel borné à une heure, abandon après `maxAttempts`.

Augmenter la fréquence n'a d'intérêt que si les envois d'e-mails deviennent
sensibles au délai. Les imports volumineux, eux, se reprennent d'un tour à
l'autre grâce au curseur de `ImportJob`.

## 5. Sauvegarde et restauration

### Ce que couvre Render

Les offres payantes de Render PostgreSQL incluent des sauvegardes quotidiennes
automatiques avec restauration à un instant donné (*point-in-time recovery*),
conservées selon l'offre. **L'offre gratuite n'en a pas, et la base expire au
bout de 30 jours** : elle ne convient pas à une boutique.

### Sauvegarde manuelle

À faire avant toute migration structurante :

```bash
# Récupérer l'URL externe dans Render › lumera-db › Connect › External
pg_dump --no-owner --no-privileges --format=custom \
  "$DATABASE_EXTERNAL_URL" > lumera-$(date +%Y%m%d-%H%M).dump
```

Le stockage objet se sauvegarde séparément (`rclone sync` vers un second
bucket) : il n'est pas couvert par la sauvegarde PostgreSQL, et une base
restaurée sans ses médias affiche des fiches sans photo.

### Restauration

```bash
# 1. Mettre le service web en pause (Render › lumera-web › Settings › Suspend)
# 2. Restaurer
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "$DATABASE_EXTERNAL_URL" lumera-20260101-1200.dump
# 3. Vérifier que le schéma correspond au code déployé
npx prisma migrate status
# 4. Réactiver le service, puis contrôler /api/health
```

`migrate status` à l'étape 3 n'est pas facultatif : restaurer une sauvegarde
plus ancienne que le code déployé laisse une base en retard d'une ou plusieurs
migrations, et l'application échouera sur les colonnes manquantes.

### Répétition

Une restauration qui n'a jamais été essayée n'est pas une sauvegarde. À tester
une fois sur une base jetable avant l'ouverture.

## 6. Journaux et diagnostic

- Render › service › **Logs** pour le flux en direct.
- Les erreurs applicatives sont préfixées par leur domaine : `[accueil]`,
  `[vehicule]`, `[recherche/suggestions]`, `[email]`, `[jobs]`, `[health]`.
- La table `EmailLog` trace tous les e-mails, réels comme simulés
  (colonne `simulated`).
- La table `AuditLog` trace les actions d'administration sensibles.

## 7. Points à surveiller

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
