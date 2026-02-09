import openpyxl
import sys

try:
    wb = openpyxl.load_workbook('Quotazioni_Fantacalcio_Stagione_2025_26.xlsx', data_only=True)
    sheet = wb.active
    print(f"Sheet Name: {sheet.title}")
    
    for i, row in enumerate(sheet.iter_rows(values_only=True)):
        print(row)
        if i >= 5: break
except Exception as e:
    print(f"Error: {e}")
