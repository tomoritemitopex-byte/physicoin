#!/bin/bash
# Fix all remaining empty try/catch blocks
# Handle: try { await (); } catch {}, try { await (); await (); } catch {}, bare await ();

set -e

FILES=$(find app/api lib/adapters/features -name "*.ts" -o -name "*.tsx" 2>/dev/null)
COUNT=0

for f in $FILES; do
  if ! grep -q "await ()" "$f" 2>/dev/null; then
    continue
  fi
  COUNT=$((COUNT + 1))
  
  # 1. Remove lines that are exactly: try { await (); } catch {}
  #    or try { await (); await (); } catch {}
  sed -E -i '/try *\{ *await \(\)( *; *await \(\))* *\} *catch *\{/d' "$f"
  
  # 2. Remove bare await (); lines
  sed -E -i '/^ *await \(\);/d' "$f"
  
  # 3. Remove remaining await (); within try blocks
  sed -E -i 's/await \(\);?//g' "$f"
  
  echo "  cleaned $f"
done

echo "Fixed $COUNT files"
