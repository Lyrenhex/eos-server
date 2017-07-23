// Node.JS Websocket Eos Chat Server

const ws = require('websockets');
const fs = require('fs');

const SSL = {
  key: fs.readFileSync('private.key'),
  cert: fs.readFileSync('certificate.crt')
}

// set up SSL websocket
var server = ws.createServer(SSL);
server.on('connect', function(sock) {
  console.log('connection: ', sock);
}).listen(443);
