import asyncio
from bleak import BleakClient, BleakScanner

# El nombre que vimos en el log del usuario
TARGET_NAME = "RubiksX_C6F27F"

async def main():
    print(f"SEARCHING: Buscando dispositivo {TARGET_NAME}...")
    device = await BleakScanner.find_device_by_name(TARGET_NAME)
    
    if not device:
        print("ERROR: No se encontró el dispositivo especificado.")
        return

    print(f"SUCCESS: Encontrado! Conectando a {device.address}...")
    async with BleakClient(device.address) as client:
        print(f"READY: Conectado: {client.is_connected}")
        
        print("\nLista de Servicios y Caracteristicas:")
        print("-" * 60)
        for service in client.services:
            print(f"[SERVICIO] {service.uuid} - {service.description}")
            for char in service.characteristics:
                props = ", ".join(char.properties)
                print(f"  └─ [CHAR] {char.uuid} ({props}) - {char.description}")
        print("-" * 60)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"ERROR: Error: {e}")
