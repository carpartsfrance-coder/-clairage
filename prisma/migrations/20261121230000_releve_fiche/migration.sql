-- Relevé des caractéristiques du même produit chez LedPerf (voir ReleveFiche dans schema.prisma).
CREATE TABLE "ReleveFiche" (
    "productId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "donnees" JSONB NOT NULL,
    "releveLe" TIMESTAMP(3) NOT NULL,
    "confiance" TEXT NOT NULL,

    CONSTRAINT "ReleveFiche_pkey" PRIMARY KEY ("productId")
);

CREATE INDEX "ReleveFiche_source_idx" ON "ReleveFiche"("source");

ALTER TABLE "ReleveFiche" ADD CONSTRAINT "ReleveFiche_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
