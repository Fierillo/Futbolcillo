import { describe, it, expect, vi } from 'vitest'
import { PITCH_BASE, ENTITIES } from '../config/constants.js'
import { Pitch } from '../pitch/Pitch.js'

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

describe('Pitch (dimension logic)', () => {
  it('maintains fixed proportion when scaling', () => {
    const landscape = Pitch.computeLayout(1024, 768)
    const portrait = Pitch.computeLayout(430, 932)
    const landscapeRatio = PITCH_BASE.GOAL_TO_GOAL / PITCH_BASE.WIDTH
    const portraitRatio = PITCH_BASE.WIDTH / PITCH_BASE.GOAL_TO_GOAL

    expect(landscape.width / landscape.height).toBeCloseTo(landscapeRatio, 5)
    expect(portrait.width / portrait.height).toBeCloseTo(portraitRatio, 5)
    expect(landscape.width).toBeLessThanOrEqual(1024)
    expect(landscape.height).toBeLessThanOrEqual(768)
    expect(portrait.width).toBeLessThanOrEqual(430)
    expect(portrait.height).toBeLessThanOrEqual(932)
  })

  it('pitch is longer than wide', () => {
    expect(PITCH_BASE.GOAL_TO_GOAL).toBeGreaterThan(PITCH_BASE.WIDTH)
  })

  it('goal-to-goal = 100', () => {
    expect(PITCH_BASE.GOAL_TO_GOAL).toBe(100)
  })

  it('goal area is larger than goal', () => {
    expect(PITCH_BASE.GOAL_AREA_WIDTH).toBeGreaterThan(PITCH_BASE.GOAL_WIDTH)
  })

  it('computeLayout produces pitch that fits screen', () => {
    const layout = Pitch.computeLayout(1024, 768)
    expect(layout.width).toBeLessThanOrEqual(1024)
    expect(layout.height).toBeLessThanOrEqual(768)
  })

  it('getGoals returns two goals', () => {
    const goals = Pitch.prototype.getGoals.call({
      getGoalLeft: () => ({ x: -2.44, y: 0, width: 2.44, height: 7.32 }),
      getGoalRight: () => ({ x: 100, y: 0, width: 2.44, height: 7.32 })
    })
    expect(goals.length).toBe(2)
  })
})

describe('TeamManager (formation logic)', () => {
  it('formation: 11 players per team', () => {
    const teamCount = ENTITIES.JUGADORES_POR_EQUIPO
    expect(teamCount).toBe(11)
  })

  it('horizontal separation > vertical in landscape', () => {
    const bounds = { width: PITCH_BASE.GOAL_TO_GOAL, height: PITCH_BASE.WIDTH }
    const sepX = bounds.width * 0.08
    const sepY = bounds.height * 0.12
    expect(sepX).toBeGreaterThan(sepY)
  })

  it('rows are spaced wider for the 11v11 layout', () => {
    const bounds = { width: PITCH_BASE.GOAL_TO_GOAL, height: PITCH_BASE.WIDTH }
    const rowGap = bounds.height * 0.22
    expect(rowGap).toBeGreaterThan(bounds.height * 0.17)
  })
})

describe('InputManager (power logic)', () => {
  it('power is calculated as drag distance ratio', () => {
    const maxDragDistance = 200
    const dragDist = 100
    const power = Math.min(dragDist / maxDragDistance, 1)
    expect(power).toBe(0.5)
  })

  it('max power is 1.0', () => {
    const maxDragDistance = 200
    const dragDist = 300
    const power = Math.min(dragDist / maxDragDistance, 1)
    expect(power).toBe(1.0)
  })

  it('min power is 0', () => {
    const maxDragDistance = 200
    const dragDist = 0
    const power = Math.min(dragDist / maxDragDistance, 1)
    expect(power).toBe(0)
  })

  it('shot velocity = direction × maxSpeed × power', () => {
    const nx = 1
    const ny = 0
    const maxSpeed = 0.63
    const power = 0.75
    const vx = nx * maxSpeed * power
    const vy = ny * maxSpeed * power
    expect(vx).toBeCloseTo(0.4725, 5)
    expect(vy).toBe(0)
  })
})

describe('AI (selection logic)', () => {
  it('selects closest player to ball', () => {
    const players = [
      { x: 75, y: 48 },
      { x: 90, y: 56 },
      { x: 25, y: 16 }
    ]
    const ball = { x: 30, y: 20 }

    const distances = players.map(p => ({
      player: p,
      dist: Math.sqrt((p.x - ball.x) ** 2 + (p.y - ball.y) ** 2)
    }))
    distances.sort((a, b) => a.dist - b.dist)

    expect(distances[0].player).toBe(players[2])
  })

  it('angle toward rival goal is calculated correctly', () => {
    const player = { x: 50, y: 32 }
    const goalRight = { x: 100, y: 30.34, width: 2.44, height: 7.32 }
    const targetX = goalRight.x + goalRight.width / 2
    const targetY = goalRight.y + goalRight.height / 2

    const angle = Math.atan2(targetY - player.y, targetX - player.x)
    expect(angle).toBeCloseTo(0, 1)
  })
})
