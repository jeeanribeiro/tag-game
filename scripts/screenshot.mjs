// Captures a real mid-chase gameplay screenshot for the README.
// Spawns the built server, connects three Chromium pages with distinct
// nicknames, lets them play for a bit and screenshots the first page.
//
// Prereq: pnpm build   (server dist + web dist must exist)
// Usage:  node scripts/screenshot.mjs

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 43155;
const BASE = `http://localhost:${PORT}`;
const OUT = resolve(root, 'docs/assets/gameplay.png');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error(`Server did not come up at ${url}`);
}

async function main() {
  mkdirSync(dirname(OUT), { recursive: true });

  const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });

  const browser = await chromium.launch();
  try {
    await waitForServer(`${BASE}/healthz`);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 810 },
      deviceScaleFactor: 2,
    });

    // Player 1 creates the room.
    const ada = await context.newPage();
    await ada.goto(BASE);
    await ada.fill('#nickname', 'Ada');
    await ada.click('#btn-create');
    await ada.waitForSelector('#menu.hidden', { state: 'attached' });
    const roomCode = (await ada.textContent('#room-code'))?.trim();
    if (!roomCode) throw new Error('No room code shown');
    console.log(`Room ${roomCode} created`);

    // Two more players join with the code.
    const others = [];
    for (const nickname of ['Bo', 'Chip']) {
      const page = await context.newPage();
      await page.goto(BASE);
      await page.fill('#nickname', nickname);
      await page.fill('#code', roomCode);
      await page.click('#btn-join');
      await page.waitForSelector('#menu.hidden', { state: 'attached' });
      others.push(page);
    }
    const [bo, chip] = others;

    // Countdown (3 s) runs; wait for GO, then steer everyone (around the
    // obstacles) toward a meeting point at ~(860, 620) so the shot catches a
    // real chase right as the start immunity drains.
    // Spawns: Ada (200,200), Bo (1400,700), Chip (1400,200).
    await sleep(3400);
    await ada.bringToFront();

    // Ada sprints: straight down, then right across the lower corridor.
    await ada.keyboard.down('Shift');
    await ada.keyboard.down('s');
    // Bo dips under the right obstacle, crosses, then comes back up.
    await bo.keyboard.down('s');
    // Chip drops a touch, then runs the top corridor and descends.
    await chip.keyboard.down('a');
    await chip.keyboard.down('s');

    await sleep(150);
    await bo.keyboard.up('s');
    await bo.keyboard.down('a');
    await sleep(50);
    await chip.keyboard.up('s');
    await sleep(940); // t≈1.14 s: Ada reaches y≈620
    await ada.keyboard.up('s');
    await ada.keyboard.down('d');
    await sleep(840); // t≈1.98 s: Bo has cleared the bottom-right corridor
    await bo.keyboard.up('a');
    await bo.keyboard.down('w');
    await sleep(250); // t≈2.23 s: Chip turns down toward the pack
    await chip.keyboard.up('a');
    await chip.keyboard.down('s');
    await sleep(250); // t≈2.48 s: Bo is back up at y≈620, cuts left
    await bo.keyboard.up('w');
    await bo.keyboard.down('a');

    for (const [index, delay] of [
      [1, 250],
      [2, 300],
      [3, 300],
    ]) {
      await sleep(delay);
      const file = OUT.replace(/\.png$/, `-${index}.png`);
      await ada.screenshot({ path: file });
      console.log(`Captured ${file}`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

await main();
