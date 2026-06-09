const http = require('http');

const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 3001;
const PORT = Number(process.env.COMMAND_CENTER_PORT || 3010);

function rewritePath(url = '/') {
  if (url === '/' || url === '') return '/command-center';
  return url;
}

const server = http.createServer((req, res) => {
  const path = rewritePath(req.url || '/');

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${TARGET_HOST}:${TARGET_PORT}`,
        connection: 'close',
      },
    },
    (proxyRes) => {
      const headers = { ...proxyRes.headers };
      delete headers['content-length'];
      headers.connection = 'close';
      res.writeHead(proxyRes.statusCode || 502, headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Command Center proxy error: ${error.message}`);
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`command-center-proxy listening on http://0.0.0.0:${PORT}`);
});
