export const isTauriApp = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
