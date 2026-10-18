-- AlterTable
ALTER TABLE "LightingEquipment" ADD COLUMN     "hint" TEXT,
ADD COLUMN     "illustrationId" TEXT;

-- AddForeignKey
ALTER TABLE "LightingEquipment" ADD CONSTRAINT "LightingEquipment_illustrationId_fkey" FOREIGN KEY ("illustrationId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
