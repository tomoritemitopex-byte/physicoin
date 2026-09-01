/**
 * lib/profDeduper.ts — Prof Deduper pure logic (mirrors lib/hallDeduper.ts)
 * Re-exports from profMatch for backward compat with spec naming.
 * Group key = normalized last-word; quorum = 8 votes + 70% consensus.
 */
export {
  normalizeProfName,
  profMatchKey,
  PROF_QUORUM_MIN as QUORUM_MIN,
  PROF_QUORUM_RATIO as QUORUM_RATIO,
  profQuorumStatus as quorumStatus,
  profQuorumStatus,
  displayProfName,
  sameProf,
  profGroupKey,
} from "@/lib/profMatch";
export { PROF_QUORUM_MIN, PROF_QUORUM_RATIO } from "@/lib/profMatch";
import { profGroupKey as _pgk, profQuorumStatus as _pqs } from "@/lib/profMatch";
export const HALL_QUORUM_MIN = 8;
export const HALL_QUORUM_RATIO = 0.70;
export function hallQuorumStatus(yes:number,no:number){ return _pqs(yes,no); }
export function profGroupKeyAlias(s:string|null|undefined){ return _pgk(s); }
