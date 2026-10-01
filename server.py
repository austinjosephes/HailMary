"""
അമ്മയോടൊപ്പം | CLC Velappaya
Shared Prayer Counter Backend — Python stdlib only, no pip needed.

Routes:
  GET  /api/prayers              → public: returns { totalCount, todayCount, history, lastDateStr }
  POST /api/prayers              → public: { amount } → atomically adds, returns updated data
  POST /api/admin/login          → { username, password } → returns { token } or 401
  GET  /api/admin/data           → admin: returns full data (requires X-Admin-Token header)
  POST /api/admin/override       → admin: { totalCount } → sets exact total
  POST /api/admin/reset          → admin: resets everything to 0
  DELETE /api/admin/entry/<id>   → admin: deletes a history entry by id
"""

import http.server
import socketserver
import json
import os
import sys
import secrets
import threading
from datetime import datetime

# ─── Configuration ────────────────────────────────────────────────────────────
PORT        = 8000
DATA_FILE   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prayers_data.json")
TARGET_GOAL = 100000

# Admin credentials — change these before deploying!
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "clcvelappaya2024"

# In-memory session store  { token: True }
# Sessions last for the lifetime of the server process.
_admin_sessions = set()
_data_lock = threading.Lock()

# ─── Data helpers ─────────────────────────────────────────────────────────────
def get_today_str():
    return datetime.now().strftime("%Y-%m-%d")

def _default_data():
    return {
        "totalCount":  0,
        "todayCount":  0,
        "lastDateStr": get_today_str(),
        "history":     []
    }

def load_data():
    if not os.path.exists(DATA_FILE):
        d = _default_data()
        _save_data_unsafe(d)
        return d
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Daily rollover
        if data.get("lastDateStr") != get_today_str():
            data["todayCount"]  = 0
            data["lastDateStr"] = get_today_str()
        return data
    except Exception as e:
        print(f"[WARN] Error loading {DATA_FILE}: {e}")
        return _default_data()

def _save_data_unsafe(data):
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[WARN] Error saving {DATA_FILE}: {e}")

def save_data(data):
    _save_data_unsafe(data)

# ─── Public API data (strip nothing — history is public for Recent Offerings) ─
def public_view(data):
    return {
        "totalCount":  data.get("totalCount", 0),
        "todayCount":  data.get("todayCount", 0),
        "lastDateStr": data.get("lastDateStr", get_today_str()),
        "history":     data.get("history", [])[-20:]
    }

# ─── HTTP Handler ─────────────────────────────────────────────────────────────
class PrayerHandler(http.server.SimpleHTTPRequestHandler):

    # Serve static files from the script's own directory
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def log_message(self, fmt, *args):
        # Suppress noisy static-file logs; only show API requests
        if "/api/" in (args[0] if args else ""):
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % args}")

    # ── CORS / common headers ────────────────────────────────────────────────
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
        self.send_header("Cache-Control",                "no-cache, no-store, must-revalidate")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    # ── JSON response helper ──────────────────────────────────────────────────
    def json_response(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type",   "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ── Read JSON body ────────────────────────────────────────────────────────
    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    # ── Admin token check ─────────────────────────────────────────────────────
    def is_admin(self):
        token = self.headers.get("X-Admin-Token", "")
        return token in _admin_sessions

    def require_admin(self):
        if not self.is_admin():
            self.json_response(401, {"error": "Unauthorised. Admin login required."})
            return False
        return True

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self):
        # Public: GET /api/prayers
        if self.path == "/api/prayers":
            with _data_lock:
                data = load_data()
            self.json_response(200, public_view(data))
            return

        # Admin: GET /api/admin/data
        if self.path == "/api/admin/data":
            if not self.require_admin():
                return
            with _data_lock:
                data = load_data()
            self.json_response(200, data)
            return

        # Static files (index.html, admin.html, app.js, style.css …)
        super().do_GET()

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self):

        # ── Public: submit prayers ──────────────────────────────────────────
        if self.path == "/api/prayers":
            payload = self.read_json_body()
            try:
                amount = int(payload.get("amount", 0))
            except (ValueError, TypeError):
                amount = 0

            if amount <= 0:
                self.json_response(400, {"error": "amount must be a positive integer"})
                return

            with _data_lock:
                data = load_data()
                prev  = int(data.get("totalCount", 0))
                total = min(TARGET_GOAL, prev + amount)
                data["totalCount"] = total
                data["todayCount"] = int(data.get("todayCount", 0)) + amount

                entry = {
                    "id":     int(datetime.now().timestamp() * 1000),
                    "amount": amount,
                    "time":   datetime.now().strftime("%I:%M %p")
                }
                history = data.get("history", [])
                history.insert(0, entry)
                data["history"] = history[:100]   # keep last 100 on server
                save_data(data)

            self.json_response(200, public_view(data))
            return

        # ── Admin: login ────────────────────────────────────────────────────
        if self.path == "/api/admin/login":
            payload = self.read_json_body()
            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", "")).strip()

            if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
                token = secrets.token_hex(32)
                _admin_sessions.add(token)
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Admin login successful.")
                self.json_response(200, {"token": token})
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Failed admin login attempt.")
                self.json_response(401, {"error": "Invalid credentials"})
            return

        # ── Admin: logout ───────────────────────────────────────────────────
        if self.path == "/api/admin/logout":
            token = self.headers.get("X-Admin-Token", "")
            _admin_sessions.discard(token)
            self.json_response(200, {"ok": True})
            return

        # ── Admin: override total ───────────────────────────────────────────
        if self.path == "/api/admin/override":
            if not self.require_admin():
                return
            payload = self.read_json_body()
            try:
                new_total = int(payload.get("totalCount", 0))
            except (ValueError, TypeError):
                new_total = 0
            new_total = max(0, min(TARGET_GOAL, new_total))

            with _data_lock:
                data = load_data()
                data["totalCount"] = new_total
                save_data(data)

            self.json_response(200, data)
            return

        # ── Admin: reset everything ─────────────────────────────────────────
        if self.path == "/api/admin/reset":
            if not self.require_admin():
                return
            fresh = _default_data()
            with _data_lock:
                save_data(fresh)
            self.json_response(200, fresh)
            return

        self.json_response(404, {"error": "Not found"})

    # ── DELETE ────────────────────────────────────────────────────────────────
    def do_DELETE(self):
        # Admin: DELETE /api/admin/entry/<id>
        if self.path.startswith("/api/admin/entry/"):
            if not self.require_admin():
                return
            try:
                entry_id = int(self.path.split("/")[-1])
            except ValueError:
                self.json_response(400, {"error": "Invalid entry id"})
                return

            with _data_lock:
                data = load_data()
                original_len = len(data.get("history", []))
                entry_to_del = next((e for e in data.get("history", []) if e.get("id") == entry_id), None)
                if entry_to_del:
                    data["history"] = [e for e in data["history"] if e.get("id") != entry_id]
                    # Subtract the deleted amount from total
                    data["totalCount"] = max(0, int(data.get("totalCount", 0)) - int(entry_to_del.get("amount", 0)))
                    save_data(data)
                    self.json_response(200, data)
                else:
                    self.json_response(404, {"error": "Entry not found"})
            return

        self.json_response(404, {"error": "Not found"})


# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("", port), PrayerHandler) as httpd:
        print("=" * 54)
        print("  Ammayodoppam | CLC Velappaya – Shared Server")
        print(f"  User site  : http://localhost:{port}/")
        print(f"  Admin panel: http://localhost:{port}/admin.html")
        print(f"  Data file  : {DATA_FILE}")
        print("=" * 54)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
