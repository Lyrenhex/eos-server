/*
 * Eos Backend Chat Server
 * 
 * Copyright (c) Damian Heaton 2017 All rights reserved.
 * 
 * This software is designed to operate on a UBUNTU 17.04 machine running NODEJS
 * and NPM.
 * 
 * A TLS key MUST be provided in /etc/letsencrypt/live/prod.chat.eos.dheaton.uk, or 
 * /etc/letsencrypt/live/staging.chat.eos.dheaton.uk - whichever is appropriate for the
 * branch that the server is operating on.
 * 
 * Production servers MUST contain a file named 'prod' (WITHOUT file extension) in the
 * directory above this one.
 * 
 * Server operates on port 9874
 */

const ws = require('websockets');
const fs = require('fs');
const request = require('request');
const firebase = require('firebase');

// if we have a 'prod' file, then the server is production grade
const branch = (fs.existsSync('../prod') ? "prod" : "staging");

// load the SSL certificate and private key into memory
// SSL is required for any websocket connections originating from HTTPS
const SSL = {
  key: fs.readFileSync(`/etc/letsencrypt/live/${branch}.chat.eos.dheaton.uk/privkey.pem`),
  cert: fs.readFileSync(`/etc/letsencrypt/live/${branch}.chat.eos.dheaton.uk/fullchain.pem`)
}

const HEADERS = {
    'Content-Type': 'application/json'
};

var USERS = {};
var PAIRS = [];
var PAIRS_HISTORY = {};
var WAITS = [];
var CONFIG;
var server;

var config = {
  apiKey: "AIzaSyAR1zmwaotOgqX3EKEkUDPzM26FaujxEKY",
  authDomain: "solace-171915.firebaseapp.com",
  databaseURL: "https://solace-171915.firebaseio.com",
  projectId: "solace-171915",
  storageBucket: "solace-171915.appspot.com",
  messagingSenderId: "930975983513"
};
firebase.initializeApp(config);

// get config settings, and initialize the server
var confRef = firebase.database().ref(`/config/${branch}`);
confRef.on('value', function(snapshot){
  CONFIG = snapshot.val();
  try {
    init();
  } catch(err) {
    server = null;
    setTimeout(init, 1000);
  }
});

function init() {
  console.log('starting server');
  // set up SSL websocket
  server = ws.createServer(SSL);
  server.on('connect', function(sock) {
    var DATA;
    console.log('new connection');
    sock.on('close', function(){
      console.log(`user ${DATA.uid} closed connection`);
      try {
        if(USERS[DATA.uid].pair !== null && USERS[DATA.uid].pair !== undefined){ // they were paired with someone
          var pair = PAIRS[USERS[DATA.uid].pair];
          pair.forEach(function(uid){
            if(uid !== DATA.uid){
              // it's the other party
              USERS[uid].pair = null;
              USERS[uid].socket.close(); // close the connection to the other party
            }
          });
        }else if(WAITS.indexOf(DATA.uid) >= 0){
          WAITS.splice(WAITS.indexOf(DATA.uid), 1);
        }
      } catch (TypeError) {
        // fucking hell, websockets in browsers are a royal pain in the ass
      }
      USERS[DATA.uid] = undefined; // kill user's data.
    });
    sock.on('message', function(json) {
      var data = JSON.parse(json);
      console.log(data);
      switch (data.type){
        case 'id':
          DATA = data;
          USERS[data.uid] = {socket: sock, pair: null, holds: []}
          console.log(WAITS);
          if(WAITS.length === 0){
            WAITS.push(data.uid);
            console.log('user now waiting: ', data.uid);
          } else {
            WAITS.some(function(waiter, index){
              if (waiter !== data.uid) {
                var newLen = PAIRS.push([WAITS[index], data.uid]);
                USERS[data.uid].pair = newLen - 1;
                PAIRS_HISTORY[newLen - 1] = [];
                var removed = WAITS.splice(index, 1);
                console.log(`paired waiting user ${removed} with ${data.uid}`);
                USERS[removed].pair = newLen - 1;
                sock.send(JSON.stringify({type:'init'}));
                USERS[removed].socket.send(JSON.stringify({type:'init'}));
                return true;
              }
            })
          }
          break;
        case 'msg':
          /* message packets should be structured as:
            type: 'msg',
            text: user's message,
            uid: sender's user id
          */
          if(USERS[DATA.uid].pair !== null){
            // add message object to log
            PAIRS_HISTORY[USERS[DATA.uid].pair].push(data);

            var dataString = `{
              comment: {text: "${data.text}"},
              languages: ["en"],
              requestedAttributes: {ATTACK_ON_COMMENTER:{}},
              doNotStore: true
            }`;
            var options = {
              url: 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=AIzaSyDmEXbxhOpLzX8wONwTbcJF9AAHh7C69GY',
              method: 'POST',
              headers: HEADERS,
              body: dataString
            }
            function response(err, resp, body){
              if(!err && resp.statusCode === 200){
                body = JSON.parse(body);
                var menace = body.attributeScores.ATTACK_ON_COMMENTER.summaryScore.value;
                if(menace >= CONFIG["menace threshold"]){
                  var newLen = USERS[DATA.uid].holds.push(data.text);
                  sock.send(JSON.stringify({type:'hold', cause:'menace', id:newLen - 1, text:data.text}));
                  console.log('message held: menace', menace);
                } else {
                  var pair = PAIRS[USERS[DATA.uid].pair];
                  pair.forEach(function(uid){
                    if(uid !== DATA.uid){
                      USERS[uid].socket.send(JSON.stringify({type:'msg',text:data.text}));
                    }
                  });
                }
              }else{
                console.log('perspective api', resp.statusCode, 'message filter passthrough; ', err);
                var pair = PAIRS[USERS[DATA.uid].pair];
                pair.forEach(function(uid){
                  if(uid !== DATA.uid){
                    USERS[uid].socket.send(JSON.stringify({type:'msg',text:data.text}));
                  }
                });
              }
            }
            request(options, response);
          }
          break;
        case 'approve':
          try {
            var pair = PAIRS[USERS[data.uid].pair];
            var heldText = USERS[data.uid].holds[data.mid];
            pair.forEach(function(uid){
              if(uid !== DATA.uid){
                USERS[uid].socket.send(JSON.stringify({type:'msg',text:heldText}));
              }
            });
          } catch(e) {
            // for some reason, we coudln't approve the message?
          }
          break;
        case 'report':
          var reportRef = firebase.database().ref(`/reports/`);
          var newReportRef = reportRef.push();
          newReportRef.set(PAIRS_HISTORY[USERS[DATA.uid].pair]);
          break;
      }
    });
  }).listen(9874);
}
