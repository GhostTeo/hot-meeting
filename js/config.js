// Modalità locale esplicita per la demo statica inclusa nel repository.
// In deploy, impostare globalThis.HOT_MEETING_CONFIG prima di caricare app.js.
export const appConfig = globalThis.HOT_MEETING_CONFIG ?? { mode: 'local' };
