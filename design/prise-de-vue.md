# Prise de vue — ce qu'il faut photographier, et comment

État au 25 octobre 2026. Ce document existe parce que **aucune image du site
n'est une photographie qui nous appartienne.**

---

## 1. Ce qui est en ligne aujourd'hui

### Les visuels du site : des illustrations générées

| Emplacement | Fichier | Mention portée |
|---|---|---|
| Bandeau d'ouverture | `/visuels/hero-golf-reperes.webp` | « Illustration de rendu. » |
| Section « Le détail qui change tout » | `/visuels/comparatif-route.webp` | « Simulation illustrative » peinte dans l'image, plus la mention du bloc |
| Les six univers | `/demo/univers-*.jpg`, `indicator.png` | « — illustration » dans le texte alternatif |

Ces images sont honnêtement étiquetées, mais elles restent des images de
synthèse. Un client qui achète un kit ne voit nulle part ce que le produit
donne réellement.

### Les visuels du catalogue : de vraies photos, mais pas les nôtres

- **2 311** entrées média sous `/uploads`, couvrant **9 902 produits sur 9 904**.
- Présents sur ce poste : 1 147 fichiers dans `packs/`, 30 dans `produits/`.
- **Sur 24 fichiers tirés au hasard dans les deux dossiers, le filigrane
  `LedPerf.com` est visible sur la quasi-totalité**, et plusieurs montrent en
  plus des boîtes à la marque *LedPERF* ou des logos *CREE*.

Ce sont les photographies d'un concurrent. Retirer le filigrane ne les rendrait
pas nôtres : le filigrane n'est pas le problème, c'est le symptôme. Réutiliser
le catalogue photographique d'un tiers engage la responsabilité de l'éditeur
indépendamment de tout marquage.

**C'est le point bloquant le plus sérieux avant une ouverture commerciale.**

---

## 2. Les règles de prise de vue, avant la liste

Un avant/après se joue entièrement sur ces cinq points. Les ignorer produit une
comparaison fausse même avec de vraies photos.

1. **Mode manuel (M).** En automatique, l'appareil compense : il assombrit la
   LED et éclaircit l'halogène, et les deux finissent par se ressembler. Fixez
   l'ouverture, la vitesse et l'ISO, puis **n'y touchez plus entre les deux
   prises**.
2. **Balance des blancs fixe**, lumière du jour (≈ 5500 K). En automatique,
   l'appareil neutralise le jaune de l'halogène — c'est-à-dire exactement ce
   qu'on cherche à montrer.
3. **Trépied, et on n'y touche pas.** Même cadrage au pixel près entre les deux
   prises : c'est ce qui rend le comparatif lisible et incontestable.
4. **Même focale.** Aucun zoom entre les deux prises.
5. **Les deux prises à la suite**, la même nuit, au même endroit, sans que la
   lumière ambiante ait changé. Pas un soir pour l'halogène et un autre pour la
   LED.

Format : RAW si l'appareil le permet, sinon JPEG de qualité maximale. Un
téléphone récent en mode manuel (ou « pro ») convient.

> Dès qu'une paire respecte ces règles, la mention « simulation de rendu »
> tombe avec elle. C'est la seule façon de la retirer.

---

## 3. Ce qu'il faut photographier, par ordre d'utilité

### Priorité 1 — La paire phares, de nuit

Remplace l'image la plus vue du site et rétablit l'avant/après.

- Véhicule de face, légèrement décalé, trépied à hauteur de phare.
- Rue sombre, fond non uniforme (un bâtiment éclairé au loin donne de la
  profondeur). Chaussée mouillée si possible : les reflets servent le sujet.
- **Prise A** : halogène d'origine allumé.
- **Prise B** : kit LED monté, rien d'autre changé.
- Cadrage large (la voiture entière) *et* un plan serré sur un seul phare.

### Priorité 2 — La paire habitacle

- Depuis la banquette arrière, vers l'avant, portes fermées, de nuit.
- **Prise A** : plafonnier d'origine. **Prise B** : plafonnier LED.
- Même pose, même trépied. Attention : l'habitacle est sombre, prévoyez une
  pose longue — raison de plus pour le trépied.

### Priorité 3 — Les paires plaque et recul

- Arrière du véhicule, de nuit, plaque lisible.
- Éclairage de plaque d'origine, puis LED. Idem pour les feux de recul,
  marche arrière engagée, véhicule en sécurité.

### Priorité 4 — Les produits eux-mêmes

9 904 fiches ne se photographient pas en un week-end. Commencez par les
références les plus vendues, sur fond blanc uni, lumière diffuse, à plat ou sur
un petit support. Une boîte à lumière d'entrée de gamme et un téléphone
suffisent pour ce type de prise.

Photographiez **la référence telle qu'elle est livrée** : l'ampoule, son
support, son connecteur, et l'emballage si c'est le vôtre. Jamais l'emballage
d'un autre.

---

## 4. Une fois les fichiers livrés

Déposez-les tels quels, sans retouche de luminosité ni de couleur — c'est la
retouche qui transforme un comparatif en argument fabriqué. Le recadrage, le
redimensionnement et la conversion se font ensuite côté site.

### La définition, pour les visuels pleine largeur

**3840 px de large pour tout visuel qui occupe toute la largeur de la page**,
bandeau d'ouverture en tête. Ce n'est pas un confort : un écran à double
densité réclame deux pixels pour un, donc 2880 px sur une fenêtre de 1440 et
3840 sur une fenêtre de 1920. En dessous, l'image est étirée et paraît floue
quelle que soit sa qualité de compression.

Le site n'a rien à régler pour en profiter : `next/image` réclame déjà la
variante 3840 px et se contente de ce que le fichier contient.

**Mais ne remplacez pas un fichier sous le même nom.** L'optimiseur garde ses
versions retaillées pendant quatre heures (`minimumCacheTTL`) et ne sait pas
qu'un fichier a changé : Next n'offre aucun moyen de purger ce cache. Vérifié
en remplaçant ce visuel — après redémarrage du serveur, il continuait de
servir l'ancienne image, jusqu'à suppression manuelle de `<distDir>/cache/images`.

Donnez donc au nouveau fichier **un nom neuf** (`hero-golf-reperes-3840.webp`),
et changez le chemin dans `prisma/demo-data.ts` puis en base avec
`npm run contenus:accueil -- hero`. Le cache est alors contourné par
construction, et l'ancien fichier reste disponible le temps de comparer.

### Le palliatif en place sur le bandeau d'ouverture

`/visuels/hero-golf-reperes.webp` ne fait que **2000 px** — c'est la seule
version disponible. À 1440 px de fenêtre sur écran double densité, il est donc
étiré d'un facteur 1,44.

Il a pour cette raison été **pré-accentué** avant dépôt, ce qui est l'exception
à la règle de non-retouche ci-dessus : l'accentuation ne corrige pas un
comparatif, elle compense un étirement. Masque flou de rayon 1,0, intensité
90 %, seuil 3, puis WebP qualité 93 :

```
UnsharpMask(radius=1.0, percent=90, threshold=3)
```

Le seuil est ce qui rend l'opération sans danger : il laisse les aplats
intacts — mesuré sur la paroi sombre à gauche, l'écart-type reste à 1,61 avant
comme après, donc aucun grain ajouté — et ne travaille que sur les contours.
Mesurée après étirement, la variance du laplacien passe de 52 à 112.

**Ce palliatif saute le jour où une source 3840 px arrive.** Accentuer puis
agrandir ne remplace pas des pixels qui n'ont jamais été capturés.

Les mentions « illustration » et « simulation de rendu » seront retirées
emplacement par emplacement, à mesure que chaque visuel de synthèse est
remplacé par une photographie — et seulement à ce moment-là.
