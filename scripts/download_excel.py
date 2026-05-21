"""
Script per scaricare le Quotazioni Fantacalcio da fantacalcio.it
usando l'API REST del sito (niente browser, niente Playwright).

Utilizzo:
  python scripts/download_excel.py

Variabili d'ambiente:
  FANTACALCIO_USERNAME   (default: laravalafava)
  FANTACALCIO_PASSWORD   (default: laravalafava)
"""

import os
import sys
import requests

BASE_URL = "https://www.fantacalcio.it"
LOGIN_ENDPOINT = f"{BASE_URL}/api/v1/User/login"
DOWNLOAD_ENDPOINT = f"{BASE_URL}/api/v1/Excel/prices/20/1"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8",
    "Content-Type": "application/json",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/login",
}


def download():
    username = os.environ.get("FANTACALCIO_USERNAME", "laravalafava")
    password = os.environ.get("FANTACALCIO_PASSWORD", "laravalafava")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    target_excel = os.path.join(script_dir, "Quotazioni_Fantacalcio_Stagione_2025_26.xlsx")

    session = requests.Session()
    session.headers.update(HEADERS)

    # ── 1. Login ────────────────────────────────────────────────────────────
    print(f"Login come '{username}'...", flush=True)
    login_resp = session.post(
        LOGIN_ENDPOINT,
        json={"username": username, "password": password},
        timeout=30,
    )

    print(f"  Status login: {login_resp.status_code}", flush=True)

    if login_resp.status_code != 200:
        print(f"❌ Login fallita (HTTP {login_resp.status_code})", flush=True)
        print(f"   Risposta: {login_resp.text[:500]}", flush=True)
        sys.exit(1)

    login_data = login_resp.json()
    print(f"  Risposta login: {login_data}", flush=True)

    if not login_data.get("success"):
        errors = login_data.get("errors", [])
        msg = "; ".join(e.get("message", str(e)) for e in errors) if errors else str(login_data)
        print(f"❌ Login fallita: {msg}", flush=True)
        sys.exit(1)

    print("[OK] Login riuscita!", flush=True)

    # -- 2. Download Excel ---------------------------------------------------
    print(f"Download Excel da {DOWNLOAD_ENDPOINT}...", flush=True)
    dl_resp = session.get(
        DOWNLOAD_ENDPOINT,
        stream=True,
        timeout=60,
        headers={
            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
            "Referer": f"{BASE_URL}/quotazioni-fantacalcio",
        },
    )

    print(f"  Status download: {dl_resp.status_code}", flush=True)
    print(f"  Content-Type: {dl_resp.headers.get('Content-Type', 'N/A')}", flush=True)

    if dl_resp.status_code != 200:
        print(f"[ERRORE] Download fallito (HTTP {dl_resp.status_code})", flush=True)
        print(f"   Risposta: {dl_resp.text[:500]}", flush=True)
        sys.exit(1)

    # Verifica che sia davvero un file Excel (non una pagina di errore HTML)
    content_type = dl_resp.headers.get("Content-Type", "")
    if "html" in content_type:
        print("[ERRORE] Il server ha risposto con HTML invece che con un file Excel.", flush=True)
        print("   Probabile sessione non autenticata o reindirizzamento al login.", flush=True)
        sys.exit(1)

    # Salva il file
    with open(target_excel, "wb") as f:
        for chunk in dl_resp.iter_content(chunk_size=8192):
            f.write(chunk)

    size = os.path.getsize(target_excel)
    print(f"[OK] File salvato in: {target_excel} ({size:,} bytes)", flush=True)

    if size < 10_000:
        print("[WARN] Il file sembra troppo piccolo per essere un Excel valido.", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    download()
