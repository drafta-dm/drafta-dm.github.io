import os
import sys
from playwright.sync_api import sync_playwright

def download():
    # Leggi le credenziali dalle variabili d'ambiente con fallback su quelle di test
    username = os.environ.get("FANTACALCIO_USERNAME", "laravalafava")
    password = os.environ.get("FANTACALCIO_PASSWORD", "laravalafava")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    target_excel = os.path.join(script_dir, "Quotazioni_Fantacalcio_Stagione_2025_26.xlsx")

    print("Avvio di Playwright...", flush=True)
    with sync_playwright() as p:
        # Usa chromium headless con argomenti anti-bot (utile su server cloud)
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ]
        )

        # Context con user agent e header realistici per evitare blocchi Cloudflare
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
            extra_http_headers={
                "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
            }
        )

        # Nasconde webdriver per eludere i controlli anti-bot basilari
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)

        page = context.new_page()

        print("Apertura pagina di login...", flush=True)
        page.goto("https://www.fantacalcio.it/login", wait_until="networkidle", timeout=30000)

        # Stampa URL attuale per debug
        print(f"URL dopo navigazione login: {page.url}", flush=True)
        print(f"Titolo pagina: {page.title()}", flush=True)

        # Verifica che la pagina di login sia accessibile (non bloccata da Cloudflare)
        page_content = page.content()
        if "challenge" in page_content.lower() or "cf-browser-verification" in page_content.lower():
            print("⚠️ Cloudflare challenge rilevata - possibile blocco IP cloud", flush=True)

        # Accetta i cookie se compare il banner Iubenda/Quantcast/Consenso
        def dismiss_cookie_banner(stage_name):
            try:
                print(f"[{stage_name}] Controllo presenza banner cookie...", flush=True)
                btn_selector = (
                    "#qc-cmp2-container button[mode='primary'], "
                    "#qc-cmp2-container #agree-btn, "
                    "#qc-cmp2-container button:has-text('Accetto'), "
                    "#qc-cmp2-container button:has-text('Acconsento'), "
                    "#qc-cmp2-container #disagree-btn, "
                    ".iubenda-cs-accept-btn, "
                    "#iubenda-cs-banner button"
                )
                page.wait_for_selector(btn_selector, timeout=5000)
                page.click(btn_selector)
                print(f"[{stage_name}] Banner cookie chiuso.", flush=True)
                page.wait_for_timeout(1000)
            except Exception as e:
                print(f"[{stage_name}] Nessun banner cookie (timeout): {type(e).__name__}", flush=True)

        dismiss_cookie_banner("Login Page")

        # Verifica che il form di login esista
        login_form = page.locator("#loginForm")
        if not login_form.is_visible():
            print("❌ Form di login non trovato! Contenuto pagina:", flush=True)
            print(page.content()[:2000], flush=True)
            sys.exit(1)

        print("Compilazione form di login...", flush=True)
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)

        print("Invio form di login...", flush=True)
        page.click("button[type='submit']")

        # Attendi il caricamento dopo il login
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        print(f"URL dopo login: {page.url}", flush=True)
        print(f"Titolo dopo login: {page.title()}", flush=True)

        print("Navigazione alla pagina delle quotazioni...", flush=True)
        page.goto("https://www.fantacalcio.it/quotazioni-fantacalcio", wait_until="networkidle")

        print(f"URL quotazioni: {page.url}", flush=True)

        # Gestisci il banner cookie anche qui
        dismiss_cookie_banner("Quotazioni Page")

        print("Ricerca del pulsante di download...", flush=True)
        download_btn_selector = "a.download-players-price-serie-a"

        # Attendi che il pulsante sia presente (indica che l'utente è autenticato)
        try:
            page.wait_for_selector(download_btn_selector, timeout=20000)
        except Exception:
            print("❌ Pulsante di download non trovato - probabilmente non autenticato", flush=True)
            print(f"URL attuale: {page.url}", flush=True)
            # Stampa parte della pagina per debug
            print("Contenuto parziale della pagina:", flush=True)
            print(page.content()[:3000], flush=True)
            sys.exit(1)

        print("Inizio download del file...", flush=True)
        with page.expect_download() as download_info:
            page.click(download_btn_selector)

        download = download_info.value
        download.save_as(target_excel)
        size = os.path.getsize(target_excel)
        print(f"✅ File scaricato con successo in: {target_excel} ({size:,} bytes)", flush=True)

        browser.close()


if __name__ == "__main__":
    download()
