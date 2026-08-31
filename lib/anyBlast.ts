// ANY Blast Link: r/abc123 ?invite=squad ANY anon 2s YES/NO 0.3 weight no login 7/8 quorum claim 3/day/IP cap honeypot yes/total>0.65 guard
export const ANY_WEIGHT=0.3; export const ANY_QUORUM=7; export const ANY_REQUIRED=8;
export const CLAIM_CAP=3; // per day per IP
export function anyBlastLink(code:string, invite?:string){ const base= typeof window!=="undefined"? window.location.origin:""; return `${base}/r/${encodeURIComponent(code)}${invite?`?invite=${encodeURIComponent(invite)}`:""}`; }
export function honeypotBlocked(yes:number,total:number):boolean{ if(total<=0) return false; return yes/total>0.65; }
export function quorumReached(yes:number,total:number):boolean{ return yes>=ANY_QUORUM && total>=ANY_REQUIRED; }
// server-side claim guard via localStorage IP cap simulation (real IP on server)
export function canClaim(ipClaims:number):boolean{ return ipClaims < CLAIM_CAP; }
