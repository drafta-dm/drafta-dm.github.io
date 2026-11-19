// End of the draft: every roster full, so a summary for everyone with a text report to share.

import { state } from './state.js';
import { getTeamColor, esc, icon, openModal, copyText } from './utils.js';
import { ROLES, ROSTER_SIZE } from './draft-rules.js';

export function checkAndShowDraftSummary(data) {
    const done = data.status === 'started' && data.teams?.length && data.teams.every((t) => (t.roster?.length || 0) >= ROSTER_SIZE);
    if (!done) return void (state.summaryShown = false);
    if (state.summaryShown) return;
    state.summaryShown = true;
    showDraftSummary(data);
}

function showDraftSummary(data) {
    const picks = data.teams.flatMap((t) => (t.roster || []).map((r) => {
        const p = state.byId.get(String(r.playerId));
        return { name: r.name || p?.name || `#${r.playerId}`, role: r.role || p?.role, cost: r.cost || 0, team: t.name };
    }));
    const total = picks.reduce((s, p) => s + p.cost, 0);
    const top = [...picks].sort((a, b) => b.cost - a.cost)[0];
    const cheap = [...picks].sort((a, b) => a.cost - b.cost)[0];

    const stats = data.teams.map((t) => {
        const mine = picks.filter((p) => p.team === t.name);
        const spent = mine.reduce((s, p) => s + p.cost, 0);
        const best = (role) => mine.filter((p) => p.role === role).sort((a, b) => b.cost - a.cost).slice(0, 2);
        const byRole = Object.fromEntries(ROLES.map((r) => [r, mine.filter((p) => p.role === r).reduce((s, p) => s + p.cost, 0)]));
        return { id: t.id, name: t.name, value: t.totalValue || spent, avg: mine.length ? (spent / mine.length).toFixed(1) : 0, byRole, D: best('D'), C: best('C'), A: best('A') };
    }).sort((a, b) => b.value - a.value);

    const list = (arr) => arr.map((p) => `${p.name} (${p.cost})`).join(', ') || '–';
    const report = [
        'RIEPILOGO ASTA DRAFTA', '',
        `Chiamata più cara: ${top ? `${top.name} (${top.cost}), ${top.team}` : '–'}`,
        `Affare: ${cheap ? `${cheap.name} (${cheap.cost}), ${cheap.team}` : '–'}`,
        `Valore totale: ${total} crediti, media ${(total / (picks.length || 1)).toFixed(1)}`, '',
        ...stats.flatMap((s, i) => [
            `#${i + 1} ${s.name}: ${s.value}`,
            `   P ${s.byRole.P} · D ${s.byRole.D} · C ${s.byRole.C} · A ${s.byRole.A}`,
            `   Top D: ${list(s.D)}`, `   Top C: ${list(s.C)}`, `   Top A: ${list(s.A)}`, '',
        ]),
    ].join('\n');

    const box = document.getElementById('draft-summary-panel');
    box.innerHTML = `
        <div class="summary-head">
            <span class="icon-tile">${icon('trophy')}</span>
            <p class="kicker">Asta finita</p>
            <h2 id="summary-title" class="h-section">Rose <span class="serif grad">complete.</span></h2>
        </div>
        <div class="summary-highlights">
            <div><span class="kicker">Chiamata più cara</span><strong>${top ? `${esc(top.name)} · ${top.cost}` : '–'}</strong><small>${esc(top?.team || '')}</small></div>
            <div><span class="kicker">L'affare</span><strong>${cheap ? `${esc(cheap.name)} · ${cheap.cost}` : '–'}</strong><small>${esc(cheap?.team || '')}</small></div>
            <div><span class="kicker">Valore totale</span><strong>${total} crediti</strong><small>media ${(total / (picks.length || 1)).toFixed(1)} a giocatore</small></div>
        </div>
        <div class="summary-grid">${stats.map((s, i) => `
            <article class="summary-team-card" style="--team:${esc(getTeamColor(s.id, data))}">
                <span class="summary-rank">#${i + 1}</span>
                <h3>${esc(s.name)}</h3>
                <div class="summary-stats"><div><span>Valore rosa</span><b>${s.value}</b></div><div><span>Media</span><b>${s.avg}</b></div></div>
                <div class="summary-roles">${ROLES.map((r) => `<span class="role-${r}">${r} <b>${s.byRole[r]}</b></span>`).join('')}</div>
                <div class="summary-best">${['D', 'C', 'A'].map((r) => `<div><b>Top ${r}:</b> ${esc(list(s[r]))}</div>`).join('')}</div>
            </article>`).join('')}
        </div>
        <div class="actions">
            <a class="btn btn-ghost" href="mailto:?subject=${encodeURIComponent('Riepilogo asta Drafta')}&body=${encodeURIComponent(report)}">${icon('mail')}Manda per email</a>
            <button class="btn btn-ghost" data-copy-report>${icon('copy')}Copia il riepilogo</button>
            ${state.isHost ? `<button class="btn btn-ghost" data-export>${icon('download')}Esporta CSV</button>` : ''}
            <button class="btn btn-primary" data-close>Chiudi</button>
        </div>`;
    box.querySelector('[data-copy-report]').addEventListener('click', () => copyText(report, 'Riepilogo copiato.'));
    box.querySelector('[data-export]')?.addEventListener('click', () => document.getElementById('btn-export-csv').click());
    openModal('draft-summary-panel');
    confetti();
}

// A short burst of paper in the team colours. Skipped with reduced motion (CSS).
function confetti() {
    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    const colors = ['#2fe37f', '#c6f36b', '#fbbf24', '#60a5fa', '#f87171', '#ecf3ee'];
    layer.innerHTML = Array.from({ length: 70 }, (_, i) =>
        `<i style="--x:${Math.random() * 100}%;--c:${colors[i % colors.length]};--d:${Math.random() * 0.6}s;--t:${2.2 + Math.random() * 1.6}s;--r:${Math.random() * 900 - 450}deg;--drift:${Math.random() * 160 - 80}px"></i>`).join('');
    document.getElementById('draft-summary-panel').appendChild(layer);
    setTimeout(() => layer.remove(), 4500);
}
