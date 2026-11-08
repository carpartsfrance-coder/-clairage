-- Fautes de français laissées par l'import dans les textes des fiches
-- (8 novembre 2026). Elles apparaissent sur les cartes, les fiches et dans le
-- flux Google Shopping, et une faute sur une boutique inconnue coûte de la
-- confiance :
--   « Pour les éclairage de plaque »  → « Pour l’éclairage de plaque »
--   « pour les habitacle »            → « pour l’habitacle »
--   « de Opel », « de Audi »…         → « d’Opel », « d’Audi »…
UPDATE "Product"
SET
  "tagline" = regexp_replace(
    regexp_replace(
      regexp_replace("tagline", '([Pp])our les (éclairage de plaque|habitacle)', '\1our l’\2', 'g'),
      ' de (Audi|Opel|Alfa Romeo|Abarth|Aston Martin|Alpine|Infiniti|Isuzu|Iveco|Aprilia|Indian|Acura)\M', ' d’\1', 'g'
    ),
    '  +', ' ', 'g'
  ),
  "description" = regexp_replace(
    regexp_replace(
      regexp_replace("description", '([Pp])our les (éclairage de plaque|habitacle)', '\1our l’\2', 'g'),
      ' de (Audi|Opel|Alfa Romeo|Abarth|Aston Martin|Alpine|Infiniti|Isuzu|Iveco|Aprilia|Indian|Acura)\M', ' d’\1', 'g'
    ),
    '  +', ' ', 'g'
  ),
  "updatedAt" = NOW()
WHERE "tagline" ~ '([Pp])our les (éclairage de plaque|habitacle)| de (Audi|Opel|Alfa Romeo|Abarth|Aston Martin|Alpine|Infiniti|Isuzu|Iveco|Aprilia|Indian|Acura)\M'
   OR "description" ~ '([Pp])our les (éclairage de plaque|habitacle)| de (Audi|Opel|Alfa Romeo|Abarth|Aston Martin|Alpine|Infiniti|Isuzu|Iveco|Aprilia|Indian|Acura)\M';
