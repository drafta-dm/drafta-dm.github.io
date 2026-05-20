"""
Script combinato: scarica le Quotazioni Fantacalcio da fantacalcio.it
e le converte automaticamente in js/data/players.js.

Utilizzo:
  python scripts/update_players.py

Variabili d'ambiente opzionali (fallback sulle credenziali di test):
  FANTACALCIO_USERNAME
  FANTACALCIO_PASSWORD
"""

import os
import sys

def main():
    # 1. Download del file Excel
    print("=== STEP 1: Download Excel da Fantacalcio.it ===")
    try:
        from scripts.download_excel import download as do_download
    except ImportError:
        # Se eseguito dalla root del progetto il path relativo funziona così
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from download_excel import download as do_download

    do_download()

    # 2. Conversione Excel -> JS
    print("\n=== STEP 2: Conversione Excel -> JS ===")
    try:
        from scripts.convert_excel_to_js import convert as do_convert
    except ImportError:
        from convert_excel_to_js import convert as do_convert

    do_convert()

    print("\n✅ Aggiornamento completato con successo!")

if __name__ == "__main__":
    main()
