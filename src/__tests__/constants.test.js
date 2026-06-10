import { describe, it, expect } from 'vitest'
import { PHYSICS, POWER, PITCH_BASE, ENTITIES, COLORS, TEAMS } from '../config/constants.js'

describe('PHYSICS', () => {
  it('fricción está entre 0 y 1', () => {
    expect(PHYSICS.FRICCION).toBeGreaterThan(0)
    expect(PHYSICS.FRICCION).toBeLessThan(1)
  })

  it('fricción pelota es menor que fricción jugador', () => {
    expect(PHYSICS.FRICCION_PELOTA).toBeLessThan(PHYSICS.FRICCION)
  })

  it('pérdida por colisión está entre 0 y 1', () => {
    expect(PHYSICS.PERDIDA_COLISION).toBeGreaterThan(0)
    expect(PHYSICS.PERDIDA_COLISION).toBeLessThan(1)
  })

  it('coeficiente de restitución está entre 0 y 1', () => {
    expect(PHYSICS.COEF_RESTITUCION).toBeGreaterThan(0)
    expect(PHYSICS.COEF_RESTITUCION).toBeLessThanOrEqual(1)
  })

  it('umbral detenido es positivo y pequeño', () => {
    expect(PHYSICS.UMBRAL_DETENIDO).toBeGreaterThan(0)
    expect(PHYSICS.UMBRAL_DETENIDO).toBeLessThan(0.01)
  })
})

describe('POWER', () => {
  it('kick ratio arquero es mayor que campo', () => {
    expect(POWER.KICK_RATIO_ARQUERO).toBeGreaterThan(POWER.KICK_RATIO_CAMPO)
  })

  it('con kick ratio campo, pelota recorre ~62% de la cancha', () => {
    const kickVelocidad = POWER.V_MAX_CAMPO * POWER.KICK_RATIO_CAMPO
    const distancia = kickVelocidad * (1 - PHYSICS.FRICCION_PELOTA) / PHYSICS.FRICCION_PELOTA
    expect(distancia).toBeCloseTo(62.37, 0)
  })

  it('con kick ratio arquero, pelota recorre ~81% de la cancha', () => {
    const kickVelocidad = POWER.V_MAX_ARQUERO * POWER.KICK_RATIO_ARQUERO
    const distancia = kickVelocidad * (1 - PHYSICS.FRICCION_PELOTA) / PHYSICS.FRICCION_PELOTA
    expect(distancia).toBeCloseTo(81.27, 0)
  })
})

describe('PITCH_BASE', () => {
  it('goal-to-goal es 100', () => {
    expect(PITCH_BASE.GOAL_TO_GOAL).toBe(100)
  })

  it('ancho de cancha es 64', () => {
    expect(PITCH_BASE.WIDTH).toBe(64)
  })

  it('goal width es 7.32', () => {
    expect(PITCH_BASE.GOAL_WIDTH).toBe(7.32)
  })

  it('goal depth es 2.44', () => {
    expect(PITCH_BASE.GOAL_DEPTH).toBe(2.44)
  })

  it('disk radius es mayor que ball radius', () => {
    expect(PITCH_BASE.DISK_RADIUS).toBeGreaterThan(PITCH_BASE.BALL_RADIUS)
  })

  it('center circle radius es 9.15', () => {
    expect(PITCH_BASE.CENTER_CIRCLE_RADIUS).toBe(9.15)
  })

  it('goal area width es mayor que goal width', () => {
    expect(PITCH_BASE.GOAL_AREA_WIDTH).toBeGreaterThan(PITCH_BASE.GOAL_WIDTH)
  })
})

describe('ENTITIES', () => {
  it('hay 5 jugadores por equipo', () => {
    expect(ENTITIES.JUGADORES_POR_EQUIPO).toBe(5)
  })

  it('hay 1 arquero', () => {
    expect(ENTITIES.ARQUEROS).toBe(1)
  })
})

describe('COLORS', () => {
  it('todos los colores son números hex', () => {
    for (const [key, value] of Object.entries(COLORS)) {
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThan(0)
    }
  })
})

describe('TEAMS', () => {
  it('hay dos equipos: rojo y azul', () => {
    expect(TEAMS.ROJO).toBe('rojo')
    expect(TEAMS.AZUL).toBe('azul')
  })
})
