"""E2E Test Orchestrator: Starts background server and runs full browser test suite."""
import functools
import os
import subprocess
import sys
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import portal_server

def main():
    print(f"=== Starting E2E Verification Suite on {PROJECT_ROOT} ===")
    
    # 1. Start test server on an ephemeral port
    handler = functools.partial(portal_server.PortalHandler, directory=str(PROJECT_ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_port
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    
    origin = f"http://127.0.0.1:{port}"
    print(f"Test server successfully started at: {origin}")
    
    env = dict(os.environ)
    env["QMS_TEST_ORIGIN"] = origin
    
    all_passed = True
    
    try:
        # Step 1: Run Sidebar E2E Browser Test
        print("\n--- [1/3] Running Sidebar Navigation & Dynamic Indicators E2E Test ---")
        res1 = subprocess.run(
            ["node", "tests/test_sidebar_e2e.cjs"],
            cwd=str(PROJECT_ROOT),
            env=env,
            capture_output=False
        )
        if res1.returncode != 0:
            print("[FAIL] Sidebar E2E Test FAILED!")
            all_passed = False
        else:
            print("[PASS] Sidebar E2E Test PASSED!")
            
        # Step 2: Run Light/Dark Theme Switcher E2E Test
        print("\n--- [2/3] Running Light/Dark Theme Switcher & Persistence E2E Test ---")
        res_theme = subprocess.run(
            ["node", "tests/test_theme_toggle.cjs"],
            cwd=str(PROJECT_ROOT),
            env=env,
            capture_output=False
        )
        if res_theme.returncode != 0:
            print("[FAIL] Theme Toggle E2E Test FAILED!")
            all_passed = False
        else:
            print("[PASS] Theme Toggle E2E Test PASSED!")

        # Step 3: Run Full Core Browser Smoke Test (D1-D8, AI intake, approvals, IndexedDB)
        print("\n--- [3/4] Running Core Workflow & Architecture Browser Smoke Test ---")
        res2 = subprocess.run(
            ["node", "tests/browser_smoke.cjs"],
            cwd=str(PROJECT_ROOT),
            env=env,
            capture_output=False
        )
        if res2.returncode != 0:
            print("[FAIL] Core Browser Smoke Test FAILED!")
            all_passed = False
        else:
            print("[PASS] Core Browser Smoke Test PASSED!")

        # Step 4: Run Supplier Quality & 4M PCN Portal E2E Test
        print("\n--- [4/4] Running Supplier Quality & 4M PCN Portal E2E Test ---")
        res_supp = subprocess.run(
            ["node", "tests/test_supplier_portal_e2e.cjs"],
            cwd=str(PROJECT_ROOT),
            env=env,
            capture_output=False
        )
        if res_supp.returncode != 0:
            print("[FAIL] Supplier Portal E2E Test FAILED!")
            all_passed = False
        else:
            print("[PASS] Supplier Portal E2E Test PASSED!")
            
    finally:
        print("\nShutting down test server...")
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=2)
        print("Test server stopped cleanly.")
        
    if all_passed:
        print("\n*** ALL E2E BROWSER VALIDATIONS PASSED 100%! ***")
        sys.exit(0)
    else:
        print("\n*** SOME TESTS FAILED! ***")
        sys.exit(1)

if __name__ == "__main__":
    main()
