-- Des emplacements portaient leur code technique comme libellé (« TURN_FRONT »,
-- « INTERIOR_DOME »), affiché tel quel aux clients. On ne touche qu'à ceux-là.
UPDATE "LightPosition" SET "label" = CASE "code"
  WHEN 'LOW_BEAM' THEN 'Feux de croisement'
  WHEN 'HIGH_BEAM' THEN 'Feux de route'
  WHEN 'FOG' THEN 'Antibrouillards'
  WHEN 'INTERIOR_DOME' THEN 'Éclairage intérieur'
  WHEN 'PLATE' THEN 'Éclairage de plaque'
  WHEN 'REVERSE' THEN 'Feux de recul'
  WHEN 'SIDELIGHT' THEN 'Veilleuses'
  WHEN 'TURN_FRONT' THEN 'Clignotants avant'
  ELSE "label" END
WHERE "label" = "code";
