#!/bin/bash
# Fix remaining empty try/catch blocks (multiple await () patterns)

set -e

FILES=$(find app/api lib/adapters/features -name "*.ts" -o -name "*.tsx" 2>/dev/null)
COUNT=0

for f in $FILES; do
  if ! grep -q "await ()" "$f" 2>/dev/null; then
    continue
  fi
  COUNT=$((COUNT + 1))
  
  # Remove entire lines containing try { await (); ... } catch {}
  # Handle: "try { await (); } catch {}", "try { await (); await (); } catch {}", etc.
  sed -E -i '/try *\{ *await \(\)( *; *await \(\))* *\} *catch *\{/d' "$f"
  
  echo "  fixed $f"
done

echo "Fixed $COUNT files"
