import Phaser from 'phaser'

export class AIController {
  constructor(teamManager, ball, pitchBounds) {
    this.teamManager = teamManager
    this.ball = ball
    this.bounds = pitchBounds
  }

  executeTurn(team, onComplete) {
    const players = this.teamManager.getTeam(team)
    const fieldPlayers = this.teamManager.getFieldPlayers(team)

    const target = this.chooseTarget(team, fieldPlayers)

    if (!target) {
      setTimeout(() => onComplete(), 300)
      return
    }

    const angle = this.calculateShotAngle(target, team)
    const power = this.calculatePower(target)

    const vx = Math.cos(angle) * target.maxSpeed * power
    const vy = Math.sin(angle) * target.maxSpeed * power

    target.setVelocity(vx, vy)

    setTimeout(() => onComplete(), 100)
  }

  chooseTarget(team, fieldPlayers) {
    const withBall = fieldPlayers.map(p => ({
      player: p,
      dist: Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y)
    }))

    withBall.sort((a, b) => a.dist - b.dist)

    for (const d of withBall) {
      if (d.dist < this.bounds.width * 0.6) {
        return d.player
      }
    }

    return withBall.length > 0 ? withBall[0].player : null
  }

  calculateShotAngle(player, team) {
    const distBall = Phaser.Math.Distance.Between(player.x, player.y, this.ball.x, this.ball.y)

    const angleBall = Math.atan2(this.ball.y - player.y, this.ball.x - player.x)

    if (distBall < this.bounds.width * 0.15) {
      return angleBall
    }

    const goal = team === 'rojo'
      ? this.teamManager.pitch.getGoalLeft()
      : this.teamManager.pitch.getGoalRight()

    const goalX = goal.x + goal.width / 2
    const goalY = goal.y + goal.height / 2

    const angleGoal = Math.atan2(goalY - this.ball.y, goalX - this.ball.x)

    const angleArrival = angleGoal + Math.PI

    const diff = angleBall - angleArrival
    const shotAngle = angleBall - diff * 0.3

    const variation = (Math.random() - 0.5) * 0.2
    return shotAngle + variation
  }

  calculatePower(player) {
    const dist = Phaser.Math.Distance.Between(player.x, player.y, this.ball.x, this.ball.y)
    const maxDist = this.bounds.width * 0.4

    if (dist > maxDist) return 0.8 + Math.random() * 0.2

    const ratio = dist / maxDist
    return 0.5 + ratio * 0.4 + Math.random() * 0.1
  }
}
