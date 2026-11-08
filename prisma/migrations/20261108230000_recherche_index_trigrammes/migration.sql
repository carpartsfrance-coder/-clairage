-- Recherche : index trigrammes sur le nom, l'accroche, la description et le
-- culot des fiches.
--
-- La recherche cherche chaque mot « n'importe où » (ILIKE '%mot%'). Sans
-- index adapté, PostgreSQL relisait toute la table des fiches — et, pour les
-- références, toute celle des variantes — à chaque recherche. Sur la base de
-- Render, dont le disque répond en 20 à 40 ms par page, une recherche
-- nouvelle prenait 15 à 50 s (mesuré le 8 novembre 2026). Avec pg_trgm, seules
-- les fiches qui contiennent les mots sont lues.
--
-- Blocs gardés : si l'extension n'est pas disponible, la migration passe sans
-- créer les index (la recherche reste juste, seulement plus lente) — elle ne
-- doit jamais bloquer un déploiement.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm indisponible, index de recherche non créés : %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Product_tagline_trgm_idx" ON "Product" USING GIN ("tagline" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Product_description_trgm_idx" ON "Product" USING GIN ("description" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Product_bulbBase_trgm_idx" ON "Product" USING GIN ("bulbBase" gin_trgm_ops);
  END IF;
END $$;

ANALYZE "Product";
