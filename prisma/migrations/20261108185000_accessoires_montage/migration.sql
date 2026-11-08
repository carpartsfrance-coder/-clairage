-- Deux accessoires de montage, vendus pour tous les véhicules comme chez
-- LedPerf (8 novembre 2026) : un kit de 4 outils de démontage en plastique et
-- une paire de gants de précision. Prix : barème du catalogue (9,90 → 8,90 ;
-- 2,90 → 1,90). Photos LEDVROOM (public/images-types/produit-outils.webp,
-- produit-gants.webp, lib/types-produit.ts).

INSERT INTO "Product" ("id", "slug", "name", "tagline", "description", "body", "status", "vehicleType", "publishedAt", "createdAt", "updatedAt")
VALUES
  ('catoutilsdemontage00001', 'kit-outils-demontage-plastique', 'Kit de 4 outils de démontage en plastique',
   'Pour déclipser sans rayer ni casser',
   'Quatre outils en plastique pour déclipser caches, boîtiers de plaque, garnitures et plafonniers sans rayer ni casser.',
   E'Quatre outils en plastique dur, de formes différentes, pour déclipser un cache de phare, un boîtier de plaque, une garniture de coffre ou un plafonnier.\n\nLe plastique ne raye pas la peinture et ne marque pas les garnitures, là où un tournevis laisse une trace — ou casse l’agrafe.\n\n## Dans le carton\n\n- 4 outils de démontage en plastique\n',
   'PUBLISHED'::"ProductStatus", 'BOTH'::"VehicleType", NOW(), NOW(), NOW()),
  ('catgantsprecision000001', 'gants-de-precision-montage', 'Gants de précision pour le montage',
   'Pour manipuler les ampoules sans traces',
   'Une paire de gants fins pour manipuler les ampoules sans laisser de traces de doigts sur le verre.',
   E'Une paire de gants fins et souples, qui laissent toute la précision des doigts.\n\nUne trace de doigt sur le verre d’une ampoule halogène ou xénon crée un point chaud qui raccourcit sa durée de vie : avec des gants, rien ne marque le verre.\n\n## Dans le carton\n\n- 1 paire de gants de précision\n',
   'PUBLISHED'::"ProductStatus", 'BOTH'::"VehicleType", NOW(), NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "ProductVariant" ("id", "productId", "sku", "name", "packaging", "priceCents", "vatRateId", "stockOnHand", "createdAt", "updatedAt")
SELECT v.id, p."id", v.sku, p."name", 'UNIT'::"Packaging", v.prix, (SELECT "id" FROM "VatRate" WHERE "code" = 'FR_STANDARD'), 1, NOW(), NOW()
FROM (VALUES
  ('cavoutilsdemontage0001', 'kit-outils-demontage-plastique', 'LV-OUTILS-DEMONTAGE-4', 890),
  ('cavgantsprecision00001', 'gants-de-precision-montage', 'LV-GANTS-PRECISION', 190)
) AS v(id, slug, sku, prix)
JOIN "Product" p ON p."slug" = v.slug
ON CONFLICT ("sku") DO NOTHING;

INSERT INTO "StockMovement" ("id", "variantId", "delta", "reason", "reference", "createdAt")
SELECT 'cam' || substr(md5('m:' || v."sku"), 1, 22), v."id", 1, 'import', 'catalogue:ledperf', NOW()
FROM "ProductVariant" v WHERE v."sku" IN ('LV-OUTILS-DEMONTAGE-4', 'LV-GANTS-PRECISION')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ProductCategory" ("productId", "categoryId", "position")
SELECT p."id", c."id", 0
FROM "Product" p CROSS JOIN "Category" c
WHERE p."slug" IN ('kit-outils-demontage-plastique', 'gants-de-precision-montage') AND c."slug" = 'accessoires'
ON CONFLICT DO NOTHING;
