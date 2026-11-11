#!/usr/bin/env python3
"""
============================================================================
QDG RADIO // TELEVIDEO BROADCAST SERVER (server.py)
Zero-Dependency Python 3 HTTP + Broadcast State & Audio Upload Server
Endpoints:
  - GET  /             -> index.html (Listener Televideo CRT Screen)
  - GET  /admin.html   -> admin.html (P999 Master Control Room)
  - GET  /api/state    -> Returns current live broadcast state JSON
  - POST /api/state    -> Updates live broadcast state JSON across all clients
  - POST /api/upload   -> Saves uploaded MP3/WAV/OGG files to ./uploads/
  - POST /api/event    -> Stores latest broadcast trigger event
============================================================================
"""

import cgi
import http.server
import json
import os
import re
import socketserver
import sys
import time

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
STATE_FILE = os.path.join(BASE_DIR, "broadcast_state.json")

os.makedirs(UPLOADS_DIR, exist_ok=True)

LIVE_STATE = {}
LAST_EVENT = {}

if os.path.exists(STATE_FILE):
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            LIVE_STATE = json.load(f)
    except Exception:
        LIVE_STATE = {}


class QDGRadioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/state"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(LIVE_STATE).encode("utf-8"))
            return

        if self.path.startswith("/api/event"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(LAST_EVENT).encode("utf-8"))
            return

        super().do_GET()

    def do_POST(self):
        global LIVE_STATE, LAST_EVENT

        if self.path.startswith("/api/state"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(body)
                LIVE_STATE.update(data)
                LIVE_STATE["updatedAt"] = int(time.time() * 1000)
                with open(STATE_FILE, "w", encoding="utf-8") as f:
                    json.dump(LIVE_STATE, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if self.path.startswith("/api/event"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                LAST_EVENT = json.loads(body)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if self.path.startswith("/api/upload"):
            ctype, pdict = cgi.parse_header(self.headers.get("Content-Type", ""))
            if ctype == "multipart/form-data":
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers["Content-Type"]},
                )
                if "file" in form:
                    fileitem = form["file"]
                    raw_name = os.path.basename(fileitem.filename or f"track_{int(time.time())}.mp3")
                    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", raw_name)
                    out_path = os.path.join(UPLOADS_DIR, safe_name)
                    with open(out_path, "wb") as f:
                        f.write(fileitem.file.read())

                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"ok": True, "url": f"uploads/{safe_name}"}).encode("utf-8"))
                    return

            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid upload"}).encode("utf-8"))
            return


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), QDGRadioHandler) as httpd:
        print(f"============================================================")
        print(f" QDG RADIO // TELEVIDEO BROADCAST SERVER ATTIVO")
        print(f" -> Ascoltatori (Televideo P100): http://localhost:{PORT}/index.html")
        print(f" -> Regia Admin (Studio P999):    http://localhost:{PORT}/admin.html")
        print(f"============================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer fermato.")
