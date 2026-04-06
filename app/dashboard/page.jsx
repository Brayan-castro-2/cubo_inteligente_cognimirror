'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useBluetoothCube } from '../../contexts/BluetoothContext';

// ─── Utilidad: formatear tiempo ───────────────────────────────
function formatTime(ms) {
  const m = Math.floor(ms / 60000).toString().padStart(2, '0');
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  const mil = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `${m}:${s}.${mil}`;
}

export default function ClassicDashboard() {
  const { isConnected, device, connectBLE, batteryLevel, subscribeToMoves, subscribeToGyro, broadcastMove, calibrateGyro, gyroConfig, setGyroConfig } = useBluetoothCube();

  // Toda la lógica del dashboard vive en refs para no disparar re-renders
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
    lastMoveTime: 0,
    idleTotalMs: 0,
    interMoveTimes: [],
    phaseShifts: 0,
    inBurst: false,
    inhibitoryErrors: 0,
    workingMemErrors: 0,
    sgActive: false,
    sgSequence: [],
    sgIndex: 0,
    isAnimating: false,
    moveQueue: [],
    gyroActive: false,
    currentGyro: { x: 0, y: 0, z: 0 },
  });
  const threeRef = useRef(null); // THREE scene state
  const containerRef = useRef(null);
  const unsubRef = useRef(null);

  // ── Mount: initialize Three.js and subscribe to BLE ─────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let mounted = true;

    // Dynamically load Three.js scripts (already in public/old-index.html, but we need them here)
    const initThree = async () => {
      // Check if THREE is already on window (loaded from a script tag)
      if (!window.THREE) {
        console.warn('THREE.js not loaded yet. For full 3D support, add script to layout.');
        return;
      }
      if (!mounted || !containerRef.current) return;
      setupThreeScene();
    };

    // Small delay to ensure the DOM is ready
    const timeout = setTimeout(initThree, 100);

    // Subscribe to global BLE moves
    unsubRef.current = subscribeToMoves((notation) => {
      console.log("Dashboard received move via context:", notation);
      if (mounted) handleMoveInternal(notation);
    });

    // Subscribe to global BLE Gyro (ESP32)
    const unsubGyro = subscribeToGyro((data) => {
      const s = stateRef.current;
      if (mounted && data) {
        s.gyroActive = true;
        s.currentGyro = data;
      }
    });

    // Keyboard listener — solo broadcastMove, el listener del dashboard ya lo procesará
    const onKey = (e) => {
      const k = e.key.toUpperCase();
      if ('UDLRFB'.includes(k) && k.length === 1) {
        const notation = k + (e.shiftKey ? "'" : "");
        // broadcastMove envía a todos los listeners, incluyendo handleMoveInternal
        broadcastMove(notation);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      if (unsubRef.current) unsubRef.current();
      if (unsubGyro) unsubGyro();
      window.removeEventListener('keydown', onKey);
      const s = stateRef.current;
      if (s.timerInterval) clearInterval(s.timerInterval);
      // Dispose Three.js
      if (threeRef.current?.renderer) {
        threeRef.current.renderer.dispose();
      }
    };
  }, [subscribeToMoves, broadcastMove]);

  // ─── Three.js Scene Setup ─────────────────────────────────────
  function setupThreeScene() {
    if (!window.THREE || !containerRef.current) return;
    const THREE = window.THREE;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c10);
    scene.fog = new THREE.Fog(0x0a0c10, 20, 80);

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(1.5, 1.5, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.innerHTML = ''; // Fix Next.js Strict Mode double-canvas bug
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(8, 15, 10); dir.castShadow = true; scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x88aaff, 0.3);
    dir2.position.set(-8, -5, -10);
    scene.add(dir2);

    let controls = null;
    if (window.THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false; controls.enableDamping = true;
      controls.dampingFactor = 0.06; controls.minDistance = 5; controls.maxDistance = 20;
    }

    // Configuración Visual del Cubo 3D (Sincronizado con version funcional 'old-index'):
    // F (z=1, frente) = Verde | B (z=-1, atrás) = Azul
    // R (x=1, derecha) = Rojo | L (x=-1, izquierda) = Naranja
    // U (y=1, arriba) = Blanco | D (y=-1, abajo) = Amarillo
    const COLORS = { 
      U: 0xffffff, D: 0xffd500, 
      F: 0x009e60, B: 0x0051ba, 
      R: 0xc41e3a, L: 0xff5800, 
      CORE: 0x1a1a1a 
    };
    const cubeGroup = new THREE.Group();
    cubeGroup.rotation.order = 'YXZ'; // Mejor orden para tracking de mano; evita bloqueo de ejes
    scene.add(cubeGroup);
    const allCubies = [];

    // Build cube
    const geo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const mats = [
        new THREE.MeshPhongMaterial({ color: x === 1 ? COLORS.R : COLORS.CORE, shininess: 80 }),
        new THREE.MeshPhongMaterial({ color: x === -1 ? COLORS.L : COLORS.CORE, shininess: 80 }),
        new THREE.MeshPhongMaterial({ color: y === 1 ? COLORS.U : COLORS.CORE, shininess: 80 }),
        new THREE.MeshPhongMaterial({ color: y === -1 ? COLORS.D : COLORS.CORE, shininess: 80 }),
        new THREE.MeshPhongMaterial({ color: z === 1 ? COLORS.F : COLORS.CORE, shininess: 80 }),
        new THREE.MeshPhongMaterial({ color: z === -1 ? COLORS.B : COLORS.CORE, shininess: 80 }),
      ];
      const cubie = new THREE.Mesh(geo, mats);
      cubie.position.set(x, y, z);
      cubie.userData = { origX: x, origY: y, origZ: z };
      cubeGroup.add(cubie); allCubies.push(cubie);
    }

    const MOVES_CONFIG = {
      'U': { axis: 'y', val: 1, angle: -Math.PI / 2 }, 'D': { axis: 'y', val: -1, angle: Math.PI / 2 },
      'R': { axis: 'x', val: 1, angle: -Math.PI / 2 }, 'L': { axis: 'x', val: -1, angle: Math.PI / 2 },
      'F': { axis: 'z', val: 1, angle: -Math.PI / 2 }, 'B': { axis: 'z', val: -1, angle: Math.PI / 2 },
      // Capas Medias (Slice moves)
      'M': { axis: 'x', val: 0, angle: -Math.PI / 2 }, 
      'E': { axis: 'y', val: 0, angle: Math.PI / 2 }, 
      'S': { axis: 'z', val: 0, angle: -Math.PI / 2 },
      // Rotaciones de todo el cubo (Cube rotations)
      'X': { axis: 'x', val: null, angle: -Math.PI / 2 },
      'Y': { axis: 'y', val: null, angle: -Math.PI / 2 },
      'Z': { axis: 'z', val: null, angle: -Math.PI / 2 },
    };


    const checkIfSolved = () => {
      const s = stateRef.current;
      if (!s.timerRunning || s.moveHistory.length < 5) return false;
      const solved = allCubies.every(c => {
        return Math.abs(c.position.x - Math.round(c.userData.origX)) < 0.15 &&
               Math.abs(c.position.y - Math.round(c.userData.origY)) < 0.15 &&
               Math.abs(c.position.z - Math.round(c.userData.origZ)) < 0.15;
      });
      return solved;
    };


    const rotateFace = (axis, val, angle, steps = 7) => new Promise(resolve => {
      // Filtrar piezas (Si val es null, rotamos todo el cubo)
      const active = allCubies.filter(c => {
        if (val === null) return true;
        return Math.abs(c.position[axis] - val) < 0.5;
      });
      
      const pivot = new THREE.Object3D();
      cubeGroup.add(pivot);
      active.forEach(c => pivot.attach(c));
      
      const dA = steps > 0 ? angle / steps : 0; 
      let step = 0;
      
      const tick = () => {
        if (steps > 0 && step < steps) { 
          pivot.rotation[axis] += dA; 
          step++; 
          requestAnimationFrame(tick); 
        } else {
          // Snap exacto de rotación AL INSTANTE si steps=0 o al finalizar el loop
          pivot.rotation[axis] = angle;
          pivot.updateMatrixWorld();
          
          active.forEach(c => {
            cubeGroup.attach(c);
            c.position.x = Math.round(c.position.x);
            c.position.y = Math.round(c.position.y);
            c.position.z = Math.round(c.position.z);
          });
          cubeGroup.remove(pivot); 
          resolve();
        }
      };
      tick();
    });

    const processQueue = async () => {
      const s = stateRef.current;
      if (s.isAnimating || s.moveQueue.length === 0) return;
      s.isAnimating = true;
      const notation = s.moveQueue.shift();
      const face = notation.charAt(0);
      const mod = notation.length > 1 ? notation.charAt(1) : '';
      let count = mod === '2' ? 2 : 1;
      let angle = MOVES_CONFIG[face].angle;
      if (mod === "'") angle *= -1;
      
      // PRECISIÓN CLÍNICA: Si la cola es larga, PRIORIZAMOS LA IGUALDAD (Catch-up instantáneo)
      // Cola > 8 -> 0 frames (instantáneo), Cola > 3 -> 2 frames, Base -> 4 frames
      const steps = s.moveQueue.length > 8 ? 0 : s.moveQueue.length > 3 ? 2 : 4;
      
      for (let i = 0; i < count; i++) await rotateFace(MOVES_CONFIG[face].axis, MOVES_CONFIG[face].val, angle, steps);

      
      s.isAnimating = false;
      
      // Verificar si el cubo está resuelto después de cada giro (si estamos en sesión)
      if (s.appMode === 'SOLVING' && s.timerRunning) {
        if (checkIfSolved()) {
           console.log("🏆 CUBO RESUELTO!");
           finishSessionWithSuccess();
           return;
        }
      }

      if (s.moveQueue.length > 0) processQueue();
    };

    threeRef.current = { scene, camera, renderer, controls, cubeGroup, allCubies, MOVES_CONFIG, processQueue, rotateFace };

    // Resize
    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    });
    observer.observe(container);

    // Render loop
    const renderLoop = () => {
      if (!containerRef.current) return;
      requestAnimationFrame(renderLoop);
      
      const s = stateRef.current;
      if (s.gyroActive && cubeGroup) {
        // Suavizado (Lerp) - El mapeo ya viene hecho desde el Contexto (Experto)
        const smoothing = 0.09; 
        cubeGroup.rotation.x += (s.currentGyro.x - cubeGroup.rotation.x) * smoothing;
        cubeGroup.rotation.y += (s.currentGyro.y - cubeGroup.rotation.y) * smoothing;
        cubeGroup.rotation.z += (s.currentGyro.z - cubeGroup.rotation.z) * smoothing;
      }

      if (controls) controls.update();
      renderer.render(scene, camera);
    };
    renderLoop();
  }

  // ─── Move Handler (called from BLE subscription or keyboard) ──
  function handleMoveInternal(notation) {
    const s = stateRef.current;
    const face = notation.charAt(0);
    // Permitir todas las caras incluyendo capas medias (MES) y rotaciones (XYZ)
    if (!'UDLRFBMESXYZ'.includes(face)) return;

    // Scramble guide: check if this move matches current step
    if (s.sgActive && s.sgIndex < s.sgSequence.length) {
      if (notation === s.sgSequence[s.sgIndex]) {
        s.sgIndex++;
        if (s.sgIndex >= s.sgSequence.length) finishScramble();
        else renderSgStep();
        // Still animate cube below
      }
    }

    if (s.appMode === 'READY') startSolving();
    if (s.appMode === 'SOLVING' || s.appMode === 'FREE') recordMoveInternal(notation);

    // Animate cube
    if (threeRef.current) {
      s.moveQueue.push(notation);
      threeRef.current.processQueue();
    }
  }

  // ─── Timer / Stats ─────────────────────────────────────────────
  function startSolving() {
    const s = stateRef.current;
    s.appMode = 'SOLVING';
    s.timerStart = performance.now() - s.timerElapsed;
    s.timerInterval = setInterval(updateTimerUI, 33); // 30 FPS update
    s.timerRunning = true;

    const btn = document.getElementById('btn-start');
    if (btn) { btn.textContent = '⏹ Detener Evaluación'; btn.style.cssText = 'background:#ef4444;border-color:#ef4444;color:white'; }
    const lbl = document.getElementById('timer-label');
    if (lbl) lbl.textContent = 'Evaluando...';
  }

  function updateTimerUI() {
    const s = stateRef.current;
    s.timerElapsed = performance.now() - s.timerStart;
    const t = formatTime(s.timerElapsed);
    setText('big-timer', t); setText('hdr-time', t);
    const secs = s.timerElapsed / 1000;
    const tps = secs > 0 ? (s.moveHistory.length / secs).toFixed(2) : '0.00';
    setText('st-tps', tps); setText('hdr-tps', tps);

    let displayIdle = s.idleTotalMs;
    // PRECISIÓN CLÍNICA: Seguimiento en tiempo real de la latencia actual
    if (s.lastMoveTime > 0 && s.timerRunning) {
      const gap = performance.now() - s.lastMoveTime;
      displayIdle += gap; 
    }
    setText('st-idle', formatTime(displayIdle));
    const pct = s.timerElapsed > 0 ? Math.round((displayIdle / s.timerElapsed) * 100) : 0;
    setText('st-idle-pct', pct + '%');
  }

  function recordMoveInternal(notation) {
    const s = stateRef.current;
    const now = performance.now();
    s.moveHistory.push({ move: notation, t: now });
    
    // Key detection for stats (Support M, E, S)
    const key = notation.length > 1 && notation[1] === "'" ? notation.substring(0, 2) : notation.charAt(0);
    if (s.faceCounts[key] !== undefined) s.faceCounts[key]++;
    else if ('MESXYZ'.includes(key.charAt(0))) {
        // Auto-expand stats for slice moves
        s.faceCounts[key] = 1;
    }
    
    if (notation.includes("'")) s.counterClockwiseCount++; else s.clockwiseCount++;

    if (s.lastMoveTime > 0) {
      const dt = now - s.lastMoveTime;
      // PRECISIÓN CLÍNICA: Total acumulation of inter-move latency
      s.idleTotalMs += dt; 
      if (dt > 0 && 1 / (dt / 1000) > s.maxTps) s.maxTps = 1 / (dt / 1000);
    }
    s.lastMoveTime = now;

    const total = s.moveHistory.length;
    setText('st-moves', total); setText('st-total', total); setText('hdr-moves', total);
    setText('st-cw', s.clockwiseCount); setText('st-ccw', s.counterClockwiseCount);
    setText('st-max-tps', s.maxTps.toFixed(2));
    updateMoveLogUI(notation);
    updateBarChartUI();
    showTpsBadgeUI();
  }

  function stopTimer() {
    const s = stateRef.current;
    clearInterval(s.timerInterval);
    s.timerRunning = false;
  }

  function finishSessionWithSuccess() {
    const s = stateRef.current;
    stopTimer();
    const secs = s.timerElapsed / 1000;
    const finalTps = secs > 0 ? (s.moveHistory.length / secs).toFixed(2) : '0';
    
    // Mostrar Overlay de éxito
    const ov = document.getElementById('solved-overlay');
    if (ov) {
      document.getElementById('solved-sub').textContent = `Tiempo: ${formatTime(s.timerElapsed)}  •  Rotaciones: ${s.moveHistory.length}  •  TPS: ${finalTps}`;
      ov.classList.add('active');
    }
    
    s.appMode = 'FREE';
    const btn = document.getElementById('btn-start');
    if (btn) {
      btn.textContent = '▶ Preparar Evaluación';
      btn.style.cssText = '';
    }
  }

  function resetStatsInternal(dontResetCube = false) {
    const s = stateRef.current;
    stopTimer(); s.timerStart = 0; s.timerElapsed = 0;
    s.moveHistory = [];
    s.faceCounts = { 
      U: 0, "U'": 0, D: 0, "D'": 0, R: 0, "R'": 0, L: 0, "L'": 0, F: 0, "F'": 0, B: 0, "B'": 0,
      M: 0, "M'": 0, E: 0, "E'": 0, S: 0, "S'": 0
    };
    s.clockwiseCount = 0; s.counterClockwiseCount = 0; s.maxTps = 0; s.lastMoveTime = 0; s.idleTotalMs = 0;
    s.interMoveTimes = []; s.phaseShifts = 0; s.inBurst = false; s.inhibitoryErrors = 0; s.workingMemErrors = 0;

    setText('big-timer', '00:00.000'); setText('hdr-time', '00:00.000');
    setText('hdr-moves', '0'); setText('hdr-tps', '0.00');
    setText('st-moves', '0'); setText('st-tps', '0.00'); setText('st-total', '0');
    setText('st-cw', '0'); setText('st-ccw', '0'); setText('st-max-tps', '0.00');
    setText('st-idle', '00:00.000'); setText('st-idle-pct', '0%');
    setText('top-face', '—'); setText('top-freq', '0'); setText('top-move', '—');
    setHtml('move-log', '<span style="color:#64748b;font-style:italic">Esperando inicio...</span>');
    updateBarChartUI();

    if (!dontResetCube) {
      s.appMode = 'FREE';
      const btn = document.getElementById('btn-start');
      if (btn) { btn.textContent = '▶ Preparar Evaluación'; btn.style.cssText = ''; }
      setText('timer-label', 'Práctica libre (Sin grabar)');
    }
  }

  function resetCubeOnly() {
    if (threeRef.current) {
      const s = stateRef.current;
      const { allCubies, cubeGroup } = threeRef.current;
      allCubies.forEach(c => {
        cubeGroup.setRotationFromEuler(new THREE.Euler(0,0,0));
        cubeGroup.attach(c);
        c.position.set(c.userData.origX, c.userData.origY, c.userData.origZ);
        c.rotation.set(0, 0, 0);
      });
      cubeGroup.rotation.set(0,0,0);
      if (threeRef.current.controls) threeRef.current.controls.reset();
      s.moveQueue = [];
      s.isAnimating = false;
    }
  }

  function toggleEvalModeInternal() {
    const s = stateRef.current;
    const btn = document.getElementById('btn-start');
    if (s.appMode === 'FREE') {
      s.appMode = 'READY';
      resetStatsInternal(true);
      if (btn) { btn.textContent = '✋ Esperando (Gira ahora)'; btn.style.cssText = 'background:#fbbf24;border-color:#fbbf24;color:#000'; }
      setText('timer-label', 'Listo. Mueve el cubo físico.');
      setHtml('move-log', '<span style="color:#fbbf24;font-style:italic">Evaluación lista para iniciar...</span>');
    } else {
      s.appMode = 'FREE';
      stopTimer();
      if (btn) { btn.textContent = '▶ Preparar Evaluación'; btn.style.cssText = ''; }
      setText('timer-label', 'Práctica libre (Sin grabar)');
    }
  }

  // ─── UI helpers ────────────────────────────────────────────────
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

  function updateMoveLogUI(notation) {
    const log = document.getElementById('move-log');
    if (!log) return;
    const s = stateRef.current;
    if (s.moveHistory.length === 1) log.innerHTML = '';
    const chip = document.createElement('span');
    chip.className = 'move-chip' + (notation.includes("'") ? ' prime' : '');
    chip.textContent = notation;
    log.appendChild(chip); log.scrollTop = log.scrollHeight;
  }

  function updateBarChartUI() {
    const chart = document.getElementById('bar-chart');
    if (!chart) return;
    const s = stateRef.current;
    const keys = ['U', "U'", 'D', "D'", 'R', "R'", 'L', "L'", 'F', "F'", 'B', "B'"];
    const maxVal = Math.max(1, ...keys.map(k => s.faceCounts[k] || 0));
    chart.innerHTML = '';
    keys.forEach(k => {
      const val = s.faceCounts[k] || 0;
      const height = Math.round((val / maxVal) * 70);
      const isPrime = k.includes("'");
      const g = document.createElement('div'); g.className = 'bar-group';
      g.innerHTML = `<span class="bar-count">${val > 0 ? val : ''}</span><div class="bar-fill ${isPrime ? 'prime-bar' : ''}" style="height:${height}px"></div><span class="bar-label">${k}</span>`;
      chart.appendChild(g);
    });
  }

  let tpsBadgeTimer;
  function showTpsBadgeUI() {
    const badge = document.getElementById('tps-badge');
    const s = stateRef.current;
    if (!badge) return;
    const secs = s.timerElapsed / 1000;
    badge.textContent = `TPS: ${secs > 0 ? (s.moveHistory.length / secs).toFixed(2) : '—'}`;
    badge.classList.add('show');
    clearTimeout(tpsBadgeTimer);
    tpsBadgeTimer = setTimeout(() => badge.classList.remove('show'), 1500);
  }

  // ─── Scramble ─────────────────────────────────────────────────
  function startGuidedScramble() {
    const s = stateRef.current;
    if (s.sgActive) return;
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const mods = ["'", "", ""];
    s.sgSequence = [];
    let lastFace = '';
    for (let i = 0; i < 20; i++) {
      let face;
      do { face = faces[Math.floor(Math.random() * 6)]; } while (face === lastFace);
      lastFace = face;
      s.sgSequence.push(face + mods[Math.floor(Math.random() * 3)]);
    }
    s.sgIndex = 0; s.sgActive = true;
    document.getElementById('scramble-guide').classList.add('active');
    document.getElementById('btn-scramble').disabled = true;
    renderSgStep();
  }

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

    const hints = { U: 'SUPERIOR (blanca)', D: 'INFERIOR (amarilla)', R: 'DERECHA (naranja)', L: 'IZQUIERDA (roja)', F: 'FRONTAL (azul)', B: 'TRASERA (verde)' };
    const dir = move.includes("'") ? ' ← ANTIHORARIO' : ' → HORARIO';
    setText('sg-hint', `Gira la cara ${hints[move[0]] || move[0]}${dir}`);

    if (threeRef.current) { s.moveQueue.push(move); threeRef.current.processQueue(); }
  }

  function finishScramble() {
    const s = stateRef.current;
    s.sgActive = false;
    document.getElementById('scramble-guide')?.classList.remove('active');
    const btn = document.getElementById('btn-scramble');
    if (btn) btn.disabled = false;
    resetStatsInternal();
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER — Same HTML structure as old-index.html
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
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
        #canvas-container{width:100%;height:100%;touch-action:none}
        .cube-overlay{position:absolute;bottom:20px;left:20px;display:flex;gap:8px}
        .cube-btn{padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:rgba(10,12,16,.8);color:var(--text);font-family:inherit;font-size:.8rem;font-weight:600;cursor:pointer;backdrop-filter:blur(10px);transition:all .2s}
        .cube-btn:hover{background:var(--card);border-color:var(--accent)}
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
        .timer-label{text-align:center;font-size:.7rem;color:var(--muted);margin-bottom:8px}
        #move-log{background:rgba(0,0,0,.3);border-radius:8px;padding:10px;min-height:60px;max-height:90px;overflow-y:auto;font-family:'Courier New',monospace;font-size:.85rem;line-height:1.8;word-break:break-all}
        .move-chip{display:inline-block;background:#1d4ed8;color:white;padding:1px 7px;border-radius:4px;margin:1px;font-weight:600;font-size:.78rem}
        .move-chip.prime{background:#7c3aed}
        .bar-chart{display:flex;align-items:flex-end;gap:4px;height:80px;margin-top:8px}
        .bar-group{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px}
        .bar-count{font-size:.6rem;color:var(--muted)} .bar-fill{border-radius:3px 3px 0 0;width:100%;min-height:2px;background:var(--accent)} .prime-bar{background:#7c3aed} .bar-label{font-size:.58rem;color:var(--muted)}
        .controls-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:4px}
        .ctrl-btn{background:var(--card);border:1px solid var(--border);color:var(--text);padding:7px 2px;border-radius:6px;cursor:pointer;font-weight:700;font-size:.72rem;font-family:inherit;transition:all .15s;text-align:center}
        .ctrl-btn:hover{background:#1d4ed8;border-color:var(--accent)} .ctrl-btn.prime{border-color:rgba(124,58,237,.3)} .ctrl-btn.prime:hover{background:#7c3aed;border-color:#7c3aed}
        .bottom-bar{padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px}
        .bottom-bar button{flex:1;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);font-family:inherit;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s}
        .bottom-bar .btn-start{background:var(--accent);border-color:var(--accent)}
        #scramble-guide{display:none;position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(10,12,16,.97) 80%,transparent);padding:20px 20px 24px;text-align:center;z-index:20}
        #scramble-guide.active{display:block}
        .sg-sequence{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:14px}
        .sg-chip{padding:3px 10px;border-radius:6px;background:var(--card);border:1px solid var(--border);font-size:.75rem;font-weight:700;color:var(--muted);transition:all .2s}
        .sg-chip.done{background:#14532d;border-color:var(--green);color:var(--green);opacity:.55}
        .sg-chip.current{background:var(--accent);border-color:var(--accent);color:white;transform:scale(1.15);box-shadow:0 0 16px rgba(37,99,235,.6)}
        .sg-big-move{font-size:5rem;font-weight:900;color:white;line-height:1;letter-spacing:-2px;text-shadow:0 0 30px rgba(37,99,235,.8);margin-bottom:6px}
        .sg-btn{padding:7px 18px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);font-family:inherit;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s}
        .sg-btn:hover{background:#222;border-color:#555} .sg-btn.cancel{border-color:var(--red);color:var(--red)} .sg-btn.cancel:hover{background:#7f1d1d}
        .prime-char{color:#a78bfa}
        .solved-overlay {
           position: absolute; top: 0; left: 0; width: 100%; height: 100%;
           background: rgba(10, 12, 16, 0.9); backdrop-filter: blur(8px);
           z-index: 100; display: none; flex-direction: column; align-items: center; justify-content: center;
           text-align: center;
         }
         .solved-overlay.active { display: flex; }
         .solved-emoji { font-size: 4rem; margin-bottom: 20px; animation: bounce 1s infinite alternate; }
         .solved-title { font-size: 2.5rem; font-weight: 900; color: var(--green); margin-bottom: 8px; }
         .solved-sub { font-size: 1rem; color: var(--muted); margin-bottom: 30px; letter-spacing: 0.5px; }
         .solved-btn { 
           padding: 12px 30px; border-radius: 10px; background: var(--accent); color: white;
           border: none; font-weight: 700; cursor: pointer; transition: all 0.2s;
         }
         .solved-btn:hover { transform: scale(1.05); box-shadow: 0 0 20px rgba(37,99,235,0.4); }
         @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-10px); } }
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
            <a href="/reaction-game" style={{ 
              textDecoration: 'none', background: 'rgba(37,99,235,0.1)', color: 'var(--accent)', 
              padding: '6px 14px', borderRadius: '8px', fontSize: '.78rem', fontWeight: 600,
              border: '1px solid rgba(37,99,235,0.2)', transition: 'all .2s'
            }} onMouseOver={(e) => e.target.style.background = 'rgba(37,99,235,0.2)'}
               onMouseOut={(e) => e.target.style.background = 'rgba(37,99,235,0.1)'}>
              🎮 Test de Reacción
            </a>
            {batteryLevel !== null && (
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: batteryLevel < 20 ? '#ef4444' : '#22c55e' }}>
                🔋 {batteryLevel}%
              </span>
            )}
            <div className="ble-badge" onClick={connectBLE}>
              <div className={`ble-dot ${isConnected ? 'ok' : ''}`} />
              <span>{isConnected ? device : 'Conectar cubo'}</span>
            </div>
          </div>
        </header>

        <div className="main">
          <div className="cube-panel">
            <div id="canvas-container" ref={containerRef} />
            <div className="tps-badge" id="tps-badge">TPS: 0.00</div>

            {/* OVERLAY: CUBO RESUELTO */}
            <div id="solved-overlay" className="solved-overlay">
              <div className="solved-emoji">🏆</div>
              <div className="solved-title">¡Cubo Resuelto!</div>
              <div className="solved-sub" id="solved-sub">Tiempo: —</div>
              <button className="solved-btn" onClick={() => {
                const ov = document.getElementById('solved-overlay');
                if (ov) ov.classList.remove('active');
                resetStatsInternal();
              }}>Aceptar</button>
            </div>

            <div id="scramble-guide">
              <div className="sg-progress" id="sg-progress">SCRAMBLE — MOVIMIENTO 1 DE 20</div>
              <div className="sg-sequence" id="sg-sequence" />
              <div className="sg-big-move" id="sg-big-move">U</div>
              <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: 12 }} id="sg-hint">Gira la cara marcada</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                <button className="sg-btn" onClick={() => { const s = stateRef.current; if (s.sgIndex > 0) { s.sgIndex--; renderSgStep(); } }}>← Anterior</button>
                <button className="sg-btn" onClick={() => { const s = stateRef.current; s.sgIndex++; if (s.sgIndex >= s.sgSequence.length) finishScramble(); else renderSgStep(); }}>Siguiente →</button>
                <button className="sg-btn cancel" onClick={() => { const s = stateRef.current; s.sgActive = false; document.getElementById('scramble-guide')?.classList.remove('active'); const b = document.getElementById('btn-scramble'); if(b) b.disabled = false; }}>✕ Cancelar</button>
              </div>
            </div>

            <div className="cube-overlay">
              <button 
                id="btn-scramble" 
                className="cube-btn" 
                onClick={startGuidedScramble}
                style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white' }}
              >
                🔀 Scramble
              </button>
              <button 
                className="cube-btn" 
                onClick={resetCubeOnly}
                style={{ border: '1px solid var(--green)', color: 'var(--green)', fontWeight: '700' }}
              >
                🧩 Resolver
              </button>
              <button 
                className="cube-btn" 
                style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderColor: '#38bdf8' }}
                onClick={() => calibrateGyro()}
              >
                ⚓ Calibrar Centro
              </button>
              <button className="cube-btn" onClick={() => { 
                if (threeRef.current) { 
                  threeRef.current.cubeGroup.rotation.set(0,0,0); 
                  threeRef.current.camera.position.set(1.5, 1.5, 10);
                  threeRef.current.camera.lookAt(0,0,0);
                  if (threeRef.current.controls) threeRef.current.controls.reset();
                } 
              }}>↺ Vista</button>
              <button className="cube-btn danger" onClick={() => resetStatsInternal()}>✕ Reiniciar</button>
            </div>
          </div>

          <div className="stats-panel">
            <div className="stats-tabs">
              {['session', 'moves', 'controls'].map((tab, i) => (
                <div key={tab} className={`tab ${i === 0 ? 'active' : ''}`} onClick={(e) => {
                  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                  e.target.classList.add('active');
                  document.getElementById(`tab-${tab}`)?.classList.add('active');
                  if (tab === 'moves') updateBarChartUI();
                }}>
                  {tab === 'session' ? 'Sesión' : tab === 'moves' ? 'Movimientos' : 'Controles'}
                </div>
              ))}
            </div>

            <div className="tab-content active" id="tab-session">
              <div className="stat-card">
                <h3>⏱ Temporizador</h3>
                <div className="big-timer" id="big-timer">00:00.000</div>
                <div className="timer-label" id="timer-label">Práctica libre (Sin grabar)</div>
                <div className="stat-row"><span className="label">Rotaciones</span><span className="value" id="st-moves" style={{ color: 'var(--accent)' }}>0</span></div>
                <div className="stat-row"><span className="label">TPS</span><span className="value" id="st-tps" style={{ color: 'var(--green)' }}>0.00</span></div>
              </div>
              <div className="stat-card">
                <h3>📋 Registro de movimientos</h3>
                <div id="move-log"><span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Esperando inicio...</span></div>
              </div>
              <div className="stat-card">
                <h3>📊 Sesión</h3>
                <div className="stat-row"><span className="label">Total movimientos</span><span className="value" id="st-total">0</span></div>
                <div className="stat-row"><span className="label">Moves en horario</span><span className="value" id="st-cw" style={{ color: 'var(--green)' }}>0</span></div>
                <div className="stat-row"><span className="label">Moves antihorario</span><span className="value" id="st-ccw" style={{ color: 'var(--yellow)' }}>0</span></div>
                <div className="stat-row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span className="label">⏸ Tiempo inactivo</span><span className="value" id="st-idle" style={{ color: '#f87171' }}>00:00.000</span>
                </div>
                <div className="stat-row"><span className="label">% inactivo</span><span className="value" id="st-idle-pct" style={{ color: '#f87171' }}>0%</span></div>
              </div>
            </div>

            <div className="tab-content" id="tab-moves">
              <div className="stat-card">
                <h3>📈 Distribución por cara</h3>
                <div className="bar-chart" id="bar-chart" />
              </div>
              <div className="stat-card">
                <h3>🔝 Cara más usada</h3>
                <div className="stat-row"><span className="label">Cara</span><span className="value" id="top-face" style={{ color: 'var(--accent)' }}>—</span></div>
                <div className="stat-row"><span className="label">Frecuencia</span><span className="value" id="top-freq">0</span></div>
                <div className="stat-row"><span className="label">Move más repetido</span><span className="value" id="top-move" style={{ color: 'var(--green)' }}>—</span></div>
              </div>
              <div className="stat-card">
                <h3>⚡ Rachas</h3>
                <div className="stat-row"><span className="label">Max TPS puntual</span><span className="value" id="st-max-tps" style={{ color: 'var(--green)' }}>0.00</span></div>
              </div>
            </div>

            <div className="tab-content" id="tab-controls">
              <div className="stat-card">
                <h3>🎮 Controles manuales</h3>
                <div className="controls-grid">
                  {[['U',"U'","D","D'","U2","D2"],['R',"R'","L","L'","R2","L2"],['F',"F'","B","B'","F2","B2"]].flat().map(m => (
                    <button key={m} className={`ctrl-btn ${m.includes("'") ? 'prime' : ''}`}
                      onClick={() => { broadcastMove(m); }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="stat-card">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>⚙️ Ajuste de Hardware</h3>
                <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 12 }}>
                  Usa estos controles para sincronizar el movimiento de tu ESP32 con el cubo.
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="config-group" style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8 }}>
                    <h4 style={{ fontSize: '.8rem', marginBottom: 8, color: 'var(--accent)' }}>Inversión</h4>
                    {['X', 'Y', 'Z'].map(axis => (
                      <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer', marginBottom: 4 }}>
                        <input 
                          type="checkbox" 
                          checked={gyroConfig[`invert${axis}`]} 
                          onChange={(e) => setGyroConfig(prev => ({ ...prev, [`invert${axis}`]: e.target.checked }))}
                        />
                        Invertir {axis === 'X' ? 'Arriba/Abajo' : axis === 'Y' ? 'Izq/Der' : 'Inclinar'}
                      </label>
                    ))}
                  </div>

                  <div className="config-group" style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8 }}>
                    <h4 style={{ fontSize: '.8rem', marginBottom: 8, color: 'var(--green)' }}>Swapping (Ejes)</h4>
                    {[
                      ['XY', 'Swap XY (Giro/Inclinación)'],
                      ['YZ', 'Swap YZ (Subir/Girar)'],
                      ['XZ', 'Swap XZ (Subir/Inclinar)']
                    ].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer', marginBottom: 4 }}>
                        <input 
                          type="checkbox" 
                          checked={gyroConfig[`swap${key}`]} 
                          onChange={(e) => setGyroConfig(prev => ({ ...prev, [`swap${key}`]: e.target.checked }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <h3>⌨ Teclado</h3>
                <p style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                  Presiona <strong style={{ color: 'var(--text)' }}>U D L R F B</strong> para mover (horario)<br />
                  Con <strong style={{ color: 'var(--text)' }}>Shift</strong>: movimiento antihorario
                </p>
              </div>
            </div>

            <div className="bottom-bar">
              <button className="btn-start" id="btn-start" onClick={toggleEvalModeInternal}>▶ Preparar Evaluación</button>
              <button onClick={() => resetStatsInternal()}>🔄 Reset</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
