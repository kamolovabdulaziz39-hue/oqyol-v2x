"""Launcher script for V2X Cooperative Road Safety Navigation Hub."""
import uvicorn
from app.config import settings

def main():
    print("=" * 70)
    print("  V2X Cooperative Road Safety Navigation System (MVP)")
    print(f"  Starting server on http://localhost:{settings.PORT}")
    print("  WebSockets V2X Ingestion Gateway active at /ws/telemetry/{vehicle_id}")
    print("=" * 70)
    uvicorn.run(
        "app.server:app",
        host="0.0.0.0",
        port=settings.PORT,
        log_level="info",
        access_log=False
    )

if __name__ == "__main__":
    main()
