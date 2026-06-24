import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import net from 'node:net';

function pickLanAddress() {
  const nets = networkInterfaces();

  for (const entries of Object.values(nets)) {
    if (!entries) continue;

    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('192.168.') || entry.address.startsWith('10.') || entry.address.startsWith('172.')) {
        return entry.address;
      }
    }
  }

  return '127.0.0.1';
}

async function findFreePort(startPort) {
  function canListen(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen(port, '0.0.0.0', () => {
        server.close(() => resolve(true));
      });
    });
  }

  let port = startPort;
  while (!(await canListen(port))) {
    port += 1;
  }
  return port;
}

const lanIp = pickLanAddress();
const requestedPort = Number(process.env.PORT || '3000');
const port = await findFreePort(requestedPort);
const publicUrl = `http://${lanIp}:${port}`;

console.log(`Starting LAN dev server at ${publicUrl}`);

const child = spawn('npx', ['vercel', 'dev', '--listen', `0.0.0.0:${port}`], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    VITE_PUBLIC_APP_URL: process.env.VITE_PUBLIC_APP_URL || publicUrl,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
