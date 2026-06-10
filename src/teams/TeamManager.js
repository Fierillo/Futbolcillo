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
    const baseX = side === -1
      ? bounds.x + bounds.width * 0.25
      : bounds.x + bounds.width * 0.75

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

    const separationX = bounds.width * 0.08
    const separationY = bounds.height * 0.12

    const formation = [
      { dx: 0, dy: 0 },
      { dx: separationX, dy: -separationY },
      { dx: separationX, dy: separationY },
      { dx: separationX * 2, dy: 0 }
    ]

    for (const pos of formation) {
      const player = new Player(
        this.scene,
        baseX + pos.dx * side,
        cy + pos.dy,
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
