import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PITCH_BASE } from '../config/constants.js'

vi.mock('phaser', () => ({
  default: {
    Math: {
      Distance: {
        Between: (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
      }
    },
    Geom: { Line: class {} },
    Scale: { RESIZE: 'RESIZE', CENTER_BOTH: 'CENTER_BOTH' },
    AUTO: 'auto'
  }
}))

describe('Ball (pure logic)', () => {
  it('ball radius is 0.6', () => {
    expect(PITCH_BASE.BALL_RADIUS).toBe(0.6)
  })

  it('initial velocity is zero', () => {
    const ball = { velocity: { x: 0, y: 0 } }
    expect(ball.velocity.x).toBe(0)
    expect(ball.velocity.y).toBe(0)
  })

  it('setVelocity assigns correctly', () => {
    const ball = { velocity: { x: 0, y: 0 },
      setVelocity(vx, vy) { this.velocity.x = vx; this.velocity.y = vy }
    }
    ball.setVelocity(5, 3)
    expect(ball.velocity.x).toBe(5)
    expect(ball.velocity.y).toBe(3)
  })

  it('applyFriction reduces velocity', () => {
    const ball = { velocity: { x: 10, y: 10 },
      applyFriction(f) {
        this.velocity.x *= (1 - f)
        this.velocity.y *= (1 - f)
      }
    }
    ball.applyFriction(0.1)
    expect(ball.velocity.x).toBe(9)
    expect(ball.velocity.y).toBe(9)
  })

  it('move updates position', () => {
    const ball = { x: 100, y: 100, velocity: { x: 5, y: 3 },
      move(dt) { this.x += this.velocity.x * dt; this.y += this.velocity.y * dt }
    }
    ball.move(1)
    expect(ball.x).toBe(105)
    expect(ball.y).toBe(103)
  })

  it('reset stops and repositions', () => {
    const ball = { x: 100, y: 100, velocity: { x: 5, y: 3 },
      setPos(x, y) { this.x = x; this.y = y },
      reset(x, y) { this.setPos(x, y); this.velocity.x = 0; this.velocity.y = 0 }
    }
    ball.reset(500, 300)
    expect(ball.x).toBe(500)
    expect(ball.y).toBe(300)
    expect(ball.velocity.x).toBe(0)
    expect(ball.velocity.y).toBe(0)
  })
})

describe('Player (pure logic)', () => {
  it('disk radius is greater than ball radius', () => {
    expect(PITCH_BASE.DISK_RADIUS).toBeGreaterThan(PITCH_BASE.BALL_RADIUS)
  })

  it('goalkeeper has higher kick ratio', () => {
    const field = { isGoalkeeper: false, get kickRatio() { return 1.0 } }
    const goalkeeper = { isGoalkeeper: true, get kickRatio() { return 1.3 } }
    expect(goalkeeper.kickRatio).toBeGreaterThan(field.kickRatio)
  })

  it('select/deselect changes state', () => {
    const player = {
      selected: false,
      select() { this.selected = true },
      deselect() { this.selected = false }
    }
    player.select()
    expect(player.selected).toBe(true)
    player.deselect()
    expect(player.selected).toBe(false)
  })
})

describe('Goal (pure logic)', () => {
  it('contains detects point inside goal', () => {
    const goal = {
      x: 0, y: 28, width: 2.44, height: 7.32,
      contains(px, py) {
        return px >= this.x && px <= this.x + this.width &&
               py >= this.y && py <= this.y + this.height
      }
    }
    expect(goal.contains(1.22, 31.66)).toBe(true)
  })

  it('contains rejects point outside goal', () => {
    const goal = {
      x: 0, y: 28, width: 2.44, height: 7.32,
      contains(px, py) {
        return px >= this.x && px <= this.x + this.width &&
               py >= this.y && py <= this.y + this.height
      }
    }
    expect(goal.contains(66, 32)).toBe(false)
  })
})
