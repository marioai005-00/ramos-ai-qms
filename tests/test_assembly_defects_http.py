"""Isolated HTTP tests: outsourced assembly defects are internal records with per-product totals."""
import base64
import functools
import hashlib
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import portal_server
from qms_backend import QMSStore


class AssemblyDefectsHttpTests(unittest.TestCase):
    route = "/__api__/qms/assembly-defects"

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"QMS_DATABASE_PATH": str(root / "test.sqlite3"), "QMS_DEMO_PASSWORD": "1"})
        self.env.start()
        self.original = portal_server.QMS_STORE
        portal_server.QMS_STORE = self.store = QMSStore(root)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(portal_server.PortalHandler, directory=str(root)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"
        self.reviewer = self.login("sjkim")
        self.writer = self.login("jhpark")
        self.supplier = self.login("thkwon")
        self.request("POST", "/__api__/qms/state", {"state": {"cases": [{"id": "CASE-TEST"}], "intakeQueue": []}, "expectedRevision": 0}, self.reviewer)
        self.initial_state = self.store.get_state()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        portal_server.QMS_STORE = self.original
        self.env.stop(); self.temp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=8)
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
        conn.request(method, path, body, {"Origin": self.origin, "Content-Type": "application/json", **(headers or {})})
        response = conn.getresponse(); raw = response.read()
        result = json.loads(raw) if response.getheader("Content-Type", "").startswith("application/json") and raw else raw
        status, info = response.status, dict(response.getheaders()); conn.close()
        return status, info, result

    def login(self, username):
        status, headers, result = self.request("POST", "/__api__/auth/login", {"username": username, "password": "1"})
        self.assertEqual(status, 200)
        return {"Cookie": headers["Set-Cookie"].split(";", 1)[0], "X-QMS-CSRF": result["csrfToken"]}

    def payload(self, **changes):
        return {"supplierId": "SUP-TECHL", "partNumber": "MMACGD8J0F-HZRAF1-LPAGA00", "productName": "KFD eMMC 153BGA 16GB", "lotNo": "0QH321500A04-LPAGA00",
                "occurredDate": "2026-10-01", "process": "SMT", "defectType": "솔더 브릿지", "inputQty": 1000, "defectQty": 5, "files": [], **changes}

    def create(self, headers=None, **changes):
        status, _, result = self.request("POST", self.route, self.payload(**changes), headers or self.writer)
        self.assertEqual(status, 201, result)
        return result["record"]

    def update(self, record, action, headers=None, **changes):
        return self.request("POST", f"{self.route}/{record['recordId']}", {"action": action, "comment": "실제 확인 내용", "expectedRevision": record["revision"], **changes}, headers or self.writer)

    def listed(self, headers=None):
        status, _, result = self.request("GET", self.route, headers=headers or self.reviewer)
        self.assertEqual(status, 200, result)
        return result

    def test_records_are_grouped_by_product_using_entered_quantities_only(self):
        self.create()
        self.create(defectType="부품 미삽", inputQty=500, defectQty=10, supplierId="SUP-WINPAC")
        self.create(defectType="솔더 브릿지", inputQty=None, defectQty=3)
        self.create(partNumber="OTHER-PN", productName="다른 품목", inputQty=None, defectQty=2)
        result = self.listed()
        self.assertEqual(len(result["items"]), 4)
        emmc, other = result["products"]
        self.assertEqual((emmc["partNumber"], emmc["records"], emmc["open"], emmc["defectQty"]), ("MMACGD8J0F-HZRAF1-LPAGA00", 3, 3, 18))
        self.assertEqual((emmc["measuredDefectQty"], emmc["measuredInputQty"], emmc["measuredRecords"], emmc["defectRatePct"]), (15, 1500, 2, 1.0))
        self.assertEqual(emmc["suppliers"], [{"name": "WinPAC", "records": 1, "defectQty": 10}, {"name": "TechL", "records": 2, "defectQty": 8}])
        self.assertEqual(emmc["defectTypes"][0], {"type": "부품 미삽", "records": 1, "defectQty": 10})
        self.assertIsNone(other["defectRatePct"])

    def test_creation_records_the_logged_in_account_and_stores_originals(self):
        content = b"defect photo bytes"
        record = self.create(files=[{"filename": "불량 사진.png", "dataUrl": "data:image/png;base64," + base64.b64encode(content).decode()}],
                             status="Closed", actionResult="임의 완료", createdBy={"name": "임의 이름"})
        self.assertEqual((record["status"], record["actionResult"], record["createdBy"]["username"]), ("Open", "", "jhpark"))
        self.assertTrue(record["recordId"].startswith("ASD-"))
        stored = record["files"][0]
        self.assertEqual(stored["sha256"], hashlib.sha256(content).hexdigest())
        status, headers, actual = self.request("GET", f"{self.route}/{record['recordId']}/files/{stored['id']}", headers=self.reviewer)
        self.assertEqual((status, actual, headers["X-Evidence-SHA256"]), (200, content, stored["sha256"]))

    def test_input_validation(self):
        for changes in ({"supplierId": "SUP-SSPC"}, {"supplierId": ""}, {"partNumber": ""}, {"defectType": ""}, {"occurredDate": "2026/10/01"},
                        {"defectQty": None}, {"defectQty": -1}, {"inputQty": 3, "defectQty": 4}, {"defectQty": "many"}):
            with self.subTest(changes=changes):
                self.assertEqual(self.request("POST", self.route, self.payload(**changes), self.writer)[0], 400)
        self.assertEqual(self.request("POST", self.route, self.payload(linkedCaseId="NONE"), self.writer)[0], 404)
        self.assertEqual(self.request("POST", self.route, self.payload(linkedTicketId="SQ-NONE"), self.writer)[0], 404)
        self.assertEqual(self.listed()["items"], [])

    def test_links_reference_existing_records_without_changing_them(self):
        ticket = self.request("POST", "/__api__/qms/supplier-tickets", {"ticketType": "Issue", "title": "조립 불량", "description": "발견", "change4M": [],
                                                                        "incident": {"inputQty": 10, "defectQty": 1}, "files": []}, self.supplier)[2]["record"]
        record = self.create(linkedTicketId=ticket["ticketId"], linkedCaseId="CASE-TEST")
        self.assertEqual((record["linkedTicketId"], record["linkedCaseId"]), (ticket["ticketId"], "CASE-TEST"))
        self.assertEqual(self.request("POST", self.route, self.payload(supplierId="SUP-WINPAC", linkedTicketId=ticket["ticketId"]), self.writer)[0], 400)
        self.assertEqual(self.store.get_state(), self.initial_state)
        self.assertEqual(self.request("GET", f"/__api__/qms/supplier-tickets/{ticket['ticketId']}", headers=self.reviewer)[2]["record"]["revision"], ticket["revision"])

    def test_status_flow_and_closure_by_reviewer_with_result(self):
        record = self.create()
        self.assertEqual(self.update(record, "status", status="Closed", actionResult="바로 종결")[0], 409)
        status, _, result = self.update(record, "status", status="InAction")
        self.assertEqual(status, 200, result)
        record = result["record"]
        self.assertEqual(self.update(record, "status", status="Closed", actionResult="조치 완료")[0], 403)
        self.assertEqual(self.update(record, "status", self.reviewer, status="Closed")[0], 400)
        self.assertEqual(self.update({**record, "revision": 1}, "status", self.reviewer, status="Closed", actionResult="조치 완료")[0], 409)
        status, _, result = self.update(record, "status", self.reviewer, status="Closed", actionResult="노즐 교체 후 재발 없음 확인")
        self.assertEqual(status, 200, result)
        closed = result["record"]
        self.assertEqual((closed["status"], closed["closedBy"]["username"], closed["actionResult"]), ("Closed", "sjkim", "노즐 교체 후 재발 없음 확인"))
        self.assertEqual(self.update(closed, "edit", **self.payload(defectQty=1))[0], 409)
        self.assertEqual(self.update(closed, "status", status="InAction")[0], 403)
        self.assertEqual(self.listed()["products"][0]["open"], 0)

    def test_edit_updates_grouping_and_note_keeps_status(self):
        record = self.create()
        status, _, result = self.update(record, "edit", **self.payload(partNumber="NEW-PN", defectQty=7))
        self.assertEqual(status, 200, result)
        self.assertEqual([p["partNumber"] for p in self.listed()["products"]], ["NEW-PN"])
        noted = self.update(result["record"], "note")[2]["record"]
        self.assertEqual((noted["status"], len(noted["history"])), ("Open", 3))
        self.assertEqual(self.update(noted, "note", comment="")[0], 400)

    def test_access_is_internal_only(self):
        record = self.create()
        self.assertEqual(self.request("GET", self.route)[0], 401)
        self.assertEqual(self.request("GET", self.route, headers=self.supplier)[0], 403)
        self.assertEqual(self.request("POST", self.route, self.payload(), self.supplier)[0], 403)
        self.assertEqual(self.request("POST", self.route, self.payload(), {"Cookie": self.writer["Cookie"]})[0], 403)
        self.assertEqual(self.update(record, "note", self.supplier)[0], 403)
        self.assertEqual(self.request("GET", f"{self.route}/{record['recordId']}/files/ADF-none", headers=self.supplier)[0], 403)
        self.assertEqual(self.request("GET", f"{self.route}/{record['recordId']}/files/ADF-none", headers=self.reviewer)[0], 404)


if __name__ == "__main__":
    unittest.main()
