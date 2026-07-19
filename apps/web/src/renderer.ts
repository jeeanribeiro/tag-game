import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  OBSTACLES,
  PLAYER_COLORS,
  PLAYER_RADIUS,
  TAG_COOLDOWN_MS,
} from '@tag-game/shared';
import type { Snapshot, Vec2 } from '@tag-game/shared';

export interface RenderView {
  snapshot: Snapshot | null;
  /** Interpolated remote positions (from the snapshot buffer). */
  positions: Map<string, Vec2>;
  selfId: string;
  /** Predicted local player, or null while spectating. */
  self: { displayX: number; displayY: number; sprinting: boolean } | null;
}

interface Flash {
  x: number;
  y: number;
  at: number;
}

const FLASH_MS = 450;
const SHAKE_MS = 280;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;
  private flashes: Flash[] = [];
  private shakeStart = -Infinity;
  private shakeMagnitude = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported.');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  addFlash(x: number, y: number): void {
    this.flashes.push({ x, y, at: performance.now() });
  }

  addShake(magnitude: number): void {
    this.shakeStart = performance.now();
    this.shakeMagnitude = magnitude;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = window.innerWidth;
    this.cssHeight = window.innerHeight;
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
  }

  draw(view: RenderView, now: number): void {
    const { ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const padding = 20;
    const scale = Math.min(
      (this.cssWidth - padding * 2) / ARENA_WIDTH,
      (this.cssHeight - padding * 2) / ARENA_HEIGHT,
    );
    let offsetX = (this.cssWidth - ARENA_WIDTH * scale) / 2;
    let offsetY = (this.cssHeight - ARENA_HEIGHT * scale) / 2;

    const shakeAge = now - this.shakeStart;
    if (shakeAge < SHAKE_MS) {
      const falloff = this.shakeMagnitude * (1 - shakeAge / SHAKE_MS);
      offsetX += (Math.random() * 2 - 1) * falloff;
      offsetY += (Math.random() * 2 - 1) * falloff;
    }

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    this.drawArena(ctx);

    const snapshot = view.snapshot;
    if (snapshot) {
      for (const player of snapshot.players) {
        if (player.spectator) continue;
        const isSelf = player.id === view.selfId;
        let x = player.x;
        let y = player.y;
        let sprinting = player.sprinting;
        if (isSelf && view.self) {
          x = view.self.displayX;
          y = view.self.displayY;
          sprinting = view.self.sprinting;
        } else {
          const interpolated = view.positions.get(player.id);
          if (interpolated) {
            x = interpolated.x;
            y = interpolated.y;
          }
        }
        const isIt = snapshot.itId === player.id;
        this.drawPlayer(ctx, {
          x,
          y,
          color: PLAYER_COLORS[player.colorIndex % PLAYER_COLORS.length] ?? '#38bdf8',
          nickname: player.nickname,
          isIt,
          isSelf,
          sprinting,
          immunityFraction: isIt ? snapshot.immunityMs / TAG_COOLDOWN_MS : 0,
          now,
        });
      }
    }

    this.drawFlashes(ctx, now);
  }

  private drawArena(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0e141f';
    ctx.beginPath();
    ctx.roundRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT, 18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 100; x < ARENA_WIDTH; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_HEIGHT);
      ctx.stroke();
    }
    for (let y = 100; y < ARENA_HEIGHT; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_WIDTH, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#24334d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT, 18);
    ctx.stroke();

    for (const rect of OBSTACLES) {
      ctx.fillStyle = '#1b2536';
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
      ctx.fill();
      ctx.strokeStyle = '#31415e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: {
      x: number;
      y: number;
      color: string;
      nickname: string;
      isIt: boolean;
      isSelf: boolean;
      sprinting: boolean;
      immunityFraction: number;
      now: number;
    },
  ): void {
    const { x, y } = player;

    if (player.isIt) {
      // Chaser: pulsing red glow ring.
      const pulse = 4 + Math.sin(player.now / 140) * 2;
      ctx.save();
      ctx.shadowColor = 'rgba(239, 68, 68, 0.9)';
      ctx.shadowBlur = 30;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_RADIUS + pulse + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (player.immunityFraction > 0) {
        // Cooldown arc: the chaser cannot tag until this drains.
        ctx.save();
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          PLAYER_RADIUS + 14,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.min(1, player.immunityFraction),
        );
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.shadowColor = player.color;
    ctx.shadowBlur = player.sprinting ? 26 : 14;
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (player.isSelf) {
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, PLAYER_RADIUS + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = player.isIt ? 'rgba(252, 165, 165, 0.95)' : 'rgba(226, 232, 240, 0.85)';
    ctx.fillText(player.nickname, x, y - PLAYER_RADIUS - 12);
    ctx.restore();
  }

  private drawFlashes(ctx: CanvasRenderingContext2D, now: number): void {
    this.flashes = this.flashes.filter((flash) => now - flash.at < FLASH_MS);
    for (const flash of this.flashes) {
      const t = (now - flash.at) / FLASH_MS;
      const radius = PLAYER_RADIUS * (1.2 + t * 5);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - t) * 0.25;
      ctx.fillStyle = '#fecaca';
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
