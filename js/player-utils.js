// ============================================================================
// MODULO: Player Utilities
// ============================================================================
// Funzioni di utilità per i giocatori, inclusa la generazione di URL 
// per la pagina fantacalcio.it di ogni giocatore.
// ============================================================================

/**
 * Genera l'URL della pagina fantacalcio.it per un giocatore
 * 
 * Pattern URL: https://www.fantacalcio.it/serie-a/squadre/{team}/{name}/{id}
 * 
 * @param {Object} player - Oggetto giocatore { id, name, team, role, cost }
 * @returns {string} URL completo della pagina fantacalcio.it
 * 
 * @example
 * getPlayerUrl({ id: "2764", name: "Martinez L.", team: "Inter" })
 * // => "https://www.fantacalcio.it/serie-a/squadre/inter/martinez-l/2764"
 */
export function getPlayerUrl(player) {
    if (!player || !player.id || !player.team || !player.name) return null;

    const teamSlug = slugify(player.team);
    const nameSlug = slugify(player.name);

    return `https://www.fantacalcio.it/serie-a/squadre/${teamSlug}/${nameSlug}/${player.id}`;
}

/**
 * Converte una stringa in un URL slug
 * 
 * Trasformazioni:
 * - Lowercase
 * - Rimuove accenti (normalizzazione Unicode NFD)
 * - Rimuove punti, virgole, apostrofi
 * - Spazi → trattini
 * - Rimuove trattini doppi
 * - Rimuove trattini finali
 * 
 * @param {string} str - Stringa da convertire
 * @returns {string} Slug URL-friendly
 * 
 * @example
 * slugify("Milinkovic-Savic V.") => "milinkovic-savic-v"
 * slugify("De Gea")              => "de-gea"
 * slugify("Montipò")             => "montipo"
 * slugify("Martinez Jo.")        => "martinez-jo"
 * slugify("Di Gregorio")         => "di-gregorio"
 */
function slugify(str) {
    return str
        .toLowerCase()
        .normalize('NFD')                    // Separa accenti dai caratteri base
        .replace(/[\u0300-\u036f]/g, '')     // Rimuove diacritici (accenti)
        .replace(/[.'',]/g, '')              // Rimuove punti, apostrofi, virgole
        .replace(/\s+/g, '-')               // Spazi → trattini
        .replace(/-+/g, '-')                // Rimuove trattini doppi
        .replace(/-$/g, '');                 // Rimuove trattino finale
}
