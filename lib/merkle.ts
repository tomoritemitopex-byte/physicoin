/**
 * lib/merkle.ts — simple binary Merkle tree (no deps)
 * leaves are hex strings (sha256). Parent = sha256(left+right). Odd => duplicate last.
 */
import { createHash } from "crypto";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function merkleRoot(leaves: string[]): string {
  if (!leaves.length) return sha256Hex("");
  let layer = leaves.map(l => sha256Hex(String(l)));
  // sort for deterministic root (Bitcoin orders by txid)
  layer.sort();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(sha256Hex(left + right));
    }
    layer = next;
  }
  return layer[0]!;
}

export function getProof(leaves: string[], index: number): { branch: string[]; root: string; leaf: string } {
  if (!leaves.length) return { branch: [], root: merkleRoot([]), leaf: "" };
  const sorted = [...leaves].map(l => sha256Hex(String(l))).sort();
  // find index after sort — we need to map original index to sorted position
  // Simpler: caller should pass sorted leaves index. We'll just compute proof for sorted index.
  const idx = Math.max(0, Math.min(index, sorted.length - 1));
  const leaf = sorted[idx]!;
  let layer = sorted.slice();
  let pos = idx;
  const branch: string[] = [];
  while (layer.length > 1) {
    const isRight = pos % 2 === 1;
    const pairIdx = isRight ? pos - 1 : pos + 1;
    const sibling = layer[pairIdx] ?? layer[pos]!;
    branch.push(sibling);
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(sha256Hex(left + right));
    }
    layer = next;
    pos = Math.floor(pos / 2);
  }
  return { branch, root: layer[0]!, leaf };
}

// Enhanced proof with side info for precise verification
export function getProofWithSide(leaves: string[], targetId: string): { branch: string[]; root: string; leaf: string; index: number } {
  if (!leaves.length) return { branch: [], root: merkleRoot([]), leaf: "", index: -1 };
  const hashed = leaves.map(l => ({ id: String(l), hash: sha256Hex(String(l)) }));
  hashed.sort((a,b)=> a.hash.localeCompare(b.hash));
  const idx = hashed.findIndex(h => h.id === String(targetId));
  if (idx === -1) return { branch: [], root: merkleRoot(leaves), leaf: "", index: -1 };
  let layer = hashed.map(h=>h.hash);
  let pos = idx;
  const branch: string[] = [];
  while (layer.length > 1) {
    const isRight = pos % 2 === 1;
    const pairIdx = isRight ? pos - 1 : pos + 1;
    const sibling = layer[pairIdx] ?? layer[pos]!;
    const side = isRight ? "L:" : "R:";
    branch.push(side + sibling);
    const next: string[] = [];
    for (let i=0;i<layer.length;i+=2){ const l=layer[i]!; const r=layer[i+1]??l; next.push(sha256Hex(l+r)); }
    layer = next; pos = Math.floor(pos/2);
  }
  return { branch, root: layer[0]!, leaf: hashed[idx]!.hash, index: idx };
}

export function verifyProofWithSide(leafId: string, branch: string[], root: string): boolean {
  let cur = sha256Hex(String(leafId));
  for (const b of branch) {
    if (b.startsWith("L:")) cur = sha256Hex(b.slice(2) + cur);
    else if (b.startsWith("R:")) cur = sha256Hex(cur + b.slice(2));
    else cur = sha256Hex(cur + b);
  }
  return cur === root;
}
