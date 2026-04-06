'use client'; // Necesario en Next.js App Router

import ReactionGame from './ReactionGame';
import ExecutiveReport from './ExecutiveReport';
import OnboardingForm from './OnboardingForm';
import TutorialPhase from './TutorialPhase';
import Cube3DViewer from './Cube3DViewer';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { useState, useEffect, useRef } from 'react';



// ─────────────────────────────────────────────────────────────
// Subcomponentes de cada pantalla
// ─────────────────────────────────────────────────────────────

// ── ESTADO 1: MENÚ ──────────────────────────────────────────
function StepMenu({ onNext, onHistory, playerName, setPlayerName }) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const {
    isConnected,
    latencyOffset,
  } = useBluetoothCube();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-10 px-6 text-center">
      {/* Brillo ambiental decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/20 blur-[120px]" />
      </div>

      <div className="relative flex flex-col items-center gap-3 sm:gap-4 scale-90 sm:scale-100">
        <span className="text-6xl sm:text-7xl drop-shadow-[0_0_30px_rgba(168,85,247,0.7)]">⚡</span>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          Test de{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
            Reacción
          </span>
        </h1>
        <p className="text-white/50 text-sm sm:text-lg max-w-[280px] sm:max-w-sm leading-relaxed">
          Mide tu velocidad de reacción motora y tus funciones ejecutivas en tiempo real.
        </p>
      </div>

      {/* Latency Status Badge */}
      <div className="relative z-10 -mt-4">
        {latencyOffset > 0 ? (
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
              Offset Calibrado: −{latencyOffset}ms
            </span>
          </div>
        ) : (
          <div className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
              Sin calibrar (Precisión Estándar)
            </span>
          </div>
        )}
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col gap-4">
        <input 
          type="text"
          placeholder="Nombre del Paciente"
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          className="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-center text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-semibold"
        />

        <div className="flex flex-col gap-3">
          <button
            onClick={onNext}
            disabled={!playerName.trim() || !acceptedTerms}
            className={`
              relative group px-10 py-5 rounded-2xl font-bold text-xl text-white
              transition-all duration-200 ease-out shadow-[0_0_40px_rgba(168,85,247,0.4)]
              ${(playerName.trim() && acceptedTerms)
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-[0_0_60px_rgba(168,85,247,0.6)] hover:scale-105 active:scale-95' 
                : 'bg-white/10 text-white/40 cursor-not-allowed shadow-none'}
            `}
          >
            Iniciar Test
            <span className="ml-3 inline-block group-hover:translate-x-1 transition-transform">🚀</span>
          </button>

          <button
            onClick={onHistory}
            className="w-full py-4 rounded-2xl font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm uppercase tracking-widest border border-white/5"
          >
            📜 Ver Historial Clinico
          </button>
        </div>

        {/* Disclaimer Legal Ley N° 19.628 */}
        <div className="mt-4 flex flex-col items-center max-w-sm mx-auto gap-3 text-left bg-white/5 border border-white/5 p-4 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border border-white/20 bg-white/5 appearance-none checked:bg-purple-600 checked:border-purple-500 relative flex-shrink-0 transition-colors after:content-['✓'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-white after:font-black after:text-[12px] after:opacity-0 checked:after:opacity-100"
            />
            <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
              Comprendo y Acepto
            </span>
          </label>
          <p className="text-[10px] text-gray-500 leading-relaxed text-justify">
            "Al iniciar esta evaluación, autorizo el procesamiento temporal de mis datos para la generación del Reporte Ejecutivo Neuromotriz. Acepto que mis métricas de interacción (milisegundos y patrones de movimiento) sean encriptadas, estrictamente anonimizadas y desvinculadas de mi identidad, para ser utilizadas de forma estadística en la mejora de algoritmos de salud preventiva, en total cumplimiento de la Ley N° 19.628 sobre Protección de la Vida Privada."
          </p>
        </div>
      </div>
    </div>
  );
}

// ── ESTADO: HISTORIAL ──────────────────────────────────────
function StepHistory({ onBack, onOpenReport }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem('cogniMirror_DB') || '[]');
    setHistory(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
  }, []);

  const downloadAllCSV = () => {
    if (history.length === 0) return;
    const headers = ["Fecha", "Paciente", "Dominancia", "TR Promedio (ms)", "Turno", "Cara", "Tiempo Neto (ms)"];
    const rows = [];
    
    history.forEach(session => {
      session.rawTurnsData.forEach(t => {
        rows.push([
          new Date(session.date).toLocaleString(),
          session.playerName,
          session.metrics.dominance,
          session.metrics.averageReactionTime,
          t.turn,
          t.expectedFace,
          t.reactionTimeMs
        ]);
      });
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CogniMirror_Historial_Completo.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-6 pt-20 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between w-full mb-8">
        <h2 className="text-3xl font-black text-white">Historial</h2>
        <button onClick={downloadAllCSV} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center gap-2">
          📊 Exportar Todo (Excel)
        </button>
      </div>

      <div className="w-full space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        {history.length === 0 ? (
          <p className="text-white/30 text-center py-20">No hay registros aún.</p>
        ) : (
          history.map(record => (
            <div 
              key={record.id}
              onClick={() => onOpenReport(record)}
              className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/10 cursor-pointer transition-all flex items-center justify-between group"
            >
              <div>
                <p className="text-white font-bold text-lg">{record.playerName}</p>
                <p className="text-white/40 text-xs">{new Date(record.date).toLocaleDateString()} · {record.metrics.dominance}</p>
              </div>
              <div className="text-right">
                <p className="text-purple-400 font-black text-xl">{record.metrics.averageReactionTime} ms</p>
                <p className="text-[10px] text-white/20 uppercase tracking-widest font-black group-hover:text-white/60 transition-colors">Ver Detalles →</p>
              </div>
            </div>
          ))
        )}
      </div>

      <button onClick={onBack} className="mt-8 text-white/40 hover:text-white transition-colors font-bold uppercase tracking-widest text-xs">
        ← Volver al Menú
      </button>
    </div>
  );
}

// ── ESTADO 2: CALIBRACIÓN ───────────────────────────────────
function StepCalibration({ onNext }) {
  const { subscribeToGyro } = useBluetoothCube();
  const [gyroData, setGyroData] = useState(null);

  useEffect(() => {
    const unsub = subscribeToGyro((data) => {
      setGyroData(data);
    });
    return () => unsub();
  }, [subscribeToGyro]);

  // Coordenadas de rotación objetivo para Three.js:
  // Blanco arriba (Y+), Azul al frente (Z-)
  // Ajusta estos valores según tu sistema de coordenadas en Cube3D
  const calibrationRotation = { x: 0, y: 0, z: 0 }; // posición estándar: blanco arriba, azul al frente

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-6 text-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-cyan-500/10 blur-[100px]" />
      </div>

      {/* Indicador de paso */}
      <StepIndicator current={2} total={4} />

      <div className="relative flex flex-col items-center gap-2">
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Calibración Física
        </h2>
        <p className="text-white/60 text-sm sm:text-lg">
          Para empezar, sostén tu cubo{' '}
          <span className="text-cyan-400 font-semibold">exactamente así:</span>
        </p>
      </div>

      {/* Cubo 3D Real (Three.js) */}
      <div className="w-48 h-48 sm:w-64 sm:h-64 relative bg-white/5 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden">
        <Cube3DViewer
          targetRotation={gyroData || calibrationRotation}
          status={gyroData ? 'gyro_active' : 'teaching'}
          className="scale-110"
        />
      </div>

      {/* Instrucciones de orientación */}
      <div className="flex gap-2 sm:gap-4">
        <OrientationBadge
          emoji="⬆️"
          label="C. Blanca"
          sublabel="al techo"
          color="bg-white/10 border-white/20"
        />
        <OrientationBadge
          emoji="👁️"
          label="C. Azul"
          sublabel="a ti"
          color="bg-blue-500/10 border-blue-400/30"
        />
      </div>

      <button
        onClick={onNext}
        className="
          px-10 py-4 rounded-2xl font-bold text-lg text-white
          bg-gradient-to-r from-cyan-600 to-blue-600
          shadow-[0_0_30px_rgba(6,182,212,0.3)]
          hover:shadow-[0_0_50px_rgba(6,182,212,0.5)]
          hover:scale-105 active:scale-95
          transition-all duration-200
        "
      >
        Ya lo tengo así ✅
      </button>
    </div>
  );
}


// ── ESTADO 4: CUENTA REGRESIVA ──────────────────────────────
function StepReadyToPlay({ onGameStart }) {
  const [count, setCount] = useState(3);
  const [started, setStarted] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setStarted(true);
          // Pequeño delay para que el usuario vea "¡YA!" antes de que arranque el juego
          setTimeout(() => onGameStart(), 600);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [onGameStart]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-6 text-center">
      {/* Pulso de fondo */}
      <div
        className={`
          absolute inset-0 flex items-center justify-center pointer-events-none
          transition-opacity duration-300
          ${started ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <div className="w-[700px] h-[700px] rounded-full bg-green-500/20 animate-ping" />
      </div>

      <p className="text-white/40 uppercase tracking-[0.4em] text-sm font-semibold">
        Preparado...
      </p>

      {/* Número de cuenta regresiva */}
      <div
        key={count} // Re-monta para re-disparar la animación en cada cambio
        className={`
          font-black leading-none select-none
          transition-all duration-100
          ${started
            ? 'text-green-400 text-9xl drop-shadow-[0_0_60px_rgba(74,222,128,0.9)] scale-125'
            : 'text-white text-[10rem] drop-shadow-[0_0_40px_rgba(255,255,255,0.4)] scale-100'
          }
          animate-pop-in
        `}
      >
        {started ? '¡YA!' : count}
      </div>

      <p className="text-white/30 text-sm">
        {started ? 'Iniciando...' : 'Prepara tus dedos sobre el cubo'}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Componentes de apoyo
// ─────────────────────────────────────────────────────────────

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`
            rounded-full transition-all duration-300
            ${i + 1 === current
              ? 'w-8 h-2 bg-white'
              : i + 1 < current
              ? 'w-2 h-2 bg-white/40'
              : 'w-2 h-2 bg-white/15'
            }
          `}
        />
      ))}
    </div>
  );
}

function OrientationBadge({ emoji, label, sublabel, color }) {
  return (
    <div
      className={`
        flex flex-col items-center gap-1 px-5 py-4 rounded-xl border
        backdrop-blur-sm ${color}
      `}
    >
      <span className="text-3xl">{emoji}</span>
      <span className="text-white font-bold text-sm">{label}</span>
      <span className="text-white/50 text-xs">{sublabel}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL — ReactionGameView
// ─────────────────────────────────────────────────────────────

/**
 * Flujo de Onboarding para el Test de Reacción.
 *
 * Props:
 *   onExit        — (fn) Callback para salir del flujo y volver al menú principal.
 *   onGameReady   — (fn) Callback que se dispara cuando la cuenta regresiva llega a 0.
 *                        Aquí conectarás tu startGameLoop().
 */
export default function ReactionGameView({ onExit, onGameReady }) {
  const [step, setStep] = useState('menu');
  const [playerName, setPlayerName] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);

  function startGameLoop() {
    setStep('playing');
    if (typeof onGameReady === 'function') onGameReady();
  }

  function handleOnboardingComplete(meta) {
    setSessionMeta(meta);
    setStep('ready_to_play');
  }

  function handleOpenReport(record) {
    setSelectedRecord(record);
    setStep('view_report');
  }

  return (
    <div className="relative min-h-screen bg-[#07080f] overflow-hidden font-sans">
      {step !== 'ready_to_play' && (
        <button
          onClick={step === 'view_report' ? () => setStep('history') : onExit}
          className="absolute top-5 left-5 z-50 flex items-center gap-2 px-3 py-2 rounded-lg text-white/40 hover:text-white/80 text-sm hover:bg-white/5 transition-all duration-150 no-print"
        >
          ← Volver
        </button>
      )}

      {step === 'menu' && (
        <StepMenu 
          onNext={() => setStep('calibration')} 
          onHistory={() => setStep('history')}
          playerName={playerName} 
          setPlayerName={setPlayerName} 
        />
      )}

      {step === 'history' && (
        <StepHistory onBack={() => setStep('menu')} onOpenReport={handleOpenReport} />
      )}

      {step === 'view_report' && selectedRecord && (
        <ExecutiveReport
          playerName={selectedRecord.playerName}
          date={selectedRecord.date}
          rawTurnsData={selectedRecord.rawTurnsData}
          latencyOffset={0}
          onRestart={() => setStep('menu')}
          onExit={() => setStep('history')}
          recordId={selectedRecord.id}
        />
      )}

      {step === 'calibration' && (
        <StepCalibration onNext={() => setStep('tutorial')} />
      )}
      {step === 'tutorial' && (
        <TutorialPhase onCompleteTutorial={() => setStep('onboarding')} />
      )}
      {step === 'onboarding' && (
        <OnboardingForm
          playerName={playerName}
          onComplete={handleOnboardingComplete}
        />
      )}
      {step === 'ready_to_play' && (
        <StepReadyToPlay onGameStart={startGameLoop} />
      )}
      {step === 'playing' && (
        <ReactionGame
          onExit={() => { setStep('menu'); setPlayerName(''); setSessionMeta(null); }}
          playerName={playerName}
          sessionMeta={sessionMeta}
        />
      )}
    </div>
  );
}
