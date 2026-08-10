import AudioDataManager from "../../src/analyser/AudioDataManager";
import AdvancedAnalyserNode from "../../src/analyser/AdvancedAnalyserNode";
import { InitData as WorkerInitData, MessagePayload as WorkerMessagePayload } from "../../src/render-engine/worker";

const dbAudioToggleEl: HTMLInputElement = document.querySelector("input[type='checkbox']#db-audio-toggle")!;
const dbAudioStorageEnabled = (function(){
    const v = localStorage.getItem("allowDbAudioStorage");
    if (v === null) return false;
    return Boolean(Number(v));
})();
let playedInitiallyFromDbLoad = false;
dbAudioToggleEl.checked = dbAudioStorageEnabled;

const canvasEl: HTMLCanvasElement = document.querySelector("canvas#visualizer")!;
const audioInput: HTMLInputElement = document.querySelector("#audio-input")!;
const audio = document.querySelector("#music")! as HTMLAudioElement;
const audioContext = new AudioContext();
const analyser = await AdvancedAnalyserNode.create(audioContext);
const sourceNode = audioContext.createMediaElementSource(audio);
sourceNode
.connect(analyser)
.connect(audioContext.destination);
await audioContext.suspend();

const workerUrl = new URL("../../src/render-engine/worker.ts", import.meta.url);
const worker = new Worker(workerUrl, { type: "module" });
const canvasElRect = canvasEl.getBoundingClientRect();
canvasEl.width = canvasElRect.width * 2;
canvasEl.height = canvasElRect.height * 2;
const offCanv = canvasEl.transferControlToOffscreen();
const initMessagePayload: WorkerMessagePayload = {
    type: "init",
    data: {
        sab: analyser.sab,
        canvas: offCanv
    }
};
worker.addEventListener("message", (e) => {
    if (e.data !== "Ready") {
        throw new Error(e.data);
    }
    worker.postMessage(initMessagePayload, [offCanv]);
}, { once: true });

dbAudioToggleEl.addEventListener("change", (e) => {
    localStorage.setItem("allowDbAudioStorage", Number(dbAudioToggleEl.checked).toString());
});
audio.addEventListener("play", handleAudioPlay);
audio.addEventListener("pause", handleAudioPause);
audio.addEventListener("timeupdate", handleTimeupdate);
audioInput.addEventListener("input", handleAudioInput);

const dbInitPromise: Promise<void> = new Promise((resolve) => {
    if (dbAudioStorageEnabled === false) {
        return resolve();
    }
    const dbOpenRequest = indexedDB.open("AudioSource");
    dbOpenRequest.onupgradeneeded = (e) => {
        const db = dbOpenRequest.result;
        db.createObjectStore("AudioFile");
    };
    dbOpenRequest.onsuccess = (e) => {
        const db = dbOpenRequest.result;
        const transaction = db.transaction("AudioFile", "readonly", { durability: "strict" });
        const objectStore = transaction.objectStore("AudioFile");
        const getRequest = objectStore.get("file");

        const cleanup = () => {
            try {
                transaction.commit();
            } catch (err) {
                console.error(err);
            }
            db.close();
            resolve();
        };
        getRequest.onerror = () => {
            console.log("No previous audio files detected");
            cleanup();
        };
        getRequest.onsuccess = (e) => {
            const file: File | undefined = getRequest.result;
            if (file !== undefined) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                audioInput.files = dataTransfer.files;
                audioInput.dispatchEvent(new Event("input"));
                console.log(`Loaded file from DB (${file.type}): ${file.name}`);
            }
            cleanup();
        };
    };
});

async function handleAudioPlay(e: Event) {
    await audioContext.resume();
}
async function handleAudioPause(e: Event) {
    await audioContext.suspend();
}
async function handleAudioInput(e: Event) {
    await dbInitPromise;
    const target: HTMLInputElement = e.target! as HTMLInputElement;
    if (!target.files || target.files.length !== 1) return;

    const file = target.files[0];
    setAudioSrc(audio, file);
    if (!playedInitiallyFromDbLoad && dbAudioStorageEnabled) {
        playedInitiallyFromDbLoad = true;
        const currentTime = sessionStorage.getItem("audioCurrentTime");
        audio.currentTime = parseFloat(currentTime === null ? "0" : currentTime);
        await audio.play();
        console.log("Auto play from DB load");
    }

    indexedDB.open("AudioSource")
    .onsuccess = (e) => {
        const db: IDBDatabase = (e.target as any).result;
        const transaction = db.transaction("AudioFile", "readwrite", { durability: "strict" });
        const objectStore = transaction.objectStore("AudioFile");
        objectStore.put(file, "file");
        transaction.commit();
        db.close();
    };
}
function handleTimeupdate(e: Event) {
    if (dbAudioStorageEnabled) {
        sessionStorage.setItem("audioCurrentTime", `${audio.currentTime}`);
    }
}

function setAudioSrc(audio: HTMLAudioElement, file: File): void {
    const { src } = audio;
    if (src !== "" && URL.canParse(src)) {
        URL.revokeObjectURL(src);
    }
    const url = URL.createObjectURL(file);
    audio.src = url;
    console.log(`audio source: ${url}`);
}