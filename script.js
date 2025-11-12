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

// alwaysRender = true; is not reliable right now until out-of-order frame issue is resolved
audioPlayer.init(canvas.transferControlToOffscreen(), true);

globalThis.img = new Image();
const imgInput = document.querySelector("#image-input");
const video = document.querySelector("video");
const videoInput = document.querySelector("input#video-input");
let lastBitmap = null;

audioPlayer.createResolverPromise("init").then(() => {
    const handleImageInput = async () => {
        setMediaSrcFromFile(img, imgInput.files[0]);
        await eventListenerPromise(img, "load");
        const { width, height } = audioPlayer.options.canvas;
        const newWidth = width;
        const newHeight = height;
        const bitmap = await window.createImageBitmap(img, {
            resizeWidth: newWidth,
            resizeHeight: newHeight
        });
        audioPlayer.bgRender(bitmap, false);
    }
    handleImageInput();
    imgInput.oninput = handleImageInput;

    const handleVideoInput = () => {
        setMediaSrcFromFile(video, videoInput.files[0]);
        if (!video.src) return;
        video.addEventListener("canplay", () => {
            const { width, height } = audioPlayer.options.canvas;
            const newWidth = width / 8;
            const newHeight = newWidth * 9 / 16;
            let videoFrameAvailable = false;
            const draw = async () => {
                if (!video.paused && videoFrameAvailable) {
                    videoFrameAvailable = false;
                    const bitmap1 = await window.createImageBitmap(video, {
                        resizeWidth: newWidth,
                        resizeHeight: newHeight
                    });
                    const bitmap2 = await window.createImageBitmap(bitmap1, {
                        resizeWidth: width,
                        resizeHeight: height
                    });
                    lastBitmap = bitmap2;
                    // audioPlayer.bgRender(bitmap2, false);
                    requestAnimationFrame(draw);
                } else {
                    requestAnimationFrame(draw);
                }
            }
            requestAnimationFrame(draw);

            const videoFrame = () => {
                videoFrameAvailable = true;
                video.requestVideoFrameCallback(videoFrame);
            }
            video.requestVideoFrameCallback(videoFrame);
        }, { once: true });
    }
    videoInput.oninput = handleVideoInput;
});


const gainNode = audioPlayer.audioContext.createGain();
gainNode.gain.value = 2;
// audioPlayer.setAudioNodes(gainNode);

const renderTimeSamples = [];
const sampleSize = 165 * 2;

let lastTimestamp = performance.now(); // for testing
requestAnimationFrame(draw);
async function draw(timestamp) {
    if (renderTimeSamples.length > sampleSize) {
        const sum = renderTimeSamples.reduce((prev, curr) => prev + curr);
        console.log(`FPS: ${1000 / (sum/renderTimeSamples.length)}`);
        console.log(`Real FPS: ${1000 / (timestamp - lastTimestamp)}`);
        renderTimeSamples.length = 0;
    }
    lastTimestamp = timestamp;

    if (!audioEl.paused) {
        if (lastBitmap) {
            audioPlayer.fgRender(lastBitmap, false);
            lastBitmap = null;
        } else {
            audioPlayer.fgRender(null, false);
        }
        
        audioPlayer.createResolverPromise("fgRender").then((renderTime) => {
            renderTimeSamples.push(renderTime);
        });
        audioPlayer.postEmptyWorkerMessage("render");
        
        // TODO: Find a way to halt rendering in worker thread whenever a new render begins.
        // This is caused by starting a render for a new frame before the last render finishes.
        // If you don't wait for resolver, outdated frames will arive, causing slowdowns in playback
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

/**
 * @param {any} img 
 * @param {number} newWidth 
 * @param {number} newHeight 
 * @param {number} quality From 0 - 1, only works with lossy mime types
 * @param {string} mimeType 
 * @returns {Promise<string>} New image object URL
 */
function quickImageScale(img, newWidth, newHeight, quality = 1, mimeType = "image/jpg") {
    return new Promise((resolve, reject) => {
        if (globalThis.dummyCtx && globalThis.dummyCtx.constructor !== CanvasRenderingContext2D) {
            throw new Error("'globalThis.dummyCtx' is already taken");
        }
        if (!globalThis.dummyCtx) {
            const canv = document.createElement("canvas");
            globalThis.dummyCtx = canv.getContext("2d");
            dummyCtx.imageSmoothingEnabled = false;
        }
        const canvas = dummyCtx.canvas;
        canvas.width = newWidth;
        canvas.height = newHeight;
        dummyCtx.clearRect(0, 0, canvas.width, canvas.height);
        dummyCtx.drawImage(img, 0, 0, newWidth, newHeight);
        canvas.toBlob((blob) => {
            resolve(URL.createObjectURL(blob));
        }, mimeType, quality);
    });
}

function eventListenerPromise(eventTarget, type) {
    return new Promise((resolve, reject) => {
        eventTarget.addEventListener(type, resolve, { once: true });
    });
}