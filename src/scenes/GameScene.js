import Phaser from 'phaser'
import { Pitch } from '../pitch/Pitch.js'
import { TeamManager } from '../teams/TeamManager.js'
import { Ball } from '../entities/Ball.js'
import { Goal } from '../entities/Goal.js'
import { PhysicsEngine } from '../physics/PhysicsEngine.js'
import { InputManager } from '../input/InputManager.js'
import { AIController } from '../ai/AIController.js'
import { COLORS } from '../config/constants.js'

const MOVES_PER_TURN = 3

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b1324')

    this.score = { rojo: 0, azul: 0 }
    this.currentTeam = 'azul'
    this.isSimulating = false
    this.turnActive = true
    this.foulCommitted = false
    this.movesRemaining = MOVES_PER_TURN

    const { width, height } = this.scale
    this.setupField(width, height)

    this.scale.on('resize', (gameSize) => {
      this.handleResize(gameSize.width, gameSize.height)
    })
  }

  setupField(width, height) {
    this.pitch = new Pitch(this, width, height)
    this.pitchBounds = this.pitch.getBounds()

    const teamManager = new TeamManager(this, this.pitch)
    this.teams = teamManager.createTeams()
    this.teamManager = teamManager

    const cx = this.pitchBounds.x + this.pitchBounds.width / 2
    const cy = this.pitchBounds.y + this.pitchBounds.height / 2

    this.ball = new Ball(this, cx, cy, this.pitch)

    this.initialPositions = this.getAllPlayers().map(p => ({
      x: p.x, y: p.y
    }))

    this.goals = this.pitch.getGoals().map(g => new Goal(
      this,
      g.bounds.x, g.bounds.y,
      g.bounds.width, g.bounds.height,
      g.team,
      this.pitch
    ))

    this.goalAreas = this.pitch.getGoalAreas()

    this.physicsEngine = new PhysicsEngine(this.pitchBounds, this.goalAreas)
    this.physicsEngine.onFoul = () => this.onFoulDetected()
    this.physicsEngine.onGoal = (goal) => this.onGoalScored(goal)

    this.aiController = new AIController(teamManager, this.ball, this.pitchBounds)

    this.inputManager = new InputManager(
      this,
      this.getAllPlayers(),
      this.ball,
      this.pitch,
      (player) => this.onShot(player)
    )

    this.ballCarrierIndicator = this.add.graphics()
    this.ballCarrierIndicator.setDepth(95)

    this.createUI()
    this.updateUI()
  }

  handleResize(width, height) {
    this.cameras.main.setBackgroundColor('#0b1324')

    if (this.inputManager) this.inputManager.destroy()
    if (this.pitch && this.pitch.graphics) this.pitch.graphics.destroy()
    if (this.uiBar) this.uiBar.destroy()
    if (this.scoreTextAzul) this.scoreTextAzul.destroy()
    if (this.scoreTextRojo) this.scoreTextRojo.destroy()
    if (this.turnText) this.turnText.destroy()
    if (this.messageText) this.messageText.destroy()
    if (this.ballCarrierIndicator) this.ballCarrierIndicator.destroy()

    for (const team of Object.values(this.teams)) {
      for (const p of team) {
        p.sprite.destroy()
        p.selectionRing.destroy()
      }
    }
    if (this.ball) this.ball.sprite.destroy()
    if (this.goals) {
      for (const g of this.goals) g.rectangle.destroy()
    }

    this.setupField(width, height)
  }

  getAllPlayers() {
    return [...this.teams.rojo, ...this.teams.azul]
  }

  createUI() {
    const { width, height } = this.scale

    const barH = 68
    this.uiBar = this.add.graphics()
    this.uiBar.fillStyle(0x07101a, 0.98)
    this.uiBar.fillRect(0, 0, width, barH)
    this.uiBar.fillStyle(0x3e8dff, 1)
    this.uiBar.fillRoundedRect(width * 0.04, 11, width * 0.25, 44, 16)
    this.uiBar.fillStyle(0xff4355, 1)
    this.uiBar.fillRoundedRect(width * 0.71, 11, width * 0.25, 44, 16)
    this.uiBar.fillStyle(0x142334, 1)
    this.uiBar.fillRoundedRect(width * 0.345, 13, width * 0.31, 40, 14)
    this.uiBar.fillStyle(0xffc533, 1)
    this.uiBar.fillRect(width * 0.345, 13, width * 0.31, 4)
    this.uiBar.lineStyle(1, 0x254760, 1)
    this.uiBar.lineBetween(0, barH, width, barH)
    this.uiBar.setDepth(90)

    this.scoreTextAzul = this.add.text(width * 0.2, barH / 2, 'AZUL  0', {
      fontSize: '26px',
      fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(91)

    this.scoreTextRojo = this.add.text(width * 0.8, barH / 2, 'ROJO  0', {
      fontSize: '26px',
      fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(91)

    this.turnText = this.add.text(width / 2, barH / 2, '', {
      fontSize: '19px',
      fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
      color: '#fffdf6',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(91)

    this.messageText = this.add.text(width / 2, height / 2, '', {
      fontSize: '36px',
      fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
      color: '#fffdf6',
      fontStyle: 'bold',
      stroke: '#08111d',
      strokeThickness: 4,
      backgroundColor: '#122235ee',
      padding: { x: 30, y: 15 }
    }).setOrigin(0.5).setAlpha(0).setDepth(200)
  }

  updateUI() {
    this.scoreTextAzul.setText(`AZUL  ${this.score.azul}`)
    this.scoreTextRojo.setText(`ROJO  ${this.score.rojo}`)

    const turnColor = this.currentTeam === 'azul' ? '#82c7ff' : '#ff8a8a'
    let turnLabel = this.currentTeam === 'azul' ? 'TU TURNO' : 'TURNO IA'
    turnLabel += ` (${this.movesRemaining})`
    this.turnText.setText(turnLabel)
    this.turnText.setStyle({ color: turnColor })
  }

  showMessage(text, duration = 2000) {
    this.messageText.setText(text)
    this.messageText.setAlpha(1)
    this.time.delayedCall(duration, () => {
      this.messageText.setAlpha(0)
    })
  }

  onShot(player) {
    if (this.movesRemaining <= 0) {
      this.switchTurn()
      return
    }
    this.movesRemaining--
    this.turnActive = false
    this.isSimulating = true
    this.physicsEngine.reset()

    this.inputManager.disable()
    this.inputManager.deselectAll()
  }

  onFoulDetected() {
    this.foulCommitted = true
  }

  onGoalScored(goal) {
    const scoringTeam = goal.team === 'rojo' ? 'azul' : 'rojo'
    if (scoringTeam === 'rojo') {
      this.score.rojo++
    } else {
      this.score.azul++
    }
    this.updateUI()
  }

  update(time, delta) {
    this.inputManager.updateKeyboard()
    this.updateBallCarrierIndicator()

    if (!this.isSimulating) return

    for (const player of this.getAllPlayers()) {
      if (player.isGoalkeeper) {
        const area = player.team === 'azul'
          ? this.pitch.getAreaChicaLeft()
          : this.pitch.getAreaChicaRight()
        this.physicsEngine.applyGoalkeeperRestriction(player, area)
      }
    }

    const result = this.physicsEngine.simulate(1, this.ball, this.getAllPlayers(), this.goals)

    if (result.foul) {
      if (!this.foulCommitted) {
        this.foulCommitted = true
      }
    }

    if (result.goal) {
      const scoringTeam = result.goal.team === 'rojo' ? 'AZUL' : 'ROJO'
      const receivingTeam = result.goal.team
      this.showMessage(`GOAL ${scoringTeam}!`, 2000)
      this.time.delayedCall(2500, () => this.resetPositions(receivingTeam))
      this.isSimulating = false
      return
    }

    if (result.allStopped) {
      this.isSimulating = false

      if (this.foulCommitted) {
        this.foulCommitted = false
        this.movesRemaining = MOVES_PER_TURN + 1
        this.currentTeam = this.currentTeam === 'azul' ? 'rojo' : 'azul'
        this.inputManager.currentTeam = this.currentTeam
        this.showMessage('FALTA - Turno extra para rival', 1500)
        this.enableTurn()
        return
      }

      if (this.movesRemaining > 0) {
        this.enableTurn()
      } else {
        this.switchTurn()
      }
    }
  }

  updateBallCarrierIndicator() {
    this.ballCarrierIndicator.clear()
  }

  enableTurn() {
    this.turnActive = true
    this.updateUI()

    if (this.currentTeam === 'azul') {
      this.inputManager.enable()
    } else {
      this.inputManager.disable()
      this.time.delayedCall(600, () => {
        this.aiController.executeTurn('rojo', () => {
          this.onShot(null)
        })
      })
      this.time.delayedCall(3000, () => {
        if (this.currentTeam === 'rojo' && !this.isSimulating) {
          this.movesRemaining = 0
          this.switchTurn()
        }
      })
    }
  }

  switchTurn() {
    this.movesRemaining = MOVES_PER_TURN
    this.currentTeam = this.currentTeam === 'azul' ? 'rojo' : 'azul'
    this.inputManager.currentTeam = this.currentTeam
    this.enableTurn()
  }

  resetPositions(initialTeam = 'azul') {
    const bounds = this.pitchBounds
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2

    this.ball.reset(cx, cy)

    const players = this.getAllPlayers()
    for (let i = 0; i < players.length; i++) {
      players[i].reset(this.initialPositions[i].x, this.initialPositions[i].y)
    }

    this.currentTeam = initialTeam
    this.movesRemaining = MOVES_PER_TURN
    this.inputManager.currentTeam = initialTeam
    this.enableTurn()
  }
}
