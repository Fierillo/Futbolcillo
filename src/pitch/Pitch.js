import Phaser from 'phaser'
import { COLORS, PITCH_BASE } from '../config/constants.js'

const PB = PITCH_BASE

const PITCH_LENGTH = PB.GOAL_TO_GOAL
const GOAL_LINE_LEFT = 0
const GOAL_LINE_RIGHT = PB.GOAL_TO_GOAL
const CENTER_X = PB.GOAL_TO_GOAL / 2
const CENTER_Y = PB.WIDTH / 2

export class Pitch {
  static computeLayout(screenWidth, screenHeight) {
    const availableWidth = screenWidth * (1 - PB.MARGIN * 2)
    const availableHeight = screenHeight * (1 - PB.MARGIN * 2)

    const isPortrait = screenHeight > screenWidth
    const baseW = isPortrait ? PB.WIDTH : PITCH_LENGTH
    const baseH = isPortrait ? PITCH_LENGTH : PB.WIDTH

    const scale = Math.min(availableWidth / baseW, availableHeight / baseH)

    return {
      width: baseW * scale,
      height: baseH * scale,
      offsetX: (screenWidth - baseW * scale) / 2,
      offsetY: (screenHeight - baseH * scale) / 2,
      scale,
      isPortrait
    }
  }

  static getConstants() {
    return {
      PITCH_LENGTH,
      GOAL_LINE_LEFT,
      GOAL_LINE_RIGHT,
      CENTER_X,
      CENTER_Y
    }
  }

  constructor(scene, screenWidth, screenHeight) {
    this.scene = scene
    const layout = Pitch.computeLayout(screenWidth, screenHeight)

    this.pixelWidth = layout.width
    this.pixelHeight = layout.height
    this.offsetX = layout.offsetX
    this.offsetY = layout.offsetY
    this.scale = layout.scale
    this.isPortrait = layout.isPortrait

    this.width = PITCH_LENGTH
    this.height = PB.WIDTH
    this.unitSize = this.scale

    this.graphics = scene.add.graphics()
    this.draw()
  }

  getBounds() {
    return { x: 0, y: 0, width: PITCH_LENGTH, height: PB.WIDTH }
  }

  pitchToPixelX(px, py) {
    if (this.isPortrait) {
      return this.offsetX + (PB.WIDTH - py) * this.scale
    }
    return this.offsetX + px * this.scale
  }

  pitchToPixelY(px, py) {
    if (this.isPortrait) {
      return this.offsetY + px * this.scale
    }
    return this.offsetY + py * this.scale
  }

  pixelToPitchX(sx, sy) {
    if (this.isPortrait) {
      return (sy - this.offsetY) / this.scale
    }
    return (sx - this.offsetX) / this.scale
  }

  pixelToPitchY(sx, sy) {
    if (this.isPortrait) {
      return PB.WIDTH - ((sx - this.offsetX) / this.scale)
    }
    return (sy - this.offsetY) / this.scale
  }

  rectToScreen(rect) {
    if (this.isPortrait) {
      return {
        x: this.offsetX + (PB.WIDTH - (rect.y + rect.height)) * this.scale,
        y: this.offsetY + rect.x * this.scale,
        width: rect.height * this.scale,
        height: rect.width * this.scale
      }
    }

    return {
      x: this.offsetX + rect.x * this.scale,
      y: this.offsetY + rect.y * this.scale,
      width: rect.width * this.scale,
      height: rect.height * this.scale
    }
  }

  getGoalLeft() {
    return {
      x: -PB.GOAL_DEPTH,
      y: CENTER_Y - PB.GOAL_WIDTH / 2,
      width: PB.GOAL_DEPTH,
      height: PB.GOAL_WIDTH
    }
  }

  getGoalRight() {
    return {
      x: GOAL_LINE_RIGHT,
      y: CENTER_Y - PB.GOAL_WIDTH / 2,
      width: PB.GOAL_DEPTH,
      height: PB.GOAL_WIDTH
    }
  }

  getAreaChicaLeft() {
    return {
      x: 0,
      y: CENTER_Y - PB.GOAL_AREA_WIDTH / 2,
      width: PB.GOAL_AREA_DEPTH,
      height: PB.GOAL_AREA_WIDTH
    }
  }

  getAreaChicaRight() {
    return {
      x: GOAL_LINE_RIGHT - PB.GOAL_AREA_DEPTH,
      y: CENTER_Y - PB.GOAL_AREA_WIDTH / 2,
      width: PB.GOAL_AREA_DEPTH,
      height: PB.GOAL_AREA_WIDTH
    }
  }

  getGoals() {
    return [
      { bounds: this.getGoalLeft(), team: 'azul' },
      { bounds: this.getGoalRight(), team: 'rojo' }
    ]
  }

  getGoalAreas() {
    const goalL = this.getGoalLeft()
    const goalR = this.getGoalRight()
    return [
      {
        x: goalL.x,
        y: goalL.y,
        width: goalL.width,
        height: goalL.height,
        goalX: goalL.x + goalL.width,
        direction: 'left'
      },
      {
        x: goalR.x,
        y: goalR.y,
        width: goalR.width,
        height: goalR.height,
        goalX: goalR.x,
        direction: 'right'
      }
    ]
  }

  draw() {
    const g = this.graphics
    g.clear()

    g.fillStyle(COLORS.PITCH_GREEN, 1)
    g.fillRect(this.offsetX, this.offsetY, this.pixelWidth, this.pixelHeight)

    g.lineStyle(2, COLORS.PITCH_LINE, 0.8)
    g.strokeRect(this.offsetX, this.offsetY, this.pixelWidth, this.pixelHeight)

    const cxPx = this.pitchToPixelX(CENTER_X, CENTER_Y)
    const cyPx = this.pitchToPixelY(CENTER_X, CENTER_Y)

    if (this.isPortrait) {
      g.strokeLineShape(new Phaser.Geom.Line(
        this.offsetX, cyPx,
        this.offsetX + this.pixelWidth, cyPx
      ))
    } else {
      g.strokeLineShape(new Phaser.Geom.Line(
        cxPx, this.offsetY,
        cxPx, this.offsetY + this.pixelHeight
      ))
    }

    g.strokeCircle(cxPx, cyPx, PB.CENTER_CIRCLE_RADIUS * this.scale)

    g.fillStyle(COLORS.PITCH_LINE, 0.8)
    g.fillCircle(cxPx, cyPx, 3)

    this.drawAreaChica(g)
  }

  drawAreaChica(g) {
    g.lineStyle(2, COLORS.PITCH_LINE, 0.6)

    const leftArea = this.rectToScreen(this.getAreaChicaLeft())
    g.strokeRect(leftArea.x, leftArea.y, leftArea.width, leftArea.height)

    const rightArea = this.rectToScreen(this.getAreaChicaRight())
    g.strokeRect(rightArea.x, rightArea.y, rightArea.width, rightArea.height)
  }
}
