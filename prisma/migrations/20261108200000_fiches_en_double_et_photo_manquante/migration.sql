-- 1. Fiches en double : même nom, même véhicule, toutes deux en vente.
--
-- Les fiches « Pack LED clignotants » remises en vente sous leur vrai nom
-- (« Centrale de clignotants LED pour… », migration 20261108170000) et
-- celles importées ensuite avec le catalogue complet (20261108180000) se
-- recouvrent sur environ 140 véhicules : la page du véhicule montrait deux
-- cartes identiques, au même prix, et Google Shopping deux articles au même
-- titre.
--
-- Règle : parmi les fiches publiées qui portent le même nom et sont
-- documentées sur exactement les mêmes configurations d'une seule génération
-- (même véhicule, même équipement d'origine), on garde la plus ancienne — son adresse est celle que Google connaît — et les autres sont
-- archivées. Une fiche archivée renvoie vers la page de son véhicule
-- (src/lib/queries/repli-fiche.ts) ; rien n'est supprimé.

DROP TABLE IF EXISTS fiche_generation;
CREATE TEMPORARY TABLE fiche_generation AS
SELECT
  p."id",
  p."name",
  p."createdAt",
  string_agg(DISTINCT c."id", ',' ORDER BY c."id") AS configurations,
  COUNT(DISTINCT c."generationId") AS generations
FROM "Product" p
JOIN "ProductVariant" v ON v."productId" = p."id"
JOIN "Fitment" f ON f."variantId" = v."id" AND f."status" <> 'INCOMPATIBLE'
JOIN "VehicleConfiguration" c ON c."id" = f."configurationId"
WHERE p."status" = 'PUBLISHED' AND p."isDemo" = false
GROUP BY p."id";

DROP TABLE IF EXISTS fiche_en_double;
CREATE TEMPORARY TABLE fiche_en_double AS
SELECT "id"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "name", configurations ORDER BY "createdAt", "id") AS rang
  FROM fiche_generation
  WHERE generations = 1
) classement
WHERE rang > 1;

UPDATE "Product"
SET "status" = 'ARCHIVED', "updatedAt" = NOW()
WHERE "id" IN (SELECT "id" FROM fiche_en_double);

DROP TABLE fiche_en_double;
DROP TABLE fiche_generation;

-- 2. « -photo-manquante » dans les adresses ------------------------------
--
-- Le suffixe, repris des pages du revendeur, était resté dans 690 adresses
-- de fiches et 55 pages de génération (le nom affiché, lui, a été corrigé
-- par 20261108150000). Il est retiré quand l'adresse sans suffixe est libre ;
-- sinon l'adresse ne change pas. Les anciennes adresses renvoient vers les
-- nouvelles (src/lib/queries/adresses-renommees.ts).

WITH cible AS (
  SELECT
    g."id",
    g."modelId",
    replace(g."slug", '-photo-manquante', '') AS slug,
    ROW_NUMBER() OVER (
      PARTITION BY g."modelId", replace(g."slug", '-photo-manquante', '')
      ORDER BY g."id"
    ) AS rang
  FROM "VehicleGeneration" g
  WHERE g."slug" LIKE '%-photo-manquante%'
)
UPDATE "VehicleGeneration" g
SET "slug" = cible.slug
FROM cible
WHERE g."id" = cible."id"
  AND cible.rang = 1
  AND NOT EXISTS (
    SELECT 1 FROM "VehicleGeneration" o
    WHERE o."modelId" = cible."modelId" AND o."slug" = cible.slug
  );

WITH cible AS (
  SELECT
    p."id",
    replace(p."slug", '-photo-manquante', '') AS slug,
    ROW_NUMBER() OVER (PARTITION BY replace(p."slug", '-photo-manquante', '') ORDER BY p."id") AS rang
  FROM "Product" p
  WHERE p."slug" LIKE '%-photo-manquante%'
)
UPDATE "Product" p
SET "slug" = cible.slug, "updatedAt" = NOW()
FROM cible
WHERE p."id" = cible."id"
  AND cible.rang = 1
  AND NOT EXISTS (SELECT 1 FROM "Product" o WHERE o."slug" = cible.slug);

-- 3. « (photo manquante...) » encore affiché sous le nom de 55 générations
-- moto : il était aussi rangé dans la phase (« Nexus 500 · 2002–2005 ·
-- (photo manquante...) » sur la page du modèle).
UPDATE "VehicleGeneration"
SET "phase" = NULLIF(btrim(regexp_replace("phase", '\s*\(photo manquante[^)]*\)', '', 'gi')), '')
WHERE "phase" ~* 'photo manquante';

UPDATE "VehicleTrim"
SET "name" = btrim(regexp_replace("name", '\s*\(photo manquante[^)]*\)', '', 'gi'))
WHERE "name" ~* 'photo manquante';

UPDATE "VehicleConfiguration"
SET "label" = NULLIF(btrim(regexp_replace("label", '\s*\(photo manquante[^)]*\)', '', 'gi')), '')
WHERE "label" ~* 'photo manquante';
