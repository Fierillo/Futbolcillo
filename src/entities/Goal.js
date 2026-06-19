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

    const rect = pitch.rectToScreen(this)
    this.rectangle = scene.add.rectangle(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      rect.width,
      rect.height,
      COLORS.GOAL, 0.3
    )
    this.rectangle.setStrokeStyle(3, COLORS.GOAL)
  }

  contains(px, py) {
    return px >= this.x && px <= this.x + this.width &&
           py >= this.y && py <= this.y + this.height
  }

  updateScale() {
    const rect = this.pitch.rectToScreen(this)
    this.rectangle.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2)
    this.rectangle.setSize(rect.width, rect.height)
  }
}
