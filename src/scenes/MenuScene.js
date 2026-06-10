import Phaser from 'phaser'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    const { width, height } = this.scale

    this.cameras.main.setBackgroundColor('#0b1324')

    const g = this.add.graphics()

    g.fillStyle(0x09111f, 1)
    g.fillRect(0, 0, width, height)

    g.fillStyle(0x11364f, 0.9)
    g.fillRect(0, height * 0.1, width, height * 0.8)

    g.fillStyle(0x1d6b45, 0.85)
    g.fillRect(0, height * 0.18, width, height * 0.64)

    for (let i = 0; i < 12; i++) {
      const y = height * 0.18 + (height * 0.64 / 12) * i
      g.fillStyle(i % 2 === 0 ? 0x1f7448 : 0x256e43, 0.6)
      g.fillRect(0, y, width, height * 0.64 / 12)
    }

    g.fillStyle(0x7dd3fc, 0.08)
    g.fillCircle(width * 0.16, height * 0.22, Math.min(width, height) * 0.18)
    g.fillStyle(0xffb703, 0.06)
    g.fillCircle(width * 0.84, height * 0.78, Math.min(width, height) * 0.16)

    g.lineStyle(3, 0xf8fafc, 0.35)
    g.strokeRect(width * 0.1, height * 0.2, width * 0.8, height * 0.6)
    g.strokeLineShape(new Phaser.Geom.Line(width / 2, height * 0.2, width / 2, height * 0.8))
    g.strokeCircle(width / 2, height * 0.5, Math.min(width, height) * 0.12)

    const title = this.add.text(width / 2, height * 0.08, 'FUTBOLCILLO', {
      fontSize: `${Math.min(width * 0.12, 72)}px`,
      fontFamily: '"Trebuchet MS", Arial, sans-serif',
      color: '#f8fafc',
      fontStyle: 'bold',
      stroke: '#09111f',
      strokeThickness: 5
    }).setOrigin(0.5)

    const subtitle = this.add.text(width / 2, height * 0.88, 'Futbol por turnos · Pool style', {
      fontSize: `${Math.min(width * 0.03, 18)}px`,
      fontFamily: '"Trebuchet MS", Arial, sans-serif',
      color: '#cbd5e1'
    }).setOrigin(0.5)

    const playBg = this.add.graphics()
    const btnW = Math.min(width * 0.4, 200)
    const btnH = 56
    const btnX = width / 2 - btnW / 2
    const btnY = height * 0.47

    playBg.fillStyle(0xffb703, 1)
    playBg.fillRoundedRect(btnX, btnY, btnW, btnH, 12)
    playBg.lineStyle(2, 0xffc93c, 1)
    playBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 12)

    const playText = this.add.text(width / 2, btnY + btnH / 2, 'JUGAR', {
      fontSize: '28px',
      fontFamily: '"Trebuchet MS", Arial, sans-serif',
      color: '#09111f',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    const playZone = this.add.zone(width / 2, btnY + btnH / 2, btnW, btnH).setInteractive({ useHandCursor: true })

    playZone.on('pointerover', () => {
      playBg.clear()
      playBg.fillStyle(0xffc93c, 1)
      playBg.fillRoundedRect(btnX, btnY, btnW, btnH, 12)
      playBg.lineStyle(2, 0xffd76a, 1)
      playBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 12)
    })

    playZone.on('pointerout', () => {
      playBg.clear()
      playBg.fillStyle(0xffb703, 1)
      playBg.fillRoundedRect(btnX, btnY, btnW, btnH, 12)
      playBg.lineStyle(2, 0xffc93c, 1)
      playBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 12)
    })

    playZone.on('pointerdown', () => {
      this.scene.start('GameScene')
    })

    const rulesY = height * 0.65
    const rules = [
      { text: 'TU EQUIPO: AZUL', color: '#82c7ff' },
      { text: 'IA: ROJO', color: '#ff8a8a' },
      { text: '', color: '#cbd5e1' },
      { text: 'Estira hacia atras para apuntar', color: '#cbd5e1' },
      { text: 'La pelota sale en la direccion de la guia', color: '#cbd5e1' },
      { text: 'Falta = 2 turnos para el rival', color: '#ffb703' }
    ]

    rules.forEach((rule, i) => {
      this.add.text(width / 2, rulesY + i * 26, rule.text, {
        fontSize: `${Math.min(width * 0.028, 15)}px`,
        fontFamily: '"Trebuchet MS", Arial, sans-serif',
        color: rule.color,
        align: 'center'
      }).setOrigin(0.5)
    })
  }
}
