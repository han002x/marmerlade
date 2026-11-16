import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'node:http';
import { appendFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const directory = fileURLToPath(new URL('.', import.meta.url));
const client = new Client({ name: 'marmerlade-product-walkthrough', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), '--file', resolve(directory, 'walkthrough.marmerlade.json')], stderr: 'pipe' });
transport.stderr?.on('data', data => process.stderr.write(data));
await client.connect(transport);
const server = createServer(async (req, res) => {
  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    const result = request.resource
      ? await client.readResource({ uri: request.resource })
      : request.list ? await client.listTools()
      : await client.callTool({ name: request.name, arguments: request.args ?? {} }, undefined, { timeout: 240_000 });
    const metadata = result.content?.filter(item => item.type === 'text').map(item => {
      try { return JSON.parse(item.text); } catch { return item.text; }
    });
    const output = metadata ? { isError: Boolean(result.isError), data: metadata[0] } : result;
    await appendFile(resolve(directory, 'mcp-evidence.jsonl'), JSON.stringify({ at: new Date().toISOString(), request, result: output }) + '\n');
    res.writeHead(result.isError ? 422 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(output));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const endpoint = `http://127.0.0.1:${server.address().port}`;
await writeFile(resolve(directory, 'session.json'), JSON.stringify({ endpoint }));
console.log(JSON.stringify({ endpoint }));
async function stop() { server.close(); await client.close(); process.exit(); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
