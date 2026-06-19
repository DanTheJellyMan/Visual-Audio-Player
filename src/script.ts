import AudioDataManager from "./analyser/AudioDataManager";
import AdvancedAnalyserNode from "./analyser/AdvancedAnalyserNode";

// const worker = new Worker(new URL("./render-engine/worker.ts", import.meta.url));

const audioInput = document.querySelector("#audio-input")!;
const audio = document.querySelector("#music")! as HTMLAudioElement;
const audioContext = new AudioContext();
const analyser = await AdvancedAnalyserNode.create(audioContext);
const manager = new AudioDataManager(analyser.sab);

const sourceNode = audioContext.createMediaElementSource(audio);
sourceNode
.connect(analyser)
.connect(audioContext.destination);

await audioContext.suspend();

audio.addEventListener("play", async (e) => {
    await audioContext.resume();
});
audio.addEventListener("pause", async (e) => {
    await audioContext.suspend();
    const { processHeadIndex } = manager.getHeader("processHeadIndex");
    console.log(manager.readProcess(processHeadIndex));
});

audioInput.addEventListener("input", (e) => {
    const target: HTMLInputElement = e.target! as HTMLInputElement;
    if (!target.files || target.files.length !== 1) return;

    const file = target.files[0];
    setAudioSrc(audio, file);
});

function setAudioSrc(audio: HTMLAudioElement, file: File): void {
    const { src } = audio;
    if (src !== "" && URL.canParse(src)) {
        URL.revokeObjectURL(src);
    }
    const url = URL.createObjectURL(file);
    audio.src = url;
    console.log(`audio src:\t${url}`);
}