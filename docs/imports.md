# Imports et exports

## Ce que l'import garantit

Quatre choses, et elles existent toutes parce que l'inverse arrive :

1. **Rien n'est écrit avant d'avoir été validé.** Le fichier est lu, les
   colonnes sont associées, chaque ligne est vérifiée — et seulement ensuite
   l'écriture est lancée, à la main.
2. **Une ligne fautive ne bloque pas les autres.** Chaque ligne est écrite dans
   sa propre transaction. Un import de 3 000 lignes dont 12 sont mauvaises en
   écrit 2 988 et rapporte les 12, avec leur numéro de ligne et leur motif.
3. **Pas d'écrasement muet.** Quand une mise à jour change une valeur, le
   rapport dit laquelle : `priceCents : 1990 → 2450`. « 412 lignes mises à
   jour » ne permet de rien vérifier.
4. **Une interruption ne coûte qu'un lot.** L'écriture avance par paquets de 50
   et enregistre un curseur. Reprendre repart de là, sans rejouer ce qui est
   déjà écrit.

## Le déroulé

```
Fichier .csv
    │
    ├─ 1. Analyse ........... colonnes lues, correspondance PROPOSÉE
    │                          (rien n'est écrit)
    ├─ 2. Correspondance .... vous corrigez ce que la machine a deviné
    ├─ 3. Validation ........ chaque ligne vérifiée, doublons repérés
    │                          (rien n'est écrit)
    ├─ 4. Écriture .......... par lots de 50, curseur enregistré
    └─ 5. Rapport ........... verdict et motif, ligne par ligne
```

La correspondance automatique **propose**, elle ne décide pas. Elle reconnaît
les intitulés accentués et ponctués (« Prix TTC (€) » → prix), mais ce qu'elle
ne reconnaît pas est écarté plutôt que deviné : une colonne « prix » remplie
avec des références ne se répare pas après coup.

## Le fichier

- **Format** : CSV. Séparateur attendu : le **point-virgule** (celui des
  tableurs francophones). La virgule, la tabulation et la barre verticale sont
  reconnues automatiquement.
- **Encodage** : UTF-8. Le BOM qu'ajoute Excel est retiré — sans quoi il se
  colle au premier nom de colonne et fait échouer la correspondance.
- **Guillemets** : un champ entre guillemets peut contenir le séparateur, des
  sauts de ligne et des guillemets doublés (`""`).
- **Nombres** : `9,90`, `9.90`, `1 234,56` et `1,234.56` sont tous compris. Une
  cellule **vide n'est pas un zéro** : elle laisse la valeur existante
  inchangée, ou fait échouer la ligne si le champ est obligatoire.
- **Taille** : 5 Mo au maximum.

## Les trois formats

Les colonnes exactes, avec leurs intitulés reconnus et un exemple de fichier
téléchargeable, sont affichées dans **Administration › Imports**. Elles sont
générées depuis `src/lib/imports/definitions.ts`, de sorte que l'écran ne peut
pas diverger du code.

### Produits et variantes

Une ligne par **conditionnement** (par SKU). Les colonnes du produit se
répètent à l'identique sur chacune de ses lignes.

Obligatoires : identifiant produit, nom, référence (SKU), nom du
conditionnement, prix TTC.

> Les produits importés sont créés en **brouillon**. Un import ne met jamais
> directement en vente : la publication reste une décision.

### Compatibilités

Une ligne par compatibilité : véhicule × emplacement × référence.

Obligatoires : marque, modèle, génération, équipement d'origine, emplacement,
référence.

> **Une ligne sans statut explicite est importée en « à vérifier », jamais en
> « compatible ».** Une donnée manquante ne vaut pas confirmation. De même, une
> date de vérification n'est posée que sur une compatibilité confirmée :
> ailleurs, elle laisserait croire qu'un « à vérifier » a été vérifié.

La configuration véhicule (génération + équipement) est créée si elle manque.
En revanche, un véhicule, un emplacement ou une référence inconnus font
**échouer la ligne** : l'import ne crée pas de véhicule au passage.

### Stocks

Une ligne par référence. Met à jour le stock détenu et le seuil d'alerte. Ne
crée rien.

> Le stock d'un **kit** n'est pas modifiable : il se calcule depuis ses
> composants. Les lignes visant un kit sont signalées et ignorées, pas écrites.

Chaque changement de stock écrit un mouvement (`StockMovement`, motif
`import`), pour que l'inventaire reste explicable.

## Les trois modes d'écriture

| Mode | Effet |
| --- | --- |
| **Créer et mettre à jour** | Crée ce qui manque, met à jour ce qui existe. Le mode par défaut. |
| **Créer seulement** | Ne touche à rien d'existant. À utiliser pour un ajout sans risque. |
| **Mettre à jour seulement** | Ne crée rien. À utiliser pour une révision de prix ou de stock. |

## Doublons

Les doublons sont cherchés **dans le fichier**, sur la clé qui identifie une
ligne (le SKU pour les produits et les stocks ; véhicule + emplacement +
référence pour les compatibilités).

Quand deux lignes portent la même clé, **la première passe et la seconde est
signalée**, avec le numéro de la ligne qui l'a précédée. Les écrire toutes les
deux reviendrait à laisser la seconde écraser la première sans que personne le
voie.

## Reprise

Un import interrompu — onglet fermé, déploiement, panne — reste en l'état. Sa
page le montre et le bouton « Écrire le prochain lot » reprend au curseur.
Rien n'est réécrit.

## Exports

**Aucun export n'est implémenté.** Ni le catalogue, ni les commandes, ni la
comptabilité. Les écrans concernés le disent au lieu d'afficher un bouton qui
ne ferait rien.

C'est un manque assumé à ce stade, pas un oubli : il figure dans la matrice de
réception.
