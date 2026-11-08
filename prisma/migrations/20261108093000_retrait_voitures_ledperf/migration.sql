-- Retrait des photos de voitures sur fond blanc reprises de LedPerf
-- (8 novembre 2026, confirmé par l'exploitant).
--
-- Elles sont toutes rangées sous `vehicules/` dans le stockage : 408 visuels
-- distincts rattachés aux fiches en ligne, d'autres aux fiches pas encore
-- publiées. Les pages ne les montraient pas (une fiche qui a ses rendus masque
-- ses visuels « produit »), mais elles partaient dans le flux Google Shopping
-- et seraient revenues sur les fiches sans rendu.
--
-- Détachées des fiches et des générations de véhicules ; fichiers et lignes
-- Media conservés (opération réversible).
DELETE FROM "ProductMedia"
WHERE "mediaId" IN (SELECT "id" FROM "Media" WHERE "url" LIKE '%.r2.dev/vehicules/%');

UPDATE "VehicleGeneration" SET "photoMediaId" = NULL
WHERE "photoMediaId" IN (SELECT "id" FROM "Media" WHERE "url" LIKE '%.r2.dev/vehicules/%');
