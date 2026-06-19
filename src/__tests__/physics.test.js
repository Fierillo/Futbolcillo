import { describe, it, expect, beforeEach } from 'vitest'
import { PhysicsEngine } from '../physics/PhysicsEngine.js'
import { PHYSICS } from '../config/constants.js'

function createMockEntity(x, y, radius, team = 'rojo', isGoalkeeper = false) {
  return {
    x, y, radius, team, isGoalkeeper,
    velocity: { x: 0, y: 0 },
    facingX: 1,
    facingY: 0,
    setPos(nx, ny) { this.x = nx; this.y = ny },
    setVelocity(vx, vy) {
      this.velocity.x = vx
      this.velocity.y = vy
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed > 0.001) {
        this.facingX = vx / speed
        this.facingY = vy / speed
      }
    },
    applyFriction(f) {
      this.velocity.x *= (1 - f)
      this.velocity.y *= (1 - f)
    },
    move(dt) {
      this.x += this.velocity.x * dt
      this.y += this.velocity.y * dt
    },
    get active() {
      return Math.abs(this.velocity.x) > 0.0001 || Math.abs(this.velocity.y) > 0.0001
    },
    get maxSpeed() { return 0.63 },
    get kickRatio() { return isGoalkeeper ? 1.3 : 1.0 }
  }
}

describe('PhysicsEngine', () => {
  let engine
  const bounds = { x: 0, y: 0, width: 100, height: 64 }

  beforeEach(() => {
    engine = new PhysicsEngine(bounds)
  })

  describe('reset()', () => {
    it('resets foul and goal flags', () => {
      engine.foulOccurred = true
      engine.goalDetected = {}
      engine.reset()
      expect(engine.foulOccurred).toBe(false)
      expect(engine.goalDetected).toBeNull()
    })
  })

  describe('simulate()', () => {
    it('applies friction and movement to active entities', () => {
      const ball = createMockEntity(50, 32, 0.6)
      ball.setVelocity(0.5, 0)
      const players = []

      engine.simulate(1, ball, players, [])

      expect(ball.velocity.x).toBeLessThan(0.5)
      expect(ball.x).toBeGreaterThan(50)
    })

    it('does not move stopped entities', () => {
      const ball = createMockEntity(50, 32, 0.6)
      const players = []

      engine.simulate(1, ball, players, [])

      expect(ball.x).toBe(50)
      expect(ball.y).toBe(32)
    })

    it('returns allStopped when no movement', () => {
      const ball = createMockEntity(50, 32, 0.6)
      const players = []

      const result = engine.simulate(1, ball, players, [])

      expect(result.allStopped).toBe(true)
    })

    it('returns allStopped=false when moving', () => {
      const ball = createMockEntity(50, 32, 0.6)
      ball.setVelocity(0.5, 0)
      const players = []

      const result = engine.simulate(1, ball, players, [])

      expect(result.allStopped).toBe(false)
    })
  })

  describe('clampBallAbsolute()', () => {
    it('prevents ball from escaping left', () => {
      const ball = createMockEntity(-3, 32, 0.6)
      ball.setVelocity(-0.5, 0)

      engine.clampBallAbsolute(ball)

      expect(ball.x).toBeGreaterThanOrEqual(-2.44 + 0.6)
    })

    it('prevents ball from escaping right', () => {
      const ball = createMockEntity(103, 32, 0.6)
      ball.setVelocity(0.5, 0)

      engine.clampBallAbsolute(ball)

      expect(ball.x).toBeLessThanOrEqual(100 + 2.44 - 0.6)
    })
  })

  describe('circleCollision()', () => {
    it('no collision between separated circles', () => {
      const a = createMockEntity(10, 10, 1.8)
      const b = createMockEntity(20, 20, 1.8)

      engine.circleCollision(a, b, 'player', 'player')

      expect(a.x).toBe(10)
      expect(b.x).toBe(20)
    })

    it('no collision between same entity', () => {
      const a = createMockEntity(10, 10, 1.8)

      engine.circleCollision(a, a, 'player', 'player')

      expect(a.x).toBe(10)
    })

    it('resolves collision between overlapping circles', () => {
      const a = createMockEntity(10, 10, 1.8)
      const b = createMockEntity(12, 10, 1.8)
      a.setVelocity(0.3, 0)

      engine.circleCollision(a, b, 'player', 'player')

      const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
      expect(dist).toBeGreaterThanOrEqual(3.4)
    })

    it('detects foul when rival discs collide', () => {
      const a = createMockEntity(10, 10, 1.8, 'rojo')
      const b = createMockEntity(12, 10, 1.8, 'azul')
      a.setVelocity(0.3, 0)

      engine.circleCollision(a, b, 'player', 'player')

      expect(engine.foulOccurred).toBe(true)
    })

    it('no foul between same team players', () => {
      const a = createMockEntity(10, 10, 1.8, 'rojo')
      const b = createMockEntity(12, 10, 1.8, 'rojo')
      a.setVelocity(0.3, 0)

      engine.circleCollision(a, b, 'player', 'player')

      expect(engine.foulOccurred).toBe(false)
    })
  })

  describe('resolvePlayerBallCollision()', () => {
    it('applies kick ratio when hitting fast ball', () => {
      const player = createMockEntity(10, 10, 1.8, 'rojo')
      const ball = createMockEntity(12, 10, 0.6)
      ball.setVelocity(-0.5, 0)
      player.setVelocity(0.63, 0)

      const hit = engine.resolvePlayerBallCollision(player, ball)

      expect(hit).toBe(true)
      expect(ball.velocity.x).toBeGreaterThan(0)
    })

    it('stationary player bounces fast ball', () => {
      const player = createMockEntity(10, 10, 1.8, 'rojo')
      const ball = createMockEntity(12, 10, 0.6)
      ball.setVelocity(-0.5, 0)

      const hit = engine.resolvePlayerBallCollision(player, ball)

      expect(hit).toBe(true)
      expect(ball.velocity.x).toBeGreaterThan(0)
    })

    it('reduces player velocity after hitting', () => {
      const player = createMockEntity(10, 10, 1.8, 'rojo')
      const ball = createMockEntity(12, 10, 0.6)
      ball.setVelocity(-0.5, 0)
      player.setVelocity(0.63, 0)

      engine.resolvePlayerBallCollision(player, ball)

      expect(player.velocity.x).toBeLessThan(0.63)
    })

    it('goalkeeper hits harder than field player', () => {
      const goalkeeper = createMockEntity(10, 10, 1.8, 'rojo', true)
      const field = createMockEntity(30, 10, 1.8, 'rojo', false)
      const ball1 = createMockEntity(12, 10, 0.6)
      const ball2 = createMockEntity(32, 10, 0.6)
      ball1.setVelocity(-0.5, 0)
      ball2.setVelocity(-0.5, 0)
      goalkeeper.setVelocity(0.63, 0)
      field.setVelocity(0.63, 0)

      engine.resolvePlayerBallCollision(goalkeeper, ball1)
      engine.resolvePlayerBallCollision(field, ball2)

      expect(ball1.velocity.x).toBeGreaterThan(ball2.velocity.x)
    })

    it('separates ball completely from player', () => {
      const player = createMockEntity(10, 10, 1.8, 'rojo')
      const ball = createMockEntity(11.2, 10, 0.6)

      engine.resolvePlayerBallCollision(player, ball)

      const dist = Math.sqrt((ball.x - player.x) ** 2 + (ball.y - player.y) ** 2)
      expect(dist).toBeGreaterThanOrEqual(player.radius + ball.radius)
    })
  })

  describe('detectGoal()', () => {
    it('detects goal when ball is inside goal area', () => {
      const goalArea = { x: -2.44, y: 28, width: 2.44, height: 7.32, direction: 'left' }
      engine.goalAreas = [goalArea]

      const ball = createMockEntity(-1.22, 31.66, 0.6)
      const goal = { bounds: { x: 0, y: 28, width: 2.44, height: 7.32 }, team: 'rojo', contains: () => false }

      engine.detectGoal(ball, [goal])

      expect(engine.goalDetected).toBe(goal)
    })

    it('does not detect goal when ball is outside goal area', () => {
      const goalArea = { x: -2.44, y: 28, width: 2.44, height: 7.32, direction: 'left' }
      engine.goalAreas = [goalArea]

      const ball = createMockEntity(50, 32, 0.6)
      const goal = { bounds: { x: 0, y: 28, width: 2.44, height: 7.32 }, team: 'rojo', contains: () => false }

      engine.detectGoal(ball, [goal])

      expect(engine.goalDetected).toBeNull()
    })
  })

  describe('isAllStopped()', () => {
    it('returns true if no entities', () => {
      expect(engine.isAllStopped([])).toBe(true)
    })

    it('returns true if all entities are stopped', () => {
      const entities = [
        createMockEntity(10, 10, 0.6),
        createMockEntity(20, 20, 0.6)
      ]
      expect(engine.isAllStopped(entities)).toBe(true)
    })

    it('returns false if at least one entity is active', () => {
      const entities = [
        createMockEntity(10, 10, 0.6),
        createMockEntity(20, 20, 0.6)
      ]
      entities[1].setVelocity(0.3, 0)
      expect(engine.isAllStopped(entities)).toBe(false)
    })
  })

  describe('applyGoalkeeperRestriction()', () => {
    it('restricts goalkeeper to area', () => {
      const goalkeeper = createMockEntity(5, 5, 1.8, 'rojo', true)
      const area = { x: 0, y: 0, width: 10, height: 20 }

      goalkeeper.setPos(15, 10)
      engine.applyGoalkeeperRestriction(goalkeeper, area)

      expect(goalkeeper.x).toBeLessThanOrEqual(area.x + area.width - goalkeeper.radius)
    })

    it('does not restrict field players', () => {
      const player = createMockEntity(5, 5, 1.8, 'rojo', false)
      const area = { x: 0, y: 0, width: 10, height: 20 }

      player.setPos(15, 10)
      engine.applyGoalkeeperRestriction(player, area)

      expect(player.x).toBe(15)
    })

    it('stops goalkeeper velocity at area edge', () => {
      const goalkeeper = createMockEntity(5, 5, 1.8, 'rojo', true)
      goalkeeper.setVelocity(0.3, 0.3)
      const area = { x: 0, y: 0, width: 10, height: 20 }

      goalkeeper.setPos(9, 19)
      engine.applyGoalkeeperRestriction(goalkeeper, area)

      expect(goalkeeper.velocity.x).toBe(0)
      expect(goalkeeper.velocity.y).toBe(0)
    })
  })

  describe('full simulation flow', () => {
    it('ball stops after several frames', () => {
      const ball = createMockEntity(50, 32, 0.6)
      ball.setVelocity(0.5, 0)
      const players = []

      for (let i = 0; i < 1000; i++) {
        const result = engine.simulate(1, ball, players, [])
        if (result.allStopped) break
      }

      expect(Math.abs(ball.velocity.x)).toBeLessThan(PHYSICS.UMBRAL_DETENIDO)
    })

    it('foul is detected during simulation', () => {
      const playerA = createMockEntity(10, 10, 1.8, 'rojo')
      const playerB = createMockEntity(13, 10, 1.8, 'azul')
      const ball = createMockEntity(50, 32, 0.6)

      playerA.setVelocity(0.63, 0)

      const result = engine.simulate(1, ball, [playerA, playerB], [])

      expect(result.foul).toBe(true)
    })

    it('keeps foul when attacker hits rival in corner', () => {
      const attacker = createMockEntity(8, 32, 1.8, 'rojo')
      const defender = createMockEntity(4.5, 32, 1.8, 'azul')
      const ball = createMockEntity(2.5, 32, 0.6)

      attacker.setVelocity(-0.63, 0)
      defender.setVelocity(0, 0)

      const result = engine.simulate(1, ball, [attacker, defender], [])

      expect(result.foul).toBe(true)
    })
  })
})
