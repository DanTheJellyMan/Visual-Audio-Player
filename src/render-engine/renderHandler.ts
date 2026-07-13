import loadShaders from "../utils/loadShaders";
import AudioDataManager, { Process, ProcessInfo } from "../analyser/AudioDataManager";

export let sab: SharedArrayBuffer | null = null;
export let ctx: GPUCanvasContext | null = null;
export function init(buf: SharedArrayBuffer, canv: OffscreenCanvas): void {
    sab = buf;

    const context = canv.getContext("webgpu") as GPUCanvasContext | null;
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported");
    } else if (context === null) {
        throw new Error("Failed to get webgpu context from canvas");
    } else {
        ctx = context;
    }

    ctx.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "premultiplied"
    });

    let intervalId;
    let intervalCb = () => {
        if (pipelineCreationPromiseResolver === undefined) return;
        clearInterval(intervalId!);
        pipelineCreationPromiseResolver();
    }
    intervalId = setInterval(intervalCb, 1000);
    intervalCb();
}

const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
if (!adapter) {
    throw new Error("Failed to retrieve GPU Adapter");
}
const device = await adapter.requestDevice();
const shaderModule = device.createShaderModule({
    code: await loadShaders(new URL("./render-shader-modules"))
});

// Test prototype code
let pipelineCreationPromiseResolver: (value?: unknown) => void;
await new Promise((resolve) => pipelineCreationPromiseResolver = resolve);

const manager = new AudioDataManager(sab!);

const vertBuf = device.createBuffer({
    size: sab!.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

// function getSamples(inputIndex: number, channelIndex: number, sampleCount: number): Float32Array {
//     const processes: [number, Process][] = [];

//     // Read all processes
//     while(processes.length === 0 ||
//         manager.interpretProcessInfo(
//             processes[processes.length-1][1], processes[processes.length-1][0]
//         ).totalSampleCount.value < sampleCount
//     ) {
//         const lastIndex = processes.length === 0 ? 0 : processes[processes.length-1][0];
//         const index = manager.findNextProcess(lastIndex+1, 1);
//         if (processes.length > 1 && lastIndex === index || index === processes[0][0]) {
//             break;
//         }

//         const process = manager.readProcess(index, 1);
//         processes.push([index, process]);
//     }
    
//     const samples = new Float32Array(sampleCount);
//     let totalSamples = 0;
//     let i = processes.length-1;
//     while(totalSamples < sampleCount && i >= 0) {
//         const channel = processes[i][1][inputIndex][channelIndex];
//         totalSamples += channel.length;

//         let sliced: Float32Array;
//         if (totalSamples > sampleCount) {
//             const startIndex = totalSamples - sampleCount;
//             sliced = channel.subarray(startIndex, channel.length-1);
//         } else {
//             sliced = channel;
//         }
//         samples.set(sliced, totalSamples);
//         i--;
//     }
//     return samples;
// }