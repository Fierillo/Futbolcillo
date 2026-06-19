import { PHYSICS } from '../config/constants.js'

export class PhysicsEngine {
  constructor(pitchBounds, goalAreas = []) {
    this.bounds = pitchBounds
    this.goalAreas = goalAreas
    this.foulOccurred = false
    this.goalDetected = null
    this.onFoul = null
    this.onGoal = null
  }

  reset() {
    this.foulOccurred = false
    this.goalDetected = null
  }

  simulate(dt, ball, players, goals) {
    this.goalDetected = null

    const all = [ball, ...players]
    const ballInGoalArea = this.isInGoalArea(ball)

    for (const entity of all) {
      if (entity.active) {
        let friction = entity === ball ? PHYSICS.FRICCION_PELOTA : PHYSICS.FRICCION
        if (entity === ball && ballInGoalArea) {
          friction = 0.85
        }
        entity.applyFriction(friction)
        entity.move(dt)

        if (Math.abs(entity.velocity.x) < PHYSICS.UMBRAL_DETENIDO) entity.velocity.x = 0
        if (Math.abs(entity.velocity.y) < PHYSICS.UMBRAL_DETENIDO) entity.velocity.y = 0
      }
    }

    this.clampBounds(all, ball, goals)
    this.detectGoal(ball, goals)
    this.resolveEntityCollisions(ball, players)
    this.clampBounds(all, ball, goals)

    this.clampBallAbsolute(ball)

    return {
      foul: this.foulOccurred,
      goal: this.goalDetected,
      allStopped: this.isAllStopped(all)
    }
  }

  clampBallAbsolute(ball) {
    const goalDepth = 2.44
    if (ball.x - ball.radius < -goalDepth) {
      ball.setPos(-goalDepth + ball.radius, ball.y)
      ball.velocity.x = Math.abs(ball.velocity.x) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
    }
    if (ball.x + ball.radius > this.bounds.width + goalDepth) {
      ball.setPos(this.bounds.width + goalDepth - ball.radius, ball.y)
      ball.velocity.x = -Math.abs(ball.velocity.x) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
    }
    if (ball.y - ball.radius < this.bounds.y) {
      ball.setPos(ball.x, this.bounds.y + ball.radius)
      ball.velocity.y = Math.abs(ball.velocity.y) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
    }
    if (ball.y + ball.radius > this.bounds.y + this.bounds.height) {
      ball.setPos(ball.x, this.bounds.y + this.bounds.height - ball.radius)
      ball.velocity.y = -Math.abs(ball.velocity.y) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
    }
  }

  isInGoalArea(entity) {
    const r = entity.radius || 0
    for (const area of this.goalAreas) {
      if (entity.x - r >= area.x && entity.x + r <= area.x + area.width &&
          entity.y - r >= area.y && entity.y + r <= area.y + area.height) {
        return true
      }
    }
    return false
  }

  clampBounds(all, ball, goals) {
    for (const entity of all) {
      const r = entity.radius

      let canPassLeft = false
      let canPassRight = false

      if (entity === ball && goals) {
        for (const goal of goals) {
          const g = goal.bounds || goal
          if (g.x + g.width <= this.bounds.x && ball.y >= g.y && ball.y <= g.y + g.height) {
            canPassLeft = true
          }
          if (g.x >= this.bounds.x + this.bounds.width && ball.y >= g.y && ball.y <= g.y + g.height) {
            canPassRight = true
          }
        }
      }

      if (canPassLeft || canPassRight) continue

      if (entity.x - r < this.bounds.x) {
        entity.setPos(this.bounds.x + r, entity.y)
        entity.velocity.x = Math.abs(entity.velocity.x) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
      }
      if (entity.x + r > this.bounds.x + this.bounds.width) {
        entity.setPos(this.bounds.x + this.bounds.width - r, entity.y)
        entity.velocity.x = -Math.abs(entity.velocity.x) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
      }
      if (entity.y - r < this.bounds.y) {
        entity.setPos(entity.x, this.bounds.y + r)
        entity.velocity.y = Math.abs(entity.velocity.y) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
      }
      if (entity.y + r > this.bounds.y + this.bounds.height) {
        entity.setPos(entity.x, this.bounds.y + this.bounds.height - r)
        entity.velocity.y = -Math.abs(entity.velocity.y) * PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
      }
    }
  }

  resolveEntityCollisions(ball, players) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        this.circleCollision(players[i], players[j], 'player', 'player')
      }
    }

    for (let iter = 0; iter < 3; iter++) {
      for (const player of players) {
        this.resolvePlayerBallCollision(player, ball)
      }
    }
  }

  circleCollision(a, b, typeA, typeB) {
    if (a === b) return

    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const minDist = a.radius + b.radius

    if (dist >= minDist || dist === 0) return

    const nx = dx / dist
    const ny = dy / dist
    const overlap = minDist - dist

    a.setPos(a.x - nx * overlap / 2, a.y - ny * overlap / 2)
    b.setPos(b.x + nx * overlap / 2, b.y + ny * overlap / 2)

    if (typeA === 'player' && typeB === 'player') {
      if (a.team !== b.team) {
        this.foulOccurred = true
        if (this.onFoul) this.onFoul()
      }
    }

    const relVx = a.velocity.x - b.velocity.x
    const relVy = a.velocity.y - b.velocity.y
    const relVelNormal = relVx * nx + relVy * ny

    if (relVelNormal <= 0) return

    const restitution = PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
    const impulse = relVelNormal * (1 + restitution) / 2

    a.velocity.x -= impulse * nx
    a.velocity.y -= impulse * ny
    b.velocity.x += impulse * nx
    b.velocity.y += impulse * ny
  }

  resolvePlayerBallCollision(player, ball) {
    const dx = ball.x - player.x
    const dy = ball.y - player.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const minDist = player.radius + ball.radius

    if (dist >= minDist) return false

    let nx = dx
    let ny = dy
    if (dist > 0) {
      nx = dx / dist
      ny = dy / dist
    } else {
      const rvx = ball.velocity.x - player.velocity.x
      const rvy = ball.velocity.y - player.velocity.y
      const rmag = Math.sqrt(rvx * rvx + rvy * rvy)
      if (rmag > 0) {
        nx = rvx / rmag
        ny = rvy / rmag
      } else {
        nx = 1
        ny = 0
      }
    }
    const overlap = minDist - dist

    ball.setPos(ball.x + nx * (overlap + 0.25), ball.y + ny * (overlap + 0.25))

    const playerSpeed = Math.sqrt(
      player.velocity.x * player.velocity.x +
      player.velocity.y * player.velocity.y
    )

    if (playerSpeed < 0.001) {
      const restitution = PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
      const relVx = 0 - ball.velocity.x
      const relVy = 0 - ball.velocity.y
      const relVelNormal = relVx * nx + relVy * ny
      if (relVelNormal >= 0) {
        const impulse = relVelNormal * (1 + restitution)
        ball.velocity.x += impulse * nx
        ball.velocity.y += impulse * ny
      }
      return true
    }

    const dotPlayerNormal = player.velocity.x * nx + player.velocity.y * ny
    const dotBallNormal = ball.velocity.x * nx + ball.velocity.y * ny

    const restitution = PHYSICS.COEF_RESTITUCION * (1 - PHYSICS.PERDIDA_COLISION)
    const transferRatio = player.kickRatio

    ball.velocity.x = nx * dotPlayerNormal * transferRatio + (ball.velocity.x - nx * dotBallNormal) * restitution
    ball.velocity.y = ny * dotPlayerNormal * transferRatio + (ball.velocity.y - ny * dotBallNormal) * restitution

    player.velocity.x *= 0.3
    player.velocity.y *= 0.3

    return true
  }

  detectGoal(ball, goals) {
    if (this.goalDetected) return

    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i]
      const g = goal.bounds || goal
      const area = this.goalAreas[i]
      if (!area) continue

      const ballInside = ball.x - ball.radius >= area.x &&
                         ball.x + ball.radius <= area.x + area.width &&
                         ball.y - ball.radius >= area.y &&
                         ball.y + ball.radius <= area.y + area.height

      if (!ballInside) continue

      const inYRange = ball.y >= g.y && ball.y <= g.y + g.height

      if (!inYRange) continue

      this.goalDetected = goal
      if (this.onGoal) this.onGoal(goal)
      return
    }
  }

  isAllStopped(all) {
    for (const entity of all) {
      if (entity.active) return false
    }
    return true
  }

  applyGoalkeeperRestriction(player, areaBounds) {
    if (!player.isGoalkeeper) return

    const r = player.radius
    if (player.x - r < areaBounds.x) {
      player.setPos(areaBounds.x + r, player.y)
      player.velocity.x = 0
    }
    if (player.x + r > areaBounds.x + areaBounds.width) {
      player.setPos(areaBounds.x + areaBounds.width - r, player.y)
      player.velocity.x = 0
    }
    if (player.y - r < areaBounds.y) {
      player.setPos(player.x, areaBounds.y + r)
      player.velocity.y = 0
    }
    if (player.y + r > areaBounds.y + areaBounds.height) {
      player.setPos(player.x, areaBounds.y + areaBounds.height - r)
      player.velocity.y = 0
    }
  }
}
