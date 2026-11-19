-- Alertes instantanées des discussions : les appareils de l'équipe abonnés
-- aux notifications du navigateur.
--
-- Une table neuve, rien d'autre. Un appareil disparaît avec le compte de son
-- propriétaire (suppression en cascade) : un ancien membre de l'équipe ne
-- doit plus recevoir les questions des clients.

CREATE TABLE "StaffPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffPushSubscription_endpoint_key" ON "StaffPushSubscription"("endpoint");
CREATE INDEX "StaffPushSubscription_userId_idx" ON "StaffPushSubscription"("userId");

ALTER TABLE "StaffPushSubscription" ADD CONSTRAINT "StaffPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
