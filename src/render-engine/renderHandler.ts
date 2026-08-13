import { Float32 } from "../utils/numberWrappers";
import AudioDataManager, { Process, ProcessInfo } from "../analyser/AudioDataManager";
import fftShaderCode from "../analyser/fft.wgsl?raw";
import renderShaderCode from "./render-shader.wgsl?raw";

export const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("Failed to retrieve GPU Adapter");
const timestampQueryEnabled = adapter.features.has("timestamp-query");
if (!timestampQueryEnabled) {
    console.warn("Timestamp query is disabled");
} else {
    console.log("Timestamp query is enabled");
}

export const device = await adapter.requestDevice({
    requiredFeatures: [
        (timestampQueryEnabled ? "timestamp-query" : null)
    ].filter((value) => value !== "" && value !== null) as GPUFeatureName[]
});

export let sab: SharedArrayBuffer | null = null;
export let ctx: GPUCanvasContext | null = null;

/**
 * @param buf 
 * @param canvas 
 * @returns Render function
 */
export function init(buf: SharedArrayBuffer, canvas: OffscreenCanvas) {
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

    const renderFn = prepShaders();
    return renderFn;
}

function prepShaders() {
    // NOTE: most of the code could be placed in the top level of this
    // module, but I chose not to for readability, and practically
    // all of the variables only need to be within this function.
    const fftShaderModule = device.createShaderModule({ code: fftShaderCode });
    const renderShaderModule = device.createShaderModule({ code: renderShaderCode });
    Promise.all([fftShaderModule.getCompilationInfo(), renderShaderModule.getCompilationInfo()])
    .then((infos) => {
        console.info("shader module compilation info:\n\t", ...infos);
    });

    const minFFTRatio = AudioDataManager.FFT_RATIO_MIN.value;
    const maxFFTRatio = AudioDataManager.FFT_RATIO_MAX.value;
    const maxFFTSize = 2 ** maxFFTRatio;
    const audioSampleBuf = device.createBuffer({
        size: maxFFTSize * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        label: "audioSamples"
    });
    const complexSampleBuf = device.createBuffer({
        size: audioSampleBuf.size * 2,
        usage: audioSampleBuf.usage,
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
        label: "fftSizeUniform"
    });
    const magBuf = device.createBuffer({
        size: fftBuf.size / 2,
        usage: fftBuf.usage,
        label: "magnitudes"
    });
    const testSampleBuf = device.createBuffer({
        size: magBuf.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        label: "test"
    });
    const timestampQuerySet = device.createQuerySet({
        count: 8,
        type: "timestamp"
    });
    const timestampQuerySetBuf = device.createBuffer({
        size: timestampQuerySet.count * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
    });
    const timestampQuerySetReadBuf = device.createBuffer({
        size: timestampQuerySetBuf.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    const preprocessSamplesLayout = device.createBindGroupLayout({
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
    const computeFFTLayout = device.createBindGroupLayout({
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
                    type: "uniform"
                }
            },
            {
                binding: 1,
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
                    buffer: fftSizeUniformBuf
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: audioSampleBuf
                }
            },
            {
                binding: 2,
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
                    buffer: fftSizeUniformBuf
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: complexSampleBuf
                }
            },
            {
                binding: 2,
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
                    buffer: fftSizeUniformBuf
                }
            },
            {
                binding: 1,
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
        layout: device.createPipelineLayout({
            bindGroupLayouts: [renderSamplesLayout]
        }),
        vertex: {
            module: renderShaderModule,
            entryPoint: "vert_main"
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
        }
    });

    const samples = new Float32Array(maxFFTSize);
    const manager = new AudioDataManager(sab!);
    let lastFFTSize = 0;

    return async () => {
        const manHeader = manager.getHeader("processHeadIndex", "fftRatio");
        if (manHeader.fftRatio < minFFTRatio || manHeader.fftRatio > maxFFTRatio) {
            console.warn(
                `FFT ratio out of valid range [${minFFTRatio}, ${maxFFTRatio}]: ${manHeader.fftRatio}`
            );
            manHeader.fftRatio = Math.min(Math.max(minFFTRatio, manHeader.fftRatio), maxFFTRatio);
        }
        const { processHeadIndex } = manHeader;
        const fftSize = 2 ** manHeader.fftRatio;
        const manSamples = manager.getSamples(0, 0, fftSize, processHeadIndex, -1);
        let newAndOldSamplesMatch = true;
        for (let i = 0; i < manSamples.length && i < samples.length; i++) {
            if (Float32.normalizeValue(manSamples[i]) !== Float32.normalizeValue(samples[i])) {
                newAndOldSamplesMatch = false;
                break;
            }
        }
        if (newAndOldSamplesMatch) return;
        
        // Fill samples with 0s for the area where lastFFTSize extended past fftSize
        const startFill = lastFFTSize - fftSize;
        const endFill = Math.max(fftSize, lastFFTSize);
        if (startFill > 0) {
            // TODO: optimize and find a way to remove this conditional to where
            // startFill has a larger lastFFTSize handled auto
            // samples.fill(0.0, startFill, endFill);
        }
        samples.fill(0); // For testing
        samples.set(manSamples);
        device.queue.writeBuffer(
            audioSampleBuf, 0,
            samples, 0,
            fftSize
            // samples.length
            // Math.max(lastFFTSize, fftSize)
        );
        if (fftSize !== lastFFTSize) {
            device.queue.writeBuffer(
                fftSizeUniformBuf, 0,
                new Uint32Array([fftSize]), 0,
                fftSizeUniformBuf.size / 4
            );
        }
        lastFFTSize = fftSize;

        const commandEncoder = device.createCommandEncoder();
        const wkgrpCt = Math.ceil(fftSize / 64);
        const preprocessPass = commandEncoder.beginComputePass({
            timestampWrites: {
                querySet: timestampQuerySet,
                beginningOfPassWriteIndex: 0,
                endOfPassWriteIndex: 1
            }
        });
        preprocessPass.setPipeline(preprocessSamplesPipeline);
        preprocessPass.setBindGroup(0, preprocessSamplesGroup);
        preprocessPass.dispatchWorkgroups(wkgrpCt);
        preprocessPass.end();

        const fftPass = commandEncoder.beginComputePass({
            timestampWrites: {
                querySet: timestampQuerySet,
                beginningOfPassWriteIndex: 2,
                endOfPassWriteIndex: 3
            }
        });
        fftPass.setPipeline(computeFFTPipeline);
        fftPass.setBindGroup(0, computeFFTGroup);
        fftPass.dispatchWorkgroups(wkgrpCt);
        fftPass.end();

        const magnitudePass = commandEncoder.beginComputePass({
            timestampWrites: {
                querySet: timestampQuerySet,
                beginningOfPassWriteIndex: 4,
                endOfPassWriteIndex: 5
            }
        });
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
            ],
            timestampWrites: {
                querySet: timestampQuerySet,
                beginningOfPassWriteIndex: 6,
                endOfPassWriteIndex: 7
            }
        });
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderSamplesGroup);
        renderPass.draw((fftSize/2)*6);
        renderPass.end();

        // commandEncoder.copyBufferToBuffer(magBuf, testSampleBuf);
        commandEncoder.resolveQuerySet(timestampQuerySet, 0, timestampQuerySet.count, timestampQuerySetBuf, 0);
        commandEncoder.copyBufferToBuffer(timestampQuerySetBuf, timestampQuerySetReadBuf);
        device.queue.submit([commandEncoder.finish()]);

        // await testSampleBuf.mapAsync(GPUMapMode.READ, 0, testSampleBuf.size);
        // const sampleAbCpy = testSampleBuf.getMappedRange(0, testSampleBuf.size).slice();
        // testSampleBuf.unmap();
        // console.log(new Float32Array(sampleAbCpy).toString());

        await (async function(){
            return;
            await timestampQuerySetReadBuf.mapAsync(GPUMapMode.READ, 0, timestampQuerySetReadBuf.size);
            const timestampAbCpy = timestampQuerySetReadBuf.getMappedRange(0, timestampQuerySetReadBuf.size).slice();
            timestampQuerySetReadBuf.unmap();
            const timestamps = new BigUint64Array(timestampAbCpy);
            const nsToMs = BigInt(1e+6);
            const preprocessTime = (timestamps[1] - timestamps[0]) / nsToMs;
            const fftTime = (timestamps[3] - timestamps[2]) / nsToMs;
            const magnitudeTime = (timestamps[5] - timestamps[4]) / nsToMs;
            const renderTime = (timestamps[7] - timestamps[6]) / nsToMs;
            console.log(
                `Preprocess: ${preprocessTime}ms\nFFT: ${fftTime}ms\n`+
                `Magnitude: ${magnitudeTime}ms\nRender: ${renderTime}ms`
            );
        })();
    };
}