// Replace window.storage from the Claude artifact environment with localStorage.

const PREFIX = 'sweettalk:'

export async function storageGet(key: string): Promise<{ value: string } | null> {
  try {
    const val = localStorage.getItem(PREFIX + key)
    return val ? { value: val } : null
  } catch {
    return null
  }
}

export async function storageSet(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // Remove part of the oldest translation cache when localStorage is full.
    clearOldCache()
    try { localStorage.setItem(PREFIX + key, value) } catch {}
  }
}

function clearOldCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX + 'tr:'))
  // Remove half of the translation cache.
  keys.slice(0, Math.floor(keys.length / 2)).forEach(k => localStorage.removeItem(k))
}
