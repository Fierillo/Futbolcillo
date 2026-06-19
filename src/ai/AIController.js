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

    const target = this.chooseTarget(fieldPlayers)

    if (!target) {
      setTimeout(() => onComplete(), 300)
      return
    }

    const power = this.calculateMovePower(target)
    const speed = target.maxSpeed * power

    const opponents = this.getOpponents(team)
    const evasiveAngle = this.calculateEvasiveAngle(target, this.ball.x, this.ball.y, opponents)

    target.setVelocity(Math.cos(evasiveAngle) * speed, Math.sin(evasiveAngle) * speed)

    setTimeout(() => onComplete(), 100)
  }

  getOpponents(team) {
    const allTeams = ['rojo', 'azul']
    const otherTeam = allTeams.find(t => t !== team)
    return this.teamManager.getTeam(otherTeam)
  }

  findNearestOpponent(player, opponents) {
    let nearest = null
    let minDist = Infinity
    for (const opp of opponents) {
      const dist = Phaser.Math.Distance.Between(player.x, player.y, opp.x, opp.y)
      if (dist < minDist) {
        minDist = dist
        nearest = opp
      }
    }
    return { opponent: nearest, distance: minDist }
  }

  calculateEvasiveAngle(player, targetX, targetY, opponents) {
    const baseAngle = Math.atan2(targetY - player.y, targetX - player.x)
    const { opponent, distance } = this.findNearestOpponent(player, opponents)

    if (!opponent || distance > 8) {
      return baseAngle
    }

    const oppAngle = Math.atan2(opponent.y - player.y, opponent.x - player.x)
    const diff = baseAngle - oppAngle
    const evasion = diff > 0 ? 0.4 : -0.4
    return baseAngle + evasion
  }

  chooseTarget(fieldPlayers) {
    const withBall = fieldPlayers.map(p => ({
      player: p,
      dist: Phaser.Math.Distance.Between(p.x, p.y, this.ball.x, this.ball.y)
    }))

    withBall.sort((a, b) => a.dist - b.dist)

    return withBall.length > 0 ? withBall[0].player : null
  }

  calculateMovePower(player) {
    const dist = Phaser.Math.Distance.Between(player.x, player.y, this.ball.x, this.ball.y)
    const maxDist = this.bounds.width * 0.3

    if (dist > maxDist) return 0.7 + Math.random() * 0.3

    const ratio = dist / maxDist
    return 0.4 + ratio * 0.4 + Math.random() * 0.1
  }

  calculateShotAngle(player, team) {
    const goal = team === 'rojo'
      ? this.teamManager.pitch.getGoalLeft()
      : this.teamManager.pitch.getGoalRight()

    const goalX = goal.x + goal.width / 2
    const goalY = goal.y + goal.height / 2

    const angle = Math.atan2(goalY - player.y, goalX - player.x)
    const variation = (Math.random() - 0.5) * 0.15
    return angle + variation
  }

  distToGoal(player, team) {
    const goal = team === 'rojo'
      ? this.teamManager.pitch.getGoalLeft()
      : this.teamManager.pitch.getGoalRight()

    const goalX = goal.x + goal.width / 2
    const goalY = goal.y + goal.height / 2

    return Phaser.Math.Distance.Between(player.x, player.y, goalX, goalY)
  }
}
