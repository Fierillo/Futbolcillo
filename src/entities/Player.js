import { COLORS, PITCH_BASE, POWER } from '../config/constants.js'

export class Player {
  constructor(scene, x, y, pitch, team, isGoalkeeper = false) {
    this.scene = scene
    this.pitch = pitch
    this.team = team
    this.isGoalkeeper = isGoalkeeper
    this.radius = PITCH_BASE.DISK_RADIUS
    this.velocity = { x: 0, y: 0 }
    this.selected = false

    this.x = x
    this.y = y

    const color = team === 'rojo' ? COLORS.TEAM_ROJO : COLORS.TEAM_AZUL
    const px = pitch.pitchToPixelX(x, y)
    const py = pitch.pitchToPixelY(x, y)
    this.sprite = scene.add.circle(px, py, this.radius * pitch.scale, color)
    this.sprite.setStrokeStyle(2, 0x000000)

    if (isGoalkeeper) {
      this.sprite.setStrokeStyle(3, 0xffd700)
    }

    this.selectionRing = scene.add.circle(px, py, (this.radius + 0.4) * pitch.scale, 0xffffff)
    this.selectionRing.setStrokeStyle(2, 0xffffff)
    this.selectionRing.setAlpha(0)
  }

  get active() {
    return Math.abs(this.velocity.x) > 0.0001 || Math.abs(this.velocity.y) > 0.0001
  }

  get maxSpeed() {
    return this.isGoalkeeper ? POWER.V_MAX_ARQUERO : POWER.V_MAX_CAMPO
  }

  get kickRatio() {
    return this.isGoalkeeper ? POWER.KICK_RATIO_ARQUERO : POWER.KICK_RATIO_CAMPO
  }

  select() {
    this.selected = true
    this.selectionRing.setAlpha(1)
  }

  deselect() {
    this.selected = false
    this.selectionRing.setAlpha(0)
  }

  setPos(x, y) {
    this.x = x
    this.y = y
    const px = this.pitch.pitchToPixelX(x, y)
    const py = this.pitch.pitchToPixelY(x, y)
    this.sprite.x = px
    this.sprite.y = py
    this.selectionRing.x = px
    this.selectionRing.y = py
  }

  setVelocity(vx, vy) {
    this.velocity.x = vx
    this.velocity.y = vy
  }

  applyFriction(friction) {
    this.velocity.x *= (1 - friction)
    this.velocity.y *= (1 - friction)
  }

  move(dt) {
    this.setPos(
      this.x + this.velocity.x * dt,
      this.y + this.velocity.y * dt
    )
  }

  reset(x, y) {
    this.setPos(x, y)
    this.velocity.x = 0
    this.velocity.y = 0
    this.deselect()
  }

  updateScale() {
    this.sprite.setRadius(this.radius * this.pitch.scale)
    this.selectionRing.setRadius((this.radius + 0.4) * this.pitch.scale)
    this.setPos(this.x, this.y)
  }
}
