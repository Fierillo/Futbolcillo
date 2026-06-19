import { Player } from '../entities/Player.js'
import { PITCH_BASE } from '../config/constants.js'
import { Pitch } from '../pitch/Pitch.js'

export class TeamManager {
  constructor(scene, pitch) {
    this.scene = scene
    this.pitch = pitch
    this.teams = {
      rojo: [],
      azul: []
    }
  }

  createTeams() {
    const bounds = this.pitch.getBounds()
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2

    this.createTeam('rojo', bounds, cx, cy, 1)
    this.createTeam('azul', bounds, cx, cy, -1)

    return this.teams
  }

  createTeam(team, bounds, cx, cy, side) {
    const goalArea = side === -1
      ? this.pitch.getAreaChicaLeft()
      : this.pitch.getAreaChicaRight()

    const goal = side === -1
      ? this.pitch.getGoalLeft()
      : this.pitch.getGoalRight()

    const goalkeeper = new Player(
      this.scene,
      goalArea.x + goalArea.width / 2,
      goal.y + goal.height / 2,
      this.pitch,
      team,
      true
    )
    this.teams[team].push(goalkeeper)

    const halfStart = side === -1 ? bounds.x : bounds.x + bounds.width / 2
    const halfWidth = bounds.width / 2
    const lineRatios = [0.09, 0.36, 0.66]
    const lineXs = side === -1
      ? lineRatios.map(ratio => halfStart + halfWidth * ratio)
      : lineRatios.map(ratio => halfStart + halfWidth * (1 - ratio))
    const rowGap = bounds.height * 0.22

    this.addRow(team, lineXs[0], cy, 4, rowGap)
    this.addRow(team, lineXs[1], cy, 3, rowGap)
    this.addRow(team, lineXs[2], cy, 3, rowGap)
  }

  addRow(team, x, cy, count, rowGap) {
    const start = -(count - 1) / 2

    for (let i = 0; i < count; i++) {
      const y = cy + (start + i) * rowGap
      const player = new Player(
        this.scene,
        x,
        y,
        this.pitch,
        team,
        false
      )
      this.teams[team].push(player)
    }
  }

  getTeam(team) {
    return this.teams[team]
  }

  getAllPlayers() {
    return [...this.teams.rojo, ...this.teams.azul]
  }

  getGoalkeeper(team) {
    return this.teams[team].find(p => p.isGoalkeeper)
  }

  getFieldPlayers(team) {
    return this.teams[team].filter(p => !p.isGoalkeeper)
  }
}
