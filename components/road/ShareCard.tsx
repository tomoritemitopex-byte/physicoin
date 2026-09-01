"use client";
import { useEffect, useRef, useState } from "react";

type LevelInfo = { lvl: number; name: string; progress: number; nextAt: number | null };

export default function ShareCard({ open, onClose, myRep, streak, youHandle, levelInfo }: {
  open: boolean; onClose: () => void; myRep: number; streak: number; youHandle: string | null; levelInfo: LevelInfo;
}) {
  const [shareImg, setShareImg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function generate() {
    const c = canvasRef.current;
    if (!c) return;
    const W=1080, H=1350;
    c.width=W; c.height=H;
    const ctx=c.getContext("2d");
    if(!ctx) return;
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#0d3b2a");
    g.addColorStop(0.45,"#143d2e");
    g.addColorStop(1,"#52b788");
    ctx.fillStyle=g;
    ctx.fillRect(0,0,W,H);
    const rg=ctx.createRadialGradient(W/2,H*0.28,0,W/2,H*0.28,W*0.7);
    rg.addColorStop(0,"rgba(82,183,136,0.32)");
    rg.addColorStop(1,"transparent");
    ctx.fillStyle=rg;
    ctx.fillRect(0,0,W,H);
    const cardX=56, cardY=420, cardW=W-112, cardH=560, r=32;
    ctx.fillStyle="rgba(255,255,255,0.96)";
    ctx.beginPath();
    // @ts-ignore
    if((ctx as any).roundRect) (ctx as any).roundRect(cardX,cardY,cardW,cardH,r);
    else ctx.rect(cardX,cardY,cardW,cardH);
    ctx.fill();
    const candyColors:Record<number,string>={1:"#10b981",2:"#0ea5e9",3:"#34d399",4:"#f59e0b",5:"#fbbf24"};
    const col=candyColors[levelInfo.lvl]||"#10b981";
    const avX=W/2, avY=360, avR=110;
    ctx.fillStyle=col+"33";
    ctx.beginPath(); ctx.arc(avX,avY,avR+22,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(avX,avY,avR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.9)";
    ctx.lineWidth=6;
    ctx.stroke();
    const initials=(youHandle||"YOU").slice(0,2).toUpperCase();
    ctx.fillStyle="white";
    ctx.font="900 64px system-ui, sans-serif";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(initials, avX, avY+4);
    ctx.fillStyle="#0f172a";
    ctx.font="900 42px system-ui, sans-serif";
    ctx.fillText((youHandle? "@"+youHandle : "@you"), W/2, cardY+92);
    ctx.fillStyle="#475569";
    ctx.font="700 22px system-ui, sans-serif";
    ctx.fillText(`${levelInfo.name}  ·  Lvl ${levelInfo.lvl}`, W/2, cardY+138);
    ctx.fillStyle="#0f172a";
    ctx.font="900 72px system-ui, sans-serif";
    ctx.fillText(`${myRep.toFixed(1)} Rep`, W/2, cardY+236);
    ctx.fillStyle="#f97316";
    ctx.font="900 28px system-ui, sans-serif";
    ctx.fillText(`🔥 ${streak} day${streak===1?"":"s"} streak`, W/2, cardY+290);
    const barX=cardX+64, barW=cardW-128, barY=cardY+340, barH=18;
    ctx.fillStyle="rgba(0,0,0,0.08)";
    // @ts-ignore
    if((ctx as any).roundRect){ ctx.beginPath(); (ctx as any).roundRect(barX,barY,barW,barH,9); ctx.fill(); } else ctx.fillRect(barX,barY,barW,barH);
    ctx.fillStyle=levelInfo.lvl===5? "#fbbf24" : "#10b981";
    const pw=Math.max(8, barW*levelInfo.progress);
    // @ts-ignore
    if((ctx as any).roundRect){ ctx.beginPath(); (ctx as any).roundRect(barX,barY,pw,barH,9); ctx.fill(); } else ctx.fillRect(barX,barY,pw,barH);
    ctx.fillStyle="#64748b";
    ctx.font="600 18px system-ui, sans-serif";
    const nextTxt=levelInfo.nextAt? `${(levelInfo.nextAt-myRep).toFixed(1)} to L${levelInfo.lvl+1}` : "MAX — Legend";
    ctx.fillText(levelInfo.lvl===5? "MAX L5 Legend" : nextTxt, W/2, barY+52);
    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.font="700 20px system-ui, sans-serif";
    ctx.fillText("physicoin · endless road · WAT", W/2, H-72);
    ctx.fillStyle="rgba(255,255,255,0.64)";
    ctx.font="500 16px system-ui, sans-serif";
    try{ ctx.fillText(window.location.origin+"/app/roadmap", W/2, H-42); } catch{}
    try{ setShareImg(c.toDataURL("image/png")); }catch{ setShareImg(null); }
  }

  useEffect(()=>{ if(open) { const t=setTimeout(()=> generate(), 50); return ()=> clearTimeout(t);} }, [open, myRep, streak, youHandle, levelInfo.lvl]);

  async function handleShare(){
    const c=canvasRef.current;
    if(!c) return;
    try{
      const blob: Blob | null = await new Promise(res=> c.toBlob(b=>res(b),"image/png",0.92));
      if(blob && (navigator as any).canShare){
        const file=new File([blob],"physicoin-rep.png",{type:"image/png"});
        if((navigator as any).canShare({files:[file]})){
          await (navigator as any).share({title:"My Physicoin Rep", text:`Lvl ${levelInfo.lvl} ${levelInfo.name} · ${myRep.toFixed(1)} Rep · 🔥 ${streak} days`, files:[file]});
          return;
        }
      }
      if((navigator as any).share && shareImg){
        await (navigator as any).share({title:"My Physicoin Rep", text:`Lvl ${levelInfo.lvl} ${levelInfo.name} · ${myRep.toFixed(1)} Rep · 🔥 ${streak} days — ${window.location.href}`, url: window.location.href});
        return;
      }
    }catch{}
    try{
      const url=c.toDataURL("image/png");
      const a=document.createElement("a");
      a.href=url; a.download=`physicoin-lvl${levelInfo.lvl}-${(youHandle||"you")}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    }catch{}
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e=> e.stopPropagation()} className="w-full max-w-[360px] rounded-[24px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-black text-white">Your Rep Card</h3>
          <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">✕</button>
        </div>
        <p className="mt-1 font-mono text-[11px] text-slate-400">Tap Share to send your forest card — candy avatar + Lvl + Rep + streak</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
          <canvas ref={canvasRef} className="h-auto w-full" style={{ display: shareImg ? "none" : "block" }} />
          {shareImg && <img src={shareImg} alt="Rep card" className="h-auto w-full" />}
        </div>
        <div className="mt-4 grid gap-2">
          <button onClick={handleShare} className="w-full rounded-full bg-white py-3 text-[14px] font-black text-black hover:bg-slate-100">Share — navigator.share or download</button>
          <button onClick={generate} className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 text-[13px] font-semibold text-white">↻ Regenerate</button>
        </div>
        <p className="mt-2 text-center font-mono text-[10px] text-slate-500">Forest green bg · candy avatar · Lvl {levelInfo.lvl} {levelInfo.name} · {myRep.toFixed(1)} Rep · 🔥 {streak}</p>
      </div>
    </div>
  );
}
