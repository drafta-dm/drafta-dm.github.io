"""
Downloads the Fantacalcio.it price list (Excel) for the current season.

The season id is read from the public price page, so the script follows the new season
by itself (it was stuck on 2025/26 with the id written in the code).

Usage:  FANTACALCIO_USERNAME=... FANTACALCIO_PASSWORD=... python scripts/download_excel.py
Writes: scripts/quotazioni.xlsx and scripts/season.txt
"""

import os
import re
import sys
import requests

BASE_URL = "https://www.fantacalcio.it"
HERE = os.path.dirname(os.path.abspath(__file__))
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "it-IT,it;q=0.9",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/login",
}


def fail(msg):
    print(f"[ERRORE] {msg}", flush=True)
    sys.exit(1)


def current_season(session):
    page = session.get(f"{BASE_URL}/quotazioni-fantacalcio", timeout=30).text
    found = re.findall(r"Excel/prices/(\d+)/1", page)
    if not found:
        fail("id della stagione non trovato nella pagina delle quotazioni")
    return max(int(s) for s in found)


def download():
    username = os.environ.get("FANTACALCIO_USERNAME")
    password = os.environ.get("FANTACALCIO_PASSWORD")
    if not username or not password:
        fail("servono FANTACALCIO_USERNAME e FANTACALCIO_PASSWORD")

    session = requests.Session()
    session.headers.update(HEADERS)

    season = current_season(session)
    print(f"Stagione Fantacalcio.it: {season}", flush=True)

    login = session.post(f"{BASE_URL}/api/v1/User/login", json={"username": username, "password": password}, timeout=30)
    if login.status_code != 200 or not login.json().get("success"):
        fail(f"login non riuscita (HTTP {login.status_code})")
    print("[OK] Login", flush=True)

    res = session.get(f"{BASE_URL}/api/v1/Excel/prices/{season}/1", timeout=60,
                      headers={"Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
                               "Referer": f"{BASE_URL}/quotazioni-fantacalcio"})
    if res.status_code != 200 or "html" in res.headers.get("Content-Type", ""):
        fail(f"download non riuscito (HTTP {res.status_code}, {res.headers.get('Content-Type')})")
    if len(res.content) < 10_000:
        fail(f"file troppo piccolo per essere il listone ({len(res.content)} byte)")

    with open(os.path.join(HERE, "quotazioni.xlsx"), "wb") as f:
        f.write(res.content)
    with open(os.path.join(HERE, "season.txt"), "w") as f:
        f.write(str(season))
    print(f"[OK] scripts/quotazioni.xlsx ({len(res.content):,} byte)", flush=True)


if __name__ == "__main__":
    download()
