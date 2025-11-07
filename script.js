import VisualAudioPlayer from "./VisualAudioPlayer.js";

const canvas = document.querySelector("canvas");
const audioEl = document.querySelector("audio#music");
const fileInput = document.querySelector("input[type='file']");
setMediaSrcFromFile(audioEl, fileInput.files[0]);
fileInput.oninput = () => setMediaSrcFromFile(audioEl, fileInput.files[0]);
const fpsCounter = document.querySelector("#fps-counter");

const canvRect = canvas.getBoundingClientRect();
globalThis.audioPlayer = new VisualAudioPlayer(audioEl, {
    analyserNode: {
        minDecibels: -100,
        maxDecibels: 0,
        fftSize: 1024 / 8
    },
    canvas: {
        width: canvRect.width,
        height: canvRect.width * 9 / 16,
        alpha: false,
        desynchronized: true,
        subpixelRendering: true,
        gapPercent: 0.5,
        interp: {
            type: "cosine",
            t: 0.25,
            adjacentPointRatio: 1/5
        }
    }
});
const gainNode = audioPlayer.audioContext.createGain();
gainNode.gain.value = 2;
// audioPlayer.setAudioNodes(gainNode);

canvas.width = audioPlayer.options.canvas.width;
canvas.height = audioPlayer.options.canvas.height;
const bitmapCtx = canvas.getContext("bitmaprenderer", {
    alpha: audioPlayer.options.canvas.alpha
});
const fpsSamples = new Array(60);
let fpsSampleCount = 0;

requestAnimationFrame(draw);
async function draw(timestamp) {
    if (fpsSampleCount >= fpsSamples.length) {
        const avgRenderTime = fpsSamples.reduce((prev, curr) => {
            return prev + curr;
        }) / fpsSampleCount;
        const fps = Math.round(1000 / Math.max(1, avgRenderTime));
        fpsCounter.textContent = `FPS (via render time): ${fps}`;
        fpsSampleCount = 0;
    }
    fpsSamples[fpsSampleCount++] = audioPlayer.lastRenderTime;

    if (!audioEl.paused) {
        audioPlayer.draw();
        const bitmap = await audioPlayer.getImageBitmap();
        if (!audioEl.paused) {
            bitmapCtx.transferFromImageBitmap(bitmap);
        }
        bitmap.close();
    }
    requestAnimationFrame(draw);
}
// setInterval(draw, 1000/15);

function setMediaSrcFromFile(mediaElement, file) {
    if (!file || !(file instanceof File)) return;
    URL.revokeObjectURL(mediaElement.src);
    const newSrc = URL.createObjectURL(file);
    mediaElement.src = newSrc;
}