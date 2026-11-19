"""
Turns scripts/quotazioni.xlsx into js/data/players.js (id, name, team, role, FVM as cost).
Refuses to write a list that looks broken, so a bad download never empties the app.

Usage: python scripts/convert_excel_to_js.py
"""

import json
import os
import sys
from datetime import datetime, timezone

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(os.path.dirname(HERE), "js", "data", "players.js")
COLUMNS = {"id": "Id", "role": "R", "name": "Nome", "team": "Squadra", "cost": "FVM"}


def convert():
    rows = list(openpyxl.load_workbook(os.path.join(HERE, "quotazioni.xlsx"), data_only=True).active.iter_rows(values_only=True))
    # row 1 is a title, row 2 the headers: find columns by name, not by position
    headers = [str(h).strip() if h is not None else "" for h in rows[1]]
    try:
        idx = {key: headers.index(name) for key, name in COLUMNS.items()}
    except ValueError as e:
        sys.exit(f"[ERRORE] colonna mancante nel listone: {e}. Intestazioni: {headers}")

    players = []
    for row in rows[2:]:
        if not row[idx["name"]] or row[idx["role"]] not in ("P", "D", "C", "A"):
            continue
        cost = row[idx["cost"]]
        players.append({
            "id": str(row[idx["id"]]),
            "name": row[idx["name"]],
            "team": row[idx["team"]],
            "role": row[idx["role"]],
            "cost": int(cost) if cost is not None else 1,
        })

    roles = {r: sum(p["role"] == r for p in players) for r in "PDCA"}
    if len(players) < 300 or min(roles.values()) < 20:
        sys.exit(f"[ERRORE] listone sospetto: {len(players)} giocatori {roles}, players.js non toccato")

    season_file = os.path.join(HERE, "season.txt")
    season = int(open(season_file).read()) if os.path.exists(season_file) else None
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(f'export const playersLastUpdated = "{now}";\n\n')
        if season:
            f.write(f"export const playersSeason = {season};\n\n")
        f.write(f"export const playersDB = {json.dumps(players, indent=4, ensure_ascii=False)};\n")
    print(f"[OK] {len(players)} giocatori {roles} -> js/data/players.js")


if __name__ == "__main__":
    convert()
