import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 환경에 따른 백엔드 주소 설정
  const isDev = mode === 'development';
  const isTest = env.NODE_ENV === 'test';
  // 로컬 개발 시 localhost, Docker 환경에서는 backend 컨테이너명 사용
  const backendTarget = isDev ? 'http://localhost:3001' : (isTest ? 'http://backend-test:3001' : 'http://backend:3001');
  console.log(`Using backend target: ${backendTarget} for environment: ${env.NODE_ENV}`);

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
          globIgnores: ['**/bible*.json'] // Exclude large bible JSON files from precaching
        },
        includeAssets: ['images/favicon.svg', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: '바이블로그',
          short_name: '바이블로그',
          description: '음성 인식을 통한 성경 읽기 동행',
          theme_color: '#8856ec',
          background_color: '#e9d5ff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'images/favicon.svg',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: 'images/favicon.svg',
              sizes: '512x512',
              type: 'image/svg+xml'
            },
            {
              src: 'images/favicon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // HTTP 모드 - 로컬 개발용(PWA 테스트는 프로덕션 환경에서)
      // https: true, // 프로덕션에서는 HTTPS 필수
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: ['biblelog.kr', 'www.biblelog.kr'],
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});