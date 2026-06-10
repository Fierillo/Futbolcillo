import { PITCH_BASE } from '../config/constants.js'

export class Ball {
  constructor(scene, x, y, pitch) {
    this.scene = scene
    this.pitch = pitch
    this.radius = PITCH_BASE.BALL_RADIUS
    this.velocity = { x: 0, y: 0 }

    const px = pitch.pitchToPixelX(x, y)
    const py = pitch.pitchToPixelY(x, y)
    this.sprite = scene.add.circle(px, py, this.radius * pitch.scale, 0xf1c40f)
    this.sprite.setStrokeStyle(2, 0xe67e22)
    this.sprite.setDepth(50)

    this.x = x
    this.y = y
  }

  get active() {
    return Math.abs(this.velocity.x) > 0.0001 || Math.abs(this.velocity.y) > 0.0001
  }

  setPos(x, y) {
    this.x = x
    this.y = y
    this.sprite.x = this.pitch.pitchToPixelX(x, y)
    this.sprite.y = this.pitch.pitchToPixelY(x, y)
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
  }

  updateScale() {
    this.sprite.setRadius(this.radius * this.pitch.scale)
    this.setPos(this.x, this.y)
  }
}
