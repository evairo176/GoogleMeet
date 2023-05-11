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
  var local_div;
  var audio;
  var isAudioMute = true;
  var rtp_aud_senders = [];
  var rtp_vid_senders = [];
  var video_states = {
    None: 0,
    Camera: 1,
    ScreenShare: 2,
  };
  var video_st = video_states.None;
  var videoCamTrack;

  async function _init(SDP_function, my_connid) {
    serverProcess = SDP_function;
    my_connection_id = my_connid;
    eventProcess();
    local_div = document.getElementById("localVideoPlayer");
  }

  function eventProcess() {
    $("#micMutteUnmmute").on("click", async function () {
      if (!audio) {
        await loadAudio();
      }
      if (!audio) {
        alert("Audio Permission has not granted");
        return;
      }

      if (isAudioMute) {
        audio.enable = true;
        $(this).html("<span class='material-icons'>mic</span>");
        updateMediaSenders(audio, rtp_aud_senders);
      } else {
        audio.enable = false;
        $(this).html("<span class='material-icons'>mic_off</span>");
        removeMediaSenders(rtp_aud_senders);
      }

      isAudioMute = !isAudioMute;
    });

    $("#videoCamOnOff").on("click", async function () {
      if (video_st == video_states.Camera) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.Camera);
      }
    });

    $("#ScreenShareOnOff").on("click", async function () {
      if (video_st == video_states.ScreenShare) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.ScreenShare);
      }
    });
  }

  async function connection_status(connection) {
    if (
      connection &&
      (connection.connectionState == "new" ||
        connection.connectionState == "connecting" ||
        connection.connectionState == "connected")
    ) {
      return true;
    } else {
      return false;
    }
  }

  async function updateMediaSenders(track, rtp_senders) {
    for (var con_id in peers_connection_ids) {
      if (connection_status(peers_connection[con_id])) {
        if (rtp_senders[con_id] && rtp_senders[con_id].track) {
          rtp_senders[con_id].replaceTrack(track);
        } else {
          rtp_senders[con_id] = peers_connection[con_id].addTrack(track);
        }
      }
    }
  }

  async function videoProcess(newVideoState) {
    // console.log(newVideoState);
    try {
      var vstream = null;
      if (newVideoState == video_states.Camera) {
        vstream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });
      } else if (newVideoState == video_states.ScreenShare) {
        vstream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });
        // vstream.oninactive = (e) => {
        //   removeVideoStream(rtp_vid_senders);
        //   $("#ScreenShareOnOf").html(
        //     '<span class="material-icons ">present_to_all</span><div >Present Now</div>'
        //   );
        // };
      }
      if (vstream && vstream.getVideoTracks().length > 0) {
        // vstream
        videoCamTrack = vstream.getVideoTracks()[0];
        console.log(videoCamTrack);
        if (videoCamTrack) {
          local_div.srcObject = new MediaStream([videoCamTrack]);
          updateMediaSenders(videoCamTrack, rtp_vid_senders);
        }
      }
    } catch (e) {
      console.log(e);
      return;
    }

    video_st = newVideoState;
  }

  async function setConnection(connId) {
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

    if (
      video_st == video_states.Camera ||
      video_st == video_states.ScreenShare
    ) {
      if (videoCamTrack) {
        updateMediaSenders(videoCamTrack, rtp_vid_senders);
      }
    }

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

  async function SDPProcess(message, from_connid) {
    message = JSON.parse(message);
    if (message.answer) {
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    } else if (message.offer) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }

      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.offer)
      );

      var answer = await peers_connection[from_connid].createAnswer();
      await peers_connection[from_connid].setLocalDescription(answer);

      serverProcess(JSON.stringify({ answer: answer }), from_connid);
    } else if (message.icecandidate) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);

        try {
          await peers_connection[from_connid].addIceCandidate(
            message.icecandidate
          );
        } catch (e) {
          console.log(e);
        }
      }
    }
  }

  return {
    setConnection: async function (connId) {
      await setConnection(connId);
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
    $("#meetingContainer").show();
    $("#me h2").text(user_id + "(Me)");
    document.title = user_id;
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
      AppProcess.setConnection(data.connId);
    });

    socket.on("inform_me_about_others_user", (others_user) => {
      if (others_user) {
        for (var i = 0; i < others_user.length; i++) {
          addUser(others_user[i].user_id, others_user[i].connectionId);
          AppProcess.setConnection(others_user[i].connectionId);
        }
      }
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
