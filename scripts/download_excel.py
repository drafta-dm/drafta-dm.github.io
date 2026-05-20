import os
import sys
from playwright.sync_api import sync_playwright

def download():
    # Leggi le credenziali dalle variabili d'ambiente con fallback su quelle di test
    username = os.environ.get("FANTACALCIO_USERNAME", "laravalafava")
    password = os.environ.get("FANTACALCIO_PASSWORD", "laravalafava")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    target_excel = os.path.join(script_dir, "Quotazioni_Fantacalcio_Stagione_2025_26.xlsx")
    
    print("Avvio di Playwright...")
    with sync_playwright() as p:
        # Avvia chromium in modalità headless
        browser = p.chromium.launch(headless=True)
        # Usa un user agent reale per evitare blocchi di sicurezza standard
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )
        page = context.new_page()
        
        print("Apertura pagina di login...")
        page.goto("https://www.fantacalcio.it/login", wait_until="networkidle")
        
        # Accetta i cookie se compare il banner Iubenda/Quantcast/Consenso per non bloccare la pagina
        def dismiss_cookie_banner(stage_name):
            try:
                print(f"[{stage_name}] Controllo presenza banner cookie...")
                btn_selector = "#qc-cmp2-container button[mode='primary'], #qc-cmp2-container #agree-btn, #qc-cmp2-container button:has-text('Accetto'), #qc-cmp2-container button:has-text('Acconsento'), #qc-cmp2-container #disagree-btn, .iubenda-cs-accept-btn, #iubenda-cs-banner button"
                
                # Attendi che appaia il banner dei cookie (max 5 secondi)
                page.wait_for_selector(btn_selector, timeout=5000)
                # Clicca sul pulsante di consenso trovato
                page.click(btn_selector)
                print(f"[{stage_name}] Banner cookie chiuso.")
                page.wait_for_timeout(1000)
            except Exception as e:
                print(f"[{stage_name}] Nessun banner cookie chiuso o non rilevato entro il timeout: {e}")

        dismiss_cookie_banner("Login Page")
            
        print("Compilazione form di login...")
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        
        print("Invio form di login...")
        page.click("button[type='submit']")
        
        # Attendi il caricamento dopo il login
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000) # Attendi ulteriore caricamento dinamico
        
        print("Navigazione alla pagina delle quotazioni...")
        page.goto("https://www.fantacalcio.it/quotazioni-fantacalcio", wait_until="networkidle")
        
        # Gestisci il banner cookie anche qui, nel caso si ripresenti
        dismiss_cookie_banner("Quotazioni Page")
        
        print("Ricerca del pulsante di download...")
        download_btn_selector = "a.download-players-price-serie-a"
        
        # Attendi che il pulsante sia presente nella pagina
        page.wait_for_selector(download_btn_selector, timeout=20000)
        
        print("Inizio download del file...")
        with page.expect_download() as download_info:
            page.click(download_btn_selector)
            
        download = download_info.value
        # Salva il file nel percorso prestabilito
        download.save_as(target_excel)
        print(f"File scaricato con successo in: {target_excel}")
        
        browser.close()

if __name__ == "__main__":
    download()
