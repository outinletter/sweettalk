import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// 로컬 번들 폰트 — 오프라인에서도 깨지지 않음 (기존 Google Fonts 네트워크 로딩 대체)
// 필요한 서브셋(한글+라틴)만 로드해 번들 크기를 최소화
import '@fontsource/jua/korean-400.css'
import '@fontsource/jua/latin-400.css'
import '@fontsource/gamja-flower/korean-400.css'
import '@fontsource/gamja-flower/latin-400.css'
import '@fontsource/nanum-gothic/korean-400.css'
import '@fontsource/nanum-gothic/korean-700.css'
import '@fontsource/nanum-gothic/latin-400.css'
import '@fontsource/nanum-gothic/latin-700.css'
import '@fontsource/noto-sans-kr/korean-400.css'
import '@fontsource/noto-sans-kr/korean-600.css'
import '@fontsource/noto-sans-kr/korean-700.css'
import '@fontsource/noto-sans-kr/latin-400.css'
import '@fontsource/noto-sans-kr/latin-600.css'
import '@fontsource/noto-sans-kr/latin-700.css'

// API 버전: 서버 키를 주입하지 않음 — 사용자가 앱 안에서 자신의 Gemini API 키를 직접 입력/저장합니다.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
