'use client';

// ─────────────────────────────────────────────────────────────
// MOTOR ANALÍTICO — calcula métricas desde rawTurnsData
// ─────────────────────────────────────────────────────────────
function computeMetrics(turns = []) {
  const correctTurns = turns.filter(t => t.esCorrecto && t.tiempoMilisegundos > 0);
  const totalTurns   = turns.filter(t => !t.isFalseStart); // Excluir falsos arranques del conteo

  const rightCorrect = correctTurns.filter(t => t.caraObjetivo === 'R');
  const leftCorrect  = correctTurns.filter(t => t.caraObjetivo === 'L');

  const rightTotal   = turns.filter(t => t.caraObjetivo === 'R' && !t.isFalseStart);
  const leftTotal    = turns.filter(t => t.caraObjetivo === 'L' && !t.isFalseStart);

  const avg = (arr, key) =>
    arr.length ? Math.round(arr.reduce((s, t) => s + t[key], 0) / arr.length) : null;

  const avgRight  = avg(rightCorrect, 'tiempoMilisegundos');
  const avgLeft   = avg(leftCorrect,  'tiempoMilisegundos');
  const avgGlobal = avg(correctTurns, 'tiempoMilisegundos');

  const precision = correctTurns.length;
  const total     = Math.min(10, totalTurns.length); // Maximo muestra

  let dominance = 'Ambidiestra';
  let dominanceIcon = '👐';
  if (avgRight !== null && avgLeft !== null) {
    if (avgRight + 30 < avgLeft)       { dominance = 'Derecha';    dominanceIcon = '👉'; }
    else if (avgLeft + 30 < avgRight)  { dominance = 'Izquierda';  dominanceIcon = '👈'; }
  } else if (avgRight !== null)        { dominance = 'Derecha';    dominanceIcon = '👉'; }
  else if (avgLeft !== null)           { dominance = 'Izquierda';  dominanceIcon = '👈'; }

  const rightAccuracy = rightTotal.length ? Math.round((rightCorrect.length / rightTotal.length) * 100) : 0;
  const leftAccuracy  = leftTotal.length  ? Math.round((leftCorrect.length  / leftTotal.length)  * 100) : 0;

  const impulsivity = turns.filter(t => t.isFalseStart || t.isOmission || (t.firstMoveWrong && !t.isFalseStart)).length;

  return {
    avgGlobal, avgRight, avgLeft,
    dominance, dominanceIcon,
    precision, total,
    rightAccuracy, leftAccuracy,
    rightCorrect: rightCorrect.length, rightTotal: rightTotal.length,
    leftCorrect:  leftCorrect.length,  leftTotal:  leftTotal.length,
    impulsivity,
  };
}

// ─────────────────────────────────────────────────────────────
// Sub-componentes de UI
// ─────────────────────────────────────────────────────────────

function StatCard({ label, value, unit, color = 'purple', icon }) {
  const colorMap = {
    purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20 text-purple-400',
    cyan:   'from-cyan-500/10 to-cyan-600/5 border-cyan-500/20 text-cyan-400',
    emerald:'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
    amber:  'from-amber-500/10 to-amber-600/5 border-amber-500/20 text-amber-400',
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-5 flex flex-col gap-2`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-4xl font-black ${colorMap[color].split(' ').pop()}`}>{value ?? '—'}</span>
        {unit && <span className="text-sm font-bold text-white/30">{unit}</span>}
      </div>
    </div>
  );
}

function AccuracyBar({ label, correct, total, avgMs, color }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const barColor = color === 'red' ? 'bg-red-500' : 'bg-orange-500';
  const textColor = color === 'red' ? 'text-red-400' : 'text-orange-400';
  return (
    <div className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex justify-between items-center">
        <span className={`font-black text-base ${textColor}`}>{label}</span>
        <span className="text-white/60 font-bold tabular-nums">{correct}/{total} correctos</span>
      </div>
      {/* Barra de precisión */}
      <div className="w-full bg-white/5 rounded-full h-3">
        <div
          className={`${barColor} h-3 rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-white/40 font-semibold">
        <span>Precisión: <span className="text-white font-black">{pct}%</span></span>
        <span>TR Promedio: <span className="text-white font-black">{avgMs !== null ? `${avgMs} ms` : 'N/A'}</span></span>
      </div>
    </div>
  );
}

function TurnRow({ t, idx }) {
  const face = t.caraObjetivo;
  const faceColor = face === 'R' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30';
  const faceName  = face === 'R' ? 'Derecha' : 'Izquierda';
  return (
    <tr className="border-t border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-2 px-3 text-white/40 text-center font-mono text-xs">{idx + 1}</td>
      <td className="py-2 px-3">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${faceColor}`}>{faceName}</span>
      </td>
      <td className="py-2 px-3 text-right font-mono font-bold text-white/80 text-sm tabular-nums">
        {t.esCorrecto && t.tiempoMilisegundos > 0 ? `${t.tiempoMilisegundos} ms` : <span className="text-white/20">—</span>}
      </td>
      <td className="py-2 px-3 text-center">
        {t.isFalseStart ? (
          <span className="text-amber-400 text-xs font-bold">Falso arranque</span>
        ) : t.isOmission ? (
          <span className="text-red-400 text-xs font-bold">Omisión</span>
        ) : t.esCorrecto ? (
          <span className="text-emerald-400 text-lg">✓</span>
        ) : (
          <span className="text-red-400 text-lg">✗</span>
        )}
      </td>
    </tr>
  );
}

function ScienceCard({ icon, title, subtitle, href, color }) {
  const colors = {
    blue:   'border-blue-500/20 hover:border-blue-400/40 hover:bg-blue-500/10',
    violet: 'border-violet-500/20 hover:border-violet-400/40 hover:bg-violet-500/10',
    teal:   'border-teal-500/20 hover:border-teal-400/40 hover:bg-teal-500/10',
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-start gap-4 p-4 rounded-2xl border bg-white/5 transition-all duration-200 cursor-pointer group ${colors[color]}`}
    >
      <span className="text-2xl mt-0.5">{icon}</span>
      <div>
        <p className="text-white font-bold text-sm group-hover:text-white/90 transition-colors">{title}</p>
        <p className="text-white/40 text-xs mt-0.5">{subtitle}</p>
      </div>
      <span className="ml-auto text-white/20 group-hover:text-white/60 transition-colors text-lg">→</span>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: ExecutiveReport
// ─────────────────────────────────────────────────────────────
export default function ExecutiveReport({ playerName, date, rawTurnsData = [], latencyOffset, onRestart, onExit, recordId }) {
  const m = computeMetrics(rawTurnsData);

  const dateStr = date ? new Date(date).toLocaleString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) : '—';

  return (
    <div className="min-h-screen bg-[#07080f] text-white font-sans overflow-y-auto">
      <div className="max-w-2xl mx-auto px-5 py-10 flex flex-col gap-10">

        {/* ── ENCABEZADO ── */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/30">Reporte Ejecutivo Neuromotriz</p>
              <h1 className="text-3xl font-black text-white mt-1">{playerName || 'Paciente'}</h1>
              <p className="text-white/40 text-xs mt-1">{dateStr}</p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              {latencyOffset > 0 && (
                <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  Offset calibrado: −{latencyOffset}ms
                </div>
              )}
              <div className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-black text-purple-400 uppercase tracking-widest">
                Muestra: {rawTurnsData.length} registros
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* ── SECCIÓN 1: RESUMEN EJECUTIVO ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">① Resumen Ejecutivo</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label="TR Promedio Global"
              value={m.avgGlobal}
              unit="ms"
              color="purple"
              icon="⚡"
            />
            <StatCard
              label="Mano Dominante"
              value={m.dominance}
              unit={m.dominanceIcon}
              color="cyan"
              icon="🧠"
            />
            <StatCard
              label="Precisión Total"
              value={`${m.precision}/${m.total}`}
              unit="aciertos"
              color={m.precision >= m.total * 0.8 ? 'emerald' : 'amber'}
              icon="🎯"
            />
          </div>
        </section>

        {/* ── SECCIÓN 2: ASIMETRÍA ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">② Desglose por Asimetría Lateral</h2>
          <div className="flex flex-col gap-3">
            <AccuracyBar
              label="🟠 Mano Derecha (Cara Naranja)"
              correct={m.rightCorrect}
              total={m.rightTotal}
              avgMs={m.avgRight}
              color="orange"
            />
            <AccuracyBar
              label="🔴 Mano Izquierda (Cara Roja)"
              correct={m.leftCorrect}
              total={m.leftTotal}
              avgMs={m.avgLeft}
              color="red"
            />
          </div>

          {/* Marcador de asimetría */}
          {m.avgRight && m.avgLeft && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Diferencial de Asimetría</p>
              <p className="text-2xl font-black text-white mt-1">
                {Math.abs(m.avgRight - m.avgLeft)} ms
                <span className="text-sm font-bold text-white/40 ml-2">entre ambas manos</span>
              </p>
              <p className="text-[10px] text-white/30 mt-1">
                {Math.abs(m.avgRight - m.avgLeft) < 30
                  ? '⚖️ Sin asimetría significativa — Perfil Ambidiestro'
                  : m.avgRight < m.avgLeft
                    ? '👉 Ventaja estadística: Mano Derecha'
                    : '👈 Ventaja estadística: Mano Izquierda'}
              </p>
            </div>
          )}
        </section>

        {/* ── SECCIÓN 3: TABLA DE TURNOS ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">③ Telemetría por Turno</h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/30 text-[10px] uppercase tracking-widest">
                  <th className="py-3 px-3 text-center font-black">#</th>
                  <th className="py-3 px-3 text-left font-black">Cara</th>
                  <th className="py-3 px-3 text-right font-black">Tiempo</th>
                  <th className="py-3 px-3 text-center font-black">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {rawTurnsData.map((t, i) => <TurnRow key={i} t={t} idx={i} />)}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── SECCIÓN 4: RESPALDO CIENTÍFICO ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">④ Respaldo Científico</h2>
          <div className="flex flex-col gap-3">
            <ScienceCard
              icon="🧬"
              title="Entiende tu Asimetría Motora"
              subtitle="Lateralización cerebral y dominancia motriz — Neurociencia Cognitiva"
              href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6204651/"
              color="blue"
            />
            <ScienceCard
              icon="🎮"
              title="El Paradigma del TR Complejo (Ley de Hick)"
              subtitle="Cómo la complejidad de la decisión afecta el tiempo de reacción"
              href="https://www.youtube.com/results?search_query=hick%27s+law+reaction+time"
              color="violet"
            />
            <ScienceCard
              icon="🧩"
              title="Por qué usamos un Cubo: Funciones Ejecutivas"
              subtitle="Cardoso et al. (2025) — Cubo Rubik y evaluación de funciones ejecutivas"
              href="https://doi.org/10.1080/01688638.2024.2363286"
              color="teal"
            />
          </div>
        </section>

        {/* ── ACCIONES ── */}
        <section className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onRestart}
            className="flex-1 py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(168,85,247,0.3)]"
          >
            🔄 Nueva Evaluación
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="flex-1 py-4 rounded-2xl font-bold text-white/60 border border-white/10 hover:bg-white/5 transition-all"
            >
              ← Menú Principal
            </button>
          )}
        </section>

        {/* Footer legal */}
        <p className="text-center text-[9px] text-white/20 leading-relaxed">
          Reporte generado por CogniMirror® · Datos procesados localmente · Ley N° 19.628 · {recordId && `ID: ${recordId.slice(0, 8)}...`}
        </p>

      </div>
    </div>
  );
}
