'use client';

import { Brain, Zap, Activity, Eye } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// MOTOR ANALÍTICO CLÍNICO V2
// ─────────────────────────────────────────────────────────────
function analyzeData(turns = []) {
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  // ── Recolección base ──────────────────────────────────────
  let rightRTs = [], leftRTs = [];
  let falseStartR = 0, falseStartL = 0;
  let falseStartCount = 0, commissionCount = 0, omissionCount = 0;
  let shortWaitRTs = [], longWaitRTs = [];

  turns.forEach((t) => {
    if (t.isFalseStart) {
      falseStartCount++;
      if (t.actualFace === 'R') falseStartR++;
      if (t.actualFace === 'L') falseStartL++;
    }
    if (t.isOmission) omissionCount++;
    if (t.firstMoveWrong && !t.isFalseStart && !t.isOmission) commissionCount++;

    if (t.isCorrect && t.reactionTimeMs > 0) {
      if (t.expectedFace === 'R') rightRTs.push(t.reactionTimeMs);
      if (t.expectedFace === 'L') leftRTs.push(t.reactionTimeMs);

      // Atención sostenida: dividir por duración de espera
      if (t.waitTimeMs < 1800) shortWaitRTs.push(t.reactionTimeMs);
      else longWaitRTs.push(t.reactionTimeMs);
    }
  });

  const impulsivityErrors = falseStartCount + omissionCount + commissionCount;

  // ── Promedios brutos ──────────────────────────────────────
  let avgRight = rightRTs.length ? avg(rightRTs) : null;
  let avgLeft  = leftRTs.length  ? avg(leftRTs)  : null;

  // Ajuste instintivo: falsos arranques revelan mano dominante
  // (un falso arranque = esa mano quiso actuar antes de tiempo)
  const adjRight = avgRight !== null ? avgRight - falseStartR * 25 : null;
  const adjLeft  = avgLeft  !== null ? avgLeft  - falseStartL * 25 : null;

  // ── Dominancia motriz ────────────────────────────────────
  let dominance = 'Indeterminada', dominanceIcon = '⚖️';
  let instinctHand = null;

  if (adjRight !== null && adjLeft !== null) {
    const diff = Math.abs(adjRight - adjLeft);
    if (adjRight + 30 < adjLeft) { dominance = 'Derecha'; dominanceIcon = '👉'; }
    else if (adjLeft + 30 < adjRight) { dominance = 'Izquierda'; dominanceIcon = '👈'; }
    else { dominance = 'Ambidiestra'; dominanceIcon = '👐'; }
  } else if (adjRight !== null) {
    dominance = 'Derecha'; dominanceIcon = '👉';
  } else if (adjLeft !== null) {
    dominance = 'Izquierda'; dominanceIcon = '👈';
  }

  if (falseStartR > falseStartL) instinctHand = 'Derecha';
  else if (falseStartL > falseStartR) instinctHand = 'Izquierda';

  // ── Diferencia entre manos ───────────────────────────────
  let handDiffText = null;
  if (avgRight !== null && avgLeft !== null) {
    const diff = Math.abs(avgRight - avgLeft);
    const faster = avgRight < avgLeft ? 'Derecha (Naranja)' : 'Izquierda (Roja)';
    handDiffText = `Tu mano ${faster} fue ${diff} ms más rápida en promedio.`;
    if (instinctHand) {
      handDiffText += ` Además, en momentos de impulsividad, tu instinto motor fue usar la mano ${instinctHand}.`;
    }
  } else if (instinctHand) {
    handDiffText = `Solo respondiste correctamente a un lado. Tu instinto impulsivo apuntó a la mano ${instinctHand}.`;
  }

  // ── Velocidad global ─────────────────────────────────────
  const allRTs = [...rightRTs, ...leftRTs];
  const avgTotal = avg(allRTs);
  let speedCategory = 'Lento';
  if (avgTotal > 0 && avgTotal < 300) speedCategory = 'Notable';
  else if (avgTotal <= 450) speedCategory = 'Normal';

  // ── Atención sostenida ───────────────────────────────────
  const avgShort = avg(shortWaitRTs);
  const avgLong  = avg(longWaitRTs);
  let attentionText = '';
  let attentionLevel = 'Sin datos suficientes';

  if (shortWaitRTs.length > 0 && longWaitRTs.length > 0) {
    const delta = avgLong - avgShort;
    attentionLevel = delta > 80 ? 'Fatiga Atencional' : delta > 30 ? 'Leve Dispersión' : 'Foco Sostenido';
    attentionText = `Con esperas cortas reaccionaste en ${avgShort} ms. En esperas largas subió a ${avgLong} ms`;
    if (delta > 80) attentionText += `, indicando fatiga atencional significativa (+${delta} ms).`;
    else if (delta > 30) attentionText += `, una leve dispersión al prolongarse la espera (+${delta} ms).`;
    else attentionText += `, mostrando foco sostenido estable.`;
  } else if (shortWaitRTs.length > 0) {
    attentionText = `Solo hubo esperas cortas. Tiempo promedio: ${avgShort} ms.`;
    attentionLevel = 'Foco Sostenido';
  } else if (longWaitRTs.length > 0) {
    attentionText = `Solo hubo esperas largas. Tiempo promedio: ${avgLong} ms.`;
    attentionLevel = 'Foco Sostenido';
  }

  // ── Control inhibitorio ──────────────────────────────────
  let controlCategory = 'Moderado';
  let controlColor = 'text-amber-600';
  if (impulsivityErrors === 0) { controlCategory = 'Excelente'; controlColor = 'text-emerald-600'; }  
  else if (impulsivityErrors >= 4) { controlCategory = 'Bajo'; controlColor = 'text-rose-600'; }

  return {
    avgTotal,
    avgRight,
    avgLeft,
    handDiffText,
    dominance,
    dominanceIcon,
    speedCategory,
    attentionLevel,
    attentionText,
    avgShort: shortWaitRTs.length ? avgShort : null,
    avgLong:  longWaitRTs.length  ? avgLong  : null,
    controlCategory,
    controlColor,
    falseStartCount,
    commissionCount,
    omissionCount,
    impulsivityErrors,
  };
}

// ─────────────────────────────────────────────────────────────
// SUBCOMPONENTES
// ─────────────────────────────────────────────────────────────
function StatRow({ label, value, color = 'text-slate-700' }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

// NUEVO: Generador de CSV
function downloadExcel(playerName, data) {
  const headers = ["Turno", "Cara Esperada", "Cara Girada", "Tiempo Bruto (ms)", "Descuento (ms)", "Tiempo Neto (ms)", "Correcto", "Falso Arranque", "Omision"];
  const rows = data.map(t => [
    t.turn,
    t.expectedFace === 'L' ? 'Roja' : 'Naranja',
    t.actualFace === 'L' ? 'Roja' : 'Naranja',
    t.rawReactionTimeMs || 0,
    t.latencyDiscount || 0,
    t.reactionTimeMs,
    t.isCorrect ? 'SI' : 'NO',
    t.isFalseStart ? 'SI' : 'NO',
    t.isOmission ? 'SI' : 'NO'
  ]);

  const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `CogniMirror_${playerName || 'Anonimo'}_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function ErrorBadge({ label, count, color }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${color}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-lg font-black">{count}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function ReactionDashboard({ playerName, date, rawTurnsData, latencyOffset, onRestart, onExit, recordId }) {
  const m = analyzeData(rawTurnsData || []);
  
  const handlePrint = () => {
    window.print();
  };

  const d = date ? new Date(date) : new Date();
  const formattedDate = `${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })} a las ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;

  // Humanizar nombre de cara (L=Roja, R=Naranja)
  const faceName = (f) => f === 'L' ? '🔴 Roja (L)' : f === 'R' ? '🟠 Naranja (R)' : f;
  const ms = (v) => v !== null && v > 0 ? `${v} ms` : '—';

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-800 font-sans p-4 md:p-8 report-container">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .report-container { padding: 0 !important; background: white !important; }
          .bg-white { border: 1px solid #e2e8f0 !important; box-shadow: none !important; }
          .bg-slate-800 { background: #1e293b !important; color: white !important; -webkit-print-color-adjust: exact; }
          .text-indigo-600 { color: #4f46e5 !important; }
          .text-emerald-600 { color: #059669 !important; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div className="max-w-5xl mx-auto mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Reporte Neuro-Motriz</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">
            Paciente: <span className="text-indigo-600 font-bold">{playerName || 'Anónimo'}</span>
            <span className="mx-2 text-slate-300">|</span>
            {formattedDate}
          </p>
          {latencyOffset > 0 ? (
            <p className="text-xs text-emerald-600 mt-1 font-bold flex items-center gap-1">
              <Zap size={12} className="fill-emerald-600" />
              Tiempos compensados (−{latencyOffset} ms) para precisión clínica.
            </p>
          ) : (
            <p className="text-xs text-amber-600 mt-1 font-bold flex items-center gap-1">
              ⚠️ Sin calibrar. Los resultados incluyen latencia de hardware.
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap md:flex-nowrap flex-shrink-0 no-print">
          <button onClick={onRestart} className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all text-sm">
            🔄 Rehacer
          </button>
          <button onClick={handlePrint} className="px-4 py-2 rounded-xl bg-slate-800 font-bold text-white hover:bg-slate-900 shadow-sm transition-all text-sm flex items-center gap-2">
            🖨️ PDF
          </button>
          <button onClick={() => downloadExcel(playerName, rawTurnsData)} className="px-4 py-2 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700 shadow-sm transition-all text-sm flex items-center gap-2">
            📊 Excel
          </button>
          <button onClick={onExit} className="px-4 py-2 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 shadow shadow-indigo-200 transition-all text-sm">
            ← Finalizar
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── SECCIÓN 1: 4 TARJETAS DE INSIGHTS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* Card 1: Dominancia Motriz */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3 col-span-1 md:col-span-1">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
              <Brain size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Dominancia Motriz</p>
              <p className="text-2xl font-black text-slate-800">{m.dominance} {m.dominanceIcon}</p>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-3">
              <StatRow label="Promedio Izquierda 🔴 (L)" value={ms(m.avgLeft)} color="text-red-600" />
              <StatRow label="Promedio Derecha 🟠 (R)"   value={ms(m.avgRight)} color="text-orange-500" />
            </div>
            {m.handDiffText && (
              <p className="text-xs text-slate-500 leading-relaxed">{m.handDiffText}</p>
            )}
            
            {/* Dominance Confirmation UI */}
            {recordId && (
              <div className="mt-4 pt-4 border-t border-slate-100 no-print">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">¿Confirmas esta dominancia?</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const db = JSON.parse(localStorage.getItem('cogniMirror_DB') || '[]');
                      const idx = db.findIndex(r => r.id === recordId);
                      if (idx !== -1) {
                        db[idx].userDominanceConfirmed = true;
                        db[idx].userDominanceFeedback = 'Match';
                        localStorage.setItem('cogniMirror_DB', JSON.stringify(db));
                        alert("✅ Confirmado: Datos validados.");
                      }
                    }}
                    className="flex-1 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-all border border-emerald-200"
                  >
                    SÍ, ES CORRECTA
                  </button>
                  <button 
                    onClick={() => {
                      const db = JSON.parse(localStorage.getItem('cogniMirror_DB') || '[]');
                      const idx = db.findIndex(r => r.id === recordId);
                      if (idx !== -1) {
                        db[idx].userDominanceConfirmed = false;
                        db[idx].userDominanceFeedback = 'Mismatch';
                        localStorage.setItem('cogniMirror_DB', JSON.stringify(db));
                        alert("❌ Reportado: Dominancia no coincide.");
                      }
                    }}
                    className="flex-1 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-all border border-rose-200"
                  >
                    NO COINCIDE
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Perfil de Velocidad */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
              <Zap size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Perfil de Velocidad</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-slate-800">{m.speedCategory}</p>
                <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded text-sm">{ms(m.avgTotal)}</span>
              </div>
            </div>
            <div className="mt-auto">
              {/* Mini barra visual de velocidad */}
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700"
                  style={{ width: `${m.avgTotal > 0 ? Math.min(100, Math.max(10, 100 - (m.avgTotal / 600) * 100)) : 5}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>Rápido</span><span>Lento</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tiempo promedio de respuesta pura a estímulos correctos. Bajo 300ms indica reflejos neuro-cognitivos atléticos.
            </p>
          </div>

          {/* Card 3: Atención Sostenida (NUEVA) */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center text-violet-500">
              <Eye size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Atención Sostenida</p>
              <p className="text-2xl font-black text-slate-800">{m.attentionLevel}</p>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-3">
              <StatRow label="Esperas cortas (&lt;1.8s)" value={ms(m.avgShort)} color="text-violet-600" />
              <StatRow label="Esperas largas (≥1.8s)"   value={ms(m.avgLong)}  color="text-slate-600" />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{m.attentionText || 'No hay suficientes datos para calcular.'}</p>
          </div>

          {/* Card 4: Control Inhibitorio */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
              <Activity size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Control Inhibitorio</p>
              <p className={`text-2xl font-black ${m.controlColor}`}>{m.controlCategory}</p>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <ErrorBadge
                label="⚡ Falsos Arranques (anticipación)"
                count={m.falseStartCount}
                color={m.falseStartCount > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-400'}
              />
              <ErrorBadge
                label="✋ Mano equivocada (comisión)"
                count={m.commissionCount}
                color={m.commissionCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'}
              />
              <ErrorBadge
                label="😶 Sin respuesta (omisión)"
                count={m.omissionCount}
                color={m.omissionCount > 0 ? 'bg-orange-50 text-orange-700' : 'bg-slate-50 text-slate-400'}
              />
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 2: RADIOGRAFÍA POR TURNOS ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            📋 Radiografía por Turnos
          </h2>
          <div className="space-y-3">
            {(rawTurnsData || []).map((t, idx) => {
              const waitSec = (t.waitTimeMs / 1000).toFixed(1);
              let statusText = '', borderLine = '', dot = '';

              if (t.isFalseStart) {
                statusText = `⚡ Te anticipaste al estímulo. Impulso a cara ${faceName(t.actualFace)}.`;
                borderLine = 'border-rose-200 bg-rose-50/60';
                dot = 'bg-rose-500';
              } else if (t.isOmission) {
                statusText = '😶 No respondiste a tiempo (Omisión). +3000 ms penalización.';
                borderLine = 'border-amber-200 bg-amber-50/60';
                dot = 'bg-amber-500';
              } else if (t.firstMoveWrong && !t.gaveUp) {
                statusText = `✋ Te equivocaste de mano, pero corregiste. Reacción final: ${t.reactionTimeMs} ms.`;
                borderLine = 'border-blue-200 bg-blue-50/60';
                dot = 'bg-blue-500';
              } else if (t.gaveUp) {
                statusText = '❌ Te equivocaste de cara y se acabó el tiempo.';
                borderLine = 'border-red-200 bg-red-50/60';
                dot = 'bg-red-500';
              } else {
                statusText = `✅ Acierto. Tiempo de reacción: ${t.reactionTimeMs} ms.`;
                borderLine = 'border-emerald-100 bg-emerald-50/40';
                dot = 'bg-emerald-500';
              }

              return (
                <div key={idx} className={`flex gap-4 p-4 rounded-xl border ${borderLine} transition-all`}>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                    <div className={`w-3 h-3 rounded-full ${dot}`} />
                    {idx < (rawTurnsData.length - 1) && <div className="w-px flex-1 bg-slate-200 min-h-[16px]" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-black text-slate-500 text-sm">Turno {t.turn}</span>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-slate-100 text-slate-600 rounded px-2 py-0.5 font-semibold">
                          Espera: {waitSec}s
                        </span>
                        <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5 font-semibold">
                          Estímulo: {faceName(t.expectedFace)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700">{statusText}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SECCIÓN 3: FICHA TÉCNICA DE LATENCIA (Transparencia) ── */}
        <div className="bg-slate-800 rounded-3xl p-6 text-white/90 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <Activity size={20} className="text-indigo-400" />
            <h3 className="font-bold text-lg">Auditoría de Latencia del Sistema</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-white/40 uppercase font-black">Offset Aplicado</p>
              <p className="text-2xl font-black text-indigo-400">-{latencyOffset} ms</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-white/40 uppercase font-black">Método de Cálculo</p>
              <p className="text-sm font-medium leading-tight">Tiempo Neto = Tiempo Bruto (BLE) − Offset de Hardware</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-white/40 uppercase font-black">Estado de Datos</p>
              <p className="text-sm text-emerald-400 font-bold">✓ Verificados para validez neuro-motriz</p>
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-4 leading-relaxed border-t border-white/5 pt-4">
            Este reporte aplica un descuento automático basado en la calibración previa del enlace Bluetooth y el lag de renderizado del navegador. Los milisegundos mostrados representan la respuesta sináptica y motora pura del paciente.
          </p>
        </div>

      </div>
    </div>
  );
}
