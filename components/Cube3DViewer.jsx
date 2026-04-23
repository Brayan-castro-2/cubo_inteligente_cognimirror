'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useCubeState } from '../contexts/CubeStateContext';

const COLORS = {
  U: 0xffffff, D: 0xffd500, F: 0x0051ba,
  B: 0x009e60, L: 0xc41e3a, R: 0xff5800, CORE: 0x111111
};

// Tabla de configuración de movimientos - eje, selección de capa, ángulo base 90°
// angle es SIEMPRE ±Math.PI/2 (90°). Los giros dobles se ejecutan como dos giros de 90°.
const MOVES_CONFIG = {
  'U':  { axis: 'y', val:  1, angle: -Math.PI / 2 },
  'D':  { axis: 'y', val: -1, angle:  Math.PI / 2 },
  'R':  { axis: 'x', val:  1, angle: -Math.PI / 2 },
  'L':  { axis: 'x', val: -1, angle:  Math.PI / 2 },
  'F':  { axis: 'z', val:  1, angle: -Math.PI / 2 },
  'B':  { axis: 'z', val: -1, angle:  Math.PI / 2 },
};

// M = L + R' (capa central en el eje X)
// Descomponemos M en dos caras: L (horario) y R' (antihorario)
const COMPOUND_MOVES = {
  'M':  ['L', "R'"],
  "M'": ["L'", 'R'],
  'E':  ['D', "U'"],
  "E'": ["D'", 'U'],
  'S':  ['F', "B'"],
  "S'": ["F'", 'B'],
};

/**
 * Cube3DViewer - Optimized with sequential move queue and memory management.
 */
export default function Cube3DViewer({
  targetRotation, status, className,
  isLocked = false, size = 300, ignoreSensor = false,
  demoMoves = null, demoKey = 0, onDemoComplete = null
}) {
  const containerRef = useRef(null);
  const threeRef = useRef(null);
  const { moveHistory } = useCubeState();
  
  // Sincronización Refs
  const movesAppliedRef = useRef(0);
  const queueRef = useRef([]);
  const isProcessingRef = useRef(false);
  const lastInteractionRef = useRef(Date.now());
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });

  // ═══ INIT THREE.JS ═══
  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;
    const container = containerRef.current;
    const W = size, H = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(4, 4, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 7);
    scene.add(dl);

    const cubeGroup = new THREE.Group();
    cubeGroup.rotation.order = 'YXZ';
    scene.add(cubeGroup);
    const allCubies = [];

    const geo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const mats = [
            new THREE.MeshPhongMaterial({ color: x === 1 ? COLORS.R : COLORS.CORE, shininess: 50 }),
            new THREE.MeshPhongMaterial({ color: x === -1 ? COLORS.L : COLORS.CORE, shininess: 50 }),
            new THREE.MeshPhongMaterial({ color: y === 1 ? COLORS.U : COLORS.CORE, shininess: 50 }),
            new THREE.MeshPhongMaterial({ color: y === -1 ? COLORS.D : COLORS.CORE, shininess: 50 }),
            new THREE.MeshPhongMaterial({ color: z === 1 ? COLORS.F : COLORS.CORE, shininess: 50 }),
            new THREE.MeshPhongMaterial({ color: z === -1 ? COLORS.B : COLORS.CORE, shininess: 50 }),
          ];
          const cubie = new THREE.Mesh(geo, mats);
          cubie.position.set(x, y, z);
          cubeGroup.add(cubie);
          allCubies.push(cubie);
        }
      }
    }

    // Interaction handlers
    if (!isLocked) {
      const onDown = (e) => {
        isDraggingRef.current = true;
        const pt = e.touches ? e.touches[0] : e;
        prevMouseRef.current = { x: pt.clientX, y: pt.clientY };
      };
      const onMove = (e) => {
        if (!isDraggingRef.current) return;
        const pt = e.touches ? e.touches[0] : e;
        const dx = (pt.clientX - prevMouseRef.current.x) * 0.01;
        const dy = (pt.clientY - prevMouseRef.current.y) * 0.01;
        prevMouseRef.current = { x: pt.clientX, y: pt.clientY };
        
        const sph = new THREE.Spherical().setFromVector3(camera.position);
        sph.theta -= dx;
        sph.phi = Math.max(0.2, Math.min(Math.PI - 0.2, sph.phi - dy));
        camera.position.setFromSpherical(sph);
        camera.lookAt(0, 0, 0);
        lastInteractionRef.current = Date.now();
      };
      const onUp = () => { isDraggingRef.current = false; lastInteractionRef.current = Date.now(); };

      renderer.domElement.addEventListener('mousedown', onDown);
      renderer.domElement.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      renderer.domElement.addEventListener('touchstart', onDown, { passive: true });
      renderer.domElement.addEventListener('touchmove', onMove, { passive: true });
      window.addEventListener('touchend', onUp);
    }

    // ═══ MOTOR DE ROTACIÓN (Corregido con snap por quaterniones) ═══
    // Recibe notación estándar: 'U', "U'", 'R2', 'L', etc.
    // Los giros dobles (X2) se ejecutan como DOS giros de 90° encadenados.
    const rotateSingleFace = async (baseFace, angle90, steps) => {
      const cfg = MOVES_CONFIG[baseFace];
      if (!cfg) return;

      const active = allCubies.filter(c => Math.abs(c.position[cfg.axis] - cfg.val) < 0.4);
      const pivot = new THREE.Object3D();
      cubeGroup.add(pivot);
      // Reparentar cubies al pivot
      active.forEach(c => pivot.attach(c));

      if (steps <= 0) {
        // Modo instantáneo (catch-up)
        pivot.rotation[cfg.axis] = angle90;
        pivot.updateMatrixWorld(true);
      } else {
        const dA = angle90 / steps;
        for (let i = 0; i < steps; i++) {
          pivot.rotation[cfg.axis] += dA;
          renderer.render(scene, camera);
          await new Promise(requestAnimationFrame);
        }
        pivot.rotation[cfg.axis] = angle90;
        pivot.updateMatrixWorld(true);
        renderer.render(scene, camera);
      }

      // SNAP con quaterniones — numéricamente estable
      active.forEach(c => {
        cubeGroup.attach(c); // hereda transform mundial
        // Snap posición a enteros
        c.position.set(
          Math.round(c.position.x),
          Math.round(c.position.y),
          Math.round(c.position.z)
        );
        // Snap cuaternión al múltiplo más cercano de 90°
        const hp = Math.PI / 2;
        const e = c.rotation;
        c.rotation.set(
          Math.round(e.x / hp) * hp,
          Math.round(e.y / hp) * hp,
          Math.round(e.z / hp) * hp
        );
        c.updateMatrixWorld(true);
      });
      cubeGroup.remove(pivot);
    };

    const rotateFace = async (notation, steps = 12) => {
      // Resolver movimientos compuestos (M, E, S)
      if (COMPOUND_MOVES[notation]) {
        for (const sub of COMPOUND_MOVES[notation]) {
          await rotateFace(sub, steps);
        }
        return;
      }

      const isDouble = notation.includes('2');
      const isPrime  = notation.includes("'") || notation.includes('-');
      const baseFace = notation.charAt(0);
      const cfg = MOVES_CONFIG[baseFace];
      if (!cfg) return;

      // Ángulo de 90° con signo correcto
      const angle90 = isPrime ? -cfg.angle : cfg.angle;

      if (isDouble) {
        // Giro doble = dos giros de 90° en la misma dirección
        await rotateSingleFace(baseFace, angle90, steps);
        await rotateSingleFace(baseFace, angle90, steps);
      } else {
        await rotateSingleFace(baseFace, angle90, steps);
      }
    };

    threeRef.current = { cubeGroup, rotateFace };

    // ═══ ANIMATION LOOP ═══
    let afId;
    const loop = () => {
      afId = requestAnimationFrame(loop);
      
      if (status === 'eval_celebration') {
        const t = Date.now() * 0.002;
        cubeGroup.rotation.y += 0.05;
        cubeGroup.rotation.x = Math.sin(t) * 0.3;
        renderer.render(scene, camera);
        return;
      }

      if (isLocked) {
        const t = Date.now() * 0.0005;
        cubeGroup.rotation.y = t;
        cubeGroup.rotation.x = Math.sin(t * 0.7) * 0.3;
        renderer.render(scene, camera);
        return;
      }

      const now = Date.now();
      const isIdle = (now - lastInteractionRef.current > 3000) && !isDraggingRef.current;
      if (isIdle) {
        camera.position.lerp(new THREE.Vector3(4, 4, 8), 0.05);
        camera.lookAt(0, 0, 0);
      }
      renderer.render(scene, camera);
    };
    afId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(afId);
      // Proper disposal
      allCubies.forEach(c => {
        c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      });
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [isLocked, size, status]);

  // ═══ QUEUE WORKER ═══
  useEffect(() => {
    if (isLocked || ignoreSensor) return;
    const three = threeRef.current;
    if (!three) return;

    const processQueue = async () => {
      if (isProcessingRef.current || queueRef.current.length === 0) return;
      isProcessingRef.current = true;

      while (queueRef.current.length > 0) {
        const move = queueRef.current.shift();
        // Catch-up logic: if many moves pending, skip animation
        const steps = queueRef.current.length > 2 ? 0 : 6;
        await three.rotateFace(move, steps);
      }

      isProcessingRef.current = false;
    };

    const total = moveHistory.length;
    const applied = movesAppliedRef.current;
    if (total > applied) {
      const missing = moveHistory.slice(applied);
      queueRef.current.push(...missing);
      movesAppliedRef.current = total;
      processQueue();
    }
  }, [moveHistory, isLocked, ignoreSensor]);

  // ═══ DEMO SEQUENCES ═══
  useEffect(() => {
    if (!demoMoves || demoMoves.length === 0 || demoKey === 0) return;
    const three = threeRef.current;
    if (!three) return;

    const runDemo = async () => {
      for (const m of demoMoves) {
        await three.rotateFace(m, 12);
        await new Promise(r => setTimeout(r, 200));
      }
      if (onDemoComplete) onDemoComplete();
    };
    runDemo();
  }, [demoKey]);

  return <div ref={containerRef} className={className || ''} style={{ width: size, height: size, margin: '0 auto' }} />;
}
