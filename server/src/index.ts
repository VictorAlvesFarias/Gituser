import { startServer } from './app.ts';
import { paths } from './paths.ts';

const { port } = await startServer(Number(process.env.PORT ?? 4311));
console.log(`Gituser API on http://localhost:${port} (data: ${paths.dataDir})`);
