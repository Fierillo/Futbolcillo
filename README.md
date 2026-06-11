# ⚽ Futbolcillo

![Phaser.js](https://img.shields.io/badge/Phaser.js-3.90-0f88f2?style=flat&logo=phaser&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6.4-646cff?style=flat&logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-4.1-6e9f18?style=flat&logo=vitest&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-f7df1e?style=flat&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-ISC-blue?style=flat)

Minimalist turn-based 2D football game with pool-style physics.

## How to Play

**Mouse:**
- Click on a disc to select it
- Drag to aim (arrow shows direction)
- Release to shoot

**Keyboard** (after selecting a disc):
- `←` `→` — change direction
- `↑` `↓` — increase/decrease power
- `Enter` / `Space` — shoot
- `Esc` — cancel selection
- `Tab` — switch player

## Rules

- You play as **BLUE**, AI plays as **RED**
- Pool-style physics: ball moves based on collision angle
- Foul = extra turn for rival
- Goal = ball enters the goal area behind the pitch

## Install

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## License

ISC
