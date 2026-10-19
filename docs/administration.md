# Administration

## Premier compte

Aucun compte d'administration n'est créé par le seed, et aucun mot de passe par
défaut n'existe dans le dépôt. Le premier compte se crée à la main :

```bash
npm run admin:create            # rôle ADMIN
npm run admin:create SUPPORT    # un autre rôle
```

L'adresse et le mot de passe sont demandés dans le terminal, le mot de passe
sans écho. Seul un condensé scrypt est stocké, et la création est inscrite dans
`AuditLog`. Quand l'entrée est redirigée (script, CI, conteneur sans terminal),
les réponses sont lues ligne à ligne — il n'y a alors pas d'écran à protéger.

Sur Render, exécuter la commande depuis **Shell** (offres payantes) ou en local
en pointant `DATABASE_URL` sur la base de production.

### Mots de passe

Le hachage est scrypt (`src/lib/auth/password.ts`), partagé par les clients et
l'équipe — dupliquer l'implémentation produirait deux formats incompatibles, et
un compte créé d'un côté ne pourrait plus se connecter de l'autre.

Le coût est réglé à N = 2^15 (~32 Mo, ~150 ms par vérification), **en dessous du
N = 2^17 recommandé par l'OWASP**. C'est un arbitrage assumé : à 2^17, chaque
calcul réclamerait 128 Mo, et quatre connexions simultanées satureraient une
instance de 512 Mo. La variable `AUTH_SCRYPT_LOG_N` permet de durcir sans
toucher au code dès que l'instance a la mémoire ; les comptes existants restent
valides, chaque condensé portant ses propres paramètres.

La défense contre la force brute **en ligne** n'est pas le coût du hachage mais
la limitation de fréquence : 10 essais par quart d'heure, comptés par adresse IP
et par adresse e-mail visée, plus un verrouillage du compte après 10 échecs.

### Ce qui n'est pas encore en place

- **Les adresses e-mail ne sont pas vérifiées.** On peut s'inscrire avec
  l'adresse de quelqu'un d'autre. C'est pour cela que rattacher une commande
  invité à un compte exige la référence de commande en plus de l'adresse. À
  mettre en place avant l'ouverture.
- Pas de second facteur, ni pour les clients ni pour l'équipe.

## Rôles

| Rôle | Portée prévue |
| --- | --- |
| `ADMIN` | Tout, y compris les paramètres, les rôles et les remboursements |
| `CATALOG_MANAGER` | Produits, variantes, catégories, médias, véhicules, compatibilités, imports |
| `FULFILLMENT` | Commandes, préparation, expéditions, suivi. Pas d'accès aux remboursements |
| `SUPPORT` | SAV, retours, messages clients, consultation des commandes |
| `READ_ONLY` | Consultation seule, y compris les indicateurs |

Le rôle est porté par `User.staffRole`. Un `staffRole` nul désigne un client :
la séparation client / équipe tient à ce seul champ, et aucun client ne peut
atteindre le back-office.

Le rôle décide de ce que la personne voit **et** de ce qu'elle peut faire. La
table unique est dans `src/lib/admin/permissions.ts`, et elle est couverte par
des tests : une permission ajoutée sans être retirée des rôles qui ne doivent
pas l'avoir fait échouer la suite.

Deux séparations comptent plus que les autres, et elles sont testées :

- **Préparer n'est pas rembourser.** Le rôle `FULFILLMENT` expédie, suit et
  annote. Il ne voit ni le formulaire de remboursement ni celui d'annulation,
  et les actions correspondantes le refusent.
- **Le SAV décide d'un retour, l'administration rend l'argent.** `SUPPORT`
  traite les demandes et annote les clients ; il ne rembourse pas.

Le contrôle est fait au rendu côté serveur par `requireStaff(permission)`, et
**refait dans chaque action**. Une action de serveur est un point d'entrée
public : elle est atteignable sans jamais avoir vu la page qui l'affiche.

Toute tentative d'accès hors droits est inscrite dans `AuditLog`.

> **État.** Le back-office est opérationnel sur les commandes, la préparation,
> les catégories et le référentiel véhicule (marques, modèles, générations,
> configurations et compatibilités). Le catalogue produits, le SAV, les
> promotions et les paramètres restent **consultables mais non modifiables**
> depuis l'écran. Voir la matrice de réception.

## Exploitation courante

### Retirer les données de démonstration

```bash
npm run seed -- --purge-demo
```

Supprime tout ce qui porte `isDemo` : produits, variantes, compatibilités,
médias, le véhicule de démonstration et les blocs d'accueil. Les référentiels
(TVA, emplacements lumineux, équipements, livraison, paramètres) restent.

Ensuite seulement, passer `NEXT_PUBLIC_DEMO_MODE` à `off` : le bandeau de
préproduction disparaît et le `noindex` est levé.

### Enregistrer un véhicule et ses compatibilités

*Administration › Véhicules.* Tout se saisit à l'écran, sans ligne de commande :

1. **Marque** (nom, type voiture ou moto, adresse publique, logo), puis
   **modèle**, puis **génération** (nom, phase, années). Le logo se choisit
   parmi les médias déjà déposés dans `/admin/medias` — cet écran ne téléverse
   pas. Sans logo, le menu affiche le monogramme de la marque : un logo de
   constructeur est une marque déposée, que l'exploitant n'a pas
   nécessairement le droit d'afficher.
2. **Configuration** sur la page de la génération : l'équipement d'origine, avec
   finition et référence de bloc optique facultatives. Sans configuration, une
   génération n'affiche aucune pièce — l'écran le signale.
3. **Compatibilité** : emplacement, référence, statut, quantité, restrictions,
   homologation routière, source et date de vérification ; puis les accessoires
   exigés par ce montage.

Trois règles tenues par le code, et non par la discipline de l'opérateur :

- le statut par défaut est **« à vérifier »**, jamais « confirmée » ; une valeur
  illisible y retombe aussi ;
- **« confirmée » exige une source et une date de vérification**, saisies à la
  main. Rien n'est pré-rempli : une vérification non faite ne doit pas
  s'inscrire comme faite ;
- **rien ne se supprime dès qu'une compatibilité est en jeu.** Le bouton laisse
  place à une phrase qui dit de désactiver — ce qui retire du site sans rien
  perdre, et se défait.

L'**adresse publique** (le slug) ne bouge pas quand on renomme : elle est dans
les URL `/packs/...` déjà partagées et indexées. La changer est une opération à
part, sous confirmation explicite, et l'écran annonce que les anciens liens
cesseront de répondre — ce projet ne tient aucune table de redirections.

**Ce qui reste à l'import CSV** : les chargements en nombre. L'écran est fait
pour quelques véhicules à la fois, pas pour un catalogue constructeur entier.
Les emplacements lumineux et les équipements d'origine ne se créent pas non
plus ici : ce sont des référentiels, posés par le script d'amorçage.

### Identité commerciale

Deux endroits, dans cet ordre de priorité :

1. La table `Setting` — administrable, prend le pas.
2. [`src/lib/identity.ts`](../src/lib/identity.ts) — valeurs par défaut.

Les champs d'identité légale (raison sociale, SIRET, TVA, adresse, directeur de
la publication) sont **nuls** par défaut. Tant qu'ils le sont, le pied de page
affiche un rappel explicite au lieu d'inventer une mention légale. Ils doivent
être renseignés avant toute ouverture commerciale.

### E-mails

Le pilote par défaut est `log` : rien ne part, tout est tracé dans `EmailLog`
avec `simulated = true`. C'est le bon réglage tant que le domaine n'a pas de
SPF, DKIM et DMARC valides — un envoi depuis un domaine non authentifié part en
indésirable et abîme durablement sa réputation.

Pour passer en envoi réel : renseigner `EMAIL_DRIVER` (`mailersend`, `brevo` ou
`resend`), `EMAIL_FROM` et `EMAIL_API_KEY`. Si la clé ou l'expéditeur manquent,
le code **retombe en simulation et le dit** plutôt que d'échouer en silence.

### Paiements

`PAYMENT_TEST_MODE=true` par défaut. Chaque `Payment` enregistre son
`isTestMode` : une commande payée en mode test reste identifiable après coup,
ce qui évite de la compter dans un chiffre d'affaires réel.

### Modèles de messages

Dix modèles couvrent les messages du cahier des charges : création et
récupération de compte, confirmation de commande, paiement non abouti,
expédition, annulation, remboursement, ouverture de demande SAV, réponse et
instructions de retour.

**Administration › Messages** les liste avec, pour chacun :

- son **déclencheur** — quand il part, dit en une phrase ;
- l'**aperçu HTML** rendu avec un jeu d'exemple, dans un cadre isolé ;
- la **version texte brut**, qui part avec chaque message : les filtres
  anti-spam pénalisent un HTML sans équivalent, et certains clients n'affichent
  que celui-là ;
- les **variables d'exemple** utilisées pour l'aperçu ;
- un bouton d'**envoi de test** vers l'adresse de votre choix.

Un bandeau en haut de l'écran dit si les envois partent réellement ou sont
seulement journalisés. C'est l'information la plus importante de la page :
personne ne doit croire qu'un message est parti alors qu'il a été enregistré
avec la mention « simulé ».

Les modèles n'annoncent aucun délai ni aucune garantie, et un test le vérifie :
rien dans l'application ne permettrait de les tenir.

### Journaux

| Table | Contenu |
| --- | --- |
| `AuditLog` | Actions d'administration sensibles, avec l'état avant et après |
| `EmailLog` | Tous les e-mails, réels et simulés |
| `OrderEvent` | Historique d'une commande, horodaté et attribué |
| `StockMovement` | Chaque mouvement de stock avec son motif |
| `ImportJob` / `ImportRow` | Traçabilité ligne à ligne des imports |

Les erreurs applicatives sont préfixées par domaine dans les journaux Render :
`[accueil]`, `[vehicule]`, `[recherche/suggestions]`, `[email]`, `[jobs]`,
`[health]`.
