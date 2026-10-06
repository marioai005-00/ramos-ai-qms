"""Demo portal: same source, separate database (data/demo.sqlite3), fixed port 8792, mail off.

The operational server (portal_server.py, ports 8765-8775, data/qms.sqlite3) is not touched.
The agent scheduler is not started, so the demo database sends no SLA or monitoring mail.
"""
import functools
import os
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8792
# Set before portal_server is imported: the process environment wins over .env.
os.environ.update(QMS_DATABASE_PATH=str(ROOT / "data" / "demo.sqlite3"), QMS_EXTERNAL_SEND_ENABLED="false",
                  QMS_NO_BROWSER="1", PYTHONDONTWRITEBYTECODE="1")
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

import portal_server  # noqa: E402


def main() -> None:
    url = f"http://127.0.0.1:{PORT}/"
    open_browser = os.environ.get("QMS_DEMO_NO_BROWSER") != "1"  # set to 1 to start the server without a browser tab
    if portal_server.local_port_is_open(PORT):
        if open_browser:
            webbrowser.open(url)
        return
    server = ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(portal_server.PortalHandler, directory=str(ROOT)))
    print(f"[DEMO] {url}  (DB: data/demo.sqlite3, 메일 꺼짐)")
    if open_browser:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
