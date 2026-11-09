-- Photo propre à une option (finition claire / fumée, couleur des LED…).
ALTER TABLE "ProductVariant" ADD COLUMN "imageId" TEXT;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProductVariant_imageId_idx" ON "ProductVariant"("imageId");

-- La même option, produit allumé.
ALTER TABLE "ProductVariant" ADD COLUMN "imageAllumeeId" TEXT;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_imageAllumeeId_fkey" FOREIGN KEY ("imageAllumeeId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
