-- Fiches moto marquées « voiture » (8 novembre 2026).
--
-- L'import avait laissé `vehicleType = CAR` sur des packs dont toutes les
-- compatibilités sont sur des marques moto (Aprilia, Indian, Kawasaki…).
-- Conséquence visible depuis leur remise en ligne : les images types d'une
-- VOITURE sur des fiches moto. Le type suit désormais les compatibilités : une
-- fiche dont toutes les marques compatibles sont des marques moto devient une
-- fiche moto. Les fiches mixtes ou sans compatibilité ne changent pas.
UPDATE "Product" AS p
SET "vehicleType" = 'MOTORCYCLE', "updatedAt" = NOW()
WHERE p."vehicleType" = 'CAR'
  AND EXISTS (
    SELECT 1
    FROM "ProductVariant" v
    JOIN "Fitment" f ON f."variantId" = v."id"
    JOIN "VehicleConfiguration" c ON c."id" = f."configurationId"
    JOIN "VehicleGeneration" g ON g."id" = c."generationId"
    JOIN "VehicleModel" m ON m."id" = g."modelId"
    JOIN "VehicleMake" k ON k."id" = m."makeId"
    WHERE v."productId" = p."id" AND k."type" = 'MOTORCYCLE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ProductVariant" v
    JOIN "Fitment" f ON f."variantId" = v."id"
    JOIN "VehicleConfiguration" c ON c."id" = f."configurationId"
    JOIN "VehicleGeneration" g ON g."id" = c."generationId"
    JOIN "VehicleModel" m ON m."id" = g."modelId"
    JOIN "VehicleMake" k ON k."id" = m."makeId"
    WHERE v."productId" = p."id" AND k."type" <> 'MOTORCYCLE'
  );
