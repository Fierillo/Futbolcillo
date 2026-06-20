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

    // Background - grass field
    ctx.fillStyle = '#2d8f4e';
    ctx.fillRect(0, 0, w, h);

    // Grass texture
    ctx.fillStyle = 'rgba(23, 111, 54, 0.35)';
    for (let i = 0; i < 70; i++) {
      const rx = ((i * 137.5) % w);
      const ry = ((i * 89.7) % h);
      ctx.beginPath();
      ctx.arc(rx, ry, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    // Border
    ctx.strokeStyle = '#1a5e30';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Center circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Penalty areas
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;

    const penaltyAreaWidth = 180;
    const penaltyAreaHeight = 280;
    const penaltyAreaY = (h - penaltyAreaHeight) / 2;

    ctx.strokeRect(0, penaltyAreaY, penaltyAreaWidth, penaltyAreaHeight);
    ctx.strokeRect(w - penaltyAreaWidth, penaltyAreaY, penaltyAreaWidth, penaltyAreaHeight);

    // Penalty arcs
    const penaltyMarkOffset = 120;
    const penaltyArcRadius = 55;
    const penaltyArcAngle = Math.acos((penaltyAreaWidth - penaltyMarkOffset) / penaltyArcRadius);

    ctx.beginPath();
    ctx.arc(penaltyMarkOffset, h / 2, penaltyArcRadius, -penaltyArcAngle, penaltyArcAngle);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w - penaltyMarkOffset, h / 2, penaltyArcRadius, Math.PI - penaltyArcAngle, Math.PI + penaltyArcAngle);
    ctx.stroke();

    // Goal areas
    const goalAreaWidth = 80;
    const goalAreaHeight = 160;
    const goalAreaY = (h - goalAreaHeight) / 2;

    ctx.strokeRect(0, goalAreaY, goalAreaWidth, goalAreaHeight);
    ctx.strokeRect(w - goalAreaWidth, goalAreaY, goalAreaWidth, goalAreaHeight);

    // Penalty marks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(penaltyMarkOffset, h / 2, 4, 0, Math.PI * 2);
    ctx.arc(w - penaltyMarkOffset, h / 2, 4, 0, Math.PI * 2);
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

    // Shot guide
    if (gameState.dragStart && gameState.dragCurrent && gameState.selectedPlayer !== null) {
      const player = gameState.players[gameState.selectedPlayer];
      const dx = gameState.dragStart.x - gameState.dragCurrent.x;
      const dy = gameState.dragStart.y - gameState.dragCurrent.y;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);
      const power = dragDistance * 0.15;
      const maxPower = 18;
      const ratio = Math.min(power / maxPower, 1);
      const guideLength = 40 + ratio * 80;
      const directionLength = dragDistance || 1;
      const guideEndX = player.pos.x + (dx / directionLength) * guideLength;
      const guideEndY = player.pos.y + (dy / directionLength) * guideLength;

      // Power indicator color
      const r = Math.floor(255 * ratio);
      const g = Math.floor(255 * (1 - ratio));
      const color = `rgb(${r}, ${g}, 100)`;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3 + ratio * 3;
      ctx.beginPath();
      ctx.moveTo(player.pos.x, player.pos.y);
      ctx.lineTo(guideEndX, guideEndY);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(dy, dx);
      const arrowSize = 12 + ratio * 6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(guideEndX, guideEndY);
      ctx.lineTo(
        guideEndX - Math.cos(angle - 0.45) * arrowSize,
        guideEndY - Math.sin(angle - 0.45) * arrowSize
      );
      ctx.lineTo(
        guideEndX - Math.cos(angle + 0.45) * arrowSize,
        guideEndY - Math.sin(angle + 0.45) * arrowSize
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
    canvasRef.current?.setPointerCapture(e.pointerId);
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

  const handlePointerUp = (e: React.PointerEvent) => {
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    onMouseUp();
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={FIELD_WIDTH}
      height={FIELD_HEIGHT}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        width: FIELD_WIDTH * scale,
        height: FIELD_HEIGHT * scale,
        touchAction: 'none',
        cursor: gameState.phase === 'aiming' ? 'crosshair' : 'default',
      }}
      className="rounded-lg shadow-2xl border-4 border-green-950"
    />
  );
}
