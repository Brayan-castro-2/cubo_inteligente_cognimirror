#!/usr/bin/env python3
"""
cube_keys.py — CogniMirror Joicube Key Injector
═══════════════════════════════════════════════════════════════════════
Servidor ultra-liviano. NO maneja BLE.
El browser mantiene su conexión BLE y le ENVÍA cada movimiento aquí.
Este script SOLO inyecta teclas al Sistema Operativo.

Perfiles Multijuego incorporados (Geometry Dash, Tetris, Mario).
Ejecuta una vez:  python scripts/cube_keys.py
"""

import asyncio
import json
import os
import sys
import time

# Forzar UTF-8 en stdout para Windows (evita UnicodeEncodeError con emojis)
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

from aiohttp import web
import aiohttp

# ── Importar directinput (teclas OS-level) ────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
try:
    from directinput import press_key, release_key, SCAN_CODES
except ImportError:
    try:
        from scripts.directinput import press_key, release_key, SCAN_CODES
    except ImportError:
        print("⚠️  directinput no encontrado — las teclas serán simuladas en consola")
        SCAN_CODES = {
            'space': 0x39, 'up': 0xC8, 'down': 0xD0,
            'left': 0xCB, 'right': 0xCD, 'z': 0x2C, 'x': 0x2D
        }
        def press_key(c):   print(f"  [SIM] PRESS   scan=0x{c:02X}")
        def release_key(c): print(f"  [SIM] RELEASE scan=0x{c:02X}")

PORT = 8765

# ── Perfiles Multijuego ───────────────────────────────────────────
# Tipos de modo:
#  'pulse'  → presiona la tecla un instante (0.06s por defecto)
#  'toggle' → primera vez mantiene presionada; siguiente vez suelta
#  'hold'   → mantiene presionada durante una duración específica (ms)
#
# Formato: "Movimiento": ("tecla", "modo", duración_opcional_segundos)

PROFILES = {
    "GEOMETRY_DASH": {
        "L":   ("space", "pulse"),
        "L'":  ("space", "pulse"),
        "R":   ("space", "toggle"),
        "R'":  ("space", "toggle"),
        "U":   ("up",    "pulse"),
        "U'":  ("up",    "pulse"),
    },
    "TETRIS": {
        "L":   ("left",  "pulse"),
        "R":   ("right", "pulse"),
        "D":   ("down",  "pulse"),
        "D'":  ("down",  "pulse"),
        "U":   ("up",    "pulse"),    # Hard drop (si el juego lo soporta en UP)
        "F":   ("z",     "pulse"),    # Rotar Izq
        "F'":  ("x",     "pulse"),    # Rotar Der
        "B":   ("z",     "pulse"),
        "B'":  ("x",     "pulse"),
    },
    "MARIO": {
        # 'directional' es un modo especial para Mario: frena si vas en contra, si no, activa
        "R":   ("right", "directional", "left"),
        "R'":  ("left",  "directional", "right"),
        "U":   ("up",    "hold", 0.5),   # Saltar sostenido (salto alto)
        "U'":  ("up",    "hold", 0.5),
        "L":   ("up",    "hold", 0.5),   # Saltar alternativo sostenido
        "L'":  ("up",    "hold", 0.5),
        "B":   ("z",     "toggle"),      # Correr (Z)
        "B'":  ("z",     "toggle"),
        "D":   ("down",  "toggle"),      # Agacharse
        "D'":  ("down",  "toggle"),
    }
}

# ── Estado ────────────────────────────────────────────────────────
current_profile_name = "GEOMETRY_DASH"
active_keys = {}   # { key_name: expire_timestamp_or_None }
ws_clients  = set()

# ── Lógica de teclas ──────────────────────────────────────────────
def do_press(k):   press_key(SCAN_CODES.get(k, 0))
def do_release(k): release_key(SCAN_CODES.get(k, 0))

def release_all():
    for k in list(active_keys.keys()):
        do_release(k)
    active_keys.clear()

def activate_notation(notation):
    global current_profile_name, active_keys
    profil = PROFILES.get(current_profile_name, {})
    mapping = profil.get(notation)
    
    if not mapping:
        return

    # Parsear mapping (puede tener 2 o 3 elementos)
    k = mapping[0]
    mode = mapping[1]
    
    if mode == "toggle":
        if k in active_keys and active_keys[k] is None:
            do_release(k)
            del active_keys[k]
            print(f"  🔴 [TOGGLE OFF] {k.upper()}  ← {notation}")
        else:
            do_press(k)
            active_keys[k] = None # None significa que no expira solo
            print(f"  🟢 [TOGGLE ON]  {k.upper()}  ← {notation}")
            
    elif mode == "directional":
        # mapping[2] es la tecla opuesta
        k_opposite = mapping[2]
        
        # Si la opuesta está presionada = FRENADO
        if k_opposite in active_keys:
            do_release(k_opposite)
            del active_keys[k_opposite]
            print(f"  🛑 [BRAKE] Frenando {k_opposite.upper()}  ← {notation}")
        # Si no hay frenado, evaluamos avanzar
        else:
            if k not in active_keys:
                do_press(k)
                active_keys[k] = None # Caminar infinito hasta frenar
                print(f"  👟 [MOVE] Avanzando hacia {k.upper()}  ← {notation}")
            else:
                print(f"  👟 [MOVE] Ya estabas yendo a {k.upper()}  ← {notation}")
            
    elif mode == "hold":
        duration = mapping[2] if len(mapping) > 2 else 0.5
        if k not in active_keys:
            do_press(k)
        active_keys[k] = time.time() + duration
        print(f"  ⏳ [HOLD {duration}s] {k.upper()}  ← {notation}")
        
    else:  # pulse
        duration = mapping[2] if len(mapping) > 2 else 0.06
        if k in active_keys and active_keys[k] is not None:
            do_release(k)
            del active_keys[k]
            time.sleep(0.01)
            
        do_press(k)
        active_keys[k] = time.time() + duration
        print(f"  ⚡ [CLICK]       {k.upper()}  ← {notation}")

async def key_monitor():
    """Auto-suelta teclas que han expirado su tiempo de presión."""
    while True:
        now = time.time()
        expired = [k for k, expire_time in list(active_keys.items())
                   if expire_time is not None and now >= expire_time]
        
        for k in expired:
            do_release(k)
            del active_keys[k]
            print(f"  ⚪ [AUTO-RELEASE] {k.upper()}")
            
        await asyncio.sleep(0.005)

# ── WebSocket y Servidor ──────────────────────────────────────────
async def handle_ws(request):
    ws = web.WebSocketResponse(heartbeat=15)
    await ws.prepare(request)
    ws_clients.add(ws)
    n = len(ws_clients)
    print(f"🌐 [WS] Cliente conectado  ({n} activos)")

    await ws.send_str(json.dumps({"type": "ready", "msg": "Joicube key-server listo", "profile": current_profile_name}))

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    if data.get("type") == "move":
                        activate_notation(data["notation"])
                    elif data.get("type") == "release_all":
                        release_all()
                        print("  🛑 [RELEASE ALL] teclas liberadas por el browser")
                except Exception as e:
                    print(f"  ⚠️  mensaje inválido: {e}")
            elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    finally:
        ws_clients.discard(ws)
        release_all()
        print(f"🌐 [WS] Cliente desconectado ({len(ws_clients)} activos) — teclas liberadas")

    return ws

@web.middleware
async def cors(request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })
    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

async def handle_status(request):
    return web.json_response({
        "ok": True,
        "clients": len(ws_clients),
        "profile": current_profile_name,
        "active_keys": list(active_keys.keys()),
        "profiles": list(PROFILES.keys())
    })

async def set_profile(request):
    global current_profile_name
    try:
        data = await request.json()
        new_prof = data.get("profile")
        if new_prof in PROFILES:
            release_all() # Soltar teclas antiguas al cambiar de perfil
            current_profile_name = new_prof
            print(f"\n🎮 [PROFILE] Perfil cambiado a: {current_profile_name}")
            return web.json_response({"ok": True, "profile": current_profile_name})
        else:
            return web.json_response({"ok": False, "msg": "Perfil no encontrado"}, status=404)
    except Exception as e:
         return web.json_response({"ok": False, "msg": str(e)}, status=400)


# ── Main ──────────────────────────────────────────────────────────
async def main():
    app = web.Application(middlewares=[cors])
    app.router.add_get("/",       handle_status)
    app.router.add_get("/ws",     handle_ws)
    app.router.add_get("/status", handle_status)
    app.router.add_post("/profile", set_profile)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "localhost", PORT)
    await site.start()

    asyncio.ensure_future(key_monitor())

    print("=" * 50)
    print(f"  🕹️  CogniMirror Joicube Keys Multijuego → localhost:{PORT}")
    print("=" * 50)
    print("  WS /ws       → recibe movimientos")
    print("  POST /profile → cambiar perfil (json: {'profile': 'MARIO'})")
    print()
    print("  PERFILES DISPONIBLES:")
    for prof, mapping in PROFILES.items():
        print(f"    - {prof}")
    print()
    print(f"  Perfil Inicial: {current_profile_name}")
    print("  Ctrl+C para detener\n")

    await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        release_all()
        print("\n🛑 Joicube Keys detenido. Teclas liberadas.")
