const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/serve');

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, (response) => {
      let bytes = 0;
      response.on('data', (chunk) => { bytes += chunk.length; });
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], bytes }));
    }).on('error', reject);
  });
}

test('static server returns the application resources', async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const { port } = server.address();

  const responses = await Promise.all([
    request(port, '/'),
    request(port, '/assets/styles.css'),
    request(port, '/assets/app.js'),
    request(port, '/data/question-bank.js'),
    request(port, '/assets/questions/c21t4.png')
  ]);

  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200]);
  assert.deepEqual(responses.map((response) => response.type), [
    'text/html; charset=utf-8',
    'text/css; charset=utf-8',
    'text/javascript; charset=utf-8',
    'text/javascript; charset=utf-8',
    'image/png'
  ]);
  assert.ok(responses.every((response) => response.bytes > 0));
});
