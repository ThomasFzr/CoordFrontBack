#!/usr/bin/env bash
# Revient à une version précédente de l'API. Les données (volume Mongo ou Atlas) ne sont pas touchées.
# Usage : scripts/rollback.sh            → version déployée juste avant l'actuelle
#         scripts/rollback.sh <tag>      → version précise
#         scripts/rollback.sh --list     → historique des déploiements et sauvegardes
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEPLOY_DIR=${DEPLOY_DIR:-$ROOT/.deploy}
BACKUP_DIR=${BACKUP_DIR:-$ROOT/backups}
HISTORY="$DEPLOY_DIR/history"

if [ "${1:-}" = --list ]; then
  echo "Déploiements (le plus récent en bas) :"
  cat -n "$HISTORY" 2>/dev/null || echo "  aucun"
  echo "Sauvegardes :"
  ls -1 "$BACKUP_DIR" 2>/dev/null || echo "  aucune"
  exit 0
fi

[ -s "$HISTORY" ] || { echo "✗ aucun déploiement enregistré"; exit 1; }
current=$(tail -n 1 "$HISTORY")
target=${1:-$(tail -n 2 "$HISTORY" | head -n 1)}
[ "$target" != "$current" ] || { echo "✗ $target est déjà la version déployée"; exit 1; }

echo "↩ rollback $current → $target (données conservées)"
exec "$ROOT/scripts/deploy.sh" "$target"
