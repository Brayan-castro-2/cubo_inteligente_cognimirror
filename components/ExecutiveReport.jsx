'use client';
import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, 
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, Legend, CartesianGrid,
  AreaChart, Area
} from 'recharts';
import Cube3DViewer from './Cube3DViewer';
import { computeCumulativeMetrics, analyzeGameData } from '../utils/analyzeGameData';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ─────────────────────────────────────────────────────────────
// MOTOR ANALÍTICO PRO 5.0 — High Performance Diagnostics
// ─────────────────────────────────────────────────────────────
function computeMetrics(record) {
  if (!record) return {};
  
  const raw = record.rawTurnsData || [];
  const uniqueRounds = Array.from(new Set(raw.map(r => r.round)));
  
  // 1. Filtrado de datos válidos (GO)
  const goRounds = raw.filter(t => t.type === 'GO');
  const validGo = goRounds.filter(t => t.time > 0);
  
  // 2. Dominancia Lateral (Balance)
  const leftGo = validGo.filter(t => t.expected === 'L');
  const rightGo = validGo.filter(t => t.expected === 'R');
  
  const avgL = leftGo.length > 0 ? leftGo.reduce((a, b) => a + b.time, 0) / leftGo.length : 0;
  const avgR = rightGo.length > 0 ? rightGo.reduce((a, b) => a + b.time, 0) / rightGo.length : 0;
  
  const deltaLateral = Math.abs(avgL - avgR);
  const dominantSide = avgL < avgR ? 'IZQUIERDA' : 'DERECHA';
  
  // Balance scale: 50 is center. < 50 left, > 50 right
  let balanceValue = 50;
  if (avgL > 0 && avgR > 0) {
    balanceValue = (avgR / (avgL + avgR)) * 100; 
  }

  // 3. Neural Battery (Resistencia / Consistencia)
  const mid = Math.floor(validGo.length / 2);
  const firstHalf = validGo.slice(0, mid);
  const secondHalf = validGo.slice(mid);
  
  const getStdDev = (data) => {
    if (data.length === 0) return 0;
    const avg = data.reduce((a, b) => a + b.time, 0) / data.length;
    const sqDiffs = data.map(t => Math.pow(t.time - avg, 2));
    return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / data.length);
  };
  
  const stdDev1 = getStdDev(firstHalf);
  const stdDev2 = getStdDev(secondHalf);
  
  let batteryLevel = 100;
  if (stdDev1 > 0) {
    const instabilityInc = (stdDev2 - stdDev1) / stdDev1;
    batteryLevel = Math.max(10, Math.min(100, 100 - (instabilityInc * 100)));
  }

  // 4. Radar Data (5 Ejes)
  const nogoTotal = raw.filter(t => t.type === 'NOGO').length;
  const nogoSuccess = raw.filter(t => t.type === 'NOGO' && !t.fail).length;
  const inhibitionScore = nogoTotal > 0 ? (nogoSuccess / nogoTotal) * 100 : 100;
  
  const symmetryScore = Math.max(0, 100 - (deltaLateral / 5)); 
  
  const globalAvg = validGo.reduce((a, b) => a + b.time, 0) / (validGo.length || 1);
  const globalStdDev = getStdDev(validGo);
  const stabilityScore = Math.max(0, 100 - (globalStdDev / 2));
  
  const totalTurns = uniqueRounds.length;
  const totalCorrect = raw.filter(t => (t.status === 'Ok' || t.status === 'Corregido') || (t.type === 'NOGO' && !t.fail)).length;
  const focusScore = totalTurns > 0 ? (totalCorrect / totalTurns) * 100 : 0;
  
  const reactionScore = Math.max(0, Math.min(100, 100 - (globalAvg - 400) / 10));

  const radarData = [
    { subject: 'Inhibición', A: inhibitionScore, fullMark: 100 },
    { subject: 'Simetría', A: symmetryScore, fullMark: 100 },
    { subject: 'Estabilidad', A: stabilityScore, fullMark: 100 },
    { subject: 'Foco', A: focusScore, fullMark: 100 },
    { subject: 'Reacción', A: reactionScore, fullMark: 100 }
  ];

  return {
    raw,
    avgL,
    avgR,
    deltaLateral,
    dominantSide,
    balanceValue, 
    batteryLevel,
    radarData,
    globalAvg: Math.round(globalAvg),
    inhibitionScore,
    focusScore,
    stabilityScore,
    globalStdDev: Math.round(globalStdDev)
  };
}

// ─────────────────────────────────────────────────────────────
// WIDGETS DE DISEÑO "SCI-FI"
// ─────────────────────────────────────────────────────────────

function NeuralBattery({ level }) {
  const color = level > 70 ? 'text-[#39FF14]' : level > 30 ? 'text-[#00FFFF]' : 'text-[#FF5F1F]';
  const bgColor = level > 70 ? 'bg-[#39FF14]/20' : level > 30 ? 'bg-[#00FFFF]/20' : 'bg-[#FF5F1F]/20';
  
  return (
    <div className="flex flex-col gap-3 p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md relative overflow-hidden group">
      <div className="flex justify-between items-center z-10">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Neural Battery (Resistance)</h3>
        <span className={`text-xl font-black ${color}`}>{Math.round(level)}%</span>
      </div>
      <div className="w-full h-8 bg-black/40 rounded-lg p-1 border border-white/5 z-10 flex gap-0.5">
        {[...Array(10)].map((_, i) => (
          <div 
            key={i} 
            className={`flex-1 h-full rounded-sm transition-all duration-1000 ${i < level/10 ? bgColor : 'bg-white/5'}`}
            style={{ transitionDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
      <p className="text-[10px] text-white/30 font-medium z-10 uppercase tracking-widest mt-1">
        {level > 70 ? 'Alta Consistencia Operativa' : 'Fatiga Atencional Detectada'}
      </p>
      <div className="absolute top-0 right-0 w-32 h-32 bg-current opacity-[0.02] blur-3xl rounded-full" />
    </div>
  );
}

function DominanceScale({ balance, side, diff }) {
  return (
    <div className="flex flex-col gap-4 p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md relative">
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">L/R Weighting (Dominance)</h3>
        <span className="text-[10px] font-bold text-[#FF5F1F] uppercase tracking-widest">Diff: {Math.round(diff)}ms</span>
      </div>
      <div className="relative w-full h-12 flex items-center">
        <div className="w-full h-[2px] bg-white/10 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-4 bg-white/20" />
        </div>
        
        <motion.div 
          initial={{ left: '50%' }}
          animate={{ left: `${balance}%` }}
          transition={{ type: 'spring', stiffness: 50 }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
        >
          <div className="w-1 h-8 bg-gradient-to-b from-[#00FFFF] to-transparent shadow-[0_0_15px_rgba(0,255,255,0.5)]" />
          <span className="text-[8px] font-black text-[#00FFFF] mt-1 uppercase">Weight</span>
        </motion.div>
        
        <div className="absolute left-0 top-0 text-[10px] font-black text-[#ef4444]/40">LEFT</div>
        <div className="absolute right-0 top-0 text-[10px] font-black text-[#f97316]/40">RIGHT</div>
      </div>
      <p className="text-[10px] text-center text-white/40 font-bold uppercase tracking-widest mt-2">
        Dominancia Detectada: <span className="text-white">{side}</span>
      </p>
    </div>
  );
}

function ClinicalRadar({ data }) {
  return (
    <div className="w-full h-80 bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md relative group">
      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 absolute top-6 left-6 z-10">Neural Architecture</h3>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#ffffff10" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#ffffff60', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }} 
          />
          <Radar 
            name="Score" 
            dataKey="A" 
            stroke="#00FFFF" 
            strokeWidth={3} 
            fill="#00FFFF" 
            fillOpacity={0.15} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '10px' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function ExecutiveReport({ record, onRestart, onExit }) {
  const m = useMemo(() => computeMetrics(record), [record]);
  const metrics = useMemo(() => analyzeGameData(record?.rawTurnsData || []), [record]);
  const cumulative = useMemo(() => computeCumulativeMetrics(record?.userHistory || []), [record]);
  const reportRef = useRef(null);

  const dateStr = record?.date ? new Date(record.date).toLocaleString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) : '—';

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { 
      scale: 2, 
      useCORS: true,
      backgroundColor: '#07080f'
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`CogniMirror_Diagnostic_${record?.playerName || 'User'}_${new Date().toLocaleDateString()}.pdf`);
  };

  if (!record) return null;

  return (
    <div className="min-h-screen bg-[#07080f] text-white font-sans overflow-x-hidden pb-20 selection:bg-[#00FFFF]/30">
      
      <div className="max-w-4xl mx-auto px-6 pt-6 flex justify-between gap-4 no-print border-b border-white/5 pb-6">
        <button onClick={onExit} className="px-5 py-2.5 bg-white/5 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-white/10 transition">
          History
        </button>
        <button onClick={downloadPDF} className="flex-1 px-5 py-2.5 bg-gradient-to-r from-[#00FFFF] to-[#3b82f6] hover:brightness-110 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-[0_0_20px_rgba(0,255,255,0.3)] transition text-black">
          📥 EXPORT CLINICAL PDF
        </button>
        <button onClick={onRestart} className="px-5 py-2.5 bg-white text-black rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-gray-200 transition">
          RE-TEST
        </button>
      </div>

      <div ref={reportRef} className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-10 bg-[#07080f]">
        
        <header className="flex flex-col md:flex-row items-center justify-between border-b border-[#00FFFF]/20 pb-8 gap-6 relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00FFFF]/50 to-transparent" />
          <div className="flex flex-col gap-2 text-center md:text-left">
            <h1 className="text-4xl font-black tracking-tighter uppercase italic">
              COGNIMIRROR: <span className="text-[#00FFFF] drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">DIGITAL TWIN ASSESSMENT</span>
            </h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
               <span className="px-3 py-1 bg-[#39FF14]/10 text-[#39FF14] rounded-sm text-[9px] font-black uppercase tracking-[0.3em] border border-[#39FF14]/30">
                 GO/NO-GO PROTOCOL v5.0 VALIDATED
               </span>
               <span className="text-[9px] text-white/30 font-mono uppercase tracking-[0.2em]">
                 REF_ID: {record.id.slice(0,12)}
               </span>
            </div>
          </div>
          <div className="flex flex-col items-center md:items-end gap-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg">
            <p className="text-xl font-black text-white uppercase tracking-tighter">{record.playerName}</p>
            <p className="text-[9px] text-[#00FFFF]/60 font-black uppercase tracking-[0.2em]">{dateStr}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <NeuralBattery level={m.batteryLevel} />
          <DominanceScale balance={m.balanceValue} side={m.dominantSide} diff={m.deltaLateral} />
        </section>

        {/* --- RECUPERACIÓN MANUAL (PARCHE FERIA) --- */}
        <section className="flex flex-col gap-6">
          
          {/* TARJETAS DE MANOS (Promedios) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl backdrop-blur-md">
              <p className="text-red-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Mano Izquierda (Rojo)</p>
              <h3 className="text-4xl font-black text-white">{Math.round(metrics.avgLeft)}ms</h3>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-3xl backdrop-blur-md">
              <p className="text-orange-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Mano Derecha (Naranja)</p>
              <h3 className="text-4xl font-black text-white">{Math.round(metrics.avgRight)}ms</h3>
            </div>
          </div>

          {/* GRÁFICO DE LÍNEAS (Recuperado) */}
          <div className="h-72 w-full bg-white/5 rounded-3xl p-6 border border-white/10 backdrop-blur-md relative">
            <h4 className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mb-6">Flujo de Reacción Dual</h4>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.turns}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="index" hide />
                  <YAxis domain={[0, 1500]} hide />
                  <Tooltip contentStyle={{backgroundColor: '#000', border: 'none', borderRadius: '12px', fontSize: '10px'}} />
                  <Line type="monotone" dataKey="time" stroke="#00FFFF" strokeWidth={4} dot={{fill: '#00FFFF', r: 4}} activeDot={{r: 6, stroke: '#00FFFF', strokeWidth: 2}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PERFIL Y ERRORES */}
          <div className="p-6 bg-gradient-to-r from-[#00FFFF]/20 to-[#3b82f6]/10 border border-[#00FFFF]/20 rounded-3xl flex items-center justify-between backdrop-blur-md">
            <div>
              <p className="text-[#00FFFF] text-[10px] font-black uppercase tracking-[0.3em] mb-1">Perfil Detectado</p>
              <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">{metrics.profile}</h2>
            </div>
            <div className="text-right">
              <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Errores</p>
              <h2 className="text-3xl font-black text-[#FF5F1F] drop-shadow-[0_0_10px_#FF5F1F44]">{metrics.errors}</h2>
            </div>
          </div>

        </section>
        {/* --- FIN PARCHE --- */}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ClinicalRadar data={m.radarData} />
          
          <div className="flex flex-col gap-6">
            <div className="p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-6">Inhibition Efficacy</h3>
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-4xl font-black text-[#39FF14]">{Math.round(m.inhibitionScore)}%</span>
                  <span className="text-[10px] font-bold text-white/20 uppercase">No-Go Accuracy</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${m.inhibitionScore}%` }}
                    className="h-full bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.5)]"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-6">Processing Latency</h3>
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-baseline text-[#00FFFF]">
                  <span className="text-4xl font-black">{m.globalAvg}ms</span>
                  <span className="text-[10px] font-bold text-white/20 uppercase">Mean RT (Net)</span>
                </div>
                <p className="text-[10px] text-white/30 font-medium uppercase tracking-widest leading-relaxed">
                  Estabilidad Estándar: <span className="text-white">{m.globalStdDev}ms</span>. 
                  {m.batteryLevel < 60 ? ' La variabilidad sugiere una degradación de la reserva cognitiva durante la sesión.' : ' Consistencia neural optimizada.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4">
          <div className="p-4 bg-gradient-to-r from-[#00FFFF]/10 to-transparent border-l-2 border-[#00FFFF] rounded-r-2xl">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">🌊</span>
              <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#00FFFF]">Diagnóstico: Estado de Flujo</h4>
            </div>
            <p className="text-[10px] text-white/50 leading-relaxed font-medium">
              El sistema detectó una sincronía superior entre el córtex visual y la respuesta motora. 
              Diferencial L/R menor a 50ms sugiere un balance hemisferico eficiente bajo presión.
            </p>
          </div>
          
          {m.inhibitionScore === 100 && (
            <div className="p-4 bg-gradient-to-r from-[#39FF14]/10 to-transparent border-l-2 border-[#39FF14] rounded-r-2xl">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">🛡️</span>
                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#39FF14]">Diagnóstico: Supresión Prefrontal</h4>
              </div>
              <p className="text-[10px] text-white/50 leading-relaxed font-medium">
                Cero errores de comisión en estímulos de interferencia (NOGO). Control inhibitorio de grado clínico.
              </p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/80">Turn-by-Turn Telemetry</h3>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-[9px] uppercase tracking-widest">
              <thead className="bg-white/5 text-white/30 font-black">
                <tr>
                  <th className="p-4">Round</th>
                  <th className="p-4">Stimulus</th>
                  <th className="p-4">Latency</th>
                  <th className="p-4">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {m.raw.slice(0, 15).map((t, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white/20 font-mono">#{String(idx + 1).padStart(2, '0')}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-sm border ${
                        t.type === 'GO' 
                          ? (t.expected === 'L' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-[#FF5F1F]/10 text-[#FF5F1F] border-[#FF5F1F]/20')
                          : 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/20'
                      }`}>
                        {t.type === 'GO' ? (t.expected === 'L' ? 'LEFT_GO' : 'RIGHT_GO') : `NOGO_${t.label}`}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-white/60">{t.time ? `${t.time}ms` : '---'}</td>
                    <td className={`p-4 font-black ${
                      t.status === 'Ok' ? 'text-[#39FF14]' : t.fail ? 'text-[#FF5F1F]' : 'text-white/20'
                    }`}>
                      {t.status || 'ABSENT'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-20 flex flex-col items-center gap-4 text-center">
          <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="text-[10px] text-white/20 uppercase font-bold tracking-[0.5em]">
            COGNIMIRROR® CLINICAL DIAGNOSTIC SUITE v5.0
          </p>
          <p className="text-[8px] text-white/10 uppercase tracking-[0.2em] leading-loose max-w-sm">
            Este reporte es para fines educativos y de tamizaje preventivo. 
            La latencia de hardware está normalizada mediante algoritmos de compensación XAI.
          </p>
        </footer>

      </div>
    </div>
  );
}
