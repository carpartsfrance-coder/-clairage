-- AddForeignKey
ALTER TABLE "VehicleMake" ADD CONSTRAINT "VehicleMake_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
