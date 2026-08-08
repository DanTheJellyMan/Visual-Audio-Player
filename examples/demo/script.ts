import AudioDataManager from "../../src/analyser/AudioDataManager";
import AdvancedAnalyserNode from "../../src/analyser/AdvancedAnalyserNode";

const workerUrl = new URL("../../src/render-engine/worker.ts", import.meta.url);
const worker = new Worker(workerUrl, { type: "module" });

const audioInput: HTMLInputElement = document.querySelector("#audio-input")!;
const audio = document.querySelector("#music")! as HTMLAudioElement;
const audioContext = new AudioContext();
const analyser = await AdvancedAnalyserNode.create(audioContext);
const manager = new AudioDataManager(analyser.sab);

const sourceNode = audioContext.createMediaElementSource(audio);
sourceNode
.connect(analyser)
.connect(audioContext.destination);

await audioContext.suspend();

audio.addEventListener("play", handleAudioPlay);
audio.addEventListener("pause", handleAudioPause);
audioInput.addEventListener("input", handleAudioInput);

const dbInitPromise: Promise<void> = new Promise((resolve, reject) => {
    const dbOpenRequest = indexedDB.open("AudioSource");
    dbOpenRequest.onupgradeneeded = (e) => {
        const db = dbOpenRequest.result;
        const objectStore = db.createObjectStore("AudioFile");
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
        }
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
    const { processHeadIndex } = manager.getHeader("processHeadIndex");
    console.log(manager.readProcess(processHeadIndex, -1));
}
async function handleAudioInput(e: Event) {
    await dbInitPromise;
    const target: HTMLInputElement = e.target! as HTMLInputElement;
    if (!target.files || target.files.length !== 1) return;

    const file = target.files[0];
    setAudioSrc(audio, file);

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

function setAudioSrc(audio: HTMLAudioElement, file: File): void {
    const { src } = audio;
    if (src !== "" && URL.canParse(src)) {
        URL.revokeObjectURL(src);
    }
    const url = URL.createObjectURL(file);
    audio.src = url;
    console.log(`audio source: ${url}`);
}