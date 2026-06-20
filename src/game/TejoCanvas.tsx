import { useRef, useEffect, useCallback } from 'react';
import { GameState, FIELD_WIDTH, FIELD_HEIGHT } from './types';

interface Props {
  gameState: GameState;
  onMouseDown: (x: number, y: number) => void;
  onMouseMove: (x: number, y: number) => void;
  onMouseUp: () => void;
  scale: number;
}

export default function TejoCanvas({ gameState, onMouseDown, onMouseMove, onMouseUp, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = FIELD_WIDTH;
    const h = FIELD_HEIGHT;
    const shakeX = (Math.random() - 0.5) * gameState.cameraShake;
    const shakeY = (Math.random() - 0.5) * gameState.cameraShake;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Background - clay field
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 0, w, h);

    // Clay texture
    ctx.fillStyle = '#7a3c10';
    for (let i = 0; i < 40; i++) {
      const rx = ((i * 137.5) % w);
      const ry = ((i * 89.7) % h);
      ctx.beginPath();
      ctx.arc(rx, ry, 2 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = '#5c2e0b';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = '#a0522d';
    ctx.lineWidth = 3;
    ctx.setLineDash([15, 10]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center circle
    ctx.strokeStyle = '#a0522d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#a0522d';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Goals
    for (const goal of gameState.goals) {
      ctx.fillStyle = goal.team === 'home' ? 'rgba(30, 64, 175, 0.3)' : 'rgba(185, 28, 28, 0.3)';
      ctx.fillRect(goal.x, goal.y, goal.width, goal.height);
      ctx.strokeStyle = goal.team === 'home' ? '#1e40af' : '#b91c1c';
      ctx.lineWidth = 3;
      ctx.strokeRect(goal.x, goal.y, goal.width, goal.height);

      // Net pattern
      ctx.strokeStyle = goal.team === 'home' ? 'rgba(96, 165, 250, 0.4)' : 'rgba(248, 113, 113, 0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < goal.height; i += 12) {
        ctx.beginPath();
        ctx.moveTo(goal.x, goal.y + i);
        ctx.lineTo(goal.x + goal.width, goal.y + i);
        ctx.stroke();
      }
      for (let i = 0; i < goal.width; i += 12) {
        ctx.beginPath();
        ctx.moveTo(goal.x + i, goal.y);
        ctx.lineTo(goal.x + i, goal.y + goal.height);
        ctx.stroke();
      }
    }

    // Mecheros
    for (const m of gameState.mecheros) {
      if (m.exploded) {
        const alpha = m.explodeTimer / 60;
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.beginPath();
        ctx.arc(m.pos.x, m.pos.y, m.radius + (60 - m.explodeTimer) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Triangle shape for mechero
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(m.pos.x, m.pos.y - m.radius);
        ctx.lineTo(m.pos.x - m.radius, m.pos.y + m.radius);
        ctx.lineTo(m.pos.x + m.radius, m.pos.y + m.radius);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Sparkle
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(m.pos.x, m.pos.y + 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ball trail
    if (gameState.ball.trail.length > 1) {
      for (let i = 0; i < gameState.ball.trail.length - 1; i++) {
        const t = i / gameState.ball.trail.length;
        ctx.strokeStyle = `rgba(251, 191, 36, ${t * 0.5})`;
        ctx.lineWidth = 2 + t * 4;
        ctx.beginPath();
        ctx.moveTo(gameState.ball.trail[i].x, gameState.ball.trail[i].y);
        ctx.lineTo(gameState.ball.trail[i + 1].x, gameState.ball.trail[i + 1].y);
        ctx.stroke();
      }
    }

    // Ball
    const ball = gameState.ball;
    ctx.fillStyle = ball.color;
    ctx.beginPath();
    ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ball.strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ball shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(ball.pos.x - 3, ball.pos.y - 3, ball.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Players
    for (const p of gameState.players) {
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.ellipse(p.pos.x + 3, p.pos.y + p.radius - 2, p.radius * 0.8, p.radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Stroke
      ctx.strokeStyle = p.isSelected ? '#ffffff' : p.strokeColor;
      ctx.lineWidth = p.isSelected ? 4 : 2;
      ctx.stroke();

      // Number
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${p.radius}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.number), p.pos.x, p.pos.y + 1);

      // Selection glow
      if (p.isSelected) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Cooldown indicator
      if (p.cooldown > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Drag line
    if (gameState.dragStart && gameState.dragCurrent && gameState.selectedPlayer !== null) {
      const player = gameState.players[gameState.selectedPlayer];
      const dx = gameState.dragStart.x - gameState.dragCurrent.x;
      const dy = gameState.dragStart.y - gameState.dragCurrent.y;
      const power = Math.sqrt(dx * dx + dy * dy) * 0.15;
      const maxPower = 18;
      const ratio = Math.min(power / maxPower, 1);

      // Power indicator color
      const r = Math.floor(255 * ratio);
      const g = Math.floor(255 * (1 - ratio));
      const color = `rgb(${r}, ${g}, 100)`;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3 + ratio * 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(player.pos.x, player.pos.y);
      ctx.lineTo(gameState.dragCurrent.x, gameState.dragCurrent.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow head
      const angle = Math.atan2(dy, dx);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(player.pos.x, player.pos.y);
      ctx.lineTo(
        player.pos.x - Math.cos(angle - 0.3) * 15,
        player.pos.y - Math.sin(angle - 0.3) * 15
      );
      ctx.lineTo(
        player.pos.x - Math.cos(angle + 0.3) * 15,
        player.pos.y - Math.sin(angle + 0.3) * 15
      );
      ctx.closePath();
      ctx.fill();
    }

    // Particles
    for (const p of gameState.particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Message overlay
    if (gameState.message && gameState.messageTimer > 0) {
      const alpha = Math.min(1, gameState.messageTimer / 20);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, h / 2 - 50, w, 100);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gameState.message, w / 2, h / 2);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [gameState]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    onMouseDown(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    onMouseMove(x, y);
  };

  const handlePointerUp = () => {
    onMouseUp();
  };

  return (
    <canvas
      ref={canvasRef}
      width={FIELD_WIDTH}
      height={FIELD_HEIGHT}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        width: FIELD_WIDTH * scale,
        height: FIELD_HEIGHT * scale,
        touchAction: 'none',
        cursor: gameState.phase === 'aiming' ? 'crosshair' : 'default',
      }}
      className="rounded-lg shadow-2xl border-4 border-amber-900"
    />
  );
}
