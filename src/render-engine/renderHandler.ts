import AudioDataManager, { Process, ProcessInfo } from "../analyser/AudioDataManager";
import renderShaderCode from "./render-shader.wgsl?raw";

export const adapter = (await navigator.gpu.requestAdapter())!;
if (!adapter) throw new Error("Failed to retrieve GPU Adapter");

export const device = await adapter.requestDevice();
export let sab: SharedArrayBuffer | null = null;
export let ctx: GPUCanvasContext | null = null;

export function init(buf: SharedArrayBuffer, canvas: OffscreenCanvas): void {
    sab = buf;

    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
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

    main();
}

async function main() {
    const shaderModule = device.createShaderModule({
        code: renderShaderCode
    });
    
    const vertBuf = device.createBuffer({
        size: sab!.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    const manager = new AudioDataManager(sab!);
}