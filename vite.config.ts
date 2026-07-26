import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/sweettalk/',  // GitHub 저장소 이름과 일치해야 해요
})
