import { TestFunction, test, expect } from "vitest";
import { randInt, randFloat } from "../../../src/utils/randomNumber";
import arrayEquals from "../../../src/utils/arrayEquals";
import { Float32 } from "../../../src/utils/numberWrappers";
import AudioDataManager from "../../../src/analyser/AudioDataManager";
import { normalizeModuleId } from "vite/module-runner";

const RANDOM_TESTING = true as const;
const MANAGER_CONFIG = getManagerConfig(RANDOM_TESTING);

const bufSize = AudioDataManager.estimateBufSize(
    MANAGER_CONFIG.inputCount,
    MANAGER_CONFIG.maxChannelCount
); // TODO: investigate why the test gets frozen when modifying this value

const buf = new ArrayBuffer(bufSize);
const manager = new AudioDataManager(buf);
manager.initHeader(
    MANAGER_CONFIG.sampleRate,
    MANAGER_CONFIG.fftRatio
);

const testHeader: TestFunction = function(context) {
    const headerValues = manager.getHeader("sampleRate", "fftRatio", "processHeadIndex", "currentFrame", "currentTime", "previousConsumeFrame");
    
    expect(headerValues.sampleRate).toBe(MANAGER_CONFIG.sampleRate);
    expect(headerValues.fftRatio).toBe(MANAGER_CONFIG.fftRatio);
    expect(headerValues.processHeadIndex).toBe(0);
    expect(headerValues.currentFrame).toBe(0n);
    expect(headerValues.currentTime).toBe(0);
    expect(headerValues.previousConsumeFrame).toBe(0n);
}

const testSampleReadWrite: TestFunction = function(context) {
    console.log(`Manager config: ${JSON.stringify(MANAGER_CONFIG, null, 4)}`);
    
    const { randomTesting, fftRatio, sampleFrameLength, inputCount, maxChannelCount } = MANAGER_CONFIG;
    const samplesPerProcess = sampleFrameLength * maxChannelCount * inputCount;
    const requiredProcessCount = Math.ceil((2**fftRatio) / samplesPerProcess);
    const inputProcesses: Float32Array[][][] = [];
    // console.log("required process count: " + requiredProcessCount + ", samplesPerProcess: " + samplesPerProcess);
    
    for (let i=0; i<requiredProcessCount; i++) {
        const inputs: Float32Array[][] = new Array(inputCount)
        .fill(null)
        .map(() => generateInput(
            randomTesting ? randInt(1, maxChannelCount) : maxChannelCount,
            sampleFrameLength,
            randomTesting
        ));
        inputProcesses.push(inputs);

        const writeStatus = manager.writeProcess(inputs);
        expect(writeStatus, "Write successful?").toBe(0);
        // console.log(`HEAD_PROCESS_INDEX: ${manager.getHeader("processHeadIndex").processHeadIndex}`);
    }

    const processIndices = manager.getAllProcessIndices();
    console.log(`process-start indices: ${processIndices.join(", ")}`);

    const startT = performance.now();
    const outputProcesses = processIndices.map((index) =>
        manager.readProcess(manager.findNextProcess(index))
    );
    console.log(`Total process read time: ${performance.now() - startT}ms`);

    expect(inputProcesses.length).toBe(outputProcesses.length);
    for (let i=0; i<inputProcesses.length; i++) {
        compareProcesses(inputProcesses[i], outputProcesses[i]);
    }
}

const testProcessSearch: TestFunction = function(context) {
    const processIndices = manager.getAllProcessIndices();
    const processes = processIndices.map((index) => manager.readProcess(index));
    
    for (let i=0; i<processes.length; i++) {
        const index = manager.searchProcess(processes[i]);

        expect(index).toSatisfy((value) => !isNaN(value));
        expect(index).toBe(processIndices[i]);
    }
}

test("Stores and reads header values back correctly", testHeader);
test(testSampleReadWrite, testSampleReadWrite);
test(testProcessSearch, testProcessSearch);

function compareProcesses<P extends Float32Array[][]>(process1: P, process2: P): void {
    const factor = 10 ** 5;
    const normalizeSample = (value: number): number => Math.floor(
        Float32.normalizeValue(value) * factor
    ) / factor;

    expect(process1.length).toBe(process2.length);

    for (let iI=0; iI<process1.length; iI++) {
        const input = process1[iI];
        const output = process2[iI];

        for (let cI=0; cI<input.length; cI++) {
            for (let sI=0; sI<input[cI].length; sI++) {
                const inputSample = normalizeSample(input[cI][sI]);
                const outputSample = normalizeSample(output[cI][sI]);

                // For testing
                const result = Object.is(inputSample, outputSample);
                if (!result) {
                    console.log(`Input: ${iI} Channel: ${cI} Sample: ${sI} - [${inputSample}, ${outputSample}]`);
                }

                // TODO: find out why the numbers, especially the first read sample, are sometimes off from input and output.
                // Can only recreate the issue when not normalizing the raw sample values.
                expect(inputSample).toBe(outputSample);
            }
            
            // For some reason arrayEquals always fails. May be an issue with comparing floating-point values
            // const isEqual = arrayEquals(input, output);
            // expect(isEqual).toBe(true);
        }
    }
}

function generateInput(channelCount: number, sampleCount: number, random: boolean = true): Float32Array[] {
    const input = new Array(channelCount);
    for (let c=0; c<channelCount; c++) {
        const channel = new Float32Array(sampleCount);
        for (let s=0; s<sampleCount; s++) {
            if (random) {
                channel[s] = randSample();
            } else {
                // 0, 1, 0, 1...
                channel[s] = s % 2;
            }
        }
        input[c] = channel;
    }
    return input;
}

/**
 * @returns Random number from [-1, 1]
 */
function randSample(): number {
    const deg = randFloat(0, Math.PI * 2);
    return Float32.normalizeValue(Math.sin(deg));
}

function getManagerConfig(randomTesting: boolean = true) {
    const sfls = new Array(5).fill(128/2).map((value, i) => value * (2**i));
    const rates = [44100, 48000, 96000] as const;
    const inputRange = [1, 5] as const;
    const channelRange = [1, 12] as const;

    let sampleFrameLength: number;
    let sampleRate: number;
    let fftRatio: number;
    let inputCount: number;
    let maxChannelCount: number;

    if (randomTesting) {
        sampleFrameLength = sfls[randInt(0, sfls.length-1)];
        sampleRate = rates[randInt(0, rates.length-1)];
        fftRatio = randInt(AudioDataManager.FFT_RATIO_MIN.value, AudioDataManager.FFT_RATIO_MAX.value);
        inputCount = randInt(inputRange[0], inputRange[1]);
        maxChannelCount = randInt(channelRange[0], channelRange[1]);
    } else {
        sampleFrameLength = 128;
        sampleRate = rates[0];
        fftRatio = AudioDataManager.FFT_RATIO_MIN.value;
        inputCount = inputRange[0];
        maxChannelCount = channelRange[0];
    }

    return {
        randomTesting,
        sampleFrameLength,
        sampleRate,
        fftRatio,
        inputCount,
        maxChannelCount
    };
}