#!/usr/bin/env python3
"""
cube_server.py — CogniMirror Joicube Server
═══════════════════════════════════════════════════════════════════════
Ejecuta UNA VEZ: python scripts/cube_server.py

Expone:
  HTTP  localhost:8765/status   → estado actual (JSON)
  HTTP  localhost:8765/start    → activa modo Joicube (BLE + teclas)
  HTTP  localhost:8765/stop     → desactiva modo Joicube
  WS    localhost:8765/ws       → stream de movimientos al cubo 3D

Requiere: pip install aiohttp bleak
"""

import asyncio
import json
import time
import os
import sys

from bleak import BleakScanner, BleakClient
from aiohttp import web
import aiohttp

# ── Importar directinput (teclas OS-level) ────────────────────────
try:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from directinput import press_key, release_key, SCAN_CODES
except ImportError:
    try:
        from scripts.directinput import press_key, release_key, SCAN_CODES
    except ImportError:
        print("⚠️  directinput no encontrado — modo simulación (sin teclas reales)")
        SCAN_CODES = {'space': 0x39, 'up': 0xC8, 'down': 0xD0, 'left': 0xCB, 'right': 0xCD}
        def press_key(c): print(f"  [SIM] press {c}")
        def release_key(c): print(f"  [SIM] release {c}")

PORT = 8765

# ── Tabla de movimientos del firmware Rubik's Connected / GoCube ──
# IDs pares = horario, impares = antihorario
# 0=B, 1=B', 2=F, 3=F', 4=U, 5=U', 6=D, 7=D', 8=L, 9=L', 10=R, 11=R'
FACE_TABLE = ["B", "B'", "F", "F'", "U", "U'", "D", "D'", "L", "L'", "R", "R'"]

# ── Perfil de Joicube para Geometry Dash ──────────────────────────
# Cara Roja (L/L')   → pulse SPACE (click de salto)
# Cara Naranja (R/R')→ toggle SPACE (hold para vuelo)
# Cara Blanca (U/U') → pulse UP (salto alternativo)
PROFILE = {
    "L":    ("space", "pulse",  0.06),
    "L'":   ("space", "pulse",  0.06),
    "R":    ("space", "toggle", 0.0),
    "R'":   ("space", "toggle", 0.0),
    "U":    ("up",    "pulse",  0.06),
    "U'":   ("up",    "pulse",  0.06),
}

# ── Estado Global ─────────────────────────────────────────────────
state = {
    "joicube_active": False,
    "ble_client":     None,
    "active_keys":    {},      # { key: timestamp | None }
    "last_fp":        None,
    "last_fp_time":   0.0,
    "ws_clients":     set(),
    "monitor_task":   None,
}

# ── Lógica de Teclas ─────────────────────────────────────────────

def do_press(k):
    code = SCAN_CODES.get(k, 0)
    if code: press_key(code)

def do_release(k):
    code = SCAN_CODES.get(k, 0)
    if code: release_key(code)

def activate_key(notation):
    mapping = PROFILE.get(notation)
    if not mapping:
        # Cualquier cara no mapeada: libera holds activos
        if "space" in state["active_keys"] and state["active_keys"]["space"] is None:
            do_release("space")
            del state["active_keys"]["space"]
            print(f"  ⚪ [RELEASE-ANY] SPACE (por movimiento: {notation})")
        return

    k, t, pl = mapping

    if t == "toggle":
        if k in state["active_keys"]:
            do_release(k)
            del state["active_keys"][k]
            print(f"  🔴 [TOGGLE OFF] {k.upper()}")
        else:
            do_press(k)
            state["active_keys"][k] = None  # None = hold indefinido
            print(f"  🟢 [TOGGLE ON] {k.upper()}")

    elif t == "pulse":
        if k in state["active_keys"] and state["active_keys"][k] is None:
            do_release(k)
            del state["active_keys"][k]
            time.sleep(0.01)
        do_press(k)
        state["active_keys"][k] = time.time()
        print(f"  ⚡ [CLICK] {k.upper()}")

def release_all_keys():
    for k in list(state["active_keys"].keys()):
        do_release(k)
    state["active_keys"].clear()

async def key_monitor():
    """Suelta teclas de pulse que llevan más de 60ms presionadas."""
    while state["joicube_active"]:
        now = time.time()
        expired = [
            k for k, t in list(state["active_keys"].items())
            if t is not None and (now - t) >= 0.06
        ]
        for k in expired:
            do_release(k)
            del state["active_keys"][k]
        await asyncio.sleep(0.005)

# ── Broadcast de Movimientos a Clientes WebSocket ────────────────

async def broadcast_move(notation, source="single"):
    if not state["ws_clients"]:
        return
    msg = json.dumps({
        "type":     "move",
        "notation": notation,
        "source":   source,
        "ts":       time.time() * 1000,
    })
    dead = set()
    for ws in state["ws_clients"]:
        try:
            await ws.send_str(msg)
        except Exception:
            dead.add(ws)
    state["ws_clients"] -= dead

# ── Procesamiento de Movimientos BLE ─────────────────────────────

async def process_move(move_id, source="type6"):
    if move_id < 0 or move_id >= len(FACE_TABLE):
        return
    notation = FACE_TABLE[move_id]
    print(f"  🎮 [{source}] {notation}")
    activate_key(notation)
    await broadcast_move(notation, source)

async def handle_ble_notification(sender, data: bytes):
    if len(data) < 4 or data[0] != 0x2a:
        return

    # Deduplicación temporal (ventana 40ms)
    fp  = list(data)
    now = time.time()
    if state["last_fp"] == fp and (now - state["last_fp_time"]) < 0.04:
        return
    state["last_fp"]      = fp
    state["last_fp_time"] = now

    mt = data[1]
    if mt in [6, 8]:
        await process_move(data[3], "type6" if mt == 6 else "type8_a")
        if mt == 8 and len(data) > 5 and 0 <= data[5] <= 11:
            await process_move(data[5], "type8_b")

# ── Conexión BLE ──────────────────────────────────────────────────

CUBE_PREFIXES   = ["rubiks", "gocube", "gan"]
NOTIFY_CHAR_IDS = [
    "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
    "0000fff3-0000-1000-8000-00805f9b34fb",
    "beb5483e-36e1-4688-b7f5-ea07361b26a9",
    "0000aadc-0000-1000-8000-00805f9b34fb",
]

async def connect_ble() -> bool:
    print("🔍 [Joicube] Escaneando dispositivos BLE...")
    devices = await BleakScanner.discover(timeout=6.0)
    device = next(
        (d for d in devices
         if any(p in (d.name or "").lower() for p in CUBE_PREFIXES)),
        None
    )
    if not device:
        print("❌ [Joicube] Cubo no encontrado.")
        return False

    print(f"✅ [Joicube] Conectando a {device.name} ({device.address})...")
    try:
        client = BleakClient(device.address)
        await client.connect()
        state["ble_client"] = client

        char_uuid = None
        for svc in client.services:
            for ch in svc.characteristics:
                if ch.uuid.lower() in NOTIFY_CHAR_IDS:
                    char_uuid = ch.uuid
                    break
            if char_uuid:
                break

        if not char_uuid:
            print("❌ [Joicube] Característica de notificación no encontrada.")
            await client.disconnect()
            return False

        # Lambda envuelve la corutina en una Future para el callback sincrono de bleak
        await client.start_notify(
            char_uuid,
            lambda sender, data: asyncio.ensure_future(handle_ble_notification(sender, data))
        )
        print(f"🎮 [Joicube] ¡LISTO! Escuchando movimientos de {device.name}")
        return True

    except Exception as e:
        print(f"❌ [Joicube] Error al conectar: {e}")
        return False

async def disconnect_ble():
    if state["ble_client"]:
        try:
            await state["ble_client"].disconnect()
        except Exception:
            pass
        state["ble_client"] = None
    release_all_keys()
    print("🛑 [Joicube] BLE desconectado, teclas liberadas.")

# ── Handlers HTTP ─────────────────────────────────────────────────

async def handle_status(request):
    connected = (
        state["ble_client"] is not None
        and state["ble_client"].is_connected
    )
    return web.json_response({
        "joicube_active": state["joicube_active"],
        "ble_connected":  connected,
        "ws_clients":     len(state["ws_clients"]),
    })

async def handle_start(request):
    if state["joicube_active"]:
        return web.json_response({"ok": True, "msg": "Ya activo"})

    state["joicube_active"] = True
    ok = await connect_ble()

    if not ok:
        state["joicube_active"] = False
        return web.json_response(
            {"ok": False, "msg": "Cubo no encontrado. Asegúrate de que esté encendido."},
            status=503
        )

    # Lanzar monitor de teclas en background
    state["monitor_task"] = asyncio.ensure_future(key_monitor())
    return web.json_response({"ok": True, "msg": "Joicube activado"})

async def handle_stop(request):
    state["joicube_active"] = False
    if state["monitor_task"]:
        state["monitor_task"].cancel()
        state["monitor_task"] = None
    await disconnect_ble()
    return web.json_response({"ok": True, "msg": "Joicube desactivado"})

async def handle_ws(request):
    """WebSocket: envía movimientos del cubo al navegador para el espejo 3D."""
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    state["ws_clients"].add(ws)
    print(f"🌐 [WS] Nuevo cliente ({len(state['ws_clients'])} conectados)")

    # Enviar estado inicial
    await ws.send_str(json.dumps({
        "type":   "connected",
        "status": "ok",
        "joicube_active": state["joicube_active"],
    }))

    try:
        async for msg in ws:
            if msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    finally:
        state["ws_clients"].discard(ws)
        print(f"🌐 [WS] Cliente desconectado ({len(state['ws_clients'])} restantes)")

    return ws

# ── CORS Middleware ───────────────────────────────────────────────

@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })
    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

# ── Main ──────────────────────────────────────────────────────────

async def main():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/status",  handle_status)
    app.router.add_post("/start",  handle_start)
    app.router.add_post("/stop",   handle_stop)
    app.router.add_get("/ws",      handle_ws)
    # Pre-flight CORS
    app.router.add_route("OPTIONS", "/start", handle_status)
    app.router.add_route("OPTIONS", "/stop",  handle_status)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "localhost", PORT)
    await site.start()

    print("=" * 55)
    print(f"  🎮 CogniMirror Joicube Server  →  localhost:{PORT}")
    print("=" * 55)
    print(f"  GET  /status  → estado JSON")
    print(f"  POST /start   → activar Joicube (conectar cubo BLE)")
    print(f"  POST /stop    → desactivar Joicube")
    print(f"  WS   /ws      → stream de movimientos (cubo 3D)")
    print("  Ctrl+C para detener")
    print()

    await asyncio.Event().wait()  # Mantener vivo indefinidamente

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Servidor Joicube detenido.")
