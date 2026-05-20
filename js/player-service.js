import { playersDB as defaultPlayers, playersLastUpdated as defaultLastUpdated } from './data/players.js';

export class PlayerService {
    constructor() {
        this.players = [...defaultPlayers];
        this.lastUpdated = defaultLastUpdated || null;
    }

    async loadFromUrl(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const data = await response.json();

            if (!this.validateData(data)) {
                throw new Error("Formato JSON non valido. Richiesto array di oggetti {id, name, team, role, cost}");
            }

            this.players = data;
            return this.players;
        } catch (error) {
            console.error("Failed to load players:", error);
            throw error;
        }
    }

    validateData(data) {
        if (!Array.isArray(data)) return false;
        if (data.length === 0) return true; // Empty is valid but useless

        // Check first item as sample
        const item = data[0];
        return item.hasOwnProperty('id') &&
            item.hasOwnProperty('name') &&
            item.hasOwnProperty('role') &&
            item.hasOwnProperty('cost');
    }

    getPlayers() {
        return this.players;
    }

    getLastUpdated() {
        return this.lastUpdated;
    }

    getLastUpdatedLabel() {
        if (!this.lastUpdated) return 'Data non disponibile';
        try {
            const date = new Date(this.lastUpdated);
            return date.toLocaleString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/Rome'
            });
        } catch {
            return this.lastUpdated;
        }
    }
}

export const playerService = new PlayerService();
