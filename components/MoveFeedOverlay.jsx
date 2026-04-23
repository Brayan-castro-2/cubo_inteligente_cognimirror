'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useBluetoothCube } from '../contexts/BluetoothContext';

const MAX_ENTRIES = 30;

// Etiqueta visual según el origen del paquete BLE
const SOURCE_LABELS = {
  type6:        { label: 'Simple',    color: '#4ade80' }, // verde
  type8_first:  { label: '2× · 1°',  color: '#fb923c' }, // naranja
  type8_second: { label: '2× · 2°',  color: '#f87171' }, // rojo
};

/**
 * MoveFeedOverlay
 * Panel compacto de diagnóstico BLE que muestra el historial de movimientos
 * recibidos desde el cubo físico en tiempo real.
 * Úsalo dentro de la pantalla de configuración / calibración BLE.
 */
export default function MoveFeedOverlay() {
  const { subscribeToMoveFeed, isConnected } = useBluetoothCube();
  const [feed, setFeed] = useState([]);
  const scrollRef = useRef(null);

  // Suscripción al canal moveFeed
  useEffect(() => {
    const unsub = subscribeToMoveFeed((entry) => {
      setFeed(prev => {
        const next = [entry, ...prev].slice(0, MAX_ENTRIES);
        return next;
      });
    });
    return () => unsub();
  }, [subscribeToMoveFeed]);

  // Auto-scroll al tope cuando llegan nuevas entradas
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [feed]);

  const clearFeed = useCallback(() => setFeed([]), []);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.45)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: '100%',
    }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>📡</span>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: '13px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Feed de Movimientos BLE
          </span>
          {/* Indicador de conexión */}
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isConnected ? '#4ade80' : '#6b7280',
            display: 'inline-block',
            boxShadow: isConnected ? '0 0 6px #4ade80' : 'none',
          }} />
        </div>
        {feed.length > 0 && (
          <button
            onClick={clearFeed}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.4)',
              borderRadius: '8px',
              padding: '3px 10px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        {Object.entries(SOURCE_LABELS).map(([key, { label, color }]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, display: 'inline-block',
            }} />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 600 }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Lista de movimientos */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: '220px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {feed.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.2)',
            fontSize: '12px',
            padding: '28px 0',
          }}>
            {isConnected
              ? 'Gira una cara del cubo para ver el feed…'
              : 'Conecta el cubo para ver los movimientos'}
          </div>
        ) : (
          feed.map((entry, i) => {
            const src = SOURCE_LABELS[entry.source] || { label: entry.source, color: '#94a3b8' };
            const isDouble = entry.source?.startsWith('type8');
            const time = new Date(entry.timestamp).toLocaleTimeString('es-CL', {
              hour: '2-digit', minute: '2-digit', second: '2-digit',
              fractionalSecondDigits: 3,
            });
            return (
              <div
                key={`${entry.timestamp}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  background: i === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                  borderLeft: `2px solid ${src.color}`,
                  transition: 'background 0.2s',
                }}
              >
                {/* Notación del movimiento */}
                <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  fontSize: '15px',
                  color: src.color,
                  minWidth: '36px',
                }}>
                  {entry.notation}
                </span>

                {/* Badge de tipo */}
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: src.color,
                  background: `${src.color}18`,
                  border: `1px solid ${src.color}33`,
                  borderRadius: '4px',
                  padding: '1px 6px',
                  letterSpacing: '0.05em',
                }}>
                  {src.label}
                </span>

                {/* Indicador visual de ráfaga */}
                {isDouble && (
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                    ⚡ doble rápido
                  </span>
                )}

                {/* Timestamp */}
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: 'rgba(255,255,255,0.25)',
                }}>
                  {time}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
