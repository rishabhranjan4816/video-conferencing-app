const socket = io();
const roomId = location.pathname.split("/").pop();
const grid = document.getElementById("grid");

const peers = {};      // har dusre user ka connection yahan rakhenge
let localStream;       // apna camera/mic

function addVideo(id, stream) {
  let v = document.getElementById(id);
  if (!v) {
    v = document.createElement("video");
    v.id = id;
    v.autoplay = true;
    v.playsInline = true;
    if (id === "me") v.muted = true;
    grid.append(v);
  }
  v.srcObject = stream;
}

// Ek dusre user ke saath connection banao
function createPeer(id) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // apni video/audio is connection mein daalo
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  // jab koi raasta (ICE candidate) mile, dusre user ko bhejo
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("signal", { to: id, data: { candidate: e.candidate } });
    }
  };

  // jab dusre ki video aaye, screen pe dikhao
  pc.ontrack = (e) => addVideo(id, e.streams[0]);

  peers[id] = pc;
  return pc;
}

// Page khulte hi: camera lo, phir room join karo
(async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: {width: 840,height:480},
    audio: true,
  });
  addVideo("me", localStream);
  socket.emit("join", roomId);
})();

// Koi naya user aaya -> hum OFFER bhejte hain
socket.on("user-joined", async (id) => {
  const pc = createPeer(id);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: id, data: { sdp: pc.localDescription } });
});

// Dusre user ka offer / answer / candidate aaya
socket.on("signal", async ({ from, data }) => {
  const pc = peers[from] || createPeer(from);

  if (data.sdp) {
    await pc.setRemoteDescription(data.sdp);
    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: { sdp: pc.localDescription } });
    }
  } else if (data.candidate) {
    await pc.addIceCandidate(data.candidate);
  }
});

// Koi chala gaya -> uski video hatao
socket.on("user-left", (id) => {
  if (peers[id]) peers[id].close();
  delete peers[id];
  const v = document.getElementById(id);
  if (v) v.remove();
});


const muteBtn = document.getElementById("muteBtn");
const camBtn = document.getElementById("camBtn");
const leaveBtn = document.getElementById("leaveBtn");

// Mute / Unmute
muteBtn.onclick = () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  muteBtn.textContent = track.enabled ? "Mute" : "Unmute";
};

// Camera on / off
camBtn.onclick = () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  camBtn.textContent = track.enabled ? "Camera Off" : "Camera On";
};

// Leave: sab connection band karo, homepage par jao
leaveBtn.onclick = () => {
  Object.values(peers).forEach((pc) => pc.close());
  localStream.getTracks().forEach((t) => t.stop());
  socket.disconnect();
  location.href = "/";
};