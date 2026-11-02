"""Launcher script for V2X Cooperative Road Safety Navigation Hub."""
import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
import uvicorn

from app.config import settings


def find_chrome_executable() -> str | None:
    """Detect Google Chrome executable on the system."""
    if sys.platform == "win32":
        # 1. Check Windows Registry App Paths
        try:
            import winreg
            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe") as key:
                        val, _ = winreg.QueryValueEx(key, "")
                        if val and os.path.isfile(val):
                            return val
                except OSError:
                    pass
        except ImportError:
            pass

        # 2. Check standard Windows directories
        candidates = [
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        ]
        for path in candidates:
            if os.path.isfile(path):
                return path

    elif sys.platform == "darwin":
        mac_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if os.path.isfile(mac_path):
            return mac_path

    # 3. Search PATH for cross-platform binaries
    for name in ("chrome", "chrome.exe", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found

    return None


def open_in_chrome(url: str) -> bool:
    """Attempt to open the given URL specifically in Google Chrome."""
    chrome_path = find_chrome_executable()
    if chrome_path:
        try:
            subprocess.Popen([chrome_path, url])
            return True
        except Exception as e:
            print(f"  [Chrome Launcher] Не удалось запустить {chrome_path}: {e}")

    # Fallback attempt via system start command on Windows
    if sys.platform == "win32":
        try:
            res = os.system(f'start chrome "{url}"')
            if res == 0:
                return True
        except Exception:
            pass

    # Generic browser fallback if Chrome is not detected
    try:
        webbrowser.open(url)
        return True
    except Exception as e:
        print(f"  [Chrome Launcher] Ошибка открытия браузера: {e}")
        return False


def wait_and_open_browser(port: int, timeout: float = 8.0):
    """Wait for server to start, then open in Google Chrome."""
    def _worker():
        url = f"http://localhost:{port}"
        health_url = f"{url}/api/health"
        start_time = time.time()

        while time.time() - start_time < timeout:
            try:
                with urllib.request.urlopen(health_url, timeout=0.5):
                    break
            except Exception:
                time.sleep(0.2)

        print(f"  [Auto-Launch] Платформа готова. Открытие в Google Chrome: {url}")
        open_in_chrome(url)

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


def main():
    parser = argparse.ArgumentParser(description="V2X Road Safety Navigation Hub Launcher")
    parser.add_argument("--port", type=int, default=settings.PORT, help="Port to bind server")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()

    port = args.port
    print("=" * 70)
    print("  V2X Cooperative Road Safety Navigation System (MVP)")
    print(f"  Starting server on http://localhost:{port}")
    print("  WebSockets V2X Ingestion Gateway active at /ws/telemetry/{vehicle_id}")
    print("  Браузер Google Chrome откроется автоматически при запуске.")
    print("=" * 70)

    if settings.AUTO_OPEN_BROWSER and not args.no_browser:
        wait_and_open_browser(port)

    uvicorn.run(
        "app.server:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=False
    )


if __name__ == "__main__":
    main()
