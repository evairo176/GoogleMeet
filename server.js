const express = require("express");
const path = require("path");
var app = express();
const port = 3000;
var server = app.listen(port, function () {
  console.log("Listening on port " + port);
});

const io = require("socket.io")(server, {
  allowEIO3: true,
});

app.use(express.static(path.join(__dirname, "")));
var userConnections = [];
io.on("connection", (socket) => {
  console.log("Socket id is" + socket.id);
  socket.on("userConnect", (data) => {
    console.log(data);
    var other_users = userConnections.filter(
      (value) => value.meeting_id == data.meeting_id
    );
    userConnections.push({
      connectionId: socket.id,
      user_id: data.displayName,
      meeting_id: data.meeting_id,
    });

    other_users.forEach((value) => {
      socket.to(value.connectionId).emit("inform_others_about_me", {
        other_user_id: data.displayName,
        connId: socket.id,
      });
    });

    socket.emit("inform_me_about_others_user", other_users);
  });

  socket.on("SDPProcess", (data) => {
    socket.to(data.to_connid).emit("SDPProcess", {
      message: data.message,
      from_connid: socket.id,
    });
  });
});
