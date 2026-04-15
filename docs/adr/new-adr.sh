#!/usr/bin/env bash
# Crear un nuevo ADR a partir del template
# Uso: ./docs/adr/new-adr.sh "titulo de la decision"

set -euo pipefail

ADR_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$ADR_DIR/TEMPLATE.md"

if [ -z "${1:-}" ]; then
  echo "Uso: $0 \"titulo de la decision\""
  exit 1
fi

TITLE="$1"
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9áéíóúñü]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Find next number (portable for macOS and Linux)
LAST=$(ls "$ADR_DIR"/[0-9][0-9][0-9][0-9]-*.md 2>/dev/null | sort | tail -1 | cut -d- -f1 | rev | cut -c1-4 | rev || echo "0000")
NEXT=$(printf "%04d" $((10#$LAST + 1)))

FILENAME="$ADR_DIR/${NEXT}-${SLUG}.md"
DATE=$(date +%Y-%m-%d)

sed "s/ADR-NNNN/ADR-${NEXT}/g; s/\[Título descriptivo de la decisión\]/${TITLE}/g; s/YYYY-MM-DD/${DATE}/g" "$TEMPLATE" > "$FILENAME"

echo "Creado: $FILENAME"
echo "Recuerda actualizar docs/adr/INDEX.md"
