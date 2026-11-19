-- Discussions : l'article conseillé par l'équipe dans un message, affiché au
-- visiteur en carte (photo, prix, ajout au panier).
--
-- Une colonne facultative sur une table encore petite : l'ajout ne réécrit
-- pas la table et ne bloque rien. Si l'article disparaît du catalogue, le
-- message reste et perd seulement sa carte (SET NULL).

ALTER TABLE "ConversationMessage" ADD COLUMN "variantId" TEXT;

ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
