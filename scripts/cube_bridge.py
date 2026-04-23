import asyncio
import time
from bleak import BleakClient, BleakScanner
try:
    from directinput import press_key, release_key, SCAN_CODES
except ImportError:
    try:
        from scripts.directinput import press_key, release_key, SCAN_CODES
    except ImportError:
        # Fallback simulation
        SCAN_CODES = {'space': 0x39, 'up': 0xC8, 'down': 0xD0, 'left': 0xCB, 'right': 0xCD}
        def press_key(c): pass
        def release_key(c): pass

# ─────────────────────────────────────────────────────────────────────────────
#  CLASE KeyAction
# ─────────────────────────────────────────────────────────────────────────────
class KeyAction:
    def __init__(self, key, action_type="pulse", press_length=0.15, cancel_keys=None):
        self.key         = key
        self.action_type = action_type  # "pulse" | "toggle" | "retap"
        self.press_length = press_length
        self.cancel_keys  = cancel_keys or []

# ─────────────────────────────────────────────────────────────────────────────
#  PERFILES DE JUEGO (Lógica Solicitada: Naranja = Toggle/Hold dinámico)
# ─────────────────────────────────────────────────────────────────────────────
PROFILES = {
    "Geometry Dash": {
        # Cara Roja (L) → Click rápido (Barra Espaciadora)
        # IMPORTANTE: Al ser un click "cualquiera", también debe soltar el hold naranja
        "L":       KeyAction("space", action_type="pulse", press_length=0.06, cancel_keys=["space"]),
        "L_prime": KeyAction("space", action_type="pulse", press_length=0.06, cancel_keys=["space"]),
        
        # Cara Naranja (R) → Lógica de Interruptor (Mueve para mantener, mueve para soltar)
        "R":       KeyAction("space", action_type="toggle"),
        "R_prime": KeyAction("space", action_type="toggle"),
        
        # Cara Blanca (Arriba) → Salto alternativo (Flecha Arriba)
        "U":       KeyAction("up", action_type="pulse", press_length=0.06),
        "U_prime": KeyAction("up", action_type="pulse", press_length=0.06),
    }
}

class CubeBridge:
    def __init__(self, profile_name="Geometry Dash"):
        self.profile = PROFILES.get(profile_name, PROFILES["Geometry Dash"])
        self.profile_name = profile_name
        self.last_packet_fingerprint = None
        self.last_packet_time = 0.0  # Timestamp del último paquete idéntico
        self.active_keys: dict = {} # { key_name: timestamp o None para toggle }

        print(f"🎮 MODO: {profile_name}")
        print("🔴 Cara Roja    -> Click (También detiene el hold)")
        print("🟠 Cara Naranja -> Toggle (Gira para presionar, gira para soltar)")
        print("─" * 50)

    def _press(self, k): press_key(SCAN_CODES.get(k, 0))
    def _release(self, k): release_key(SCAN_CODES.get(k, 0))

    def _cancel(self, keys):
        """Suelta teclas específicas."""
        for k in keys:
            if k in self.active_keys:
                self._release(k)
                del self.active_keys[k]

    def activate(self, action: KeyAction):
        k = action.key
        t = action.action_type

        # Lógica especial para "cualquiera se deja de pulsar" si era el hold naranja
        # Si la tecla ya estaba en hold (None) y recibimos CUALQUIER acción que la use
        # (incluso si no está en cancel_keys explícitamente), la soltamos si es un toggle.
        
        # Primero procesamos cancel_keys estándar
        self._cancel(action.cancel_keys)

        if t == "toggle":
            if k in self.active_keys:
                self._release(k)
                del self.active_keys[k]
                print(f"  🔴 [RELEASE] {k.upper()}")
            else:
                self._press(k)
                self.active_keys[k] = None # None significa hold hasta nuevo aviso
                print(f"  🟢 [HOLD ON] {k.upper()}")
        
        elif t == "retap":
            if k in self.active_keys:
                self._release(k)
                time.sleep(0.02)
                self._press(k)
                self.active_keys[k] = None
                print(f"  🔁 [RE-TAP] {k.upper()}")
            else:
                self._press(k)
                self.active_keys[k] = None
                print(f"  🟡 [HOLD INICIO] {k.upper()}")
        
        else: # "pulse"
            # Si íbamos a hacer un pulse de algo que ya está en hold, lo soltamos y pulsamos
            if k in self.active_keys and self.active_keys[k] is None:
                self._release(k)
                del self.active_keys[k]
                time.sleep(0.01)

            self._press(k)
            self.active_keys[k] = time.time()
            print(f"  ⚡ [CLICK] {k.upper()}")

    async def key_monitor(self):
        while True:
            now = time.time()
            expired = [k for k, t in list(self.active_keys.items()) if t is not None and (now - t) >= 0.06]
            for k in expired:
                self._release(k)
                del self.active_keys[k]
            await asyncio.sleep(0.005)

    def handle_data(self, sender, data: bytes):
        fp = list(data)
        now = time.time()
        # Deduplicación temporal: bloquear sólo si el paquete es idéntico Y muy reciente (<40ms)
        # Esto deja pasar ráfagas legítimas como U+U (mismo estado, pero dos giros distintos)
        if self.last_packet_fingerprint == fp and (now - self.last_packet_time) < 0.04:
            return
        self.last_packet_fingerprint = fp
        self.last_packet_time = now
        if len(data) > 3 and data[0] == 0x2a:
            mt = data[1]
            if mt in [6, 8]:
                self.process_move(data[3])
                # Para type 8 (ráfaga doble), procesar el segundo giro SIN filtrar iguales
                if mt == 8 and len(data) > 5:
                    self.process_move(data[5])

    def process_move(self, move_id: int):
        # Tabla de movimientos del firmware Rubik's Connected / GoCube:
        # IDs pares = horario, impares = antihorario
        # 0=B, 1=B', 2=F, 3=F', 4=U, 5=U', 6=D, 7=D', 8=L, 9=L', 10=R, 11=R'
        face_table = ["B", "B_prime", "F", "F_prime", "U", "U_prime",
                      "D", "D_prime", "L", "L_prime", "R", "R_prime"]
        if move_id < len(face_table):
            notation = face_table[move_id]
            action = self.profile.get(notation)
            if action:
                self.activate(action)
            elif "space" in self.active_keys and self.active_keys["space"] is None:
                # REQUISITO: "Cualquier otra cara se deja de pulsar"
                # Si se gira una cara que NO tiene mapeo pero estamos en HOLD, soltamos.
                self._release("space")
                del self.active_keys["space"]
                print(f"  ⚪ [CUALQUIERA RELEASE] SPACE")

async def main():
    bridge = CubeBridge("Geometry Dash")
    print("🔍 Buscando cubo... (Gira una cara)")
    
    device = None
    scanner = BleakScanner()
    devices = await scanner.discover(timeout=5.0)
    for d in devices:
        if any(p.lower() in (d.name or "").lower() for p in ["Rubiks", "GoCube", "GAN", "Gi"]):
            device = d; break
            
    if not device:
        print("❌ No se encontró el cubo.")
        return

    print(f"✅ Conectando a {device.name}...")
    async with BleakClient(device.address) as client:
        common_uuids = [
            "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
            "0000fff3-0000-1000-8000-00805f9b34fb",
            "beb5483e-36e1-4688-b7f5-ea07361b26a9",
            "0000aadc-0000-1000-8000-00805f9b34fb",
        ]
        char_uuid = None
        for service in client.services:
            for char in service.characteristics:
                if char.uuid.lower() in common_uuids:
                    char_uuid = char.uuid
                    break
            if char_uuid: break
        
        if not char_uuid:
            print("❌ No se encontró característica compatible.")
            return

        print("🎮 ¡LISTO!")
        await client.start_notify(char_uuid, bridge.handle_data)
        asyncio.ensure_future(bridge.key_monitor())
        while True: await asyncio.sleep(1)

if __name__ == "__main__":
    try: asyncio.run(main())
    except KeyboardInterrupt: print("\n🛑 Detenido.")
