import './style.css';
import { SnapshotBuffer } from '@tag-game/shared';
import { Hud } from './hud';
import { createInputController } from './input';
import { NetClient } from './net';
import { LocalPredictor } from './prediction';
import { Renderer } from './renderer';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

const menu = element<HTMLDivElement>('menu');
const menuError = element<HTMLParagraphElement>('menu-error');
const nicknameInput = element<HTMLInputElement>('nickname');
const codeInput = element<HTMLInputElement>('code');
const createButton = element<HTMLButtonElement>('btn-create');
const joinButton = element<HTMLButtonElement>('btn-join');

// A shared link like https://…/#ABCD prefills the room code.
const hashCode = location.hash.replace('#', '').trim().toUpperCase();
if (/^[A-Z0-9]{4}$/.test(hashCode)) codeInput.value = hashCode;
nicknameInput.focus();

function showMenuError(message: string): void {
  menuError.textContent = message;
  menuError.classList.remove('hidden');
}

function setBusy(busy: boolean): void {
  createButton.disabled = busy;
  joinButton.disabled = busy;
}

async function start(roomCode?: string): Promise<void> {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    showMenuError('Pick a nickname first.');
    nicknameInput.focus();
    return;
  }
  setBusy(true);
  menuError.classList.add('hidden');

  const net = new NetClient();
  try {
    await net.connect();
  } catch (error) {
    showMenuError(error instanceof Error ? error.message : 'Could not connect.');
    setBusy(false);
    return;
  }

  const result = await net.join(nickname, roomCode);
  if (!result.ok) {
    showMenuError(result.error);
    setBusy(false);
    return;
  }

  location.hash = result.roomCode;
  menu.classList.add('hidden');
  runGame(net, result.selfId, result.roomCode);
}

createButton.addEventListener('click', () => {
  void start();
});
joinButton.addEventListener('click', () => {
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    showMenuError('Room codes are 4 letters/digits.');
    codeInput.focus();
    return;
  }
  void start(code);
});
for (const input of [nicknameInput, codeInput]) {
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const code = codeInput.value.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(code)) void start(code);
    else void start();
  });
}

function runGame(net: NetClient, selfId: string, roomCode: string): void {
  const canvas = element<HTMLCanvasElement>('game');
  const renderer = new Renderer(canvas);
  const hud = new Hud(selfId, roomCode);
  const buffer = new SnapshotBuffer();
  const predictor = new LocalPredictor(selfId, (input) => {
    net.sendInput(input);
  });
  const input = createInputController({
    joyBase: element<HTMLDivElement>('joy-base'),
    joyThumb: element<HTMLDivElement>('joy-thumb'),
    sprintButton: element<HTMLButtonElement>('btn-sprint'),
  });

  let running = true;

  net.onSnapshot((snapshot) => {
    const now = performance.now();
    buffer.push(snapshot, now);
    predictor.onSnapshot(snapshot);
    hud.update(snapshot, predictor.state()?.stamina ?? null, now);
  });

  net.onTag((event) => {
    renderer.addFlash(event.x, event.y);
    const involved = event.newItId === selfId || event.oldItId === selfId;
    renderer.addShake(involved ? 14 : 7);
  });

  net.onDisconnect(() => {
    running = false;
    menu.classList.remove('hidden');
    setBusy(false);
    showMenuError('Connection lost — join again.');
  });

  const frame = (now: number): void => {
    if (!running) return;
    predictor.frame(now, input.current());
    const predicted = predictor.state();
    renderer.draw(
      {
        snapshot: buffer.latest(),
        positions: buffer.sample(now),
        selfId,
        self: predicted
          ? {
              displayX: predicted.displayX,
              displayY: predicted.displayY,
              sprinting: predicted.sprinting,
            }
          : null,
      },
      now,
    );
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
