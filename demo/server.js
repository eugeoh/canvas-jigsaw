import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

createServer((request, response) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    const relativePath = pathname === '/' ? 'demo/index.html' : pathname.slice(1);
    const filePath = normalize(join(root, relativePath));
    const pathFromRoot = relative(root, filePath);

    if (pathFromRoot.startsWith('..') || pathFromRoot === '') {
        response.writeHead(403).end('Forbidden');
        return;
    }

    try {
        if (!statSync(filePath).isFile()) throw new Error('Not a file');
        response.writeHead(200, {
            'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream'
        });
        createReadStream(filePath).pipe(response);
    } catch {
        response.writeHead(404).end('Not found');
    }
}).listen(port, () => {
    console.log(`canvas-jigsaw demo: http://localhost:${port}`);
});
