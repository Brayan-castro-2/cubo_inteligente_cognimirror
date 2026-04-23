'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useBluetoothCube } from '../../contexts/BluetoothContext';
import { useCubeState } from '../../contexts/CubeStateContext';
import { useJoicube } from '../../contexts/JoicubeContext';
import Cube3DViewer from '../../components/Cube3DViewer';
import MoveFeedOverlay from '../../components/MoveFeedOverlay';

// ─── Utilidad: formatear tiempo ───────────────────────────────
function formatTime(ms) {
  const m = Math.floor(ms / 60000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  const mil = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `${m}:${s}.${mil}`;
}

export default function ClassicDashboard() {
  const { isConnected, device, connectBLE, batteryLevel, subscribeToMoves, broadcastMove, calibrateGyro } = useBluetoothCube();
  const { moveHistory, cubeRotation, resetCubeState } = useCubeState();
  const joicube = useJoicube();

  const [activeTab, setActiveTab] = useState('session');
  // Lógica de stats vive en refs para performance
  const stateRef = useRef({
    appMode: 'FREE',
    timerRunning: false,
    timerStart: 0,
    timerElapsed: 0,
    timerInterval: null,
    moveHistory: [],
    faceCounts: { U: 0, "U'": 0, D: 0, "D'": 0, R: 0, "R'": 0, L: 0, "L'": 0, F: 0, "F'": 0, B: 0, "B'": 0 },
    clockwiseCount: 0,
    counterClockwiseCount: 0,
    maxTps: 0,
    maxPauseMs: 0,
    lastMoveTime: 0,
    idleTotalMs: 0,
    sgActive: false,
    sgSequence: [],
    sgIndex: 0,
  });

  // ── Sincronización de Movimientos Globales con Stats del Dashboard ──
  useEffect(() => {
    const unsub = subscribeToMoves((notation) => {
      handleMoveStats(notation);
    });
    return () => unsub();
  }, [subscribeToMoves]);

  // Actualización del timer
  useEffect(() => {
    const interval = setInterval(() => {
      const s = stateRef.current;
      if (s.timerRunning) {
        s.timerElapsed = performance.now() - s.timerStart;
        updateUI();
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  function handleMoveStats(notation) {
    const s = stateRef.current;
    const now = performance.now();
    
    // Scramble Logic
    if (s.sgActive && s.sgIndex < s.sgSequence.length) {
        if (notation === s.sgSequence[s.sgIndex]) {
          s.sgIndex++;
          if (s.sgIndex >= s.sgSequence.length) finishScramble();
          else renderSgStep();
        }
    }

    if (s.appMode === 'READY') startSolving();
    if (s.appMode === 'SOLVING' || s.appMode === 'FREE') recordStats(notation, now);
  }

  function recordStats(notation, now) {
    const s = stateRef.current;
    s.moveHistory.push({ move: notation, t: now });

    const key = notation.length > 1 && notation[1] === "'" ? notation.substring(0, 2) : notation.charAt(0);
    if (s.faceCounts[key] !== undefined) s.faceCounts[key]++;
    if (notation.includes("'")) s.counterClockwiseCount++; else s.clockwiseCount++;

    if (s.lastMoveTime > 0) {
      const dt = now - s.lastMoveTime;
      if (dt > 1000) s.idleTotalMs += dt; 
      if (dt > s.maxPauseMs) s.maxPauseMs = dt; // Registro de la Pausa Prolongada (Mayor latencia clínica)
      if (dt > 0 && 1 / (dt / 1000) > s.maxTps) s.maxTps = 1 / (dt / 1000);
    }
    s.lastMoveTime = now;
    
    updateUI();
    showTpsBadgeUI();
  }

  function startSolving() {
    const s = stateRef.current;
    s.appMode = 'SOLVING';
    s.timerStart = performance.now();
    s.timerRunning = true;
    setText('timer-label', 'Evaluando...');
  }

  function updateUI() {
    const s = stateRef.current;
    const t = formatTime(s.timerElapsed);
    setText('big-timer', t); setText('hdr-time', t);
    
    const secs = s.timerElapsed / 1000;
    const tps = secs > 0 ? (s.moveHistory.length / secs).toFixed(2) : '0.00';
    setText('st-tps', tps); setText('hdr-tps', tps);
    setText('hdr-moves', s.moveHistory.length);
    setText('st-moves', s.moveHistory.length);
    setText('st-total', s.moveHistory.length);
    setText('st-cw', s.clockwiseCount);
    setText('st-ccw', s.counterClockwiseCount);
    setText('st-max-tps', s.maxTps.toFixed(2));
    
    let displayIdle = s.idleTotalMs;
    let currentPause = 0;
    if (s.lastMoveTime > 0 && s.timerRunning) {
        currentPause = performance.now() - s.lastMoveTime;
        if (currentPause > 1000) displayIdle += currentPause;
    }
    
    // UI Actualización (Pausa Prolongada: Usamos la mayor entre la calculada y la actual en curso)
    const effectiveMaxPause = Math.max(s.maxPauseMs, currentPause);
    setText('st-idle', formatTime(effectiveMaxPause)); // Reemplazamos "idleTotalMs" por Pausa Prolongada
    
    // Update Log chip (only if changed)
    const log = document.getElementById('move-log');
    if (log && s.moveHistory.length > 0) {
        const last = s.moveHistory[s.moveHistory.length - 1].move;
        if (log.innerHTML.includes('Esperando')) log.innerHTML = '';
        if (log.children.length < s.moveHistory.length) {
            const chip = document.createElement('span');
            chip.className = 'move-chip' + (last.includes("'") ? ' prime' : '');
            chip.textContent = last;
            log.appendChild(chip);
            log.scrollTop = log.scrollHeight;
        }
    }
  }

  function showTpsBadgeUI() {
    const badge = document.getElementById('tps-badge');
    if (!badge) return;
    badge.classList.add('show');
    setTimeout(() => badge.classList.remove('show'), 1500);
  }

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  function renderSgStep() {
    const s = stateRef.current;
    const total = s.sgSequence.length;
    setText('sg-progress', `SCRAMBLE — MOVIMIENTO ${s.sgIndex + 1} DE ${total}`);
    const seq = document.getElementById('sg-sequence');
    if (seq) {
      seq.innerHTML = '';
      s.sgSequence.forEach((m, i) => {
        const chip = document.createElement('span');
        chip.className = 'sg-chip' + (i < s.sgIndex ? ' done' : i === s.sgIndex ? ' current' : '');
        chip.textContent = m; seq.appendChild(chip);
      });
    }
    const move = s.sgSequence[s.sgIndex];
    const bigEl = document.getElementById('sg-big-move');
    if (bigEl) bigEl.innerHTML = move.includes("'") ? `${move[0]}<span class="prime-char">'</span>` : move;
    
    // Broadcast scramble moves to the global cube
    broadcastMove(move);
  }

  function startGuidedScramble() {
    const s = stateRef.current;
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    s.sgSequence = Array.from({length: 20}, () => faces[Math.floor(Math.random()*6)] + (Math.random() > 0.5 ? "'" : ""));
    s.sgIndex = 0; s.sgActive = true;
    document.getElementById('scramble-guide').classList.add('active');
    renderSgStep();
  }

  function finishScramble() {
    stateRef.current.sgActive = false;
    document.getElementById('scramble-guide')?.classList.remove('active');
    resetStats();
  }

  function resetStats() {
    const s = stateRef.current;
    s.timerRunning = false;
    s.timerElapsed = 0;
    s.moveHistory = [];
    s.faceCounts = { U: 0, "U'": 0, D: 0, "D'": 0, R: 0, "R'": 0, L: 0, "L'": 0, F: 0, "F'": 0, B: 0, "B'": 0 };
    s.clockwiseCount = 0; s.counterClockwiseCount = 0; s.maxTps = 0; s.lastMoveTime = 0; s.idleTotalMs = 0;
    updateUI();
    const log = document.getElementById('move-log');
    if (log) log.innerHTML = '<span style="color:#64748b;font-style:italic">Esperando inicio...</span>';
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
        :root { --bg:#0a0c10;--surface:#13161e;--card:#1a1e2a;--border:rgba(255,255,255,0.07);--accent:#2563eb;--green:#22c55e;--yellow:#fbbf24;--red:#ef4444;--text:#e2e8f0;--muted:#64748b; }
        .dashboard-body { background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column; }
        header { display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;z-index:10; }
        .logo { font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:8px; }
        .logo span{color:var(--accent)}
        .header-stats{display:flex;align-items:center;gap:20px;font-size:.85rem}
        .header-stat{color:var(--muted)} .header-stat strong{color:var(--text);font-size:1rem}
        .ble-badge{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:var(--card);border:1px solid var(--border);cursor:pointer;font-size:.8rem;transition:all .2s}
        .ble-badge:hover{border-color:var(--accent)}
        .ble-dot{width:8px;height:8px;border-radius:50%;background:var(--red);transition:background .3s}
        .ble-dot.ok{background:var(--green);box-shadow:0 0 8px var(--green)}
        .main{display:flex;flex:1;overflow:hidden}
        .cube-panel{flex:1;position:relative;min-width:0}
        .canvas-wrapper{width:100%;height:100%;touch-action:none}
        .cube-overlay{position:absolute;bottom:20px;left:20px;display:flex;gap:8px}
        .cube-btn{padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:rgba(10,12,16,.8);color:var(--text);font-family:inherit;font-size:.8rem;font-weight:600;cursor:pointer;backdrop-filter:blur(10px);transition:all .2s}
        .cube-btn:hover{background:var(--card);border-color:var(--accent)}
        .joicube-btn{padding:8px 16px;border-radius:8px;border:1.5px solid rgba(168,85,247,0.4);background:rgba(10,12,16,.8);color:#c084fc;font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer;backdrop-filter:blur(10px);transition:all .2s;display:flex;align-items:center;gap:6px}
        .joicube-btn:hover{background:rgba(168,85,247,0.1);border-color:#c084fc}
        .joicube-btn.active{background:rgba(168,85,247,0.2);border-color:#a855f7;color:#e9d5ff;box-shadow:0 0 16px rgba(168,85,247,.35)}
        .joicube-btn.connecting{opacity:.7;cursor:wait}
        .joicube-btn.error{border-color:var(--red);color:var(--red)}
        .tps-badge{position:absolute;top:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:6px 18px;border-radius:20px;font-size:.85rem;font-weight:700;letter-spacing:1px;opacity:0;transition:opacity .3s;pointer-events:none}
        .tps-badge.show{opacity:1}
        .stats-panel{width:360px;flex-shrink:0;background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
        .stats-tabs{display:flex;border-bottom:1px solid var(--border)}
        .tab{flex:1;padding:12px;text-align:center;font-size:.78rem;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
        .tab.active{color:var(--accent);border-bottom-color:var(--accent);background:rgba(37,99,235,.05)}
        .tab-content{flex:1;overflow-y:auto;padding:16px;display:none}
        .tab-content.active{display:block}
        .stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}
        .stat-card h3{font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px}
        .stat-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
        .stat-row .label{font-size:.82rem;color:var(--muted)} .stat-row .value{font-size:1rem;font-weight:700;color:var(--text)}
        .big-timer{text-align:center;font-size:2.2rem;font-weight:900;letter-spacing:2px;color:var(--accent);margin:8px 0 4px}
        #move-log{background:rgba(0,0,0,.3);border-radius:8px;padding:10px;min-height:60px;max-height:90px;overflow-y:auto;font-family:'Courier New',monospace;font-size:.85rem;line-height:1.8;word-break:break-all}
        .move-chip{display:inline-block;background:#1d4ed8;color:white;padding:1px 7px;border-radius:4px;margin:1px;font-weight:600;font-size:.78rem}
        .move-chip.prime{background:#7c3aed}
        #scramble-guide{display:none;position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(10,12,16,.97) 80%,transparent);padding:20px 20px 24px;text-align:center;z-index:20}
        #scramble-guide.active{display:block}
        .sg-sequence{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:14px}
        .sg-chip{padding:3px 10px;border-radius:6px;background:var(--card);border:1px solid var(--border);font-size:.75rem;font-weight:700;color:var(--muted);transition:all .2s}
        .sg-chip.done{background:#14532d;border-color:var(--green);color:var(--green);opacity:.55}
        .sg-chip.current{background:var(--accent);border-color:var(--accent);color:white;transform:scale(1.15);box-shadow:0 0 16px rgba(37,99,235,.6)}
        .sg-big-move{font-size:5rem;font-weight:900;color:white;line-height:1;letter-spacing:-2px;text-shadow:0 0 30px rgba(37,99,235,.8);margin-bottom:6px}
        .sg-btn{padding:7px 18px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);font-family:inherit;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s}
        .prime-char{color:#a78bfa}
      `}} />

      <div className="dashboard-body">
        <header>
          <div className="logo">🧊 <span>Cogni</span>Mirror Cube</div>
          <div className="header-stats">
            <div className="header-stat">Rotaciones: <strong id="hdr-moves">0</strong></div>
            <div className="header-stat">Tiempo: <strong id="hdr-time">00:00.000</strong></div>
            <div className="header-stat">TPS: <strong id="hdr-tps">0.00</strong></div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link href="/reaction-game" className="cube-btn" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--accent)' }}>🎮 Test</Link>
            <div className="ble-badge" onClick={connectBLE}>
              <div className={`ble-dot ${isConnected ? 'ok' : ''}`} />
              <span>{isConnected ? device : 'Conectar'}</span>
            </div>
          </div>
        </header>

        <div className="main">
          <div className="cube-panel">
            <div className="canvas-wrapper">
                <Cube3DViewer status="gyro_active" size={380} />
            </div>
            <div className="tps-badge" id="tps-badge">TPS Real-time</div>

            <div id="scramble-guide">
              <div className="sg-progress" id="sg-progress">SCRAMBLE</div>
              <div className="sg-sequence" id="sg-sequence" />
              <div className="sg-big-move" id="sg-big-move">U</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                <button className="sg-btn" onClick={() => { const s = stateRef.current; s.sgIndex++; renderSgStep(); }}>Siguiente →</button>
                <button className="sg-btn" style={{color:'red'}} onClick={finishScramble}>✕ Cancelar</button>
              </div>
            </div>

            <div className="cube-overlay">
              <button className="cube-btn" onClick={startGuidedScramble} style={{ background: 'var(--accent)', color: 'white' }}>🔀 Scramble</button>
              <button className="cube-btn" onClick={() => { resetCubeState(); resetStats(); }} style={{ color: 'var(--green)' }}>🧩 Resolver</button>
              <button className="cube-btn" onClick={calibrateGyro}>⚓ Calibrar</button>

              {/* ── Botón Joicube ── */}
              <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className={`joicube-btn ${joicube.status === 'no_server' ? 'error' : joicube.status}`}
                  onClick={joicube.toggle}
                  title={joicube.status === 'active'
                    ? 'Joicube activo — click para desactivar'
                    : joicube.status === 'no_server'
                    ? 'Servidor no disponible — ejecuta: python scripts/cube_keys.py'
                    : 'Usar el cubo como joystick (requiere cube_keys.py)'}
                >
                  {joicube.status === 'connecting' && (
                    <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', border:'2px solid #c084fc', borderTopColor:'transparent', animation:'spin .6s linear infinite' }} />
                  )}
                  {joicube.status === 'active' && (
                    <span style={{ width:8, height:8, borderRadius:'50%', background:'#a855f7', boxShadow:'0 0 8px #a855f7', display:'inline-block', flexShrink:0 }} />
                  )}
                  {joicube.status === 'no_server' && '⚠️'}
                  {(joicube.status === 'idle') && '🕹️'}
                  {joicube.status === 'active'     ? 'Joicube ON'    :
                   joicube.status === 'connecting' ? 'Conectando…'   :
                   joicube.status === 'no_server'  ? 'Sin servidor'  : 'Joicube'}
                </button>

                {/* Dropdown de perfiles (solo visible si está activo o conectado exitosamente) */}
                {(joicube.status === 'active' || joicube.profiles.length > 1) && joicube.status !== 'no_server' && (
                  <select 
                    value={joicube.currentProfile}
                    onChange={(e) => joicube.changeProfile(e.target.value)}
                    style={{
                      background: 'rgba(10,12,16,.8)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text)', padding: '6px 12px', borderRadius: '8px',
                      fontSize: '0.8rem', fontWeight: 600, outline: 'none', cursor: 'pointer',
                      backdropFilter: 'blur(10px)'
                    }}
                  >
                    {joicube.profiles.map(p => (
                      <option key={p} value={p}>{p.replace('_', ' ')}</option>
                    ))}
                  </select>
                )}

                {/* Tooltip de no_server con instrucción clara */}
                {joicube.status === 'no_server' && joicube.errorMsg && (
                  <div style={{
                    position:'absolute', bottom:'calc(100% + 8px)', left:0,
                    background:'#100808', border:'1px solid rgba(239,68,68,0.5)',
                    borderRadius:10, padding:'10px 14px', fontSize:11,
                    color:'rgba(255,255,255,0.7)', zIndex:100, minWidth:250,
                    lineHeight:1.7, boxShadow:'0 8px 30px rgba(0,0,0,.7)',
                    backdropFilter: 'blur(10px)',
                  }}>
                    <div style={{ color:'#f87171', fontWeight:700, marginBottom:4 }}>
                      🕹️ Servidor de teclas no encontrado
                    </div>
                    <div>Abre una terminal y ejecuta:</div>
                    <code style={{
                      display:'block', marginTop:4,
                      background:'rgba(255,255,255,0.08)', borderRadius:6,
                      padding:'4px 8px', fontFamily:'monospace', fontSize:11,
                      color:'#c084fc',
                    }}>
                      python scripts/cube_keys.py
                    </code>
                    <div style={{ marginTop:4, color:'rgba(255,255,255,0.4)', fontSize:10 }}>
                      El cubo BLE permanece conectado. Solo suma teclas.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="stats-panel">
            <div className="stats-tabs">
              {['session', 'moves', 'ble'].map(tab => (
                <div key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                  {tab === 'session' ? 'Sesión' : tab === 'moves' ? 'Movimientos' : '📡 BLE'}
                </div>
              ))}
            </div>

            <div className={`tab-content ${activeTab === 'session' ? 'active' : ''}`}>
              <div className="stat-card">
                <h3>⏱ Temporizador</h3>
                <div className="big-timer" id="big-timer">00:00.000</div>
                <div className="timer-label" id="timer-label">Práctica libre (Sin grabar)</div>
                <div className="stat-row"><span className="label">Rotaciones</span><span className="value" id="st-moves" style={{ color: 'var(--accent)' }}>0</span></div>
              </div>
              <div className="stat-card">
                <h3>📋 Registro</h3>
                <div id="move-log"><span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Esperando inicio...</span></div>
              </div>
              <div className="stat-card">
                 <h3>📊 Resumen</h3>
                 <div className="stat-row"><span className="label">Total Movimientos</span><span className="value" id="st-total">0</span></div>
                 <div className="stat-row"><span className="label">TPS Máximo</span><span className="value" id="st-max-tps">0.00</span></div>
                 <div className="stat-row"><span className="label">Pausa Prolongada</span><span className="value" id="st-idle">00:00.000</span></div>
              </div>
            </div>

            {/* ── Tab Movimientos (historial de chips) ── */}
            <div className={`tab-content ${activeTab === 'moves' ? 'active' : ''}`}>
              <div className="stat-card">
                <h3>📋 Secuencia Completa</h3>
                <div id="move-log-full" style={{ background:'rgba(0,0,0,.3)', borderRadius:8, padding:10, minHeight:80, maxHeight:240, overflowY:'auto', fontFamily:'Courier New,monospace', fontSize:'.85rem', lineHeight:1.8, wordBreak:'break-all' }}>
                  <span style={{ color:'var(--muted)', fontStyle:'italic' }}>Gira el cubo para ver la secuencia...</span>
                </div>
              </div>
              <div className="stat-card">
                <h3>🔢 TPS en Vivo</h3>
                <div className="stat-row"><span className="label">TPS Actual</span><span className="value" id="st-tps">0.00</span></div>
                <div className="stat-row"><span className="label">Horario (CW)</span><span className="value" id="st-cw">0</span></div>
                <div className="stat-row"><span className="label">Antihorario (CCW)</span><span className="value" id="st-ccw">0</span></div>
              </div>
            </div>

            {/* ── Tab BLE Diagnóstico ── */}
            <div className={`tab-content ${activeTab === 'ble' ? 'active' : ''}`}>
              <div style={{ padding: '4px 0 12px' }}>
                <MoveFeedOverlay />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
