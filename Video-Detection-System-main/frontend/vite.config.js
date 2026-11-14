import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: false,
    proxy: {
      '/api/auth': {
        target: 'http://localhost:9001',
        changeOrigin: true,
        secure: false,
        timeout: 30000,
      },
      '/api/videos': {
        target: 'http://localhost:9002',
        changeOrigin: true,
        secure: false,
        timeout: 600000,  // 10分钟超时，支持大文件上传
      },
      '/api/detections': {
        target: 'http://localhost:9004',
        changeOrigin: true,
        secure: false,
      },
      '/api/tasks': {
        target: 'http://localhost:9004',
        changeOrigin: true,
        secure: false,
      },
      '/api/audit': {
        target: 'http://localhost:9006',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:9002',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket 代理 — 实时检测进度推送
      '/ws': {
        target: 'http://localhost:9005',
        changeOrigin: true,
        ws: true,
      },
    }
  }
})

