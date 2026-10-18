# Administration

## Premier compte

Aucun compte d'administration n'est créé par le seed, et aucun mot de passe par
défaut n'existe dans le dépôt. Le premier compte se crée à la main :

```bash
npm run admin:create            # rôle ADMIN
npm run admin:create SUPPORT    # un autre rôle
```

L'adresse et le mot de passe sont demandés dans le terminal, le mot de passe
sans écho. Seul un condensé scrypt est stocké (`scrypt$<sel>$<condensé>`), et la
création est inscrite dans `AuditLog`.

Sur Render, exécuter la commande depuis **Shell** (offres payantes) ou en local
en pointant `DATABASE_URL` sur la base de production.

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

> **État.** Les rôles sont modélisés et le compte se crée ; les écrans
> d'administration qu'ils gouvernent ne sont pas encore écrits. Voir la matrice
> de réception.

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
