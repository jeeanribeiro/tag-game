const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

const server = require('http').createServer(app);

const io = require('socket.io')(server);

const lodash = require('lodash');

app.use(express.static(path.join(__dirname, '../public')));
app.set('views', path.join(__dirname, '../public'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(cors());

app.use('/', (req, res) => {
  res.render('index.html');
})

let connectedUsers = 0;
let players = [];
let chaser;
let canTag = true;

io.on('connection', socket => {
  connectedUsers++;

  if (connectedUsers > 1) {
    io.emit('newChaser', chaser.id);
  }

  socket.on('updatePlayer', thisPlayer => {
    updatePlayers(thisPlayer);
    io.emit('updatePlayers', players);
  })

  socket.on('disconnect', () => {
    connectedUsers--;
    players = players.filter(player => player.id !== socket.id);
  });
})

const updatePlayers = function(thisPlayer) {
  const foundPlayer = players.find(player => player.id === thisPlayer.id);

  if (!foundPlayer) {
    players.push(thisPlayer);
  }

  if (canTag) {
    updateChaser();
  }

  var foundIndex = players.findIndex(player => player.id === thisPlayer.id);
  if (foundIndex >= 0) {
    players[foundIndex] = thisPlayer;
  }

  players = lodash.uniqBy(players, 'id');
}

const updateChaser = function() {
  if (players.length === 1) {
    chaser = players[0];
    io.emit('newChaser', chaser.id);
  }

  chaser = players.find(player => player.id = chaser.id);
  
  players.forEach(player => {
    if (collision(player, chaser)) {
      chaser.id = player.id;
      io.emit('newChaser', chaser.id);
    }
  })
}

const collision = function(player, chaser) {
  if (player.id !== chaser.id) {
    if (player.x < chaser.x + chaser.width) {
      if (player.x + player.width > chaser.x) {
        if (player.y < chaser.y + chaser.height) {
          if (player.y + player.height > chaser.y) {
            canTag = false;
            updateCanTag();
            return true;
          }
        }
      }
    }
  } else {
    return false
  }
}

const updateCanTag = function() {
  if (!canTag) {
    setTimeout(() => {
      canTag = true;
    }, 3000);
  }
  return canTag;
}

const port = process.env.PORT || 80;

server.listen(port);
