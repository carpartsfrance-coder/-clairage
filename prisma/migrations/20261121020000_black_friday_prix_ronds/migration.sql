-- Black Friday 2026 : prix ronds et remises rondes.
--
-- Demande de l'exploitant (21 novembre 2026) : les prix finissent par un zéro
-- (8,40 € et non 8,44 €) et les remises sont des chiffres ronds (−20 %, −25 %,
-- −30 %…). La migration 20261120160000_black_friday_prix avait posé chaque
-- variante 1 € sous le prix promo de LedPerf : prix et pourcentages tombaient
-- au centime près (8,44 €, −23 %).
--
-- Pour chaque variante soldée par cette campagne (prix barré inchangé depuis) :
--   1. Le prix promo actuel reste un plafond : on ne remonte pas au-dessus de
--      « 1 € sous LedPerf ».
--   2. On prend la plus petite remise ronde (5, 10, 15… 50 %) dont le prix,
--      arrondi à la dizaine de centimes INFÉRIEURE, tient sous ce plafond. La
--      remise réelle est donc toujours au moins celle qu'on affiche.
--   3. Mêmes planchers que la campagne : jamais sous la moitié du prix barré,
--      ni sous le prix d'achat TTC. Quand un plancher empêche toute remise
--      ronde sous le plafond (le prix promo était déjà au plancher), le prix
--      devient ce plancher arrondi à la dizaine SUPÉRIEURE, et la fiche affiche
--      la remise ronde juste en dessous de la remise réelle (lib/remise.ts).
--
-- Le prix barré ne bouge pas : c'est le prix pratiqué avant la campagne, la
-- référence exigée pour annoncer une réduction. "PrixAvantPromotion" non plus :
-- le retour en arrière décrit dans la migration précédente reste valable.

CREATE TEMP TABLE "_prix_ronds" AS
WITH base AS (
  SELECT
    v."id",
    v."priceCents" AS "plafond",
    v."compareAtCents" AS "barre",
    GREATEST(
      CEIL(v."compareAtCents"::numeric * 0.5)::int,
      COALESCE(CEIL(v."costCents"::numeric * 1.2)::int, 0)
    ) AS "plancher"
  FROM "ProductVariant" v
  JOIN "PrixAvantPromotion" a
    ON a."variantId" = v."id" AND a."campagne" = 'black-friday-2026'
  WHERE v."compareAtCents" = a."priceCents"
    AND v."compareAtCents" > v."priceCents"
),
grille AS (
  SELECT DISTINCT ON (b."id")
    b."id",
    (FLOOR(b."barre"::numeric * (100 - r) / 1000) * 10)::int AS "prix"
  FROM base b
  CROSS JOIN generate_series(5, 50, 5) AS r
  WHERE (FLOOR(b."barre"::numeric * (100 - r) / 1000) * 10)::int BETWEEN b."plancher" AND b."plafond"
  ORDER BY b."id", r
)
SELECT
  b."id",
  b."plafond" AS "ancien",
  COALESCE(g."prix", (CEIL(GREATEST(b."plancher", b."plafond")::numeric / 10) * 10)::int) AS "nouveau",
  b."barre"
FROM base b
LEFT JOIN grille g ON g."id" = b."id";

-- Rien qui annulerait la remise : un prix arrondi qui rejoindrait le prix
-- barré garde son prix actuel.
DELETE FROM "_prix_ronds" WHERE "nouveau" >= "barre" OR "nouveau" <= 0 OR "nouveau" = "ancien";

UPDATE "ProductVariant" v
SET "priceCents" = n."nouveau", "updatedAt" = CURRENT_TIMESTAMP
FROM "_prix_ronds" n
WHERE n."id" = v."id";

DROP TABLE "_prix_ronds";
