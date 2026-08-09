import { useRef, useEffect, useCallback } from 'react';
import { GameState, FIELD_WIDTH, FIELD_HEIGHT, GOAL_WIDTH } from './types';
import { MAX_SHOOT_POWER } from './physics';
import { getMinimumShotDragDistance, getShotPowerFromDragDistance } from './local-game';

interface Props {
  gameState: GameState;
  onMouseDown: (x: number, y: number) => void;
  onMouseMove: (x: number, y: number) => void;
  onMouseUp: () => void;
  scale: number;
  isRotated?: boolean;
  isInteractionBlocked?: boolean;
}

export const FIELD_VIEW_WIDTH = FIELD_WIDTH + GOAL_WIDTH * 2;

export default function TejoCanvas({ gameState, onMouseDown, onMouseMove, onMouseUp, scale, isRotated = false, isInteractionBlocked = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawUprightText = useCallback((ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
    if (!isRotated) {
      ctx.fillText(text, x, y);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }, [isRotated]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = FIELD_WIDTH;
    const h = FIELD_HEIGHT;
    const shakeX = (Math.random() - 0.5) * gameState.cameraShake;
    const shakeY = (Math.random() - 0.5) * gameState.cameraShake;

    ctx.fillStyle = '#142a1d';
    ctx.fillRect(0, 0, FIELD_VIEW_WIDTH, h);

    ctx.save();
    ctx.translate(GOAL_WIDTH + shakeX, shakeY);

    // Pitch and alternating mowing stripes.
    ctx.fillStyle = '#2d8f4e';
    ctx.fillRect(0, 0, w, h);
    const stripeWidth = w / 10;
    ctx.fillStyle = 'rgba(18, 105, 49, 0.16)';
    for (let i = 0; i < 10; i += 2) {
      ctx.fillRect(i * stripeWidth, 0, stripeWidth, h);
    }

    // Border with an open goal mouth on each side.
    const markingColor = 'rgba(255, 255, 255, 0.72)';
    ctx.strokeStyle = markingColor;
    ctx.lineWidth = 3;
    const goalTop = (h - gameState.goals[0].height) / 2;
    const goalBottom = goalTop + gameState.goals[0].height;
    ctx.beginPath();
    ctx.moveTo(0, goalTop);
    ctx.lineTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, goalTop);
    ctx.moveTo(0, goalBottom);
    ctx.lineTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(w, goalBottom);
    ctx.stroke();

    // Halfway line, center circle and kickoff mark.
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 78, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = markingColor;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Penalty areas. The goal-line side stays open to preserve the goal mouth.
    const penaltyAreaWidth = 165;
    const penaltyAreaHeight = 360;
    const penaltyAreaY = (h - penaltyAreaHeight) / 2;
    ctx.beginPath();
    ctx.moveTo(0, penaltyAreaY);
    ctx.lineTo(penaltyAreaWidth, penaltyAreaY);
    ctx.lineTo(penaltyAreaWidth, penaltyAreaY + penaltyAreaHeight);
    ctx.lineTo(0, penaltyAreaY + penaltyAreaHeight);
    ctx.moveTo(w, penaltyAreaY);
    ctx.lineTo(w - penaltyAreaWidth, penaltyAreaY);
    ctx.lineTo(w - penaltyAreaWidth, penaltyAreaY + penaltyAreaHeight);
    ctx.lineTo(w, penaltyAreaY + penaltyAreaHeight);
    ctx.stroke();

    // Six-yard boxes.
    const goalAreaWidth = 60;
    const goalAreaHeight = 220;
    const goalAreaY = (h - goalAreaHeight) / 2;
    ctx.beginPath();
    ctx.moveTo(0, goalAreaY);
    ctx.lineTo(goalAreaWidth, goalAreaY);
    ctx.lineTo(goalAreaWidth, goalAreaY + goalAreaHeight);
    ctx.lineTo(0, goalAreaY + goalAreaHeight);
    ctx.moveTo(w, goalAreaY);
    ctx.lineTo(w - goalAreaWidth, goalAreaY);
    ctx.lineTo(w - goalAreaWidth, goalAreaY + goalAreaHeight);
    ctx.lineTo(w, goalAreaY + goalAreaHeight);
    ctx.stroke();

    // Penalty arcs
    const penaltyMarkOffset = 105;
    const penaltyArcRadius = 75;
    const penaltyArcAngle = Math.acos((penaltyAreaWidth - penaltyMarkOffset) / penaltyArcRadius);

    ctx.beginPath();
    ctx.arc(penaltyMarkOffset, h / 2, penaltyArcRadius, -penaltyArcAngle, penaltyArcAngle);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w - penaltyMarkOffset, h / 2, penaltyArcRadius, Math.PI - penaltyArcAngle, Math.PI + penaltyArcAngle);
    ctx.stroke();

    // Penalty marks.
    ctx.fillStyle = markingColor;
    ctx.beginPath();
    ctx.arc(penaltyMarkOffset, h / 2, 4, 0, Math.PI * 2);
    ctx.arc(w - penaltyMarkOffset, h / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Corner arcs.
    const cornerRadius = 18;
    ctx.beginPath();
    ctx.arc(0, 0, cornerRadius, 0, Math.PI / 2);
    ctx.moveTo(w, cornerRadius);
    ctx.arc(w, 0, cornerRadius, Math.PI / 2, Math.PI);
    ctx.moveTo(w - cornerRadius, h);
    ctx.arc(w, h, cornerRadius, Math.PI, Math.PI * 1.5);
    ctx.moveTo(0, h - cornerRadius);
    ctx.arc(0, h, cornerRadius, Math.PI * 1.5, Math.PI * 2);
    ctx.stroke();

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
      for (let i = 12; i < goal.width; i += 12) {
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

    // Curved seams give the ball a softer, stitched surface.
    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.pos.x, ball.pos.y, ball.radius - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120, 72, 12, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ball.pos.x - ball.radius * 0.55, ball.pos.y, ball.radius * 0.82, -1.05, 1.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ball.pos.x + ball.radius * 0.55, ball.pos.y, ball.radius * 0.82, Math.PI - 1.05, Math.PI + 1.05);
    ctx.stroke();
    ctx.restore();

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

      // A shallow machined groove distinguishes the discs from the stitched ball.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.radius * 0.7 + 1.5, 0, Math.PI * 2);
      ctx.stroke();

      // Number
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${p.radius}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawUprightText(ctx, String(p.number), p.pos.x, p.pos.y + 1);

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
      const power = getShotPowerFromDragDistance(dragDistance);
      const ratio = Math.min(power / MAX_SHOOT_POWER, 1);
      const isShotReady = dragDistance > getMinimumShotDragDistance(player.radius);
      const guideLength = 40 + ratio * 80;
      const directionLength = dragDistance || 1;
      const guideEndX = player.pos.x + (dx / directionLength) * guideLength;
      const guideEndY = player.pos.y + (dy / directionLength) * guideLength;

      // Power indicator color
      const r = Math.floor(255 * ratio);
      const g = Math.floor(255 * (1 - ratio));
      const color = isShotReady ? `rgb(${r}, ${g}, 100)` : 'rgb(148, 163, 184)';

      if (!isShotReady) {
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(player.pos.x, player.pos.y, player.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(player.pos.x, player.pos.y, player.radius + 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.pos.x, player.pos.y);
        ctx.lineTo(
          player.pos.x + (dx / directionLength) * guideLength,
          player.pos.y + (dy / directionLength) * guideLength,
        );
        ctx.stroke();

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
    }

    // Expanding impact rings
    for (const wave of gameState.impactWaves) {
      ctx.globalAlpha = wave.life;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = wave.lineWidth * wave.life;
      ctx.beginPath();
      ctx.arc(wave.pos.x, wave.pos.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Impact particles
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

      if (isRotated) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-Math.PI / 2);
        const boxWidth = Math.min(420, Math.max(220, gameState.message.length * 12));
        ctx.fillRect(-boxWidth / 2, -30, boxWidth, 60);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gameState.message, 0, 0);
        ctx.restore();
      } else {
        ctx.fillRect(0, h / 2 - 30, w, 60);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gameState.message, w / 2, h / 2);
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [drawUprightText, gameState, isRotated]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const rawX = (e.clientX - rect.left) / scale;
    const rawY = (e.clientY - rect.top) / scale;

    if (isRotated) {
      // Rotated 90° clockwise: logicalX = rawY, logicalY = FIELD_HEIGHT - rawX
      onMouseDown(rawY - GOAL_WIDTH, FIELD_HEIGHT - rawX);
    } else {
      onMouseDown(rawX - GOAL_WIDTH, rawY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = (e.clientX - rect.left) / scale;
    const rawY = (e.clientY - rect.top) / scale;

    if (isRotated) {
      onMouseMove(rawY - GOAL_WIDTH, FIELD_HEIGHT - rawX);
    } else {
      onMouseMove(rawX - GOAL_WIDTH, rawY);
    }
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
      width={FIELD_VIEW_WIDTH}
      height={FIELD_HEIGHT}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        width: FIELD_VIEW_WIDTH * scale,
        height: FIELD_HEIGHT * scale,
        transform: isRotated ? 'rotate(90deg)' : 'none',
        touchAction: 'none',
        cursor: isInteractionBlocked ? 'not-allowed' : gameState.phase === 'aiming' ? 'crosshair' : 'default',
      }}
      className="rounded-lg shadow-2xl border-4 border-green-950"
    />
  );
}
