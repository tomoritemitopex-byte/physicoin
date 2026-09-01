"use client";
import { useEffect, useRef, useState } from "react";
// Candy Well + Forest 2.5D — bottom well candies collide spring physics; forest parallax depth = friend distance far blur near sharp
type Candy={x:number; y:number; vx:number; vy:number; r:number; color:string; friendDist:number}
const COLORS=["#34d399","#ec4899","#10b981","#f59e0b","#0ea5e9","#f43f5e"];
export default function CandyWell({ count=14 }:{count?:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  const [parallax,setParallax]=useState(0);
  useEffect(()=>{
    const onScroll=()=> setParallax(window.scrollY*0.08);
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>window.removeEventListener("scroll",onScroll);
  },[]);
  useEffect(()=>{
    const c=ref.current; if(!c) return; const ctx=c.getContext("2d",{alpha:true}); if(!ctx) return;
    let w=c.clientWidth||320, h=96; c.width=w*2; c.height=h*2; ctx.scale(2,2);
    let candies:Candy[]=Array.from({length:count},(_,i)=>({ x: Math.random()*w, y: Math.random()*h, vx:(Math.random()-0.5)*1.8, vy:(Math.random()-0.5)*1.4, r: 8+Math.random()*7, color:COLORS[i%COLORS.length], friendDist: Math.random() }));
    let raf=0;
    const tick=()=>{
      ctx.clearRect(0,0,w,h);
      // forest bands parallax
      for(let layer=0; layer<3; layer++){
        const depth=(layer+1)/3; const yOff= parallax* (0.2+depth*0.6);
        const blur = layer===0? 2.5 : layer===1? 1.2:0; // far blur near sharp
        ctx.save(); ctx.globalAlpha=0.22+depth*0.28; ctx.filter= blur? `blur(${blur}px)`: "none";
        ctx.fillStyle= layer===0? "rgba(16,55,32,0.9)": layer===1? "rgba(22,78,44,0.7)":"rgba(34,110,60,0.5)";
        const hh= 18+depth*10;
        ctx.beginPath(); ctx.moveTo(0, h - hh + Math.sin(parallax*0.01+layer)*3);
        for(let x=0;x<=w;x+=18){ const yy= h - hh + Math.sin(x*0.02+layer)* (6-depth*3) - yOff*0.3; ctx.lineTo(x, yy); }
        ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      // spring collide
      for(let i=0;i<candies.length;i++){
        const a=candies[i];
        a.x+=a.vx; a.y+=a.vy; a.vy+=0.14; a.vx*=0.99; a.vy*=0.99;
        if(a.x<a.r||a.x>w-a.r){ a.vx*=-0.82; a.x=Math.max(a.r,Math.min(w-a.r,a.x)); }
        if(a.y<a.r||a.y>h-a.r){ a.vy*=-0.62; a.y=Math.max(a.r,Math.min(h-a.r,a.y)); if(Math.abs(a.vy)<0.6) a.vy-=0.8; }
        for(let j=i+1;j<candies.length;j++){
          const b=candies[j]; const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy), minR=a.r+b.r;
          if(d<minR && d>0.1){ const nx=dx/d, ny=dy/d; const overlap=(minR-d)*0.5; a.x-=nx*overlap; a.y-=ny*overlap; b.x+=nx*overlap; b.y+=ny*overlap;
            const k=0.18; // spring
            const dvx=b.vx-a.vx, dvy=b.vy-a.vy, dot= dvx*nx + dvy*ny;
            const imp= dot*k; a.vx+= imp*nx; a.vy+= imp*ny; b.vx-= imp*nx; b.vy-= imp*ny;
          }
        }
      }
      // draw sharpness = friend distance: near sharp, far blur via alpha+shadow
      for(const c2 of candies){
        const sharp= 1 - c2.friendDist*0.55; // near 1 far 0.45
        ctx.save(); ctx.globalAlpha= 0.92*sharp +0.22; if(c2.friendDist>0.6) ctx.filter="blur(0.6px)";
        ctx.beginPath(); ctx.arc(c2.x,c2.y,c2.r,0,Math.PI*2); ctx.fillStyle=c2.color; (ctx as any).shadowColor=c2.color; (ctx as any).shadowBlur= 8*sharp; ctx.fill();
        // gloss
        ctx.beginPath(); ctx.arc(c2.x- c2.r*0.28, c2.y- c2.r*0.32, c2.r*0.32,0,Math.PI*2); ctx.fillStyle="rgba(255,255,255,0.42)"; ctx.fill(); ctx.restore();
      }
      raf=requestAnimationFrame(tick);
    };
    tick(); return()=>cancelAnimationFrame(raf);
  },[count, parallax]);
  return (
    <div className="candy-well relative w-full overflow-hidden rounded-[18px] border border-white/10" style={{ background:"linear-gradient(to bottom, rgba(13,59,42,0.22), rgba(7,10,18,0.9))" }}>
      <canvas ref={ref} className="block h-[96px] w-full" style={{ width:"100%", height:96 }} />
      <p className="pointer-events-none absolute bottom-1 left-2 font-mono text-[9px] text-white/30">well spring · forest 2.5D · far blur near sharp</p>
    </div>
  );
}
