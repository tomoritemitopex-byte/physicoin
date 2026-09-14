#!/bin/bash
# Fix empty try/catch blocks left by strip-ddl.sh

set -e

FILES=$(find app/api lib/adapters/features -name "*.ts" -o -name "*.tsx" 2>/dev/null)
COUNT=0

for f in $FILES; do
  if ! grep -q "await ()" "$f" 2>/dev/null; then
    continue
  fi
  COUNT=$((COUNT + 1))
  
  # Remove the entire empty try/catch line: "try { await (); } catch {}"
  sed -i -E '/try *\{ *await \(\);? *\} *catch *\{/d' "$f"
  
  echo "  fixed $f"
done

echo "Fixed $COUNT files with empty try/catch blocks"
