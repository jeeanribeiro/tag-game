var io = require('socket.io-client');
var socket = io(window.location.href);

window.onload = function() {

  var canvas = document.getElementById('gameCanvas');
  var ctx = canvas.getContext('2d');
  let playersArray = [];

  socket.on('connect', function() {

    var thisPlayer = {
      id: socket.id,
      x: 640,
      y: 360,
      speed: 5,
      height: 25,
      width: 25,
    };

    var keyState = {
      up: false,
      down: false,
      left: false,
      right: false,
      space: false,
    }

    window.addEventListener('keydown', function(event) {
      var key = event.key;

      if (key === 'w' || key === 'ArrowUp') {
        keyState.up = true;
      } else if (key === 's' || key === 'ArrowDown') {
        keyState.down = true;
      } else if (key === 'a' || key === 'ArrowLeft') {
        keyState.left = true;
      } else if (key === 'd' || key === 'ArrowRight') {
        keyState.right = true;
      } else if (key === ' ') {
        keyState.space = true;
      }
    })

    window.addEventListener('keyup', function(event) {
      var key = event.key;

      if (key === 'w' || key === 'ArrowUp') {
        keyState.up = false;
      } else if (key === 's' || key === 'ArrowDown') {
        keyState.down = false;
      } else if (key === 'a' || key === 'ArrowLeft') {
        keyState.left = false;
      } else if (key === 'd' || key === 'ArrowRight') {
        keyState.right = false;
      } else if (key === ' ') {
        keyState.space = false;
      }
    })

    function gameLoop() {
      if (keyState.up && thisPlayer.y > 0) {
        thisPlayer.y -= 1 * thisPlayer.speed;
      }
      if (keyState.down && thisPlayer.y < canvas.height - 25) {
        thisPlayer.y += 1 * thisPlayer.speed;
      }
      if (keyState.left && thisPlayer.x > 0) {
        thisPlayer.x -= 1 * thisPlayer.speed;
      }
      if (keyState.right && thisPlayer.x < canvas.width - 25) {
        thisPlayer.x += 1 * thisPlayer.speed;
      }
      if (keyState.space) {
        thisPlayer.speed = 20;
      } else {
        thisPlayer.speed = 10;
      }

      socket.emit('updatePlayer', thisPlayer);

      ctx.clearRect(0,0, 1280, 720);
      socket.on('updatePlayers', function(players) {
        playersArray = players;
      })

      playersArray.forEach(function(player) {
        if (player.id === chaserId) {
          drawRect(true, player.x, player.y, player.height, player.width);
        } else {
          drawRect(false, player.x, player.y, player.height, player.width);
        }
      })

      setTimeout(gameLoop, 20);
    }
    gameLoop();

    var chaserId;
    socket.on('newChaser', function(id) {
      chaserId = id;
    })

    function drawRect(isChaser, x, y, width, height) {
      if (isChaser) {
        ctx.fillStyle = '#f00';
      } else {
        ctx.fillStyle = '#00f';
      }
      ctx.fillRect(x, y, width, height);
    }

  })

}
