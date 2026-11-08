-- Compilation JIT de PostgreSQL désactivée pour la base du site.
--
-- PostgreSQL compile à la volée (JIT) toute requête dont le coût estimé
-- dépasse 100 000. Les recherches du site (« clignotant moto » : nom, accroche,
-- description, culot et références, mot par mot) dépassent ce seuil sur les
-- 30 000 fiches : la compilation coûtait bien plus que la requête elle-même.
-- En local, 2,1 s par requête avec JIT, 0,08 s sans ; sur la petite base de
-- Render, une recherche nouvelle prenait 3 à 20 s (mesuré le 8 novembre 2026).
-- Les requêtes du site sont courtes : le JIT n'y apporte rien.
--
-- Le réglage vaut pour les nouvelles connexions (le redémarrage qui suit le
-- déploiement les renouvelle). Il est posé sur la base et sur le rôle ; si
-- l'un des deux est refusé, la migration continue — elle ne doit jamais
-- bloquer un déploiement.

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET jit = off', current_database());
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'jit (base) : réglage refusé, ignoré : %', SQLERRM;
END $$;

DO $$
BEGIN
  EXECUTE format('ALTER ROLE %I SET jit = off', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'jit (rôle) : réglage refusé, ignoré : %', SQLERRM;
END $$;
