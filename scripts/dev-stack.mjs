import { spawn } from 'node:child_process';

function spawnCommand(command, args, env = process.env) {
  return spawn(command, args, {
    stdio: 'inherit',
    env,
  });
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  }, 1500).unref();

  process.exit(code);
}

function wireChild(name, child) {
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (signal) {
      console.error(`${name} terminó por señal ${signal}`);
      shutdown(1);
      return;
    }

    if ((code ?? 0) !== 0) {
      console.error(`${name} terminó con código ${code}`);
      shutdown(code ?? 1);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

wireChild('vercel dev', spawnCommand('npx', ['vercel', 'dev']));
wireChild('partykit dev', spawnCommand('npx', ['partykit', 'dev']));
