// Node.JS Websocket Eos Chat Server

const ws = require('websockets');
const fs = require('fs');

const SSL = {
  key: fs.readFileSync('private.key'),
  cert: fs.readFileSync('certificate.crt')
}

var USERS = { }

// set up SSL websocket
var server = ws.createServer(SSL);
server.on('connect', function(sock) {
  console.log('new connection');
  sock.on('message', function(json) {
    console.log(json);
    var data = JSON.parse(json);
    switch (data.type){
      case 'id':
        USERS[data.uid] = sock;
        break;
    }
  });
}).listen(443);
