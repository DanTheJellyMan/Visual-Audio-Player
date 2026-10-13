import AdvancedAnalyserNode from "../../src/analyser/AdvancedAnalyserNode";
import { WorkerMessagePayload } from "../../src/render-engine/worker";
import { getDbStorageFlag } from "./audioInputScript";
import estimateRefreshRate from "./estimateRefreshRate";
import { getFps, setFps, getFFTRatio, setFFTRatio } from "./optionsScript";

const RENDER_WORKER_NAME = "renderWorker";

const canvasEl: HTMLCanvasElement = document.querySelector("canvas#visualizer")!;
canvasEl.width = screen.width * window.devicePixelRatio;
canvasEl.height = screen.height * window.devicePixelRatio;
canvasEl.style.setProperty(
    "aspect-ratio",
    `${canvasEl.width} / ${canvasEl.height}`,
    "important"
);
const offCanv = canvasEl.transferControlToOffscreen();

const audio: HTMLAudioElement = document.querySelector("#music")!;
const audioContext = new AudioContext();
const sourceNode = audioContext.createMediaElementSource(audio);
const analyser = await AdvancedAnalyserNode.create(audioContext);
sourceNode
.connect(analyser)
.connect(audioContext.destination);

const workerUrl = new URL("../../src/render-engine/worker.ts", import.meta.url);
const worker = new Worker(workerUrl, { type: "module" });
(globalThis as any)[RENDER_WORKER_NAME] = worker;
worker.addEventListener("message", (e) => {
    if (e.data !== "Ready") throw new Error(e.data);

    const initMessagePayload: WorkerMessagePayload = {
        type: "init",
        data: { sab: analyser.sab, canvas: offCanv }
    };
    const configMessagePayload: WorkerMessagePayload = {
        type: "config-update",
        data: {
            fftRatio: getFFTRatio(),
            fps: getFps()
        }
    };
    worker.postMessage(initMessagePayload, [offCanv]);
    worker.postMessage(configMessagePayload);

    window.addEventListener("blur", () => {
        let currFps = getFps();
        if (!Number.isFinite(currFps)) {
            currFps = estimateRefreshRate();
        }
        const newFps = Math.ceil(currFps/5);
        worker.postMessage({
            type: "config-update",
            data: {
                fftRatio: getFFTRatio() * 0.5,
                fps: newFps
            }
        } as WorkerMessagePayload);
    });
    window.addEventListener("focus", () => {
        worker.postMessage({
            type: "config-update",
            data: {
                fftRatio: getFFTRatio(),
                fps: getFps()
            }
        } as WorkerMessagePayload);
    });
}, { once: true });

canvasEl.addEventListener("dblclick", () => canvasEl.requestFullscreen());

audio.addEventListener("play", handleAudioPlay);
audio.addEventListener("pause", handleAudioPause);
audio.addEventListener("timeupdate", handleAudioTimeupdate);
audio.addEventListener("volumechange", handleAudioVolumechange);
audio.addEventListener("error", handleAudioError);

async function handleAudioPlay(e: Event) {
    await audioContext.resume();
}
async function handleAudioPause(e: Event) {
    await audioContext.suspend();
}
function handleAudioTimeupdate(e: Event) {
    const dbStorageFlag = getDbStorageFlag();
    if (dbStorageFlag) {
        sessionStorage.setItem("audioCurrentTime", `${audio.currentTime}`);
    }
}
function handleAudioVolumechange(e: Event) {
    sessionStorage.setItem("audioVolume", `${audio.volume}`);
}
async function handleAudioError(e: Event) {
    console.error(`Error on audio:`);
    console.error(audio.error);
}

export function getRenderWorker(): Worker | null {
    const worker = (globalThis as any)[RENDER_WORKER_NAME] as Worker | undefined;
    if (worker === undefined || worker.constructor !== Worker) {
        return null;
    }
    return worker;
}