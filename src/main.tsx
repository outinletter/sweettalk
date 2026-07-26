import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Gemini API 키를 window 전역에 주입 (App.tsx에서 참조)
;(window as unknown as Record<string,string>).__GEMINI_KEY__ =
  import.meta.env.VITE_GEMINI_KEY ?? ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
