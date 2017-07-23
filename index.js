// Node.JS Websocket Eos Chat Server

const ws = require('websockets');
const fs = require('fs');

const SSL = {
  key: fs.readFileSync('private.key'),
  cert: fs.readFileSync('certificate.crt')
}

var USERS = {};
var PAIRS = [];
var WAITS = [];

// set up SSL websocket
var server = ws.createServer(SSL);
server.on('connect', function(sock) {
  console.log('new connection');
  sock.on('message', function(json) {
    var data = JSON.parse(json);
    console.log(data);
    switch (data.type){
      case 'id':
        console.log(USERS[data.uid]);
        if(USERS[data.uid] !== undefined){
          USERS[data.uid] = {socket: sock, pair: null}
          if(WAITS.length === 0){
            WAITS.push(data.uid);
            console.log('user now waiting: ', data.uid);
          } else {
            var newLen = PAIRS.push([WAITS[0], data.uid]);
            USERS[data.uid].pair = newLen - 1;
            var removed = WAITS.splice(0, 1);
            console.log('paired waiting user: ', removed);
          }
        }else{
          // TODO: handle multiple instances of same account somehow
        }
        break;
    }
  });
}).listen(443);
