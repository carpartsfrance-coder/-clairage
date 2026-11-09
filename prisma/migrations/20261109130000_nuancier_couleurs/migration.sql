-- Nuancier des couleurs de lumière (9 novembre 2026, demande de l'exploitant).
--
-- Une image commune : le même phare en 4300K, 5000K, 6000K et 8000K, avec la
-- légende de chaque teinte. Ajoutée en fin de galerie de chaque fiche qui
-- propose au moins deux températures de couleur (kits xénon, ampoules…),
-- et seulement si la fiche a déjà sa photo produit : sinon elle prendrait la
-- place de la couverture. Fichier : public/visuels/nuancier-couleurs.webp.

INSERT INTO "Media" ("id", "storageKey", "url", "mimeType", "width", "height", "alt", "nature", "caption", "createdAt")
VALUES ('mednuancier0000000000001', 'visuels/nuancier-couleurs', '/visuels/nuancier-couleurs.webp', 'image/webp', 1600, 1600,
  'Comparatif des couleurs de lumière : 4300K blanc chaud, 5000K blanc pur, 6000K blanc froid, 8000K blanc bleuté',
  'ILLUSTRATION'::"MediaNature", 'Visuel d’illustration : rendu indicatif des températures de couleur.', NOW())
ON CONFLICT ("storageKey") DO NOTHING;

INSERT INTO "ProductMedia" ("id", "productId", "mediaId", "role", "position")
SELECT 'pmnua' || substr(md5(p."id"), 1, 20), p."id", m."id", 'PRODUCT'::"MediaRole",
  (SELECT COALESCE(MAX(pm."position"), 0) + 1 FROM "ProductMedia" pm WHERE pm."productId" = p."id")
FROM "Product" p
JOIN "Media" m ON m."storageKey" = 'visuels/nuancier-couleurs'
WHERE p."status" = 'PUBLISHED'
  AND (SELECT COUNT(DISTINCT substring(v."name" from '(4300|5000|6000|8000) ?K'))
       FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."active") >= 2
  AND EXISTS (SELECT 1 FROM "ProductMedia" pm WHERE pm."productId" = p."id" AND pm."role" = 'PRODUCT')
ON CONFLICT DO NOTHING;
