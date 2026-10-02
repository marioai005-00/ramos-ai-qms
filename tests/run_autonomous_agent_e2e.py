import functools
import os
import subprocess
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import portal_server

def main():
    print(f"=== Starting Autonomous 8D AI Agent E2E Test Suite on {PROJECT_ROOT} ===")
    handler = functools.partial(portal_server.PortalHandler, directory=str(PROJECT_ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_port
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    
    origin = f"http://127.0.0.1:{port}"
    print(f"Test server running at: {origin}")
    
    env = dict(os.environ)
    env["QMS_TEST_ORIGIN"] = origin
    
    res = subprocess.run(
        ["node", "tests/test_autonomous_agent_e2e.cjs"],
        cwd=str(PROJECT_ROOT),
        env=env
    )
    
    server.shutdown()
    sys.exit(res.returncode)

if __name__ == "__main__":
    main()
