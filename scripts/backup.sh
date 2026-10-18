#!/usr/bin/env bash
#
# Sauvegarde et restauration de la base LUMERA.
#
# Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est un
# fichier. La commande `verifier` ci-dessous restaure le dump dans une base
# jetable et compte les lignes, pour que l'essai soit fait AVANT d'en avoir
# besoin.
#
#   ./scripts/backup.sh sauvegarder [URL]   crée un dump horodaté
#   ./scripts/backup.sh verifier FICHIER    restaure dans une base jetable
#   ./scripts/backup.sh restaurer FICHIER URL   restaure pour de vrai (confirme)
#
# L'URL par défaut est DATABASE_URL. Pour la production, prendre l'« External
# Database URL » dans Render › lumera-db › Connect.

set -euo pipefail

DOSSIER="${BACKUP_DIR:-./sauvegardes}"
commande="${1:-aide}"

sauvegarder() {
  local url="${1:-${DATABASE_URL:-}}"
  [ -n "$url" ] || { echo "Aucune URL de base. Passez-la en argument ou définissez DATABASE_URL." >&2; exit 1; }

  mkdir -p "$DOSSIER"
  local fichier="$DOSSIER/lumera-$(date +%Y%m%d-%H%M%S).dump"

  echo "Sauvegarde vers $fichier…"
  # --format=custom : compressé, et restaurable table par table au besoin.
  pg_dump --no-owner --no-privileges --format=custom "$url" > "$fichier"

  local taille
  taille=$(du -h "$fichier" | cut -f1)
  echo "Terminé : $fichier ($taille)"
  echo
  echo "⚠  Le stockage objet n'est PAS inclus. Une base restaurée sans ses"
  echo "   médias affiche des fiches sans photo. Sauvegardez le bucket à part :"
  echo "   rclone sync <bucket> <bucket-de-sauvegarde>"
}

verifier() {
  local fichier="${1:-}"
  [ -f "$fichier" ] || { echo "Fichier introuvable : $fichier" >&2; exit 1; }

  local base="lumera_verif_$(date +%s)"
  echo "Restauration d'essai dans la base jetable $base…"

  createdb "$base"
  # On tolère les avertissements de restauration : seul compte ce qu'on relit.
  pg_restore --no-owner --no-privileges --dbname "$base" "$fichier" 2>/dev/null || true

  echo
  echo "Lignes restaurées :"
  psql -d "$base" -tAc "
    SELECT 'Produits      : ' || count(*) FROM \"Product\"
    UNION ALL SELECT 'Variantes     : ' || count(*) FROM \"ProductVariant\"
    UNION ALL SELECT 'Compatibilités: ' || count(*) FROM \"Fitment\"
    UNION ALL SELECT 'Commandes     : ' || count(*) FROM \"Order\"
    UNION ALL SELECT 'Clients       : ' || count(*) FROM \"User\"
  " || echo "  (lecture impossible — la restauration a échoué)"

  echo
  echo "Suppression de la base d'essai…"
  dropdb "$base"
  echo "Vérification terminée."
}

restaurer() {
  local fichier="${1:-}" url="${2:-}"
  [ -f "$fichier" ] || { echo "Fichier introuvable : $fichier" >&2; exit 1; }
  [ -n "$url" ] || { echo "Passez l'URL de la base cible en second argument." >&2; exit 1; }

  echo "⚠  Cette opération ÉCRASE la base cible."
  echo "   Fichier : $fichier"
  echo "   Cible   : ${url%%\?*}"
  echo
  echo "   Mettez d'abord le service web en pause (Render › lumera-web › Suspend),"
  echo "   sinon l'application écrira pendant la restauration."
  echo
  read -r -p "Tapez RESTAURER pour confirmer : " reponse
  [ "$reponse" = "RESTAURER" ] || { echo "Annulé."; exit 1; }

  pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$url" "$fichier"

  echo
  echo "Restauration terminée. Vérifiez maintenant que le schéma correspond au"
  echo "code déployé — une sauvegarde plus ancienne que le code laisse la base"
  echo "en retard d'une ou plusieurs migrations :"
  echo "    npx prisma migrate status"
  echo "puis contrôlez /api/health avant de réactiver le service."
}

case "$commande" in
  sauvegarder) sauvegarder "${2:-}" ;;
  verifier)    verifier "${2:-}" ;;
  restaurer)   restaurer "${2:-}" "${3:-}" ;;
  *)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
