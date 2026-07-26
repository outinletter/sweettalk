// Claude 아티팩트 환경의 window.storage를 localStorage로 대체합니다.

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
    // localStorage 용량 초과 시 오래된 번역 캐시 일부 삭제
    clearOldCache()
    try { localStorage.setItem(PREFIX + key, value) } catch {}
  }
}

function clearOldCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX + 'tr:'))
  // 번역 캐시 절반 삭제
  keys.slice(0, Math.floor(keys.length / 2)).forEach(k => localStorage.removeItem(k))
}
