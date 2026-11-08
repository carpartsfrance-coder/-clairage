-- Remise en ligne des fiches retirées faute de photos (8 novembre 2026).
--
-- Le 7 novembre, la bascule n'avait laissé en ligne que les fiches dont les
-- rendus du véhicule étaient prêts. Les autres sont passées en brouillon en
-- gardant leur date de publication (`publishedAt`) : c'est elle qui les
-- distingue d'une fiche jamais publiée. Elles reviennent en ligne avec les
-- images types de leur emplacement (src/lib/images-types.ts), décidées avec
-- l'exploitant.
--
-- Seulement si la fiche :
--   - a déjà été en ligne (publishedAt renseigné) et n'est pas de démonstration ;
--   - est pour une voiture (les images types montrent une voiture) ;
--   - a un emplacement qui a ses images types ;
--   - passe les contrôles bloquants du back-office (lib/admin/completeness.ts) :
--     une rubrique, au moins une variante active, et toutes ses variantes
--     actives avec un prix et un taux de TVA.
UPDATE "Product" AS p
SET "status" = 'PUBLISHED', "updatedAt" = NOW()
WHERE p."status" = 'DRAFT'
  AND p."publishedAt" IS NOT NULL
  AND p."isDemo" = false
  AND p."vehicleType" = 'CAR'
  AND p."slug" ~ '^pack-led-(phares|antibrouillards|feux-de-route|veilleuses|feux-de-jour|clignotants|eclairage-de-plaque|feux-de-recul|habitacle)-'
  AND EXISTS (SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p."id")
  AND EXISTS (
    SELECT 1 FROM "ProductVariant" v
    WHERE v."productId" = p."id" AND v."active" AND v."priceCents" > 0 AND v."vatRateId" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ProductVariant" v
    WHERE v."productId" = p."id" AND v."active" AND (v."priceCents" <= 0 OR v."vatRateId" IS NULL)
  );

-- Après une bascule de statuts en masse, les statistiques du planificateur
-- décrivent l'ancien catalogue (mesuré le 7 novembre : 7 ms → 2,6 s sur la
-- requête des véhicules visibles). On les remet à jour tout de suite.
ANALYZE;
