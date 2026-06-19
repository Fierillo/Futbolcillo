import Phaser from 'phaser'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    const { width, height } = this.scale

    this.cameras.main.setBackgroundColor('#061018')

    const g = this.add.graphics()

    g.fillStyle(0x061018, 1)
    g.fillRect(0, 0, width, height)

    g.fillStyle(0xffffff, 0.06)
    g.fillCircle(width * 0.14, height * 0.12, Math.min(width, height) * 0.14)
    g.fillCircle(width * 0.5, height * 0.08, Math.min(width, height) * 0.18)
    g.fillCircle(width * 0.86, height * 0.12, Math.min(width, height) * 0.14)

    const titleY = height * 0.07
    const subtitleY = height * 0.13
    const heroMarginX = width * 0.06
    const heroY = height * 0.19
    const heroW = width - heroMarginX * 2
    const heroH = Math.min(height * 0.44, heroW * 0.55)
    const btnY = heroY + heroH + height * 0.04
    const rulesY = btnY + 76

    g.fillStyle(0x0e2234, 0.92)
    g.fillRoundedRect(heroMarginX, heroY, heroW, heroH, 28)
    g.lineStyle(2, 0x2d5f80, 1)
    g.strokeRoundedRect(heroMarginX, heroY, heroW, heroH, 28)

    const pitchX = heroMarginX + heroW * 0.04
    const pitchY = heroY + heroH * 0.06
    const pitchW = heroW * 0.92
    const pitchH = heroH * 0.88

    g.fillStyle(0x249e5c, 1)
    g.fillRoundedRect(pitchX, pitchY, pitchW, pitchH, 22)

    for (let i = 0; i < 9; i++) {
      const stripeY = pitchY + (pitchH / 9) * i
      g.fillStyle(i % 2 === 0 ? 0x2fae67 : 0x259657, 0.55)
      g.fillRect(pitchX, stripeY, pitchW, pitchH / 9)
    }

    g.lineStyle(3, 0xfffbf0, 0.9)
    g.strokeRoundedRect(pitchX, pitchY, pitchW, pitchH, 22)
    g.strokeLineShape(new Phaser.Geom.Line(pitchX + pitchW / 2, pitchY, pitchX + pitchW / 2, pitchY + pitchH))
    g.strokeCircle(pitchX + pitchW / 2, pitchY + pitchH / 2, Math.min(pitchW, pitchH) * 0.16)
    g.lineStyle(2, 0xfffbf0, 0.6)
    g.strokeRect(pitchX, pitchY + pitchH * 0.34, pitchW * 0.13, pitchH * 0.32)
    g.strokeRect(pitchX + pitchW * 0.87, pitchY + pitchH * 0.34, pitchW * 0.13, pitchH * 0.32)

    g.fillStyle(0x3e8dff, 1)
    g.fillCircle(pitchX + pitchW * 0.23, pitchY + pitchH * 0.5, 13)
    g.fillCircle(pitchX + pitchW * 0.33, pitchY + pitchH * 0.38, 13)
    g.fillCircle(pitchX + pitchW * 0.33, pitchY + pitchH * 0.62, 13)
    g.fillCircle(pitchX + pitchW * 0.46, pitchY + pitchH * 0.5, 13)

    g.fillStyle(0xff5568, 1)
    g.fillCircle(pitchX + pitchW * 0.77, pitchY + pitchH * 0.5, 13)
    g.fillCircle(pitchX + pitchW * 0.67, pitchY + pitchH * 0.38, 13)
    g.fillCircle(pitchX + pitchW * 0.67, pitchY + pitchH * 0.62, 13)
    g.fillCircle(pitchX + pitchW * 0.54, pitchY + pitchH * 0.5, 13)

    g.fillStyle(0xffc533, 1)
    g.fillCircle(pitchX + pitchW / 2, pitchY + pitchH / 2, 8)

    this.add.text(width / 2, titleY, 'FUTBOLCILLO', {
      fontSize: `${Math.min(width * 0.1, 64)}px`,
      fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
      color: '#fffdf6',
      fontStyle: 'bold',
      stroke: '#06111d',
      strokeThickness: 5,
      letterSpacing: 3
    }).setOrigin(0.5)

    this.add.text(width / 2, subtitleY, 'NOCHE DE PARTIDO · CHOQUE · ANGULO · GOL', {
      fontSize: `${Math.min(width * 0.022, 16)}px`,
      fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
      color: '#ffe48a',
      letterSpacing: 1
    }).setOrigin(0.5)

    const playBg = this.add.graphics()
    const btnW = Math.min(width * 0.4, 220)
    const btnH = 58
    const btnX = width / 2 - btnW / 2

    playBg.fillStyle(0xffc533, 1)
    playBg.fillRoundedRect(btnX, btnY, btnW, btnH, 20)
    playBg.lineStyle(4, 0xffe79a, 1)
    playBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 20)

    this.add.text(width / 2, btnY + btnH / 2, 'JUGAR', {
      fontSize: '30px',
      fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
      color: '#07111d',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    const playZone = this.add.zone(width / 2, btnY + btnH / 2, btnW, btnH).setInteractive({ useHandCursor: true })

    playZone.on('pointerover', () => {
      playBg.clear()
      playBg.fillStyle(0xffd455, 1)
      playBg.fillRoundedRect(btnX, btnY, btnW, btnH, 20)
      playBg.lineStyle(4, 0xfff0b6, 1)
      playBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 20)
    })

    playZone.on('pointerout', () => {
      playBg.clear()
      playBg.fillStyle(0xffc533, 1)
      playBg.fillRoundedRect(btnX, btnY, btnW, btnH, 20)
      playBg.lineStyle(4, 0xffe79a, 1)
      playBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 20)
    })

    playZone.on('pointerdown', () => {
      this.scene.start('GameScene')
    })

    const rules = [
      { text: 'AZUL VS ROJO', color: '#fffdf6' },
      { text: 'Arrastra para cargar el remate', color: '#dbe7ef' },
      { text: 'La pelota sale segun el angulo del choque', color: '#dbe7ef' },
      { text: 'Falta = 2 turnos para el rival', color: '#ffd166' }
    ]

    rules.forEach((rule, i) => {
      this.add.text(width / 2, rulesY + i * 24, rule.text, {
        fontSize: `${Math.min(width * 0.022, 14)}px`,
        fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
        color: rule.color,
        align: 'center'
      }).setOrigin(0.5)
    })
  }
}
