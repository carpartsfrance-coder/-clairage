-- Stock à 10 sur tout le catalogue (demande de Killian, 8 novembre 2026).
--
-- Les fiches importées avaient 1 exemplaire en stock (20261108180000,
-- 20261108190000), d'autres 0 : un client ne pouvait pas en prendre deux, et
-- la fiche passait en rupture à la première vente. Toute référence hors
-- démonstration qui a moins de 10 exemplaires passe à 10 ; celles qui en ont
-- plus ne bougent pas (un stock réel saisi au back-office n'est pas réduit).
--
-- Chaque changement laisse un mouvement de stock (« inventaire »), visible
-- dans l'historique de la référence.

INSERT INTO "StockMovement" ("id", "variantId", "delta", "reason", "reference", "createdAt")
SELECT
  'st10' || substr(md5('stock10:' || v."id"), 1, 21),
  v."id",
  10 - v."stockOnHand",
  'inventaire',
  'stock-10-catalogue',
  NOW()
FROM "ProductVariant" v
JOIN "Product" p ON p."id" = v."productId"
WHERE NOT v."isDemo" AND NOT p."isDemo" AND v."stockOnHand" < 10
ON CONFLICT ("id") DO NOTHING;

UPDATE "ProductVariant" v
SET "stockOnHand" = 10, "updatedAt" = NOW()
FROM "Product" p
WHERE p."id" = v."productId"
  AND NOT v."isDemo" AND NOT p."isDemo"
  AND v."stockOnHand" < 10;
