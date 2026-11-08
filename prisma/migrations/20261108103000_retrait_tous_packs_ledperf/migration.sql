-- Retrait de TOUS les visuels `packs/` repris de LedPerf (8 novembre 2026).
--
-- Le premier retrait (20261108090000) visait les 427 visuels des fiches alors
-- en ligne. La remise en ligne des fiches sans rendu en a fait apparaître 667
-- autres, du même dossier et de la même origine (boîtes et filigrane LedPerf,
-- photos de fabricants), contrôlés en planche. Le seul visuel `packs/` propre
-- à LEDVROOM est le module de plaque avec la boîte LEDVROOM : il reste.
--
-- Fichiers et lignes Media conservés : seul le rattachement aux fiches part.
DELETE FROM "ProductMedia"
WHERE "mediaId" IN (
  SELECT "id" FROM "Media"
  WHERE "url" LIKE '%.r2.dev/packs/%'
    AND "url" NOT LIKE '%/packs/63e268fa-763b-4378-a0c7-7e376e822ea2-%'
);
