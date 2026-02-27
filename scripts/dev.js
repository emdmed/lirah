#!/usr/bin/env node

/**
 * Lirah Multi-Instance Dev Launcher
 * 
 * Usage: node scripts/dev.js [instance-number]
 * Example:
 *   Terminal 1: node scripts/dev.js 1
 *   Terminal 2: node scripts/dev.js 2
 *   Terminal 3: node scripts/dev.js 3
 * 
 * Each instance gets its own port range:
 *   Instance 1: port 1420
 *   Instance 2: port 1430
 *   Instance 3: port 1440
 *   etc.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import net from 'net';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_PORT = 1420;
const PORT_INCREMENT = 10;
const TAURI_CONFIG_PATH = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');

async function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try next one
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

function updateTauriConfig(port) {
  try {
    const configContent = readFileSync(TAURI_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configContent);
    
    // Update the devUrl with the actual port
    config.build = config.build || {};
    config.build.devUrl = `http://localhost:${port}`;
    
    writeFileSync(TAURI_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`📝 Updated tauri.conf.json with port ${port}`);
    return true;
  } catch (err) {
    console.error('❌ Failed to update tauri.conf.json:', err.message);
    return false;
  }
}

function restoreTauriConfig() {
  try {
    const configContent = readFileSync(TAURI_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configContent);
    
    // Restore default port
    config.build = config.build || {};
    config.build.devUrl = `http://localhost:1420`;
    
    writeFileSync(TAURI_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('📝 Restored tauri.conf.json to default port');
  } catch (err) {
    console.error('❌ Failed to restore tauri.conf.json:', err.message);
  }
}

async function main() {
  const instanceNum = parseInt(process.argv[2], 10) || 1;
  const preferredPort = BASE_PORT + (instanceNum - 1) * PORT_INCREMENT;
  
  console.log(`🚀 Starting Lirah instance ${instanceNum}...`);
  console.log(`   Preferred port: ${preferredPort}`);
  
  // Find an available port
  const port = await findAvailablePort(preferredPort);
  
  if (port !== preferredPort) {
    console.log(`⚠️  Port ${preferredPort} is in use.`);
    console.log(`✓ Using available port: ${port}`);
  } else {
    console.log(`✓ Port ${port} is available.`);
  }
  
  // Update tauri.conf.json with the actual port
  if (!updateTauriConfig(port)) {
    console.error('Failed to configure Tauri. Exiting.');
    process.exit(1);
  }
  
  console.log('');
  console.log(`🌐 Dev server will run on: http://localhost:${port}`);
  console.log('🔧 Starting Tauri development server...');
  console.log('');
  
  // Set environment variable for vite.config.js
  process.env.LIRAH_DEV_PORT = port.toString();
  
  // Run tauri dev
  const tauri = spawn('npm', ['run', 'tauri', 'dev'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      LIRAH_DEV_PORT: port.toString(),
      FORCE_COLOR: '1',
    }
  });
  
  tauri.on('close', (code) => {
    // Restore config on exit
    restoreTauriConfig();
    process.exit(code);
  });
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Lirah instance...');
    tauri.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    tauri.kill('SIGTERM');
  });
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  restoreTauriConfig();
  process.exit(1);
});
