import AudioDataManager, { Process, ProcessInfo } from "../analyser/AudioDataManager";
import fftShaderCode from "../analyser/fft.wgsl?raw";
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

    console.log("render handler initialized");
    main();
}

async function main() {
    const fftShaderModule = device.createShaderModule({ code: fftShaderCode });
    const renderShaderModule = device.createShaderModule({ code: renderShaderCode });
    Promise.all([fftShaderModule.getCompilationInfo(), renderShaderModule.getCompilationInfo()])
    .then((infos) => {
        console.info("shader module compilation info:", ...infos);
    });

    const fftSize = 2 ** AudioDataManager.FFT_RATIO_MAX.value;
    const audioSampleBuf = device.createBuffer({
        size: fftSize * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        label: "audioSamples"
    });
    const complexSampleBuf = device.createBuffer({
        size: audioSampleBuf.size * 2,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        label: "complexSamples"
    });
    const fftBuf = device.createBuffer({
        size: complexSampleBuf.size,
        usage: complexSampleBuf.usage,
        label: "fft"
    });
    const fftSizeUniformBuf = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "magnitudeUniforms"
    });
    const magBuf = device.createBuffer({
        size: fftBuf.size / 2,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX,
        label: "magnitude"
    });
    const testBuf = device.createBuffer({
        size: magBuf.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        label: "test"
    });

    const preprocessSamplesLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "read-only-storage"
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage"
                }
            }
        ]
    });
    const computeFFTLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "read-only-storage"
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage"
                }
            }
        ]
    });
    const computeMagnitudeLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "uniform"
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "read-only-storage"
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage"
                }
            }
        ]
    });
    const renderSamplesLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: "read-only-storage"
                }
            }
        ]
    });

    const preprocessSamplesGroup = device.createBindGroup({
        layout: preprocessSamplesLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: audioSampleBuf
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: complexSampleBuf
                }
            }
        ],
        label: "preprocessSamplesGroup"
    });
    const computeFFTGroup = device.createBindGroup({
        layout: computeFFTLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: complexSampleBuf
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: fftBuf
                }
            }
        ],
        label: "computeFFTGroup"
    });
    const computeMagnitudeGroup = device.createBindGroup({
        layout: computeMagnitudeLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: fftSizeUniformBuf
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: fftBuf
                }
            },
            {
                binding: 2,
                resource: {
                    buffer: magBuf
                }
            }
        ],
        label: "computeMagnitudeGroup"
    });
    const renderSamplesGroup = device.createBindGroup({
        layout: renderSamplesLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: magBuf
                }
            }
        ]
    });

    const preprocessSamplesPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [preprocessSamplesLayout]
        }),
        compute: {
            module: fftShaderModule,
            entryPoint: "preprocess_samples"
        }
    });
    const computeFFTPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [computeFFTLayout]
        }),
        compute: {
            module: fftShaderModule,
            entryPoint: "dft"
        }
    });
    const computeMagnitudePipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [computeMagnitudeLayout]
        }),
        compute: {
            module: fftShaderModule,
            entryPoint: "magnitude"
        }
    });
    const renderPipeline = device.createRenderPipeline({
        vertex: {
            module: renderShaderModule,
            entryPoint: "vert_main",
            buffers: []
        },
        fragment: {
            module: renderShaderModule,
            entryPoint: "frag_main",
            targets: [
                {
                    format: navigator.gpu.getPreferredCanvasFormat()
                }
            ]
        },
        primitive: {
            topology: "triangle-list"
        },
        layout: device.createPipelineLayout({
            bindGroupLayouts: [renderSamplesLayout]
        })
    });

    const manager = new AudioDataManager(sab!);
    const samples = new Float32Array(fftSize);

    setInterval(async () => {
        const startT = performance.now();

        const { processHeadIndex } = manager.getHeader("processHeadIndex");
        const manSamples = manager.getSamples(0, 0, samples.length, processHeadIndex, -1);
        if (!samples.some((value, i) => value !== manSamples[i])) return;
        samples.set(manSamples);
        device.queue.writeBuffer(audioSampleBuf, 0, samples, 0, samples.length);
        device.queue.writeBuffer(
            fftSizeUniformBuf, 0,
            new Uint32Array([fftSize]), 0,
            fftSizeUniformBuf.size / 4
        );

        const commandEncoder = device.createCommandEncoder();
        const wkgrpCt = Math.ceil(fftSize / 64);
        const preprocessPass = commandEncoder.beginComputePass();
        preprocessPass.setPipeline(preprocessSamplesPipeline);
        preprocessPass.setBindGroup(0, preprocessSamplesGroup);
        preprocessPass.dispatchWorkgroups(wkgrpCt);
        preprocessPass.end();

        const fftPass = commandEncoder.beginComputePass();
        fftPass.setPipeline(computeFFTPipeline);
        fftPass.setBindGroup(0, computeFFTGroup);
        fftPass.dispatchWorkgroups(wkgrpCt);
        fftPass.end();

        const magnitudePass = commandEncoder.beginComputePass();
        magnitudePass.setPipeline(computeMagnitudePipeline);
        magnitudePass.setBindGroup(0, computeMagnitudeGroup);
        magnitudePass.dispatchWorkgroups(wkgrpCt);
        magnitudePass.end();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                    view: ctx!.getCurrentTexture()
                }
            ]
        });
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderSamplesGroup);
        renderPass.setVertexBuffer(0, magBuf);
        renderPass.draw(fftSize * 6);
        renderPass.end();

        // commandEncoder.copyBufferToBuffer(magBuf, testBuf);
        device.queue.submit([commandEncoder.finish()]);

        // await testBuf.mapAsync(GPUMapMode.READ, 0, testBuf.size);
        // const abCpy = testBuf.getMappedRange(0, testBuf.size).slice();
        // testBuf.unmap();
        // console.log(new Float32Array(abCpy).toString());

        // console.log(`Render time: ${performance.now()-startT}ms`);
    }, 1000 / 10);
}