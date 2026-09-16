'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Clock3, MapPin, Radio, RotateCcw } from 'lucide-react';

const signals = [
  { id: 'anat', label: 'Anatomy 300L', place: 'New Lecture Theatre', age: '2m ago', confidence: 92, action: 'Leave in 8 min', tone: 'lime' },
  { id: 'pharm', label: 'Pharmacology', place: 'Old Auditorium', age: '11m ago', confidence: 68, action: 'Verify at venue', tone: 'amber' },
  { id: 'phys', label: 'Medical Physics', place: 'Physics Block', age: '24m ago', confidence: 41, action: 'Ask a classmate', tone: 'red' },
];

export default function SignalRadar() {
  const [active, setActive] = useState(0);
  const signal = signals[active];

  useEffect(() => {
    const timer = window.setInterval(() => setActive((value) => (value + 1) % signals.length), 5200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="signal-radar" aria-label="Live campus signal radar">
      <div className="signal-radar__topline"><span><Radio className="h-3.5 w-3.5" /> signal graph / live</span><span className="signal-radar__pulse" aria-hidden="true" /></div>
      <div className="signal-radar__body">
        <div className="signal-radar__orbit" aria-hidden="true"><span className="signal-radar__sweep" /><i /><i /><i /><b>YOU</b></div>
        <div className="signal-radar__feed">
          <p className="landing-kicker">changed since last check</p>
          <div className="signal-radar__title"><span className={`signal-dot ${signal.tone}`} /> <strong>{signal.label}</strong><span className="signal-radar__age">{signal.age}</span></div>
          <p className="signal-radar__place"><MapPin className="h-3.5 w-3.5" /> {signal.place}</p>
          <div className="signal-radar__meter"><div className={`signal-radar__meter-fill ${signal.tone}`} style={{ width: `${signal.confidence}%` }} /></div>
          <div className="signal-radar__meta"><span>{signal.confidence}% confidence</span><span>decays in 18m</span></div>
          <button type="button" className={`signal-action ${signal.tone}`} onClick={() => setActive((value) => (value + 1) % signals.length)} aria-label={`Show next signal. Current action: ${signal.action}`}><Clock3 className="h-3.5 w-3.5" /> {signal.action} <ArrowUpRight className="ml-auto h-3.5 w-3.5" /></button>
          <div className="signal-radar__controls" role="tablist" aria-label="Signals"><button type="button" onClick={() => setActive(0)} aria-label="Show Anatomy signal" aria-selected={active === 0}><Check className="h-3 w-3" /></button><button type="button" onClick={() => setActive(1)} aria-label="Show Pharmacology signal" aria-selected={active === 1}><Check className="h-3 w-3" /></button><button type="button" onClick={() => setActive(2)} aria-label="Show Physics signal" aria-selected={active === 2}><Check className="h-3 w-3" /></button><span><RotateCcw className="h-3 w-3" /> auto rotates</span></div>
        </div>
      </div>
    </section>
  );
}

export { signals };
                                                                     
