import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Locally bundled fonts — work offline instead of loading Google Fonts over the network.
// Load only the required Korean and Latin subsets to minimize bundle size.
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

// API calls go through the Cloudflare Worker proxy.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
