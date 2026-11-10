-- Numérotation continue des factures et des avoirs (une suite par type,
-- sans trou ni doublon même si deux paiements arrivent ensemble).
CREATE SEQUENCE IF NOT EXISTS "facture_numero_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "avoir_numero_seq" START 1;
