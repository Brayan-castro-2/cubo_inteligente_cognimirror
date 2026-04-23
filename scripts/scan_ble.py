import asyncio
from bleak import BleakScanner

async def main():
    print("SCANNING: Escaneando todos los dispositivos Bluetooth cercanos...")
    devices = await BleakScanner.discover(timeout=5.0)
    
    if not devices:
        print("ERROR: No se detectó ningún dispositivo Bluetooth.")
        return

    print(f"\nSe encontraron {len(devices)} dispositivos:")
    print("-" * 50)
    for d in devices:
        name = d.name if d.name else "Desconocido"
        print(f"[{name}] - Direccion: {d.address}")
    print("-" * 50)
    print("\nSi ves tu cubo en la lista, copia su nombre o direccion MAC.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"ERROR: Error al escanear: {e}")
