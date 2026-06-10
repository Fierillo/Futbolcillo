import Phaser from 'phaser'

export class InputManager {
  constructor(scene, players, ball, pitch, onShoot) {
    this.scene = scene
    this.allPlayers = players
    this.ball = ball
    this.pitch = pitch
    this.onShoot = onShoot
    this.selectedPlayer = null
    this.isDragging = false
    this.enabled = true
    this.currentTeam = 'azul'
    this.maxDragDistance = pitch.width * 0.2

    this.kbAngle = 0
    this.kbPower = 0.5
    this.kbActive = false
    this.lastKbTime = 0

    this.graphics = scene.add.graphics()
    this.graphics.setDepth(100)

    this._onPointerDown = (pointer) => this.onPointerDown(pointer)
    this._onPointerMove = (pointer) => this.onPointerMove(pointer)
    this._onPointerUp = (pointer) => this.onPointerUp(pointer)

    scene.input.on('pointerdown', this._onPointerDown)
    scene.input.on('pointermove', this._onPointerMove)
    scene.input.on('pointerup', this._onPointerUp)

    this.keys = null
    this.keysReady = false
  }

  _initKeys() {
    if (this.keysReady) return
    this.keysReady = true
    try {
      const kb = this.scene.input.keyboard
      if (!kb) return
      this.keys = {
        left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
        up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        esc: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
        tab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
        enter: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
        space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      }
    } catch (e) {
      this.keys = null
    }
  }

  get players() {
    return this.allPlayers.filter(p => p.team === this.currentTeam)
  }

  onPointerDown(pointer) {
    if (!this.enabled) return

    for (const player of this.players) {
      const dx = pointer.x - player.sprite.x
      const dy = pointer.y - player.sprite.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < player.radius * this.pitch.scale + 10) {
        this.deselectAll()
        player.select()
        this.selectedPlayer = player
        this.isDragging = true
        this.kbActive = false
        return
      }
    }
    this.deselectAll()
  }

  onPointerMove(pointer) {
    if (!this.enabled || !this.isDragging || !this.selectedPlayer) return
    this.kbActive = false
    this.drawPointerDirection(pointer)
  }

  onPointerUp(pointer) {
    if (!this.enabled || !this.isDragging || !this.selectedPlayer) return
    this.isDragging = false

    const dx = this.selectedPlayer.sprite.x - pointer.x
    const dy = this.selectedPlayer.sprite.y - pointer.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 5) {
      this.kbActive = true
      this.kbAngle = 0
      this.kbPower = 0.5
      this.drawKb()
      return
    }

    this.executePointerShot(pointer)
  }

  updateKeyboard() {
    this._initKeys()
    if (!this.keys || !this.enabled || !this.selectedPlayer || this.isDragging) return

    const now = performance.now()
    if (now - this.lastKbTime < 60) return

    let changed = false

    if (this.keys.left.isDown) {
      this.kbAngle -= 0.07
      changed = true
    }
    if (this.keys.right.isDown) {
      this.kbAngle += 0.07
      changed = true
    }
    if (this.keys.up.isDown) {
      this.kbPower = Math.min(1, this.kbPower + 0.025)
      changed = true
    }
    if (this.keys.down.isDown) {
      this.kbPower = Math.max(0.05, this.kbPower - 0.025)
      changed = true
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      this.deselectAll()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.tab)) {
      this.switchPlayer()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.enter) || Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      this.kbShoot()
      return
    }

    if (changed) {
      this.lastKbTime = now
      this.kbActive = true
      this.drawKb()
    }
  }

  switchPlayer() {
    const teamPlayers = this.players
    if (teamPlayers.length === 0) return

    const currentIdx = this.selectedPlayer
      ? teamPlayers.indexOf(this.selectedPlayer)
      : -1

    const nextIdx = (currentIdx + 1) % teamPlayers.length
    this.deselectAll()
    teamPlayers[nextIdx].select()
    this.selectedPlayer = teamPlayers[nextIdx]
    this.kbAngle = 0
    this.kbPower = 0.5
    this.kbActive = true
    this.drawKb()
  }

  kbShoot() {
    const player = this.selectedPlayer
    if (!player) return

    const nx = Math.cos(this.kbAngle)
    const ny = Math.sin(this.kbAngle)

    player.setVelocity(
      nx * player.maxSpeed * this.kbPower,
      ny * player.maxSpeed * this.kbPower
    )

    if (this.onShoot) {
      this.onShoot(player)
    }

    this.clearVisual()
    this.deselectAll()
  }

  executePointerShot(pointer) {
    const player = this.selectedPlayer
    if (!player) return

    const dx = player.sprite.x - pointer.x
    const dy = player.sprite.y - pointer.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 5) {
      this.deselectAll()
      return
    }

    const nx = dx / dist
    const ny = dy / dist
    const power = Math.min(dist / (this.maxDragDistance * this.pitch.scale), 1)

    player.setVelocity(
      nx * player.maxSpeed * power,
      ny * player.maxSpeed * power
    )

    if (this.onShoot) {
      this.onShoot(player)
    }

    this.clearVisual()
    this.deselectAll()
  }

  drawPointerDirection(pointer) {
    this.graphics.clear()
    const player = this.selectedPlayer
    if (!player) return

    const ppx = player.sprite.x
    const ppy = player.sprite.y

    const dx = ppx - pointer.x
    const dy = ppy - pointer.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist === 0) return

    const nx = dx / dist
    const ny = dy / dist
    const power = Math.min(dist / (this.maxDragDistance * this.pitch.scale), 1)

    this._drawArrow(ppx, ppy, nx, ny, power)
  }

  drawKb() {
    this.graphics.clear()
    const player = this.selectedPlayer
    if (!player) return

    const ppx = player.sprite.x
    const ppy = player.sprite.y
    const nx = Math.cos(this.kbAngle)
    const ny = Math.sin(this.kbAngle)

    this._drawArrow(ppx, ppy, nx, ny, this.kbPower)
  }

  _drawArrow(ppx, ppy, nx, ny, power) {
    const arrowLen = 30 + power * 90
    const endX = ppx + nx * arrowLen
    const endY = ppy + ny * arrowLen

    const bodyColor = power < 0.5 ? 0x2ecc71 : power < 0.8 ? 0xf39c12 : 0xe74c3c

    this.graphics.lineStyle(4, bodyColor, 0.9)
    this.graphics.lineBetween(ppx, ppy, endX, endY)

    const perpX = -ny
    const perpY = nx
    this.graphics.fillStyle(bodyColor, 0.9)
    this.graphics.fillPoints([
      { x: endX + nx * 14, y: endY + ny * 14 },
      { x: endX + perpX * 10, y: endY + perpY * 10 },
      { x: endX - perpX * 10, y: endY - perpY * 10 }
    ], true)
  }

  selectPlayer(player) {
    this.deselectAll()
    player.select()
    this.selectedPlayer = player
    this.kbAngle = 0
    this.kbPower = 0.5
    this.kbActive = true
    this.drawKb()
  }

  deselectAll() {
    for (const player of this.allPlayers) {
      player.deselect()
    }
    this.selectedPlayer = null
    this.kbActive = false
    this.clearVisual()
  }

  clearVisual() {
    this.graphics.clear()
  }

  enable() {
    this.enabled = true
  }

  disable() {
    this.enabled = false
    this.deselectAll()
  }

  destroy() {
    this.scene.input.off('pointerdown', this._onPointerDown)
    this.scene.input.off('pointermove', this._onPointerMove)
    this.scene.input.off('pointerup', this._onPointerUp)
    this.clearVisual()
  }
}
