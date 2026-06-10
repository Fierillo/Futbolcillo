import { COLORS } from '../config/constants.js'

export class Goal {
  constructor(scene, x, y, width, height, team, pitch) {
    this.scene = scene
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.team = team
    this.pitch = pitch

    const px = pitch.pitchToPixelX(x, y)
    const py = pitch.pitchToPixelY(x, y)
    const pw = width * pitch.scale
    const ph = height * pitch.scale

    this.rectangle = scene.add.rectangle(
      px + pw / 2, py + ph / 2,
      pw, ph,
      COLORS.GOAL, 0.3
    )
    this.rectangle.setStrokeStyle(3, COLORS.GOAL)
  }

  contains(px, py) {
    return px >= this.x && px <= this.x + this.width &&
           py >= this.y && py <= this.y + this.height
  }

  updateScale() {
    const px = this.pitch.pitchToPixelX(this.x, this.y)
    const py = this.pitch.pitchToPixelY(this.x, this.y)
    const pw = this.width * this.pitch.scale
    const ph = this.height * this.pitch.scale
    this.rectangle.setPosition(px + pw / 2, py + ph / 2)
    this.rectangle.setSize(pw, ph)
  }
}
