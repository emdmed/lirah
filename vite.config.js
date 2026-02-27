import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import os from "os";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => {
  // Support dynamic port allocation via environment variable
  // If LIRAH_DEV_PORT is set, use it; otherwise try 1420 first, then fallback
  const preferredPort = parseInt(process.env.LIRAH_DEV_PORT, 10) || 1420;
  
  return {
    plugins: [
      react(),
      {
        name: 'save-port',
        configureServer(server) {
          server.httpServer?.on('listening', () => {
            const address = server.httpServer?.address();
            if (address && typeof address === 'object') {
              const port = address.port;
              // Save port to a file in tmp directory for potential use by other tools
              const portFile = path.join(os.tmpdir(), `lirah-dev-port-${process.pid}.txt`);
              fs.writeFileSync(portFile, port.toString());
              console.log(`[Lirah] Dev server running on port ${port}`);
              
              // Also save to a general file for the most recent instance
              const latestPortFile = path.join(os.tmpdir(), 'lirah-dev-port-latest.txt');
              fs.writeFileSync(latestPortFile, port.toString());
              
              // Clean up on exit
              process.on('exit', () => {
                try {
                  fs.unlinkSync(portFile);
                } catch (e) {
                  // Ignore cleanup errors
                }
              });
            }
          });
        }
      }
    ],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    // Define global variables for browser compatibility
    define: {
      'process.env': {}
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. Use dynamic port allocation
    // - If LIRAH_DEV_PORT is set, try to use that port
    // - Otherwise try 1420 first
    // - If port is taken, Vite will automatically find next available port
    server: {
      port: preferredPort,
      strictPort: false, // Allow fallback to any available port if preferred is taken
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: preferredPort + 1,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
