// Local MongoDB for development and the tests: `bun run db:up` / `bun run db:down`.
//
// With Docker running, the compose service of compose.yaml (mongo:7, data in a Docker volume).
// Without it (a cloud session's container has no Docker daemon), a `mongod` installed on the
// machine (MongoDB 7, as in production), started in the background on 127.0.0.1 with its data
// in .mongo/ at the repository root (gitignored). MONGO_PORT changes the port in both cases
// (default 27017).
import { existsSync, mkdirSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const port = Number(process.env.MONGO_PORT ?? 27017);
const dataDir = join(root, '.mongo', 'data');
const logPath = join(root, '.mongo', 'mongod.log');

const run = (command: string[]) =>
	Bun.spawnSync(command, { cwd: root, stdio: ['inherit', 'inherit', 'inherit'] }).exitCode ?? 1;

const quiet = (command: string[]) => {
	try {
		return Bun.spawnSync(command, { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] }).exitCode;
	} catch {
		return 1; // not installed
	}
};

const dockerRunning = () => quiet(['docker', 'info']) === 0;

const listening = () =>
	new Promise<boolean>((resolve) => {
		const socket = connect({ host: '127.0.0.1', port });
		socket.once('connect', () => {
			socket.end();
			resolve(true);
		});
		socket.once('error', () => resolve(false));
	});

async function up() {
	if (dockerRunning()) return run(['docker', 'compose', 'up', '-d', '--wait']);
	if (await listening()) {
		console.log(`MongoDB already answers on 127.0.0.1:${port}.`);
		return 0;
	}
	if (quiet(['mongod', '--version']) !== 0) {
		console.error(
			'Neither Docker nor mongod is available: start Docker, or install MongoDB 7 (see "Cloud sessions" in CLAUDE.md).'
		);
		return 1;
	}
	mkdirSync(dataDir, { recursive: true });
	// --fork returns once the server accepts connections
	const code = run([
		'mongod',
		'--dbpath',
		dataDir,
		'--bind_ip',
		'127.0.0.1',
		'--port',
		String(port),
		'--fork',
		'--logpath',
		logPath
	]);
	if (code === 0) console.log(`MongoDB runs on 127.0.0.1:${port} (data in .mongo/data).`);
	return code;
}

async function down() {
	if (dockerRunning()) return run(['docker', 'compose', 'down']);
	if (!existsSync(dataDir) || !(await listening())) {
		console.log('No local MongoDB is running.');
		return 0;
	}
	// Quiet: mongod prints its whole shutdown log
	const code = quiet(['mongod', '--shutdown', '--dbpath', dataDir]);
	console.log(
		code === 0 ? 'MongoDB stopped.' : `mongod --shutdown failed (${code}): see .mongo/mongod.log`
	);
	return code;
}

const command = process.argv[2];
if (command !== 'up' && command !== 'down') {
	console.error('Usage: bun scripts/db.ts up|down');
	process.exit(2);
}
process.exit(await (command === 'up' ? up() : down()));
