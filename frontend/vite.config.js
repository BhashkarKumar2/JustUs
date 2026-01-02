import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import envCompatible from 'vite-plugin-env-compatible';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

export default defineConfig({
    plugins: [
        react(),
        envCompatible({ prefix: 'REACT_APP_' }), // Keep using REACT_APP_ variables
        nodePolyfills({
            // Polyfill all Node.js globals for libraries like tweetnacl-util
            protocolImports: true,
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        open: true,
        proxy: {
            // Proxy API requests to your backend (same as "proxy" in package.json)
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true,
                secure: false,
            },
            '/socket.io': {
                target: 'http://localhost:5000',
                changeOrigin: true,
                ws: true, // Enable WebSocket proxying
            },
        },
    },
    build: {
        outDir: 'build', // Output to 'build' to match CRA behavior
    },
});
