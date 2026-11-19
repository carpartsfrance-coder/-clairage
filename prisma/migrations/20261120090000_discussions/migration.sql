-- Discussions en direct : la bulle « Une question ? » des fiches produit et
-- du panier, et la boîte de réception qui lui répond dans le back-office.
--
-- Deux tables neuves, rien d'autre. Aucune table existante n'est touchée :
-- la migration ne peut ni bloquer une écriture en cours ni changer ce que
-- lisent les écrans déjà en service.

CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "pagePath" TEXT,
    "productSlug" TEXT,
    "productName" TEXT,
    "vehicleLabel" TEXT,
    "cart" JSONB,
    "visit" TEXT,
    "customerSeenAt" TIMESTAMP(3),
    "staffReadAt" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorKind" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_token_key" ON "Conversation"("token");
CREATE INDEX "Conversation_status_lastMessageAt_idx" ON "Conversation"("status", "lastMessageAt");
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
