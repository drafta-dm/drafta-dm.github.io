import openpyxl
import json
import io
import os

def convert():
    try:
        # Calcolo dei percorsi in modo dinamico
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        target_path = os.path.join(project_root, 'js', 'data', 'players.js')

        excel_name = 'Quotazioni_Fantacalcio_Stagione_2025_26.xlsx'
        excel_path = os.path.join(project_root, excel_name)
        if not os.path.exists(excel_path):
            excel_path = os.path.join(script_dir, excel_name)

        wb = openpyxl.load_workbook(excel_path, data_only=True)
        sheet = wb.active
        
        players = []
        
        # We start from row 3 (index 2 in 0-based, or just skip 2 rows)
        # Row 1 is title, Row 2 is headers.
        
        # Headers are at row 2 (1-based in openpyxl)
        # Data starts row 3
        
        rows = list(sheet.iter_rows(values_only=True))
        
        # Verify headers at row index 1
        headers = rows[1]
        # Expected: Id, R, RM, Nome, Squadra, Qt.A
        
        # Indices
        idx_id = 0
        idx_role = 1
        idx_name = 3
        idx_team = 4
        idx_cost = 11 # FVM (was 5 for Qt.A)
        
        for row in rows[2:]:
            if not row[idx_name]: continue # Skip empty
            
            p_id = str(row[idx_id])
            role = row[idx_role] # P, D, C, A typically
            name = row[idx_name]
            team = row[idx_team]
            # Handle empty FVM if necessary
            raw_cost = row[idx_cost]
            cost = int(raw_cost) if raw_cost is not None else 1
            
            # Map roles if needed. Usually they are P, D, C, A in Classic.
            # R column seems to satisfy this.
            
            players.append({
                "id": p_id,
                "name": name,
                "team": team,
                "role": role,
                "cost": cost
            })
            
        # Output JS file content
        js_content = f"export const playersDB = {json.dumps(players, indent=4)};"
        
        # Assicura che la directory di destinazione esista
        os.makedirs(os.path.dirname(target_path), exist_ok=True)

        # Scrittura del file direttamente nel percorso di destinazione corretto
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
            
        print(f"Successfully converted and saved {len(players)} players to: {target_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    convert()
