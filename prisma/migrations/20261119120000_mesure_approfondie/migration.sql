-- Mesure approfondie : temps passé, défilement, événements métier, position
-- des clics, trace du pointeur, et provenance sur la commande.
--
-- Rien ici ne change ce qui est déjà enregistré : les colonnes ajoutées sont
-- toutes facultatives, et les lignes existantes restent lisibles telles
-- quelles par les écrans de statistiques.

ALTER TABLE "VisitEvent" ADD COLUMN "name" TEXT;
ALTER TABLE "VisitEvent" ADD COLUMN "value" INTEGER;
ALTER TABLE "VisitEvent" ADD COLUMN "ms" INTEGER;
ALTER TABLE "VisitEvent" ADD COLUMN "scroll" INTEGER;
ALTER TABLE "VisitEvent" ADD COLUMN "x" INTEGER;
ALTER TABLE "VisitEvent" ADD COLUMN "y" INTEGER;
ALTER TABLE "VisitEvent" ADD COLUMN "w" INTEGER;
ALTER TABLE "VisitEvent" ADD COLUMN "h" INTEGER;

CREATE INDEX "VisitEvent_name_at_idx" ON "VisitEvent"("name", "at");
CREATE INDEX "VisitEvent_path_kind_at_idx" ON "VisitEvent"("path", "kind", "at");

CREATE TABLE "VisitTrace" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visit" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'move',
    "t" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "doc" INTEGER NOT NULL,
    CONSTRAINT "VisitTrace_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VisitTrace_visit_at_idx" ON "VisitTrace"("visit", "at");
CREATE INDEX "VisitTrace_at_idx" ON "VisitTrace"("at");

ALTER TABLE "Order" ADD COLUMN "source" TEXT;
