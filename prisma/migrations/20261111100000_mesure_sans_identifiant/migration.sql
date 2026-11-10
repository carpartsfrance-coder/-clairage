-- Mesure d'audience : plus aucun identifiant dans ce qui est déjà enregistré.
-- Mêmes règles que src/lib/mesure-chemins.ts, appliquées une fois aux lignes
-- écrites avant cette version : numéro de commande, de facture et jeton de
-- mot de passe retirés des chemins, textes cliqués personnels effacés.

UPDATE "VisitEvent" SET "path" = regexp_replace("path", '^/commande/[^/]+', '/commande/…')
WHERE "path" ~ '^/commande/[^/]+' AND "path" NOT LIKE '/commande/…%';
UPDATE "VisitEvent" SET "path" = regexp_replace("path", '^/compte/commandes/[^/]+', '/compte/commandes/…')
WHERE "path" ~ '^/compte/commandes/[^/]+' AND "path" NOT LIKE '/compte/commandes/…%';
UPDATE "VisitEvent" SET "path" = regexp_replace("path", '^/documents/[^/]+', '/documents/…')
WHERE "path" ~ '^/documents/[^/]+' AND "path" NOT LIKE '/documents/…%';
UPDATE "VisitEvent" SET "path" = regexp_replace("path", '^/mot-de-passe-oublie/[^/]+', '/mot-de-passe-oublie/…')
WHERE "path" ~ '^/mot-de-passe-oublie/[^/]+' AND "path" NOT LIKE '/mot-de-passe-oublie/…%';

UPDATE "VisitEvent" SET "target" = regexp_replace("target", '^/commande/[^/]+', '/commande/…')
WHERE "target" ~ '^/commande/[^/]+' AND "target" NOT LIKE '/commande/…%';
UPDATE "VisitEvent" SET "target" = regexp_replace("target", '^/compte/commandes/[^/]+', '/compte/commandes/…')
WHERE "target" ~ '^/compte/commandes/[^/]+' AND "target" NOT LIKE '/compte/commandes/…%';
UPDATE "VisitEvent" SET "target" = regexp_replace("target", '^/documents/[^/]+', '/documents/…')
WHERE "target" ~ '^/documents/[^/]+' AND "target" NOT LIKE '/documents/…%';
UPDATE "VisitEvent" SET "target" = regexp_replace("target", '^/mot-de-passe-oublie/[^/]+', '/mot-de-passe-oublie/…')
WHERE "target" ~ '^/mot-de-passe-oublie/[^/]+' AND "target" NOT LIKE '/mot-de-passe-oublie/…%';

-- Un libellé sur une page vue n'est plus que l'étape signalée par la page.
UPDATE "VisitEvent" SET "label" = NULL WHERE "kind" = 'page' AND "label" IS NOT NULL;
UPDATE "VisitEvent" SET "label" = NULL
WHERE "kind" = 'click' AND "label" IS NOT NULL AND (
  "label" LIKE '%@%'
  OR ("path" ~ '^/(compte|commande|connexion|inscription|mot-de-passe-oublie|suivi|contact|documents|verification)(/|$)'
      AND "label" ~ '[0-9]{4}')
);
