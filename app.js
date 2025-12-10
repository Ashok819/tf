// app.js
let video = document.getElementById('video');
let canvas = document.getElementById('overlay');
let ctx = canvas.getContext('2d');
let model = null;
let stream = null;
let running = true;
const detList = document.getElementById('detList');
const cameraSelect = document.getElementById('cameraSelect');
const toggleBtn = document.getElementById('toggleBtn');

async function setupModel() {
  // load coco-ssd
  model = await cocoSsd.load();
  console.log('Model loaded');
}

function resizeCanvas() {
  const rect = video.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function toRelativeBox(bbox, videoWidth, videoHeight) {
  // bbox from model is [x, y, width, height] relative to raw video resolution (we will scale later)
  return bbox;
}

async function detectFrame() {
  if (!running) return;
  if (video.readyState !== 4) {
    requestAnimationFrame(detectFrame);
    return;
  }
  // ensure canvas matches video display size
  resizeCanvas();
  // model expects video element
  const predictions = await model.detect(video, 10);
  // clear overlay
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw results
  const scaleX = canvas.width / video.videoWidth;
  const scaleY = canvas.height / video.videoHeight;

  // prepare detection list (unique names aggregated with highest confidence)
  const agg = {};
  predictions.forEach(p => {
    const name = p.class;
    if (!agg[name] || p.score > agg[name].score) agg[name] = { score: p.score, bbox: p.bbox };
  });

  // render boxes
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.005));
  ctx.font = `${Math.max(12, Math.round(canvas.width * 0.03))}px sans-serif`;
  predictions.forEach(p => {
    const [x,y,w,h] = p.bbox;
    ctx.strokeStyle = '#0b6df0';
    ctx.fillStyle = 'rgba(11,109,240,0.15)';
    ctx.beginPath();
    ctx.rect(x*scaleX, y*scaleY, w*scaleX, h*scaleY);
    ctx.fill();
    ctx.stroke();

    // label background
    const text = `${p.class} ${(p.score*100).toFixed(0)}%`;
    const textWidth = ctx.measureText(text).width + 8;
    const textHeight = parseInt(ctx.font, 10) + 6;
    ctx.fillStyle = '#0b6df0';
    ctx.fillRect(x*scaleX, Math.max(0,y*scaleY - textHeight), textWidth, textHeight);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x*scaleX + 4, Math.max(0, y*scaleY - 4));
  });

  // update detections list
  detList.innerHTML = '';
  Object.entries(agg).sort((a,b)=>b[1].score-a[1].score).forEach(([name, info]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${name}</span><span class="conf">${(info.score*100).toFixed(1)}%</span>`;
    detList.appendChild(li);
  });

  requestAnimationFrame(detectFrame);
}

async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === 'videoinput');
  cameraSelect.innerHTML = '';
  cams.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = c.deviceId;
    opt.text = c.label || `Camera ${i+1}`;
    cameraSelect.appendChild(opt);
  });
  return cams;
}

async function startCamera(deviceId=null) {
  try {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }, // prefer back camera
      audio: false
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    // update canvas size after video metadata
    video.addEventListener('loadedmetadata', () => {
      resizeCanvas();
    });
  } catch (e) {
    alert('Camera access denied or not available: ' + e.message);
    console.error(e);
  }
}

cameraSelect.addEventListener('change', async (ev) => {
  await startCamera(ev.target.value);
});

toggleBtn.addEventListener('click', () => {
  running = !running;
  toggleBtn.textContent = running ? 'Pause' : 'Resume';
  if (running) detectFrame();
});

(async function init() {
  // feature detect
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('getUserMedia not supported in this browser.');
    return;
  }

  await setupModel();
  const cams = await getCameras();

  // try to select the back camera if available (mobile)
  let chosen = null;
  if (cams.length > 0) {
    // prefer device with "back" or "rear" or label containing "environment"
    chosen = cams.find(c => /back|rear|environment/i.test(c.label));
    chosen = chosen || cams[0];
    await startCamera(chosen.deviceId);
  } else {
    await startCamera(); // fallback
  }

  // start detection loop
  detectFrame();
})();
