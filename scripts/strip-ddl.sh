#!/bin/bash
# Strip runtime DDL from ALL API routes and adapter files

set -e

# Files to process
FILES=$(find app/api lib/adapters/features -name "*.ts" -o -name "*.tsx" 2>/dev/null)
COUNT=0

for f in $FILES; do
  if ! grep -q "ensureAllTables\|ensureSquadTables\|ensureBunkTables\|ensureNotesTables" "$f" 2>/dev/null; then
    continue
  fi
  COUNT=$((COUNT + 1))
  
  # Remove from imports
  sed -i -E 's/\bensureAllTables\b,? *//g; s/, *\bensureAllTables\b//g' "$f"
  sed -i -E 's/\bensureSquadTables\b,? *//g; s/, *\bensureSquadTables\b//g' "$f"
  sed -i -E 's/\bensureBunkTables\b,? *//g; s/, *\bensureBunkTables\b//g' "$f"
  sed -i -E 's/\bensureNotesTables\b,? *//g; s/, *\bensureNotesTables\b//g' "$f"
  
  # Remove call lines
  sed -i -E '/try *\{ *await ensureAllTables/d' "$f"
  sed -i -E '/await ensureAllTables/d' "$f"
  sed -i -E '/try *\{ *await ensureSquadTables/d' "$f"
  sed -i -E '/await ensureSquadTables/d' "$f"
  sed -i -E '/try *\{ *await ensureBunkTables/d' "$f"
  sed -i -E '/await ensureBunkTables/d' "$f"
  sed -i -E '/try *\{ *await ensureNotesTables/d' "$f"
  sed -i -E '/await ensureNotesTables/d' "$f"
  
  echo "  patched $f"
done

echo ""
echo "=== Verification ==="
REMAINING=$(grep -rn "ensureAllTables\|ensureSquadTables\|ensureBunkTables\|ensureNotesTables" app/api lib/adapters/features 2>/dev/null | wc -l)
if [ "$REMAINING" -eq 0 ]; then
  echo "✅ ALL CLEAN — 0 runtime DDL calls remain"
else
  echo "❌ $REMAINING occurrences still found:"
  grep -rn "ensureAllTables\|ensureSquadTables\|ensureBunkTables\|ensureNotesTables" app/api lib/adapters/features 2>/dev/null
fi
