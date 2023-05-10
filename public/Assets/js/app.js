var AppProcess = (function () {
  var iceConfiguration = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
      {
        urls: "stun:stun1.l.google.com:19302",
      },
    ],
  };

  var serverProcess;
  var my_connection_id;
  var peers_connection_ids = [];
  var peers_connection = [];
  var remote_vid_stream = [];
  var remote_aud_stream = [];

  function _init(SDP_function, my_connid) {
    serverProcess = SDP_function;
    my_connection_id = my_connid;
  }

  function setNewConnection() {
    var connection = new RTCPeerConnection(iceConfiguration);

    connection.onnegotiationneeded = async function () {
      await setOffer(connId);
    };

    connection.onicecandidate = async function (event) {
      if (event.candidate) {
        serverProcess(
          JSON.stringify({ icecandidate: event.candidate }),
          connId
        );
      }
    };

    connection.ontrack = async function (event) {
      if (!remote_vid_stream[connId]) {
        remote_vid_stream = new MediaStream();
      }

      if (!remote_aud_stream[connId]) {
        remote_aud_stream = new MediaStream();
      }

      if (event.track.kind == "video") {
        remote_vid_stream[connId]
          .getVideoTracks()
          .forEach((t) => remote_vid_stream[connId].removeTrack(t));

        remote_vid_stream[connId].addTrack(event.track);

        var remoteVideoPlayer = document.getElementById("v_" + connId);
        remoteVideoPlayer.srcObject = null;
        remoteVideoPlayer.srcObject = remote_vid_stream[connId];
        remoteVideoPlayer.load();
      } else if (event.track.kind == "audio") {
        remote_aud_stream[connId]
          .getAudioTracks()
          .forEach((t) => remote_aud_stream[connId].removeTrack(t));

        remote_aud_stream[connId].addTrack(event.track);

        var remoteAudioPlayer = document.getElementById("a_" + connId);
        remoteAudioPlayer.srcObject = null;
        remoteAudioPlayer.srcObject = remote_aud_stream[connId];
        remoteAudioPlayer.load();
      }
    };

    peers_connection_ids[connId] = connId;
    peers_connection[connId] = connection;

    return connection;
  }

  async function setOffer(connId) {
    var connection = peers_connection[connId];
    var offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    serverProcess(
      JSON.stringify({ offer: connection.setLocalDescription }),
      connId
    );
  }

  return {
    setNewConnection: async function (connId) {
      await setNewConnection(connId);
    },
    init: async function (SDP_function, my_connid) {
      await _init(SDP_function, my_connid);
    },
    processClient: async function (message, from_connid) {
      await SDPProcess(message, from_connid);
    },
  };
})();
var MyApp = (function () {
  var socket = null;
  var user_id = "";
  var meeting_id = "";
  function checkId(uid, mid) {
    user_id = uid;
    meeting_id = mid;

    event_process_for_signaling_server(user_id);
  }

  function event_process_for_signaling_server() {
    socket = io.connect();

    var SDP_function = function (data, to_connid) {
      socket.emit("SDPProcess", {
        message: data,
        to_connid: to_connid,
      });
    };
    socket.on("connect", () => {
      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id);

        if ((user_id != "") & (meeting_id != "")) {
          console.log("server berhasil");
          socket.emit("userConnect", {
            displayName: user_id,
            meeting_id: meeting_id,
          });
        }
      }
    });

    socket.on("inform_others_about_me", (data) => {
      addUser(data.other_user_id, data.connId);
      AppProcess.setNewConnection(data.connId);
      console.log(data);
    });

    socket.on("SDPProcess", async (data) => {
      await AppProcess.processClient(data.message, data.from_connid);
    });
  }

  function addUser(user_id, connId) {
    var newDivId = $("#otherTemplate").clone();
    newDivId = newDivId.attr("id", connId).addClass("other");
    newDivId.find("h2").text(user_id);
    newDivId.find("video").attr("id", "v_" + connId);
    newDivId.find("audio").attr("id", "a_" + connId);
    newDivId.show();
    $("#divUsers").append(newDivId);
    console.log(user_id, connId);
  }

  return {
    _init: function (uid, mid) {
      checkId(uid, mid);
    },
  };
})();
