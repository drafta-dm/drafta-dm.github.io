"""Download + convert in one go: python scripts/update_players.py (needs FANTACALCIO_USERNAME/PASSWORD)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from download_excel import download  # noqa: E402
from convert_excel_to_js import convert  # noqa: E402

if __name__ == "__main__":
    download()
    convert()
