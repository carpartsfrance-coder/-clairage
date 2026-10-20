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
   `npm ci --include=dev` → `npx prisma migrate deploy` → `npm run build`.

   Le drapeau `--include=dev` n'est pas décoratif. Le service pose
   `NODE_ENV=production`, et `npm ci` retire alors les dépendances de
   développement — 66 paquets, dont `prisma`, `typescript` et `tailwindcss`.
   Or ce sont exactement ceux dont les deux commandes suivantes ont besoin.
   Sans lui, la construction échoue avant même le premier déploiement.
   **Le cron échoue tant que `EMAIL_FROM` est vide.** Constaté au premier
   déploiement réel : la base et le service web se créent, `lumera-jobs` non,
   avec `environment variable not found: 'EMAIL_FROM' for lumera-web`. Le cron
   reprend plusieurs variables du service web par `fromService`, et une
   variable `sync: false` laissée vide n'existe pas — il n'y a donc rien à
   reprendre. Ce n'est pas bloquant pour le site, qui tourne sans lui ; le
   cron se crée à la synchronisation suivante, une fois `EMAIL_FROM`
   renseignée. Rien ne se perd entre-temps : la file de travaux vit en base et
   sera dépilée dès que le cron existera.

5. Vérifier `https://<service>.onrender.com/api/health` : la réponse doit être
   `{"status":"ok","database":"up",…}`. Un `503` signifie que l'application
   répond mais que PostgreSQL est injoignable — c'est volontairement un échec,
   pour que Render ne déclare pas saine une instance incapable de servir.
6. Peupler les données de référence : voir [§ 1.1](#11-données-de-référence) ci-dessous.
   La migration crée les tables, pas leur contenu — un environnement neuf répond
   `ok` avec un catalogue vide.
7. Créer le premier administrateur : voir [administration.md](administration.md).

### 1.1 Données de référence

Elles **ne se déploient pas avec le code** : elles vivent en base et dans le
stockage objet, donc par environnement. Une fusion n'en porte aucune, et un
environnement neuf — préproduction, base repartie de zéro — démarre vide.

Ces commandes se lancent depuis **Render › `lumera-web` › Shell**, et pas depuis
un poste : la base n'accepte que le réseau interne Render (`ipAllowList: []`
dans `render.yaml`), et les variables `MEDIA_*` n'ont aucune raison de quitter
le tableau de bord. Dans la console, tout est déjà en place.

Dans cet ordre, parce que chacune a besoin de la précédente :

```bash
npm run seed                   # TVA, positions d'éclairage, équipements, livraison
npm run seed:taxonomy          # rubriques et familles du catalogue
npm run import:vehicles-cars   # 47 marques automobiles
npm run import:vehicles-motos  # 26 marques de deux-roues
npm run import:brand-logos     # logos du domaine public (Wikimedia Commons)
npm run logos:fournis          # les six que Commons n'héberge pas
npm run import:vehicle-photos  # visuels des générations
npm run import:produits        # catalogue initial — exige la TVA et les rubriques
npm run import:packs-vehicule  # packs par véhicule — exige les positions d'éclairage
```

Chacune est **rejouable sans dégât** : elle crée ou met à jour ce qui manque et
ne supprime rien. Une coupure en cours de route se rattrape en relançant la
commande, pas en repartant de zéro. Celles qui déposent un média refusent de
tourner si le stockage n'est pas opérationnel, plutôt que d'enregistrer des
fichiers introuvables ; `logos:fournis` finit en disant ce qui reste au
monogramme.

**Pourquoi pas dans le `buildCommand`.** Parce qu'une construction construit :
lui faire écrire des données à chaque déploiement ajouterait un effet de bord
permanent pour un besoin qui se présente à la création d'un environnement, et
un logo qui échoue retiendrait une mise en ligne qui corrige peut-être autre
chose. `prisma migrate deploy` y est pour une raison inverse : un schéma en
retard rend l'application fausse, donc le déploiement doit échouer.

### Pourquoi `migrate deploy` et pas `db push`

`migrate deploy` n'applique que des migrations déjà écrites et versionnées dans
`prisma/migrations/`. Il n'invente aucun changement de schéma et ne supprime
jamais de colonne de son propre chef. Une migration oubliée en local ne partira
donc pas en production par accident : le déploiement échouera, ce qui est le bon
comportement.

### Mettre en ligne à côté d'un site existant

Quand un autre service tourne déjà sur le compte, le blueprint ne le touche
pas : il crée ses propres ressources, nommées `lumera-db`, `lumera-web` et
`lumera-jobs`. Rien n'est partagé — ni la base, ni les variables, ni le
domaine. Les deux sites cohabitent.

Trois précautions, le temps de la cohabitation :

1. **Garder `NEXT_PUBLIC_DEMO_MODE` à `on`.** Le nouveau site reste alors en
   `noindex`, par deux mécanismes qui se complètent : `robots.txt` interdit
   tout, et la mise en page racine pose l'en-tête. Il ne viendra donc pas
   concurrencer l'ancien dans les moteurs de recherche.
2. **Ne pas rattacher le domaine définitif tout de suite.** L'adresse
   `https://<service>.onrender.com` suffit pour tout vérifier. Renseigner
   `NEXT_PUBLIC_SITE_URL` avec cette adresse-là, exactement : c'est elle qui
   construit les URL de webhook et les liens d'e-mail.
3. **Ne rien supprimer avant la bascule.** Tant que l'ancien service existe, le
   retour en arrière est immédiat.

La bascule proprement dite — rattacher le domaine, passer `DEMO_MODE` à `off`,
puis seulement ensuite retirer l'ancien service — ne se fait qu'une fois
`configuration.readyToOpen` à `true` **et** une commande réelle passée de bout
en bout : paiement encaissé, e-mail de confirmation reçu. Le contrôle
automatique vérifie que les fonctions sont configurées, pas qu'elles
aboutissent ; seule une vraie commande le montre.

## 2. Variables à renseigner

| Variable | Où la trouver | Sans elle |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Le domaine définitif, avec `https://` | URL canoniques et liens d'e-mail faux |
| `MEDIA_ENDPOINT`, `MEDIA_REGION`, `MEDIA_BUCKET`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_HOST` | Console du stockage objet | Aucun envoi de média possible |
| `MOLLIE_API_KEY` | Mollie › Développeurs › Clés d'API (**mode test** d'abord) | Paiement indisponible en production, simulé en développement |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe › Développeurs › Clés d'API (**mode test** d'abord) | Paiement indisponible en production, simulé en développement |
| `PAYMENT_PROVIDER` | `mollie` ou `stripe` | Nécessaire **uniquement** si les clés des deux prestataires sont renseignées : l'application refuse alors de choisir seule |
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

Deux prestataires sont pris en charge : **Mollie** et **Stripe**. On renseigne la
clé de celui qu'on utilise, et d'un seul. Si les deux clés sont présentes,
l'application refuse de choisir et réclame `PAYMENT_PROVIDER` : choisir en
silence, ce serait risquer d'encaisser chez l'un pendant qu'on surveille l'autre.

Dans les deux cas, **le mode test se déduit de la clé elle-même**, jamais d'une
variable séparée qu'on pourrait oublier de basculer. Et une clé dont le préfixe
n'est ni celui du test ni celui de la production est **refusée** plutôt
qu'interprétée — ne pas savoir si une clé encaisse réellement est exactement le
cas où il ne faut pas deviner.

L'état du branchement se lit en ligne, sans fouiller les variables :
**Administration › Paramètres › État de l'installation**, et `GET /api/health`
pour la version courte.

### Mollie, en mode test

1. Créer un compte sur [mollie.com](https://www.mollie.com). Le mode test est
   disponible **avant** toute validation du compte : inutile d'attendre.
2. Développeurs › Clés d'API : copier la clé **`test_…`** dans `MOLLIE_API_KEY`.
3. Vérifier qu'au moins un moyen de paiement est actif sur le profil. Sans cela
   Mollie crée bien le paiement mais ne renvoie aucune page de règlement, et
   l'application refuse avec un message qui le dit.
4. Redéployer, puis passer une commande.

Il n'y a **rien à déclarer côté Mollie pour le webhook** : l'URL est transmise à
chaque paiement par l'application, construite sur `NEXT_PUBLIC_SITE_URL`.

> ⚠ `NEXT_PUBLIC_SITE_URL` doit être l'URL publique **exacte**. Une redirection
> 301 ou 302 — `http` vers `https`, `www` vers l'apex, une barre oblique finale —
> transforme le POST de Mollie en GET et **perd la notification**. Mollie
> n'accepte que 307 ou 308 ; le plus simple est de donner d'emblée l'URL finale.

Seul l'euro est accepté en mode test. Pour forcer un refus de carte, créer la
commande avec un montant « magique » puis choisir « failed » sur l'écran de
test — le motif renvoyé par Mollie dépend du montant :

| Montant | Motif renvoyé |
| --- | --- |
| 1001,00 € | numéro de carte invalide |
| 1006,00 € | refusée par l'émetteur |
| 1007,00 € | solde insuffisant |
| 1011,00 € | carte refusée |

(La liste complète va de 1001 à 1011 : CVV, nom du porteur, carte expirée, type
de carte, carte inactive, fraude probable, authentification échouée.)

### Pourquoi le webhook Mollie n'a pas de secret

Mollie **ne signe pas** ses webhooks. Il POSTe un seul paramètre de formulaire,
`id=tr_…`, et rien d'autre : ni le statut, ni une signature. C'est délibéré de
sa part, et sûr, à une condition — que le serveur aille **relire le paiement par
l'API**. C'est ce que fait le pilote.

Un faux appel ne peut donc rien affirmer : au mieux, il nous fait relire la
vérité. La documentation de Mollie le formule ainsi : *« fake calls to your
webhook will never result in orders being processed without being actually
paid »*. Il n'y a donc aucun `MOLLIE_WEBHOOK_SECRET` à chercher : il n'existe pas.

Deux conséquences dans le code :

- la route `/api/paiement/webhook` répond **200 même pour un identifiant
  inconnu** — c'est ce que demande Mollie, et un 404 dirait à un tiers lesquels
  existent chez nous ;
- elle répond **400** quand un appel est jugé non authentique (cas Stripe) et
  **500** sur une panne passagère, pour que l'appel soit **relancé**. Mollie
  réessaie dix fois sur vingt-six heures puis **abandonne définitivement**, sans
  possibilité de redéclencher soi-même : gâcher une tentative avec un 400 mal
  placé coûte cher.

Mollie coupe l'appel au bout de **15 secondes** et compte le dépassement comme un
échec. Les appels du pilote vers Mollie sont donc bornés à 10 secondes.

### Mollie en développement : pas de webhook, et c'est prévu

Mollie refuse une URL de webhook non publique (*« you cannot use localhost »*).
L'application le détecte et **omet le champ** au lieu de faire échouer la
création du paiement. Le tunnel reste vérifiable de bout en bout, parce que le
rapprochement se fait alors au **retour du client** : la page de règlement de
Mollie renvoie sur `/api/paiement/retour`, qui interroge l'API et oriente vers
la confirmation ou vers la page de paiement.

Pour recevoir de vrais webhooks en local, exposer le site (ngrok ou équivalent)
et reporter l'URL publique du tunnel dans `NEXT_PUBLIC_SITE_URL`.

### Stripe, en mode test

1. Créer un compte Stripe et rester en **mode test**.
2. Développeurs › Clés d'API : copier la clé secrète `sk_test_…` dans
   `STRIPE_SECRET_KEY`.
3. Développeurs › Webhooks › Ajouter un point de terminaison :
   - URL : `https://<domaine>/api/paiement/webhook`
   - Événements : `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Copier le secret de signature `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
4. Redéployer, puis passer une commande avec la carte de test
   `4242 4242 4242 4242` (date future, CVC quelconque).

Contrairement à Mollie, Stripe **signe** le corps de ses webhooks : sans
`STRIPE_WEBHOOK_SECRET`, la route refuse tous les appels Stripe, et c'est voulu.

### Ce qui se passe sans aucune clé

En développement, et seulement là, un pilote de **simulation** prend le relais.
Il n'imite que l'encaissement : la commande, la réservation de stock, les
mouvements de stock, les statuts et les e-mails passent par exactement le même
code qu'un paiement réel. Chaque `Payment` ainsi créé porte
`provider = 'simulation'`, et les écrans le disent.

Attention à ne pas confondre avec le mode test d'un vrai prestataire : une clé
`test_` de Mollie **n'est pas** une simulation. Mollie répond réellement, appelle
réellement le webhook, et le tunnel se comporte comme en production. Seul
l'argent ne bouge pas.

En production, l'absence de clé fait **échouer** l'ouverture du paiement au lieu
de basculer en simulation. Une boutique qui confirme des commandes jamais payées
est un problème plus grave qu'un tunnel en erreur.

### Les statuts de Mollie, et celui qui piège

Mollie a sept statuts, dont **quatre seulement sont définitifs** : `paid`,
`canceled`, `expired`, `failed`. Le pilote n'applique une issue que sur ceux-là.
Les trois autres ne déclenchent rien, et chacun pour une raison précise :

| Statut | Pourquoi rien n'est appliqué |
| --- | --- |
| `open` | Le paiement est encore réglable. Et une tentative abandonnée **y ramène** le paiement : le client est invité à réessayer. Le lire comme un refus annulerait la commande de quelqu'un en train de payer. |
| `pending` | Attente de confirmation bancaire. Peut durer deux à trois jours ouvrés. |
| `authorized` | Les fonds sont **réservés, pas encaissés**. Sans capture, l'autorisation expire — sept jours sur Visa — et le paiement finit `expired`. Expédier là-dessus, c'est livrer gratuitement. |

Le pilote ne demande pas de capture manuelle : Mollie capture de lui-même, et
c'est le passage à `paid` qui est attendu.

> `canceled` s'écrit avec **un seul « l »**. Un test sur `cancelled` ne
> correspondrait jamais, et le paiement tomberait dans le cas par défaut sans
> erreur ni trace. C'est couvert par un test.

### Moyens de paiement : ce qui n'est pas encore transmis

Le pilote n'envoie ni `lines` (lignes de commande) ni `billingAddress`. Ces
champs sont facultatifs pour la carte, iDEAL, Bancontact et PayPal, mais
**obligatoires** pour les paiements fractionnés et différés. Tant qu'ils ne sont
pas transmis, **ne pas activer** ces moyens sur le profil Mollie : la création du
paiement échouerait.

| Moyen | Exige `lines` | Exige `billingAddress` |
| --- | --- | --- |
| Klarna, in3, Riverty, Billie, Billink | oui | oui |
| Voucher | oui | non |
| Alma | non | oui |

L'adresse exigée par ces moyens est complète (prénom, nom, rue, code postal,
ville, pays, e-mail — plus la raison sociale pour Billie). La boutique collecte
déjà tout cela ; c'est le pilote qui ne le transmet pas encore.

Le pilote n'envoie pas non plus `method` : restreindre à un seul moyen a un
effet de bord documenté — si le client renonce sur la page de ce moyen, Mollie
**n'envoie aucun webhook**. Le choix du moyen reste donc celui du profil Mollie.

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

### Libération des commandes impayées : pourquoi 60 minutes ne suffit pas

Le cron libère les commandes restées impayées, mais **il demande d'abord au
prestataire**. C'est une précaution que le branchement de Mollie a rendue
nécessaire, et le scénario qu'elle évite est précis.

Un paiement Mollie reste réglable bien plus longtemps qu'une heure : quinze
minutes pour iDEAL, trente pour la carte, quarante-cinq pour TWINT, une heure
pour Bancontact, deux heures pour les vouchers, six pour PayPal, **quarante-huit
pour Klarna et in3**, et **douze jours pour un virement bancaire**. Libérer le
stock au bout de soixante minutes, puis voir le client payer, c'est encaisser
pour une commande annulée dont les articles ont été vendus à quelqu'un d'autre.
La documentation de Mollie est explicite : *« It is not a good idea to predict
payment expiry »*.

À chaque passage, pour chaque commande en attente au-delà du délai :

1. le prestataire est interrogé ;
2. s'il donne une issue définitive, elle est appliquée par le chemin normal —
   même verrou, même contrôle de montant, même idempotence que le webhook ;
3. s'il répond « toujours ouvert », **rien n'est touché** ;
4. s'il est injoignable, **rien n'est touché** non plus : on ne conclut pas d'un
   silence ;
5. au bout de **14 jours**, la commande est libérée quoi qu'il arrive, et le
   dossier le dit. Sans cette borne, un prestataire durablement injoignable
   garderait du stock réservé indéfiniment.

Ce passage est aussi le **filet de rattrapage des webhooks perdus**, et il en
faut un : Mollie cesse de rappeler au bout de dix tentatives sur vingt-six
heures, et il est impossible de redéclencher un appel soi-même. C'est pourquoi le
service cron reçoit lui aussi `MOLLIE_API_KEY` : sans elle, il ne pourrait rien
demander et se contenterait d'expirer des commandes peut-être payées.

Si malgré tout un encaissement arrive sur une commande déjà libérée,
`OrderEvent` reçoit une ligne `payment.paid_after_release` qui le dit en clair,
pour que le SAV rembourse ou réapprovisionne. Un tel cas ne doit pas se réduire
à une ligne de journal.

### Remboursements

Le bouton de remboursement du back-office **écrit un remboursement en base et
rien de plus** : il n'appelle ni Mollie ni Stripe. L'écran le dit. Le
remboursement effectif se fait depuis le tableau de bord du prestataire.

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
