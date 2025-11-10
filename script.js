import VisualAudioPlayer from "./VisualAudioPlayer.js";

const canvas = document.querySelector("canvas");
const audioEl = document.querySelector("audio#music");
const mediaInput = document.querySelector("#media-input");
setMediaSrcFromFile(audioEl, mediaInput.files[0]);
mediaInput.oninput = () => setMediaSrcFromFile(audioEl, mediaInput.files[0]);
const fpsCounter = document.querySelector("#fps-counter");

globalThis.audioPlayer = new VisualAudioPlayer(audioEl, {
    analyserNode: {
        minDecibels: -100,
        maxDecibels: 0,
        fftSize: 1024 / 8
    },
    canvas: {

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
canvas.width = 1920;
canvas.height = 1080;
audioPlayer.init(canvas.transferControlToOffscreen(), false);

globalThis.img = new Image();
const imgInput = document.querySelector("#image-input");
audioPlayer.createResolverPromise("init").then(() => {
    const handleImageInput = () => {
        setMediaSrcFromFile(img, imgInput.files[0]);
        if (!img.src) return;
        img.addEventListener("load", () => {
            window.createImageBitmap(img).then((bitmap) => {
                audioPlayer.bgRender(bitmap, true);
            });
        }, { once: true });
    }
    handleImageInput(img, imgInput.files[0]);
    imgInput.oninput = handleImageInput;
});

const gainNode = audioPlayer.audioContext.createGain();
gainNode.gain.value = 2;
// audioPlayer.setAudioNodes(gainNode);

const renderTimeSamples = [];
const sampleSize = 165 * 1;

let lastTimestamp = performance.now(); // for testing
requestAnimationFrame(draw);
function draw(timestamp) {
    if (renderTimeSamples.length > sampleSize) {
        const sum = renderTimeSamples.reduce((prev, curr) => prev + curr);
        console.log(`FPS: ${1000 / (sum/renderTimeSamples.length)}`);
        console.log(`Real FPS: ${1000 / (timestamp - lastTimestamp)}`);
        renderTimeSamples.length = 0;
    }
    lastTimestamp = timestamp;
    
    // TODO: check issue of canvas freezing after playing and then pausing audio
    if (!audioEl.paused) {
        audioPlayer.fgRender();
        audioPlayer.createResolverPromise("fgRender").then((renderTime) => {
            renderTimeSamples.push(renderTime);
        });
        audioPlayer.postEmptyWorkerMessage("render");
        audioPlayer.createResolverPromise("render")
        .then(() => requestAnimationFrame(draw));
    } else {
        requestAnimationFrame(draw);
    }
}

function setMediaSrcFromFile(mediaElement, file) {
    if (!file || !(file instanceof File)) return;
    URL.revokeObjectURL(mediaElement.src);
    const newSrc = URL.createObjectURL(file);
    mediaElement.src = newSrc;
}