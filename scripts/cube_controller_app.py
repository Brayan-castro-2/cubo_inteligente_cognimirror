"""
CogniMirror Cube Controller — Tray App
=======================================
App de escritorio estilo gaming que controla el cubo inteligente como
gamepad. Corre en el system tray y permite crear/editar perfiles de teclas.

Dependencias: pip install customtkinter pystray pillow bleak
"""

import asyncio
import threading
import json
import os
import time
import sys
import tkinter as tk
from tkinter import messagebox
from pathlib import Path

import customtkinter as ctk
from PIL import Image, ImageDraw
import pystray

try:
    from directinput import press_key, release_key, SCAN_CODES
except ImportError:
    try:
        from scripts.directinput import press_key, release_key, SCAN_CODES
    except ImportError:
        # Fallback sin DirectInput (solo imprime)
        SCAN_CODES = {
            'up': 0xC8, 'down': 0xD0, 'left': 0xCB, 'right': 0xCD,
            'space': 0x39, 'w': 0x11, 'a': 0x1E, 's': 0x1F, 'd': 0x20,
            'enter': 0x1C, 'shift': 0x2A, 'ctrl': 0x1D, 'z': 0x2C,
            'x': 0x2D, 'c': 0x2E, 'f': 0x21, 'r': 0x13
        }
        def press_key(c): pass
        def release_key(c): pass

try:
    from bleak import BleakClient, BleakScanner
    BLEAK_AVAILABLE = True
except ImportError:
    BLEAK_AVAILABLE = False

# ─── Colores gaming ────────────────────────────────────────────────────────
ACCENT  = "#7C3AED"         # Violeta CogniMirror
ACCENT2 = "#5B21B6"
BG      = "#0F0F1A"
BG2     = "#1A1A2E"
BG3     = "#16213E"
TEXT    = "#E2E8F0"
TEXT2   = "#94A3B8"
GREEN   = "#10B981"
RED     = "#EF4444"
YELLOW  = "#F59E0B"
ORANGE  = "#F97316"

FACE_COLORS = {
    "U": "#FFFFFF", "U_prime": "#FFFFFF",
    "D": "#FFD500", "D_prime": "#FFD500",
    "F": "#0051BA", "F_prime": "#0051BA",
    "B": "#009E60", "B_prime": "#009E60",
    "L": "#C41E3A", "L_prime": "#C41E3A",
    "R": "#FF5800", "R_prime": "#FF5800",
}
FACE_LABELS = {
    "U": "⬆ Blanca (Arriba)", "U_prime": "⬆' Blanca (Arriba)'",
    "D": "⬇ Amarilla (Abajo)", "D_prime": "⬇' Amarilla (Abajo)'",
    "F": "◆ Azul (Frente)", "F_prime": "◆' Azul (Frente)'",
    "B": "◆ Verde (Atrás)", "B_prime": "◆' Verde (Atrás)'",
    "L": "◁ Roja (Izquierda)", "L_prime": "◁' Roja (Izquierda)'",
    "R": "▷ Naranja (Derecha)", "R_prime": "▷' Naranja (Derecha)'",
}
ALL_FACES = list(FACE_LABELS.keys())

PROFILES_PATH = Path(__file__).parent / "profiles.json"

# ─── Lógica del Bridge (idéntica a cube_bridge.py) ────────────────────────
# action_type puede ser:
#   "pulse"  → pulsación rápida (hold press_length segundos)
#   "toggle" → activa/desactiva (se queda hasta otro giro)
#   "retap"  → mantiene pulsado; si ya estaba, suelta y vuelve a presionar al instante
class KeyAction:
    def __init__(self, key, action_type="pulse", press_length=0.15, cancel_keys=None):
        self.key = key
        self.action_type = action_type   # "pulse" | "toggle" | "retap"
        self.press_length = press_length
        self.cancel_keys = cancel_keys or []
        # Retrocompatibilidad con is_toggle antiguo
    @property
    def is_toggle(self): return self.action_type == "toggle"

class BridgeEngine:
    def __init__(self, on_log=None, on_status=None):
        self.on_log    = on_log    or (lambda msg: print(msg))
        self.on_status = on_status or (lambda s: None)
        self.profile: dict = {}
        self.active_keys: dict = {}
        self.last_fp = None
        self.running = False
        self._loop: asyncio.AbstractEventLoop = None
        self._task = None

    def load_profile(self, face_map: dict):
        """Carga un diccionario { face → KeyAction }."""
        self.profile = face_map

    def _press(self, k): press_key(SCAN_CODES.get(k, 0))
    def _release(self, k): release_key(SCAN_CODES.get(k, 0))

    def _cancel(self, keys):
        for k in keys:
            if k in self.active_keys:
                self._release(k)
                del self.active_keys[k]

    def activate(self, action: KeyAction):
        self._cancel(action.cancel_keys)
        k = action.key
        t = action.action_type

        if t == "toggle":
            if k in self.active_keys:
                self._release(k)
                del self.active_keys[k]
                self.on_log(f"🔴 TOGGLE OFF → {k.upper()}")
            else:
                self._press(k)
                self.active_keys[k] = None
                self.on_log(f"🟢 TOGGLE ON  → {k.upper()}")

        elif t == "retap":
            # Si ya estaba presionada: suelta brevemente y vuelve a presionar (re-tap)
            if k in self.active_keys:
                self._release(k)
                time.sleep(0.02)   # 20 ms de pausa (mínima perceptible por el juego)
                self._press(k)
                self.active_keys[k] = None  # sigue en hold
                self.on_log(f"🔁 RETAP → {k.upper()} (soltar + re-presionar)")
            else:
                self._press(k)
                self.active_keys[k] = None  # hold indefinido
                self.on_log(f"🟡 RETAP INICIO → {k.upper()} (manteniendo…)")

        else:  # "pulse" (default)
            self._press(k)
            self.active_keys[k] = time.time()
            self.on_log(f"⚡ PULSE {int(action.press_length*1000)}ms → {k.upper()}")

    async def _key_monitor(self):
        while self.running:
            now = time.time()
            expired = [k for k, t in list(self.active_keys.items())
                       if t is not None]
            for k in expired:
                t = self.active_keys.get(k)
                if t and now - t >= self._get_pl(k):
                    self._release(k)
                    del self.active_keys[k]
            await asyncio.sleep(0.005)

    def _get_pl(self, key):
        for a in self.profile.values():
            if a.key == key:
                return a.press_length
        return 0.15

    def handle_data(self, sender, data: bytes):
        fp = list(data)
        if fp == self.last_fp: return
        self.last_fp = fp
        if len(data) > 3 and data[0] == 0x2a:
            mt = data[1]
            if mt in [6, 8]:
                self._process(data[3])
                if mt == 8 and len(data) > 5 and data[5] != data[3]:
                    self._process(data[5])

    def _process(self, move_id):
        faces = ["B","B'","F","F'","U","U'","D","D'","L","L'","R","R'"]
        if move_id >= len(faces): return
        key = faces[move_id].replace("'", "_prime")
        action = self.profile.get(key)
        if action:
            self.activate(action)

    async def run(self):
        self.running = True
        self.on_status("scanning")
        self.on_log("🔍 Buscando cubos inteligentes…")
        prefixes = ["Rubiks","GoCube","GAN","Gi","CogniMirror"]
        common_uuids = [
            "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
            "0000fff3-0000-1000-8000-00805f9b34fb",
            "beb5483e-36e1-4688-b7f5-ea07361b26a9",
            "0000aadc-0000-1000-8000-00805f9b34fb",
        ]
        device = None
        try:
            devices = await BleakScanner.discover(timeout=5.0)
            for d in devices:
                if any(p.lower() in (d.name or "").lower() for p in prefixes):
                    device = d; break
        except Exception as e:
            self.on_log(f"❌ Error de escaneo: {e}")
            self.on_status("error"); return

        if not device:
            self.on_log("❌ No se encontró ningún cubo compatible.")
            self.on_log("   Cierra el navegador y gira una cara para despertarlo.")
            self.on_status("error"); return

        self.on_log(f"✅ Conectando a '{device.name}'…")
        self.on_status("connecting")
        try:
            async with BleakClient(device.address) as client:
                char_uuid = None
                for svc in client.services:
                    for ch in svc.characteristics:
                        if ch.uuid.lower() in common_uuids:
                            char_uuid = ch.uuid; break
                    if char_uuid: break
                if not char_uuid:
                    self.on_log("❌ Característica de datos no encontrada.")
                    self.on_status("error"); return
                self.on_log(f"🎮 ACTIVO · UUID: {char_uuid[:8]}…")
                self.on_status("connected")
                await client.start_notify(char_uuid, self.handle_data)
                asyncio.ensure_future(self._key_monitor())
                while self.running:
                    await asyncio.sleep(0.5)
        except Exception as e:
            self.on_log(f"❌ Desconectado: {e}")
            self.on_status("disconnected")
        self.running = False

    def stop(self):
        self.running = False
        for k in list(self.active_keys.keys()):
            self._release(k)
        self.active_keys.clear()


# ─── Gestión de Perfiles JSON ─────────────────────────────────────────────
def load_profiles() -> dict:
    if PROFILES_PATH.exists():
        with open(PROFILES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_profiles(data: dict):
    with open(PROFILES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def profile_to_engine(raw: dict) -> dict:
    result = {}
    for face, cfg in raw.items():
        if "comment" in cfg: continue  # ignorar campos de documentación
        # Retrocompatibilidad: si viene is_toggle derivamos action_type
        if "action_type" not in cfg:
            at = "toggle" if cfg.get("is_toggle", False) else "pulse"
        else:
            at = cfg["action_type"]
        result[face] = KeyAction(
            key=cfg.get("key", "up"),
            action_type=at,
            press_length=cfg.get("press_length", 0.15),
            cancel_keys=cfg.get("cancel_keys", [])
        )
    return result


# ─── ICONO DEL SYSTEM TRAY (generado en memoria) ──────────────────────────
def make_tray_icon():
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([4, 4, 60, 60], fill="#7C3AED")
    for i in range(3):
        for j in range(3):
            x0 = 10 + i * 16
            y0 = 10 + j * 16
            d.rectangle([x0, y0, x0+12, y0+12],
                        fill=["#FF5800","#FFFFFF","#FFD500"][i])
    return img


# ─── VENTANA PRINCIPAL ────────────────────────────────────────────────────
class CubeControllerApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("dark-blue")

        self.title("CogniMirror Cube Controller")
        self.geometry("860x600")
        self.minsize(760, 520)
        self.configure(fg_color=BG)
        self.protocol("WM_DELETE_WINDOW", self.hide_window)

        self.profiles_data = load_profiles()
        self.active_profile_name = tk.StringVar(value=list(self.profiles_data.keys())[0] if self.profiles_data else "")
        self.bridge = BridgeEngine(on_log=self.add_log, on_status=self.update_status)
        self._bridge_thread = None
        self._loop = None
        self.tray_icon = None

        self._build_ui()
        self._start_tray()
        self.load_selected_profile()

    # ── UI ─────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # Sidebar
        sidebar = ctk.CTkFrame(self, width=200, fg_color=BG2, corner_radius=0)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)

        # Logo
        logo_f = ctk.CTkFrame(sidebar, fg_color="transparent")
        logo_f.pack(pady=(24,8), padx=16, fill="x")
        ctk.CTkLabel(logo_f, text="⬡", font=("Segoe UI", 28, "bold"),
                     text_color=ACCENT).pack()
        ctk.CTkLabel(logo_f, text="Cube Controller",
                     font=("Segoe UI", 13, "bold"), text_color=TEXT).pack()
        ctk.CTkLabel(logo_f, text="by CogniMirror",
                     font=("Segoe UI", 9), text_color=TEXT2).pack()

        ctk.CTkFrame(sidebar, height=1, fg_color="#2D2D4E").pack(fill="x", padx=12, pady=8)

        # Status
        self.status_dot = ctk.CTkLabel(sidebar, text="● Desconectado",
                                       font=("Segoe UI", 11), text_color=TEXT2)
        self.status_dot.pack(pady=(0,4))

        # Botones laterales
        nav_btns = [
            ("🎮  Perfiles", self.show_profiles_tab),
            ("➕  Nuevo Perfil", self.new_profile_dialog),
            ("📋  Log en vivo", self.show_log_tab),
        ]
        self.nav_frames = {}
        for label, cmd in nav_btns:
            b = ctk.CTkButton(sidebar, text=label, command=cmd,
                              fg_color="transparent", hover_color=BG3,
                              anchor="w", font=("Segoe UI", 12),
                              text_color=TEXT, corner_radius=8, height=36)
            b.pack(fill="x", padx=8, pady=2)

        ctk.CTkFrame(sidebar, height=1, fg_color="#2D2D4E").pack(fill="x", padx=12, pady=8)

        # Connect / Disconnect
        self.btn_connect = ctk.CTkButton(
            sidebar, text="🔗  Conectar Cubo",
            command=self.connect_cube, fg_color=ACCENT,
            hover_color=ACCENT2, font=("Segoe UI", 12, "bold"), height=38)
        self.btn_connect.pack(fill="x", padx=12, pady=4)

        self.btn_disconnect = ctk.CTkButton(
            sidebar, text="✕  Desconectar",
            command=self.disconnect_cube, fg_color="#3B2020",
            hover_color="#5C1E1E", font=("Segoe UI", 12), height=36, state="disabled")
        self.btn_disconnect.pack(fill="x", padx=12, pady=2)

        ctk.CTkLabel(sidebar, text="v1.0.0  •  Sistema de perfiles",
                     font=("Segoe UI", 8), text_color="#3D3D5C").pack(side="bottom", pady=8)

        # Main area
        self.main_area = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        self.main_area.pack(side="left", fill="both", expand=True)

        # Construir tabs
        self._build_profiles_tab()
        self._build_log_tab()
        self.show_profiles_tab()

    # ── TAB: Perfiles ──────────────────────────────────────────────────────
    def _build_profiles_tab(self):
        self.profiles_frame = ctk.CTkFrame(self.main_area, fg_color="transparent")

        header = ctk.CTkFrame(self.profiles_frame, fg_color="transparent")
        header.pack(fill="x", padx=24, pady=(20, 8))
        ctk.CTkLabel(header, text="Perfiles de Control",
                     font=("Segoe UI", 20, "bold"), text_color=TEXT).pack(side="left")

        # Selector de perfil activo
        sel_frame = ctk.CTkFrame(self.profiles_frame, fg_color=BG2, corner_radius=12)
        sel_frame.pack(fill="x", padx=24, pady=4)

        ctk.CTkLabel(sel_frame, text="Perfil activo:",
                     font=("Segoe UI", 12), text_color=TEXT2).pack(side="left", padx=16, pady=12)

        profile_names = list(self.profiles_data.keys())
        self.profile_menu = ctk.CTkOptionMenu(
            sel_frame, values=profile_names if profile_names else ["— sin perfiles —"],
            variable=self.active_profile_name,
            command=self.on_profile_selected,
            fg_color=BG3, button_color=ACCENT, button_hover_color=ACCENT2,
            font=("Segoe UI", 12), width=220)
        self.profile_menu.pack(side="left", padx=8)

        ctk.CTkButton(sel_frame, text="🗑 Eliminar",
                      command=self.delete_profile,
                      fg_color="#3B2020", hover_color="#5C1E1E",
                      font=("Segoe UI", 11), height=30, width=100).pack(side="right", padx=12)

        # Editor de teclas
        editor_label = ctk.CTkLabel(self.profiles_frame,
                                    text="Configuración de caras",
                                    font=("Segoe UI", 14, "bold"), text_color=TEXT)
        editor_label.pack(anchor="w", padx=24, pady=(16,4))

        self.face_editor_frame = ctk.CTkScrollableFrame(
            self.profiles_frame, fg_color="transparent",
            scrollbar_button_color=ACCENT)
        self.face_editor_frame.pack(fill="both", expand=True, padx=24, pady=4)

        # Botón guardar
        ctk.CTkButton(self.profiles_frame, text="💾  Guardar Perfil",
                      command=self.save_current_profile,
                      fg_color=ACCENT, hover_color=ACCENT2,
                      font=("Segoe UI", 13, "bold"), height=40).pack(
                          pady=12, padx=24, fill="x")

        self.face_widgets = {}  # face → {key_var, toggle_var, length_var, cancel_var}

    def _render_face_editor(self, profile_data: dict):
        """Renderiza las filas de configuración de cara a cara."""
        for w in self.face_editor_frame.winfo_children():
            w.destroy()
        self.face_widgets = {}

        key_options = sorted(SCAN_CODES.keys())
        action_options = ["pulse", "toggle", "retap"]
        action_labels  = {"pulse": "⚡ Pulse", "toggle": "🔄 Toggle", "retap": "🔁 Re-tap"}

        for face in ALL_FACES:
            cfg = profile_data.get(face, {"key": "up", "action_type": "pulse",
                                          "press_length": 0.15, "cancel_keys": []})
            # retrocompat
            if "action_type" not in cfg:
                cfg["action_type"] = "toggle" if cfg.get("is_toggle") else "pulse"

            row = ctk.CTkFrame(self.face_editor_frame, fg_color=BG2, corner_radius=10)
            row.pack(fill="x", pady=3)

            # Barra de color de cara
            ctk.CTkFrame(row, width=6,
                         fg_color=FACE_COLORS.get(face, "#444"),
                         corner_radius=3).pack(side="left", fill="y", padx=(8,0), pady=6)

            # Nombre de cara
            ctk.CTkLabel(row, text=FACE_LABELS.get(face, face),
                         font=("Segoe UI", 11), text_color=TEXT,
                         width=145, anchor="w").pack(side="left", padx=(8,4))

            # Tecla
            key_var = tk.StringVar(value=cfg.get("key", "up"))
            ctk.CTkOptionMenu(row, values=key_options, variable=key_var,
                              fg_color=BG3, button_color="#2D2D4E",
                              font=("Segoe UI", 10), width=100).pack(side="left", padx=4)

            # Tipo de acción (Pulse / Toggle / Re-tap)
            action_var = tk.StringVar(value=cfg.get("action_type", "pulse"))
            ctk.CTkOptionMenu(row,
                              values=action_options,
                              variable=action_var,
                              fg_color=BG3, button_color=ACCENT, button_hover_color=ACCENT2,
                              font=("Segoe UI", 10), width=100,
                              dynamic_resizing=False).pack(side="left", padx=4)

            # Hold ms
            length_var = tk.DoubleVar(value=cfg.get("press_length", 0.15))
            ctk.CTkLabel(row, text="Hold(s):", font=("Segoe UI", 9),
                         text_color=TEXT2, width=44).pack(side="left")
            ctk.CTkEntry(row, textvariable=length_var,
                         font=("Segoe UI", 10), width=48,
                         fg_color=BG3, border_color="#2D2D4E").pack(side="left", padx=(0,4))

            # Cancel keys
            cancel_var = tk.StringVar(value=",".join(cfg.get("cancel_keys", [])))
            ctk.CTkLabel(row, text="Cancela:", font=("Segoe UI", 9),
                         text_color=TEXT2, width=48).pack(side="left")
            ctk.CTkEntry(row, textvariable=cancel_var,
                         font=("Segoe UI", 10), width=80,
                         fg_color=BG3, border_color="#2D2D4E",
                         placeholder_text="up,down…").pack(side="left", padx=(0,8))

            self.face_widgets[face] = {
                "key": key_var, "action": action_var,
                "length": length_var, "cancel": cancel_var
            }

    # ── TAB: Log ──────────────────────────────────────────────────────────
    def _build_log_tab(self):
        self.log_frame = ctk.CTkFrame(self.main_area, fg_color="transparent")

        ctk.CTkLabel(self.log_frame, text="Log en vivo",
                     font=("Segoe UI", 20, "bold"), text_color=TEXT).pack(
                         anchor="w", padx=24, pady=(20,8))

        self.log_box = ctk.CTkTextbox(
            self.log_frame, font=("Consolas", 11),
            fg_color=BG2, text_color=TEXT2,
            corner_radius=12, wrap="word")
        self.log_box.pack(fill="both", expand=True, padx=24, pady=(0,12))
        self.log_box.configure(state="disabled")

        ctk.CTkButton(self.log_frame, text="🗑  Limpiar log",
                      command=self.clear_log, fg_color=BG3,
                      hover_color="#2D2D4E", font=("Segoe UI", 11), height=32).pack(
                          padx=24, pady=(0,12), anchor="e")

    # ── Navegación ────────────────────────────────────────────────────────
    def show_profiles_tab(self):
        self.log_frame.pack_forget()
        self.profiles_frame.pack(fill="both", expand=True)

    def show_log_tab(self):
        self.profiles_frame.pack_forget()
        self.log_frame.pack(fill="both", expand=True)

    # ── Lógica de perfiles ─────────────────────────────────────────────────
    def load_selected_profile(self):
        name = self.active_profile_name.get()
        if name and name in self.profiles_data:
            self._render_face_editor(self.profiles_data[name])

    def on_profile_selected(self, name):
        self.active_profile_name.set(name)
        self.load_selected_profile()
        # Si el bridge está corriendo, recargar el perfil en caliente
        if self.bridge.running:
            self.bridge.load_profile(
                profile_to_engine(self.profiles_data.get(name, {})))
            self.add_log(f"🔄 Perfil cambiado a: {name}")

    def save_current_profile(self):
        name = self.active_profile_name.get()
        if not name or name == "— sin perfiles —": return
        result = {}
        for face, w in self.face_widgets.items():
            try:
                pl = float(w["length"].get())
            except:
                pl = 0.15
            cancel = [k.strip() for k in w["cancel"].get().split(",") if k.strip()]
            result[face] = {
                "key": w["key"].get(),
                "action_type": w["action"].get(),
                "press_length": pl,
                "cancel_keys": cancel
            }
        self.profiles_data[name] = result
        save_profiles(self.profiles_data)
        self.add_log(f"💾 Perfil '{name}' guardado.")
        if self.bridge.running:
            self.bridge.load_profile(profile_to_engine(result))

    def new_profile_dialog(self):
        dialog = ctk.CTkInputDialog(
            text="Nombre del nuevo perfil:", title="Nuevo Perfil")
        name = dialog.get_input()
        if not name or not name.strip(): return
        name = name.strip()
        if name in self.profiles_data:
            messagebox.showwarning("Ya existe", f"El perfil '{name}' ya existe.")
            return
        # Perfil vacío por defecto
        self.profiles_data[name] = {
            face: {"key": "up", "is_toggle": False,
                   "press_length": 0.15, "cancel_keys": []}
            for face in ALL_FACES
        }
        save_profiles(self.profiles_data)
        self._refresh_profile_menu()
        self.active_profile_name.set(name)
        self.load_selected_profile()
        self.add_log(f"✨ Perfil '{name}' creado.")

    def delete_profile(self):
        name = self.active_profile_name.get()
        if not name or name not in self.profiles_data: return
        if len(self.profiles_data) <= 1:
            messagebox.showwarning("Error", "Debe quedar al menos un perfil.")
            return
        if not messagebox.askyesno("Confirmar", f"¿Eliminar perfil '{name}'?"):
            return
        del self.profiles_data[name]
        save_profiles(self.profiles_data)
        self._refresh_profile_menu()
        new_name = list(self.profiles_data.keys())[0]
        self.active_profile_name.set(new_name)
        self.load_selected_profile()
        self.add_log(f"🗑 Perfil '{name}' eliminado.")

    def _refresh_profile_menu(self):
        names = list(self.profiles_data.keys())
        self.profile_menu.configure(values=names)

    # ── Log ───────────────────────────────────────────────────────────────
    def add_log(self, msg: str):
        def _do():
            self.log_box.configure(state="normal")
            self.log_box.insert("end", f"{msg}\n")
            self.log_box.see("end")
            self.log_box.configure(state="disabled")
        self.after(0, _do)

    def clear_log(self):
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

    # ── Status ────────────────────────────────────────────────────────────
    def update_status(self, status: str):
        def _do():
            colors = {
                "scanning":    (YELLOW, "🔍 Buscando…"),
                "connecting":  (YELLOW, "⏳ Conectando…"),
                "connected":   (GREEN,  "● Conectado"),
                "disconnected":(TEXT2,  "● Desconectado"),
                "error":       (RED,    "● Error de conexión"),
            }
            color, label = colors.get(status, (TEXT2, "● —"))
            self.status_dot.configure(text=label, text_color=color)
            if status == "connected":
                self.btn_connect.configure(state="disabled")
                self.btn_disconnect.configure(state="normal")
            else:
                self.btn_connect.configure(state="normal")
                self.btn_disconnect.configure(state="disabled")
        self.after(0, _do)

    # ── Conexión BLE ──────────────────────────────────────────────────────
    def connect_cube(self):
        if not BLEAK_AVAILABLE:
            messagebox.showerror("Error", "bleak no está instalado.\npip install bleak")
            return
        name = self.active_profile_name.get()
        raw = self.profiles_data.get(name, {})
        self.bridge.load_profile(profile_to_engine(raw))
        self.bridge.stop()

        self._loop = asyncio.new_event_loop()
        self._bridge_thread = threading.Thread(
            target=self._run_loop, daemon=True)
        self._bridge_thread.start()
        self.show_log_tab()

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self.bridge.run())

    def disconnect_cube(self):
        self.bridge.stop()
        self.update_status("disconnected")
        self.add_log("🛑 Desconectado manualmente.")

    # ── System Tray ───────────────────────────────────────────────────────
    def _start_tray(self):
        icon_img = make_tray_icon()
        menu = pystray.Menu(
            pystray.MenuItem("Mostrar ventana", self._show_from_tray, default=True),
            pystray.MenuItem("─────────────", None, enabled=False),
            pystray.MenuItem("Salir", self._quit_app),
        )
        self.tray_icon = pystray.Icon(
            "CubeController", icon_img,
            "CogniMirror Cube Controller", menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def _show_from_tray(self, icon=None, item=None):
        self.after(0, self.deiconify)
        self.after(0, self.lift)

    def hide_window(self):
        self.withdraw()

    def _quit_app(self, icon=None, item=None):
        self.bridge.stop()
        if self.tray_icon:
            self.tray_icon.stop()
        self.quit()
        sys.exit(0)


# ─── ENTRY POINT ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = CubeControllerApp()
    app.mainloop()
