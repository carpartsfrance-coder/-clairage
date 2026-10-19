# Matrice de réception

État au 18 octobre 2026, après les étapes 1 à 11 : analyse, architecture, design
system, header final, accueil, catalogue, parcours véhicule, fiche produit,
panier, tunnel de commande, paiement, espace client, back-office, imports,
messages transactionnels, configuration Render et passe de vérification.

**La boutique n'est pas prête pour une ouverture commerciale.** Quatre points
l'empêchent, et le back-office les affiche lui-même (Administration ›
Paramètres › *État de l'installation*, également exposé par `/api/health`) :

1. **le paiement est simulé** — aucune clé de prestataire renseignée, donc
   aucun encaissement. Mollie est branché et prêt : il suffit de coller une clé
   `test_…` (ou `live_…`) dans `MOLLIE_API_KEY` ;
2. **aucun e-mail ne part réellement** — pilote `log`, tout est journalisé ;
3. **l'identité légale n'est pas renseignée** — mentions obligatoires absentes ;
4. **les données de démonstration sont encore en base** — 6 produits, 13 médias.

S'y ajoute ce qui n'est pas écrit : le back-office reste **en lecture seule sur
le catalogue produits et le SAV**, aucune facture n'est émise, les adresses
e-mail ne sont pas vérifiées et les codes promotionnels ne sont pas appliqués au
panier. Le référentiel véhicule, lui, s'écrit désormais à l'écran. Ce document
dit où en est chaque fonction, sans arrondi.

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

### Paiement

| Fonction | État | Détail |
| --- | --- | --- |
| Pilote **Mollie** | 🔸 | Écrit et testé (40 tests). Création du paiement, retour du client, webhook, relecture. **Jamais exercé avec une vraie clé** : voir plus bas |
| Pilote **Stripe** | 🔸 | Checkout hébergé, webhook signé, relecture ajoutée. Jamais exercé non plus |
| Pilote de **simulation** | ✅ | Vérifié de bout en bout. N'est jamais choisi en production |
| Choix du prestataire | ✅ | Déduit des clés présentes. Deux clés sans `PAYMENT_PROVIDER` → **refus** plutôt qu'un choix silencieux. Préfixe inconnu → refus |
| Mode test | ✅ | Déduit de la clé (`test_` / `live_`, `sk_test_` / `sk_live_`). Une clé de test **en production** est bloquante, pas un avertissement |
| Webhook | ✅ | Agnostique du prestataire. Stripe : signature vérifiée. Mollie : relecture par l'API, puisqu'il ne signe pas. Limité par adresse, corps de réponse constant |
| Retour du client | ✅ | `/api/paiement/retour` : interroge le prestataire, puis oriente. Jeton d'accès exigé comme sur les pages de commande |
| Rattrapage des webhooks perdus | ✅ | Le cron interroge le prestataire pour chaque commande en attente. Nécessaire : Mollie abandonne ses relances après 26 h et ne permet pas de les redéclencher |
| Libération du stock | ✅ | **Ne libère plus sur un délai seul.** Liste blanche de motifs ; tout le reste retient le stock ; borne dure à 14 jours |
| Contrôles avant de confirmer | ✅ | Montant, **devise**, et refus d'un encaissement au montant illisible. Chaque refus laisse une trace dans le dossier |
| Une seule commande par panier | ✅ | Une resoumission renvoie vers le paiement déjà ouvert au lieu de réserver le stock une seconde fois |
| Remboursement chez le prestataire | ⬜ | Le back-office enregistre un remboursement en base et le dit : il n'appelle ni Mollie ni Stripe |
| Capture manuelle (`authorized`) | ⬜ | Non implémentée. Le pilote n'applique une issue que sur `paid` : une autorisation seule ne confirme jamais une commande |
| `lines` et `billingAddress` Mollie | ⬜ | Non transmis. Klarna, in3, Billie, Billink, Riverty et les vouchers ne doivent donc pas être activés sur le profil |

## Espace client et SAV

| Fonction | État | Détail |
| --- | --- | --- |
| Modèle utilisateur, sessions, adresses, véhicules | ✅ | — |
| Inscription | ✅ | Mot de passe scrypt, 12 caractères minimum, refus des mots devinables et de ceux reprenant l'adresse |
| Connexion | ✅ | Message identique pour un mot de passe faux et une adresse inconnue ; hachage à vide sur adresse inconnue pour que le temps de réponse ne trahisse rien |
| Verrouillage après essais | ✅ | 10 essais puis blocage 15 minutes, plus une limitation par IP **et** par adresse visée, comptée en base |
| Récupération d'accès | ✅ | Message neutre quelle que soit l'adresse ; aucun jeton ni e-mail généré pour une adresse inconnue (vérifié) ; lien valable 1 h, à usage unique, toutes les sessions révoquées |
| Sessions | ✅ | Jeton aléatoire en cookie `httpOnly`/`SameSite=Lax`, **seul le condensé SHA-256 est en base** ; expiration et révocation filtrées en base |
| Changement de mot de passe | ✅ | Exige le mot de passe actuel, révoque les autres appareils |
| Profil | 🔸 | Prénom, nom, téléphone modifiables. **L'adresse e-mail n'est pas modifiable** et la page le dit |
| Adresses | ✅ | Création, modification, suppression, une seule adresse par défaut |
| Véhicules enregistrés | ✅ | Enregistrement du véhicule de la session, réutilisation en un clic, suppression |
| Historique et détail des commandes | ✅ | Filtre `userId` dans la requête. Vérifié : 404 sur la commande d'un autre, 200 sur la sienne |
| Rattachement d'une commande invité | ✅ | Exige la référence **et** l'adresse — s'inscrire avec l'adresse d'un autre ne suffit pas, puisque les adresses ne sont pas vérifiées |
| Suivi d'une commande invitée | ✅ | Référence + adresse, limité en fréquence, message d'échec identique que la commande existe ou non |
| Vérification de l'adresse e-mail | ⬜ | **Non implémentée.** C'est la raison pour laquelle le rattachement d'une commande exige la référence |
| Énumération de comptes à l'inscription | 🔸 | **Connue et assumée.** Connexion et récupération ne révèlent rien ; l'inscription, si : une adresse libre connecte et redirige, une adresse prise reste sur la page. La corriger suppose de ne plus connecter automatiquement et d'activer par e-mail — donc la vérification d'adresse d'abord |
| Secrets hors des journaux | ✅ | Les variables sensibles (lien de réinitialisation) passent par un champ `secrets` jamais écrit dans `EmailLog`. Testé |
| Redirection après connexion | ✅ | `?next=` résolu contre l'origine du site : `/\evil.com`, `//evil.com` et les URL absolues sont rejetés. Testé |
| Suivi des expéditions | 🔸 | Affiché quand une expédition existe ; lien transporteur seulement si l'URL est renseignée. Aucune expédition n'a encore été créée |
| Téléchargement des documents | ⬜ | La fiche commande liste les documents mais n'offre aucun bouton : la génération n'existe pas, un bouton mort serait pire |
| Demande d'annulation, de retour ou d'assistance | ⬜ | Modèle SAV en place (`SupportTicket`), aucun écran |
| Modèle SAV et retours | ✅ | Tickets, messages, notes internes séparées des messages visibles |
| Écrans SAV | ⬜ | — |

## Back-office

### Accès et droits

| Fonction | État | Détail |
| --- | --- | --- |
| Cinq rôles distincts | ✅ | ADMIN, CATALOG_MANAGER, FULFILLMENT, SUPPORT, READ_ONLY. Table unique dans `src/lib/admin/permissions.ts` |
| Contrôle d'accès | ✅ | `requireStaff(permission)` au début de chaque page **et** de chaque action : une action de serveur est un point d'entrée public, masquer le bouton ne suffirait pas |
| Navigation filtrée par rôle | ✅ | Vérifié : un préparateur ne voit ni SAV, ni Promotions, ni Paramètres |
| Refus tracé et expliqué | ✅ | `/admin/promotions` en préparateur renvoie sur le tableau de bord avec un message, et l'essai est inscrit dans `AuditLog` |
| Séparation préparer / rembourser | ✅ | Vérifié à l'écran : le préparateur voit le formulaire d'expédition et les notes, pas ceux de remboursement ni d'annulation |
| Journal des actions | ✅ | `AuditLog` avec acteur, action, entité, état avant/après et adresse IP |
| Création des comptes | ✅ | `npm run admin:create <RÔLE>`. Aucun compte par défaut dans le dépôt |
| Gestion de l'équipe depuis l'écran | ⬜ | La liste est consultable (ADMIN seulement) ; créer ou changer un rôle se fait en ligne de commande |

### Tableau de bord

| Fonction | État | Détail |
| --- | --- | --- |
| Indicateurs | ✅ | CA, panier moyen, commandes payées, remboursements, à préparer, paiements en attente, SAV ouverts, stocks faibles, ruptures |
| **Indicateurs définis** | ✅ | Chaque chiffre affiche sa définition : TTC, port inclus, remboursements déduits, période sur la date de confirmation du paiement. Exigence explicite du cahier des charges |
| Période ajustable | ✅ | 7 / 30 / 90 / 365 jours |
| Commandes en attente d'expédition | ✅ | Les plus anciennes d'abord, âge en jours signalé au-delà de 3 |
| Stocks faibles | ✅ | Les kits sont exclus du calcul : ils n'ont pas de stock propre |

### Commandes et préparation

| Fonction | État | Détail |
| --- | --- | --- |
| Recherche et filtres | ✅ | Référence, e-mail, référence d'article ; statut, paiement, préparation, période |
| Fiche commande complète | ✅ | Articles avec composition des kits, totaux, reste remboursable, paiements, expéditions, véhicule, adresses, historique complet notes internes comprises |
| Identifiant de transaction masqué | ✅ | Tronqué à l'écran : il identifie la transaction chez le prestataire |
| Expédition | ✅ | Transporteur, numéro, URL de suivi, e-mail au client optionnel. Exercé de bout en bout |
| Annulation | ✅ | Motif obligatoire, **remise en stock décochée par défaut** |
| Remboursement | 🔸 | Enregistré dans la commande avec motif, montant borné au reste remboursable, remise en stock explicite. **N'est PAS exécuté chez le prestataire** — l'écran le dit |
| Notes internes | ✅ | Jamais rendues dans l'espace client (filtre sur `actorKind`) |
| Notifications au client | ✅ | Expédition, annulation, remboursement. Simulées tant qu'aucun prestataire e-mail n'est configuré |
| Liste de préparation | ✅ | Liste agrégée à prélever, **kits décomposés en composants**, puis détail par commande |
| Exports comptables | ⬜ | Aucun. L'écran le dit au lieu d'offrir un bouton mort |

### Catalogue, véhicules, clients, SAV

| Fonction | État | Détail |
| --- | --- | --- |
| Liste du catalogue | ✅ | Recherche, statut, stock faible / rupture, prix, variantes, visuels. Les produits de démonstration portent un badge « démo » |
| Fiche produit (lecture) | ✅ | Variantes, TVA, stocks, composition des kits, compatibilités avec source et date, visuels avec leur nature, caractéristiques. Les visuels sans texte alternatif sont signalés |
| Création / modification du catalogue | ⬜ | **Aucune écriture.** Le catalogue se peuple par le script d'amorçage. L'écran le dit |
| Médiathèque | 🔸 | `/admin/medias` : dépôt d'un fichier, texte alternatif, nature du visuel, légende, suppression. L'état du stockage est affiché **avant** le formulaire, et le dépôt est désactivé quand il n'est pas opérationnel. Les médias sans texte alternatif sont comptés et signalés. **Le rattachement d'un média à une fiche n'existe pas encore depuis cet écran** |
| Véhicules | ✅ | Marques, modèles et générations : création, renommage, activation, ordre du menu, logo de la marque choisi parmi les médias (sans logo, le monogramme). Suppression offerte seulement sur une ligne vide ; sinon l'écran dit de désactiver. Le slug ne suit pas le renommage — le changer est une opération à part, sous confirmation, qui annonce la rupture des anciens liens |
| Configurations | ✅ | Équipement d'origine rattaché à une génération, finition et référence de bloc optique facultatives. Une génération sans configuration est signalée, à l'endroit où l'on y remédie |
| Compatibilités | ✅ | Saisie, modification et retrait par configuration : emplacement, référence, statut, quantité, restrictions, homologation, source et date ; accessoires exigés ajoutés et retirés. **Statut par défaut « à vérifier » ; « confirmée » refusée sans source ni date**, et aucune des deux n'est pré-remplie. **Pas de modification en série** : les chargements en nombre restent à l'import |
| Clients | ✅ | Recherche, fiche avec coordonnées, adresses, commandes, véhicules, demandes SAV et notes internes |
| Ajout de note client | ⬜ | Les notes existantes s'affichent ; l'ajout n'est pas implémenté, et l'écran le dit |
| SAV | 🔸 | File et dossier consultables, échanges affichés, notes internes distinguées. **Lecture seule** : ni réponse, ni changement de statut |
| Promotions | 🔸 | Liste consultable. **Les codes ne sont pas appliqués au panier** — l'écran l'affiche en avertissement |
| Paramètres | 🔸 | **État de l'installation** (huit contrôles, verdict d'ouverture), réglages, équipe (ADMIN seulement) et journal des actions consultables. **Aucune modification des réglages** |
| Imports | ✅ | Voir la section dédiée ci-dessous |

### Imports

| Fonction | État | Détail |
| --- | --- | --- |
| Trois formats documentés | ✅ | Produits et variantes, compatibilités, stocks. Les colonnes, exemples et fichiers types sont générés depuis le code : l'écran ne peut pas diverger |
| Lecture CSV | ✅ | Point-virgule, virgule, tabulation ; BOM retiré ; guillemets, séparateur et sauts de ligne protégés ; nombres français et anglais. 25 tests |
| Correspondance des colonnes | ✅ | Proposée automatiquement (intitulés accentués et ponctués reconnus), **corrigeable avant toute écriture**. Ce qui n'est pas reconnu est écarté, jamais deviné |
| Prévisualisation | ✅ | Chaque ligne validée et stockée avec son verdict. **Rien n'est écrit à ce stade**, et l'écran le dit |
| Détection des doublons | ✅ | Cherchés dans le fichier : la première ligne passe, les suivantes sont signalées avec le numéro de celle qui les précède. Vérifié en conditions réelles |
| Règles de création / mise à jour | ✅ | Créer et mettre à jour · Créer seulement · Mettre à jour seulement |
| Rapport par ligne | ✅ | Numéro de ligne, verdict et motif en clair : « Stock 63 → 120 (+57) », « Référence introuvable », « est un kit : son stock se calcule » |
| Pas d'écrasement muet | ✅ | Une mise à jour dit quelle valeur change et avec quoi |
| Reprise | ✅ | Écriture par lots de 50 avec curseur. Testé : 120 lignes, un lot écrit, reprise jusqu'au bout sans rejouer |
| Historique | ✅ | Tous les imports, avec leurs compteurs et leur statut |
| Garde-fous métier | ✅ | Les produits importés sont créés en **brouillon** ; une compatibilité sans statut devient « à vérifier », jamais « compatible » ; le stock d'un kit est refusé |
| Taille et type de fichier | ✅ | 5 Mo maximum, .csv ou .txt. La limite de corps des actions est relevée à 6 Mo pour que le refus soit explicite plutôt qu'une requête coupée |
| Médias importés | ⬜ | L'import n'accepte aucune image : les visuels se téléversent autrement |
| Exports | ⬜ | **Aucun.** Ni catalogue, ni commandes, ni comptabilité. Les écrans le disent au lieu d'offrir un bouton mort |

### Messages transactionnels

| Fonction | État | Détail |
| --- | --- | --- |
| Dix modèles | ✅ | Bienvenue, réinitialisation, confirmation, paiement non abouti, expédition, annulation, remboursement, SAV reçu, réponse SAV, instructions de retour |
| HTML et texte brut | ✅ | Composés depuis les mêmes blocs, donc jamais divergents. Tableaux et styles en ligne, pour s'afficher chez Outlook aussi |
| Vérifiables avant envoi | ✅ | `Administration › Messages` : déclencheur, sujet, aperçu HTML dans un cadre isolé (`sandbox=""`), version texte, variables d'exemple |
| Envoi de test | ✅ | Vers l'adresse de son choix, depuis l'écran |
| Simulation identifiée | ✅ | Bandeau permanent, et le retour d'un envoi de test dit explicitement qu'aucun message n'est parti. Vérifié : tracé `simulated=true` en base |
| Aucune promesse inventée | ✅ | Un test vérifie qu'aucun modèle n'annonce de délai ni de garantie. Pas de bouton de suivi sans URL de suivi |
| Valeurs échappées | ✅ | Un motif de SAV contenant du balisage ne peut pas l'injecter dans le message |
| Prestataire réel | ⚙️ | Pilotes MailerSend, Brevo et Resend écrits, aucun exercé : il manque `EMAIL_DRIVER`, `EMAIL_API_KEY` et `EMAIL_FROM` |
| Domaine authentifié | ⬜ | SPF, DKIM et DMARC à poser avant tout envoi réel, sans quoi les messages partiront en indésirable |

## Infrastructure Render

| Fonction | État | Détail |
| --- | --- | --- |
| `render.yaml` | 🔸 | Trois ressources décrites, variables du cron complétées ; **jamais déployé** |
| Commandes de build et de démarrage | ✅ | `npm run build` vérifié en local ; `npm start` écoute sur `$PORT` |
| `.env.example` sans secret | ✅ | Chaque variable documentée avec ce qu'elle casse si elle manque |
| Route de santé | ✅ | Teste la base, et rapporte l'état de configuration sans faire échouer le contrôle |
| **État de l'installation** | ✅ | `src/lib/readiness.ts` : huit contrôles, un seul endroit décide si la boutique peut ouvrir. Affiché dans Paramètres et dans `/api/health` |
| Adaptateur de stockage (local + S3) | ✅ | Écrit et testé (16 tests). Type reconnu sur les octets d'entête, pas sur l'extension ; **le pilote `local` est refusé en production** |
| Stockage objet réellement configuré | ⚙️ | Aucun bucket : `MEDIA_DRIVER=local`. Les variables `MEDIA_*` attendent un compte R2, B2, Scaleway ou AWS |
| Téléversement depuis le back-office | 🔸 | `/admin/medias` : dépôt, texte alternatif, nature, suppression refusée si le média est utilisé. **Le dépôt d'un fichier par le navigateur n'a pas été exercé** (les écritures le sont par les tests) |
| Travaux de fond | 🔸 | `scripts/run-jobs.ts` écrit, avec verrous et report exponentiel ; non exercé |
| Sauvegarde et restauration | 🔸 | `scripts/backup.sh` : `sauvegarder`, `verifier` (restauration d'essai dans une base jetable), `restaurer` (confirmation exigée). **Jamais exécuté sur une base de production** ; le stockage objet n'y est pas inclus |
| E-mails transactionnels | ⚙️ | Dix modèles rédigés et testés, pilote `log`, trace systématique. Aucun prestataire configuré |

## Qualité et conformité

| Fonction | État | Détail |
| --- | --- | --- |
| Responsive ordinateur et mobile | ✅ | Vérifié à 1280 et 375 px |
| Navigation au clavier | 🔸 | Vérifiée sur le menu mobile et la recherche. Non vérifiée partout |
| Contrastes | 🔸 | Travaillés (voiles de lisibilité sur les bandeaux sombres) ; aucune mesure automatique |
| Titres et métadonnées | ✅ | Un seul `h1`, sections titrées, `metadataBase`, titres par page |
| `noindex` en préproduction | ✅ | Actif tant que `NEXT_PUBLIC_DEMO_MODE` vaut `on` |
| Plan de site | ✅ | `sitemap.ts`. En préproduction : l'accueil seul. En mode ouvert : pages fixes, catégories, fiches, guides — **les fiches de démonstration en sont exclues** (`isDemo`), et une erreur de lecture ne produit pas un plan vide |
| `robots.txt` | ✅ | `robots.ts`. Tout refusé en préproduction ; en mode ouvert, refus du back-office, de l'espace client, du tunnel et de `/suivi` (dont les URL portent un jeton) |
| Données structurées | ✅ | `Product` (une offre par conditionnement, disponibilité tirée du stock réel), `BreadcrumbList`, `FAQPage`, `Organization`. **Rien n'est émis en préproduction, ni pour une fiche de démonstration.** Pas de note moyenne sans avis réels, pas de marque déduite du nom de la boutique, pas de `priceValidUntil` arbitraire |
| URL canoniques | ✅ | `alternates.canonical` sur les fiches ; `metadataBase` depuis `NEXT_PUBLIC_SITE_URL` |
| Consentement et cookies | ⬜ | À écrire quand les services réellement utilisés seront connus |
| Aucune affirmation inventée | ✅ | Aucun avis, note, volume, certification, stock tendu ni délai garanti. `Review` existe et reste vide |
| Illustrations signalées | ✅ | `Media.nature = ILLUSTRATION`, mentions reprises des maquettes |

---

## Vérifications effectuées

### Automatisées — `npm test` (307 tests, base PostgreSQL dédiée)

| Fichier | Ce qui est couvert |
| --- | --- |
| `tests/stock.test.ts` (15) | Disponibilité : stock réservé déduit, seuil d'alerte, vente à découvert ; kit divisé par la quantité du composant, composant limitant, composant facultatif ignoré, kit sans composant obligatoire ; accroche de livraison et franchise de port |
| `tests/reservation.test.ts` (13) | Réservation sur vraie base : vendable abaissé sans toucher au détenu, refus au-delà du stock, **2 commandes simultanées sur la dernière pièce → 1 seule passe**, **12 commandes sur 5 unités → exactement 5**, kit développé en composants, échec total si un composant manque, cycle réserver → payer → décompter, libération rejouée sans passer sous zéro, 20 numéros de commande concurrents tous distincts |
| `tests/orders.test.ts` (23) | Confirmation et décompte, **3 rejeux séquentiels sans effet**, **3 webhooks simultanés → un seul décompte** (vérifié : le test échoue si l'on retire le verrou), refus d'un « payé » après un échec, libération à l'échec, refus d'un montant incohérent avec trace, paiement inconnu ignoré, **seul le panier d'origine est vidé**, e-mail tracé comme simulé, expiration des commandes impayées |
| `tests/orders.test.ts`, suite | **Ajoutés avec Mollie** : un paiement encore `open` ou `pending` chez le prestataire **ne libère pas** le stock ; un prestataire injoignable non plus ; un `paid` relu confirme la commande et décompte le stock ; un `failed` relu l'annule ; au-delà de 14 jours le stock part quand même, et le dossier dit pourquoi ; un encaissement arrivé **après** la libération laisse une alerte dans le dossier ; un `paid` au montant illisible ou dans une autre devise est **refusé** ; un paiement ouvert chez un autre prestataire ne libère rien ; une resoumission du formulaire ne crée pas une seconde commande |
| `tests/order-access.test.ts` (9) | Jeton d'accès : bon jeton accepté, jeton absent, faux jeton de même longueur, préfixe correct, commande sans jeton, propriétaire connecté ; lecture du paramètre, paramètre répété, valeur vide |
| `tests/csv.test.ts` (25) | Délimiteur deviné (point-virgule, virgule, tabulation), délimiteur protégé par des guillemets, BOM retiré, saut de ligne et guillemet doublé dans un champ, fins de ligne Windows, lignes vides comptées ; nombres français et anglais, **« vide » distingué de « zéro »**, prix en centimes sans erreur de virgule flottante |
| `tests/imports.test.ts` (19) | Correspondance automatique sur intitulés accentués, aucun champ associé deux fois ; produits créés en brouillon et prix « 69,90 » lu 6990 ; erreurs par ligne sans arrêter l'import ; **doublon signalé, première ligne conservée** ; détail du changement lors d'une mise à jour ; mode création seule ; **reprise : 120 lignes, un lot puis reprise jusqu'au bout** ; compatibilité sans statut → « à vérifier », date posée seulement si confirmée ; véhicule ou référence inconnus refusés ; mouvement de stock tracé ; stock d'un kit refusé ; correspondance corrigée à la main. **Ajoutés à l'étape 11** : deux lots concurrents → un seul écrit (verrou vérifié : 2 lignes écrites une fois, pas deux), verrou relâché en fin de lot, correspondance modifiée → chiffrage et verdicts effacés, refus de modifier la correspondance d'un import terminé, plafond de 20 000 lignes refusé avant toute écriture |
| `tests/vehicles-admin.test.ts` (47) | Écriture du référentiel véhicule, sans base. Adresses : accents retirés, séparateurs écrasés, adresse dérivée du nom ou imposée, refus quand le nom n'en donne aucune ; **le chemin public s'arrête au premier niveau manquant** plutôt que de décaler la génération à la place du modèle. Périodes : fin vide = « toujours produite », fin antérieure au début refusée sans inversion, futur borné à deux ans. Compatibilités : **statut par défaut « à vérifier » et statut illisible qui y retombe**, **« confirmée » refusée sans source ni date**, **aucune date inventée**, source et date conservées sur une incompatibilité, date future ou impossible (31 février) refusée, quantité bornée, homologation jamais déduite de la compatibilité, marché par défaut FR. Suppressions : refus motivé dès qu'une compatibilité ou un enfant existe, avec le bon niveau et le bon accord |
| `tests/storage.test.ts` (16) | Formats reconnus **sur les octets d'entête** ; un PNG annoncé JPEG est reconnu PNG ; **un script renommé `.png` est refusé** ; fichier vide, fichier trop lourd (avec la taille dans le message), fichier trop court ; pilote `local` accepté hors production et **refusé en production** ; variables `MEDIA_*` manquantes nommées une à une, valeur blanche tenue pour absente ; pilote S3 jamais choisi implicitement ; écriture, URL servable, **deux dépôts du même fichier ne partagent jamais une clé** ; suppression, et suppression rejouée sans erreur |
| `tests/mollie.test.ts` (40) | Montants : deux décimales, pas de dérive flottante, aller-retour fidèle sur 2 000 valeurs, **`null` plutôt qu'une approximation** sur une forme illisible. Statuts : les quatre définitifs appliqués, `open`/`pending`/`authorized` **sans effet**, `authorized` jamais tenu pour payé, `cancelled` (deux « l ») non reconnu. Webhook : relecture par l'API, aucun appel pour un corps non exploitable, aucune signature exigée. Relecture : montant capturé retenu, 404 ignoré, 503 levé. Choix du prestataire : préfixe inconnu refusé, deux clés sans arbitrage refusées, **simulation refusée en production** |
| `tests/email-templates.test.ts` (9) | Les dix modèles rendus, sujet + HTML + texte, **aucune variable non remplacée**, HTML des valeurs échappé, montants en euros, **aucun délai garanti**, pas de bouton de suivi sans URL, message de bienvenue identique dans les deux cas |
| `tests/permissions.test.ts` (21) | Table des droits : tous les rôles couverts, aucune permission non déclarée, rien sans rôle ; ADMIN a tout ; READ_ONLY n'écrit nulle part ; **le préparateur ne peut ni rembourser ni annuler** ; le SAV ne peut pas rembourser ; le gestionnaire catalogue ne touche ni à l'argent ni à la préparation ; remboursement, annulation, paramètres et gestion de l'équipe réservés à ADMIN |
| `tests/email.test.ts` (3) | Les variables publiques sont journalisées, **les variables sensibles ne le sont jamais** (le lien de réinitialisation ne doit pas atterrir dans `EmailLog`), envoi marqué simulé sans prestataire |
| `tests/auth.test.ts` (20) | Hachage : bon et mauvais mot de passe, jamais de clair stocké, sel aléatoire, paramètres portés par le condensé, condensé corrompu refusé sans lever ; règles de robustesse (longueur, phrase sans caractère spécial acceptée, mots devinables, reprise de l'e-mail, longueur démesurée) ; sessions : seul le condensé du jeton est stocké, valide/expirée/révoquée distinguées ; jetons de réinitialisation à usage unique, expirants, jamais stockés en clair ; redirection après connexion : chemin interne accepté, URL absolue, relative au protocole et antislash rejetés |
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
12. **Espace client, parcours complet** : inscription → tableau de bord →
    enregistrement du véhicule de la session → rattachement de la commande
    invité `CMD-2026-00004` (mauvaise référence refusée, bonne acceptée) →
    déconnexion → connexion.
13. **Contrôle d'accès** : les cinq routes `/compte/*` redirigent en 307 quand on
    n'est pas connecté ; la fiche d'une commande qui n'appartient pas au client
    répond 404, la sienne 200.
14. **Non-énumération** : le message de connexion est identique mot pour mot
    pour un mot de passe faux et une adresse inconnue ; la récupération d'accès
    affiche le même message dans les deux cas, et **aucun jeton ni e-mail n'est
    créé pour une adresse inconnue** (vérifié en base).
15. **Réinitialisation** : lien reçu dans `EmailLog`, page du jeton répondant 200
    qu'il soit valide ou non (elle ne le teste pas, pour ne pas servir d'oracle),
    puis après usage : 0 session ouverte, 0 jeton réutilisable.
16. **Création d'administrateur** : `npm run admin:create` exécuté, condensé
    relu et vérifié par le module partagé.
17. **Back-office, accès** : `/admin` redirige vers la connexion sans session.
    Connecté en ADMIN : les neuf sections sont accessibles. Connecté en
    préparateur : la navigation n'affiche que six entrées, et `/admin/promotions`
    renvoie sur le tableau de bord avec un message d'explication.
18. **Back-office, séparation des rôles** : sur la même fiche de commande, le
    préparateur voit le formulaire d'expédition et les notes, mais ni
    remboursement ni annulation.
19. **Back-office, expédition réelle** : `CMD-2026-00003` expédiée par Colissimo
    avec numéro et URL de suivi → commande passée en SHIPPED/FULFILLED,
    expédition créée, `AuditLog` renseigné (`order.ship par prepa@lumera.test`),
    e-mail tracé — **et l'URL de suivi absente du journal**, puisqu'elle passe
    par `secrets`.
20. **Journal des refus** : les deux tentatives d'accès hors droits
    apparaissent dans `AuditLog` en `access.denied`.
21. **Mise en page** : l'en-tête et le pied de page de la boutique ne sont plus
    rendus sous `/admin` (vérifié dans le DOM, pas seulement à l'œil).
22. **Import réel de bout en bout**, fichier volontairement sale (6 lignes : un
    kit, une référence inconnue, un stock illisible, un doublon) :
    analyse → correspondance → validation (« 4 lignes valides, 1 en erreur,
    1 doublon. Rien n'a été écrit. ») → écriture → rapport.
    Chaque ligne a reçu son verdict et son motif. En base : les deux stocks
    attendus mis à jour, deux mouvements tracés, **le kit intact**, et
    **ACC-ADAPT-H7 resté à la valeur de la première ligne, pas à celle du
    doublon**. Journal : `import.start`, `import.preview`, `import.chunk`.
23. **Écran des messages** : les dix modèles listés avec leur déclencheur,
    aperçu HTML rendu dans un `iframe sandbox=""`, version texte et variables
    d'exemple. Un envoi de test a répondu « Aucun envoi réel : le message a été
    enregistré dans le journal avec la mention “simulé” », et la ligne
    correspondante porte bien `simulated=true` en base.

24. **Routes SEO, dans les deux modes.** En préproduction : `robots.txt` refuse
    tout, `sitemap.xml` ne déclare que l'accueil, et une fiche ne porte **aucun**
    bloc JSON-LD (`<meta name="robots" content="noindex, nofollow">` présent).
    Puis `NEXT_PUBLIC_DEMO_MODE=off` : `robots.txt` autorise et liste ses refus,
    le plan de site remonte les pages fixes, et **zéro produit ni catégorie** —
    les six fiches étant de démonstration, le filtre `isDemo` les écarte. La
    fiche porte alors `Product` et `BreadcrumbList`, avec une offre par
    conditionnement, les prix réels, `InStock` tiré du stock, et **aucune
    `aggregateRating`** puisqu'il n'existe aucun avis. Mode préproduction rétabli.
25. **`GET /api/health`** → `database: up`, `readyToOpen: false`, bloquants
    nommés (`payment`, `email`), avertissements nommés (`site-url`, `storage`).
26. **État de l'installation** : les huit contrôles rendus dans Paramètres, avec
    le verdict « la boutique n'est pas prête pour l'ouverture commerciale
    (4 points bloquants) ».
27. **Médiathèque** : écran chargé, treize médias listés avec leur nature, leur
    poids, leur clé de stockage et leur nombre de rattachements ; bandeau de
    stockage en tête ; un média utilisé par une fiche affiche « Utilisé à 1
    endroit : détachez-le d'abord » **à la place** du bouton de suppression.
28. **Séparation des rôles sur les nouveaux écrans** : en « Consultation seule »,
    `/admin/medias` répond 200 mais remplace les formulaires par « Votre rôle
    donne accès à la consultation de la médiathèque, pas à sa modification » ;
    `/admin/preparation` renvoie au tableau de bord avec `?refus=orders.fulfil`,
    et la tentative est tracée.
29. **Commande complète, à nouveau** (`CMD-2026-00005`), après les corrections :
    panier → tunnel → paiement simulé accepté → confirmation. En base :
    `stockOnHand` 95 → 94, `stockReserved` 1 → 0, `StockMovement` `order|-1`,
    commande `CONFIRMED/PAID`, `EmailLog` `commande.confirmation` en `simulated`.
30. **Prérenseignement du tunnel** : connecté, la page de commande affiche
    « Connecté avec *adresse* : cette commande sera rattachée à ce compte » et le
    champ e-mail contient cette adresse (relu dans le DOM).
31. **Sauvegarde** : `scripts/backup.sh` exécuté sans argument (aide affichée).
    `npm run build` et `tsc --noEmit` sans erreur, `npm test` à 171 tests verts.

32. **Chemin réseau réel vers Mollie.** Une clé volontairement invalide a été
    envoyée à `api.mollie.com` : la requête part, Mollie répond, et le pilote
    remonte SON message (« 400 Invalid Authorization header ») au lieu d'un code
    nu. En-têtes, URL, sérialisation du corps et lecture des erreurs sont donc
    vérifiés **contre l'API réelle**. Aucun compte Mollie n'a été créé et rien
    n'a été écrit chez eux.
33. **Clé mal recopiée, tunnel complet.** Avec cette clé invalide, une commande
    a été passée depuis le navigateur. Résultat en base : commande
    `CMD-2026-00007` en `CANCELLED/FAILED`, **stock rendu**, et un événement
    `order.payment_unavailable` qui cite le message de Mollie. L'écran affiche
    « Le paiement n'a pas pu être ouvert. Rien n'a été débité et votre panier
    est intact. »
34. **État de l'installation avec Mollie.** Le contrôle « Paiement » passe de
    « bloquant » à « à surveiller » et nomme la limite réelle : mode test, et
    adresse publique non joignable depuis l'extérieur, donc aucun webhook
    demandé. `/api/health` le reflète.
35. **La bannière de simulation disparaît** dès qu'une clé est présente : le
    tunnel ne prétend plus simuler ce qu'il ne simule pas.

---

## Écarts trouvés à l'étape 11, et corrigés

La passe de vérification a servi à cela. Quatorze écarts, dont six étaient des
**affirmations fausses** affichées au client ou à l'exploitant — la catégorie la
plus coûteuse, parce qu'elle se lit comme une information vérifiée.

| # | Écart | Correction |
| --- | --- | --- |
| 1 | `NATURE_OPTIONS` exporté depuis un module `'use client'` : la page serveur recevait une référence client, pas un tableau. **L'écran des médias ne s'affichait pas du tout** | Vocabulaire déplacé dans `src/lib/media-nature.ts`, module neutre lu des deux côtés |
| 2 | `SESSION_SECRET` déclaré dans `render.yaml` et `.env.example`, et annoncé **bloquant** par l'état de l'installation — alors qu'aucune ligne de code ne le lit (les sessions portent un jeton aléatoire dont seul le condensé est stocké) | Contrôle et variable retirés, avec la raison écrite à leur place |
| 3 | Le panier affirmait « le tunnel de commande et le paiement ne sont pas encore ouverts » : vrai à l'étape 5, faux depuis l'étape 6 | Texte conditionné à `paymentIsSimulated()` |
| 4 | La confirmation de commande affirmait « l'avis d'expédition par e-mail n'est pas encore en service » : il l'est depuis l'étape 9 (`admin-orders.ts`) | Texte conditionné à `emailIsSimulated()` : le message est préparé, l'envoi réel reste inactif |
| 5 | Les URL d'images des données structurées étaient relatives (`/demo/x.jpg`) : ignorées en silence par les validateurs | Rendues absolues |
| 6 | Les données structurées ne vérifiaient pas `isDemo` : le plan de site excluait les fiches de démonstration, le balisage non | Garde ajoutée, la même des deux côtés |
| 7 | `robots.txt` refusait `/paiement`, qui est la page publique « Moyens de paiement » et non le tunnel | Refus restreint à `/commande` |
| 8 | Un client connecté voyait un champ e-mail vide ; la commande partait sur son compte avec une autre adresse de contact, **sans que rien ne le signale** | Le tunnel nomme le compte et prérenseigne e-mail, prénom et nom |
| 9 | `npm run e2e` appelait `playwright test` : Playwright n'est pas installé et aucun test n'existe | Script retiré |
| 10 | `runImportChunk` n'avait **aucun verrou** : deux lots concurrents écrivaient les mêmes lignes deux fois, comptées deux fois | Verrou atomique (`updateMany` conditionnel) avec reprise d'un verrou orphelin après dix minutes ; deux tests de concurrence |
| 11 | `updateMapping` remettait l'import en brouillon **sans effacer** le chiffrage ni les verdicts : l'écran continuait d'afficher « n lignes valides » à propos d'une association qui n'existait plus | Chiffrage et verdicts purgés dans la même transaction ; refus sur un import en cours ou terminé |
| 12 | `listImportJobs` avalait l'erreur de base et renvoyait `[]` : l'écran affichait « Aucun import », une affirmation qu'il n'était pas en mesure de faire | Erreur propagée, et `src/app/admin/error.tsx` ajouté pour que la panne soit lisible |
| 13 | Aucun plafond de lignes : un CSV de 5 Mo (≈ 100 000 lignes) était lu en mémoire puis inséré en un seul `createMany` dans une action de serveur | Plafond de 20 000 lignes refusé **avant** toute écriture, avec le nombre et la consigne de découper ; insertion par paquets de 1 000 |
| 14 | `?nature=constructor` et `?status=constructor` remontaient la chaîne de prototypes et passaient pour des valeurs connues avant de partir en clause Prisma | `Object.hasOwn` sur les deux écrans |

Deux points annexes relevés et corrigés au passage : l'état `PAUSED`, affiché par
les écrans d'import, n'était posé par aucun code (il l'est maintenant entre deux
lots), et la limite de corps des actions de serveur était à 6 Mo alors que le
téléversement d'un média en accepte 8 — le refus applicatif, avec son message,
n'aurait jamais été atteint.

---

## Écarts trouvés en branchant Mollie, et corrigés

Le branchement d'un vrai prestataire a mis au jour des défauts que le paiement
simulé masquait — parce qu'il n'a ni latence, ni état intermédiaire, ni argent.
Une revue adversariale a confirmé les constats ci-dessous en relisant le code.

| # | Écart | Correction |
| --- | --- | --- |
| 1 | **Le stock était libéré au bout de 60 minutes sans rien demander.** Un paiement Mollie reste réglable bien plus longtemps : 48 h pour Klarna, **12 jours pour un virement**. Le client payait, et ses articles avaient été vendus à quelqu'un d'autre | Le cron **interroge le prestataire** avant de conclure. Liste blanche de motifs qui autorisent la libération ; tout le reste retient le stock ; borne dure à 14 jours, et le dossier dit que c'est faute de réponse |
| 2 | Les motifs de cette décision étaient des **phrases comparées littéralement**. Reformuler un message aurait suffi à faire repartir à la vente le stock d'une commande payée, sans que rien ne le signale | Motifs typés (`ReconcileReason`). TypeScript a immédiatement signalé une comparaison devenue fausse pendant la correction |
| 3 | **Deux soumissions du formulaire = deux commandes payables** pour le même panier, chacune réservant le stock. La clé d'idempotence du prestataire n'y pouvait rien : elle dérive de l'identifiant de commande, neuf à chaque fois | Une commande en attente sur le même panier renvoie vers **son** paiement au lieu d'en ouvrir un second |
| 4 | **Un paiement impossible à ouvrir laissait la commande en attente**, stock réservé, en affirmant au client que rien n'avait été enregistré. Chaque nouvelle tentative immobilisait un peu plus de stock : une clé mal recopiée aurait suffi à vider le catalogue | La commande est annulée, le stock rendu, et le message dit la vérité. Le motif de l'échec est consigné dans le dossier |
| 5 | Le même écran affichait **« Votre commande n'a pas été enregistrée »** au-dessus de « La commande a été enregistrée mais… » | Le titre en dur a été retiré : seul le message de l'action s'affiche |
| 6 | **La devise n'était vérifiée nulle part** : le contrôle comparait des entiers nus. 2 080 d'une autre devise valident une commande de 20,80 € | La devise voyage avec l'événement et doit correspondre |
| 7 | **Un encaissement au montant illisible confirmait la commande** : un montant nul signifiait « rien à contrôler » | Un `paid` sans montant exploitable est refusé, tracé, et laissé rattrapable |
| 8 | **Une clé de test en production n'était qu'un avertissement** : l'écran laissait croire que la boutique pouvait ouvrir alors qu'elle aurait pris des commandes sans encaisser | Bloquant en production, avertissement ailleurs |
| 9 | **Le corps de réponse du webhook était un oracle.** Le fichier affirmait en commentaire qu'un 404 renseignerait un tiers sur nos identifiants — et le corps le faisait quand même (`handled`, `reason`) | Réponse constante dans tous les cas compris. Le détail reste dans les journaux |
| 10 | **Aucun plafond sur le webhook**, dont l'URL est devinable et l'appel non signé : un tiers pouvait nous faire interroger l'API du prestataire en boucle | Limitation par adresse, large pour ne pas gêner les relances légitimes, et 429 (que le prestataire traite comme une relance) |
| 11 | **L'envoi d'e-mail retenait la réponse du webhook**, que Mollie coupe à 15 secondes en comptant le dépassement comme un échec | Attente bornée à 3 secondes ; l'envoi se poursuit ensuite en arrière-plan |
| 12 | **Une erreur sur une commande interrompait toute la passe** d'expiration, laissant les suivantes réservées | Chaque commande est traitée dans son propre `try` |
| 13 | **Stripe n'était pas interrogeable** : ses commandes étaient libérées sans vérification, et trois commentaires affirmaient que seule la simulation était dans ce cas | `fetchOutcome` ajouté pour Stripe (logique testée, réseau non exercé) |
| 14 | **L'URL de retour venait d'une variable d'environnement**, pas de l'origine réellement servie : mal réglée, elle renvoyait le client sur un autre site | Le retour suit l'origine de la requête ; seule l'URL de webhook vient de la configuration, puisqu'elle doit être publique |
| 15 | La page affirmait **« aucun montant n'a été encaissé »** sur une commande annulée, y compris quand le dossier contenait la trace d'un encaissement | La phrase n'est affichée que si aucune trace ne la contredit |
| 16 | **« Rien n'a été débité »** s'affichait au retour d'un paiement encore en cours — virement, paiement fractionné — où les fonds sont en route | Reformulé : le règlement « n'est pas encore confirmé » |
| 17 | **Une simulation était présentée comme « un prestataire en mode test »** : `isTestMode` vaut vrai dans les deux cas | Les deux cas sont distingués à l'écran |
| 18 | **Les tests dépendaient du `.env` du poste** : une clé laissée en développement changeait le pilote et donc les résultats. Le cas s'est produit pendant cette session | Les variables de paiement sont neutralisées dans la configuration de test |
| 19 | Un test nommé « tombe sur la simulation hors production, **et seulement là** » ne testait jamais la production : la garde aurait pu être retirée sans qu'il bronche | Test de production ajouté, nom corrigé |

---

## Ce qui n'a pas été vérifié

Par ordre d'importance pour une ouverture.

- **Un paiement réel, même en mode test.** Aucune clé n'est configurée sur ce
  projet. Le pilote Mollie a bien parlé à `api.mollie.com` — avec une clé
  volontairement invalide, pour éprouver le chemin réseau et le traitement des
  erreurs — mais **aucun paiement n'a jamais été créé, présenté, ni réglé**.
  Tout ce qui est écrit sur le tunnel a été vérifié avec le pilote de
  simulation. C'est le point le plus important de cette liste.

  Concrètement, il reste à faire une fois une clé `test_` en main :
  présenter l'écran de paiement, régler, revenir, et vérifier que la commande
  passe en « payée » ; forcer un refus (montant 1006,00 € puis « failed » sur
  l'écran de test) ; forcer une expiration ; et contrôler qu'un montant à deux
  décimales est bien accepté tel que nous l'écrivons — la documentation de
  Mollie ne l'impose nulle part, c'est une déduction de ses exemples.
- **Le webhook de bout en bout, chez l'un ou l'autre.** Chez Stripe, seule la
  vérification de signature est testée, hors réseau. Chez Mollie, la relecture
  est testée avec un `fetch` injecté : aucun webhook réel n'a été reçu, et il
  ne peut pas l'être en développement puisque Mollie refuse une URL non
  publique. Le vérifier demande un tunnel (ngrok) ou un déploiement.
- **La relecture Stripe** (`fetchOutcome`), ajoutée pour que ses commandes ne
  soient plus libérées sans vérification : sa logique est écrite, son
  comportement réseau n'a jamais été exercé.
- **Un envoi d'e-mail réel.** Les dix modèles sont rendus et testés, mais aucun
  message n'a quitté la machine. L'authentification du domaine (SPF, DKIM,
  DMARC) reste entièrement à faire.
- **Le déploiement Render.** Rien n'a été déployé. `render.yaml` est relu et
  complet à notre connaissance, ce qui n'est pas la même chose que vérifié.
- **La restauration d'une sauvegarde sur une base réelle.** `scripts/backup.sh
  verifier` existe précisément pour ça, mais il n'a pas été exécuté contre une
  base de production — il n'y en a pas encore.
- **Le stockage objet.** L'adaptateur S3 est écrit et testé dans sa logique
  (clés, types, refus), mais **aucun appel n'a été fait à un bucket réel** :
  aucune clé d'accès n'est configurée. Le pilote `local` est le seul exercé.
- **Le dépôt d'un fichier depuis le navigateur** sur `/admin/medias` : les
  écritures sont couvertes par les tests, pas le passage par le formulaire.
- **La vérification des adresses e-mail**, qui n'existe pas : on peut s'inscrire
  avec l'adresse de quelqu'un d'autre. C'est pour cela que le rattachement d'une
  commande exige la référence, mais il faudra la mettre en place avant
  l'ouverture.
- **La navigation au clavier** ailleurs que sur le menu mobile, la recherche et
  la galerie produit.
- **Les contrastes**, au-delà de l'œil : aucune mesure automatique.
- **Le comportement du cron Render** : `scripts/run-jobs.ts` n'a jamais tourné.
- **Les écrans sous charge** : aucune mesure de temps de réponse, et le
  catalogue de démonstration ne compte que six fiches.

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
