import { TestFunction, test, expect } from "vitest";
import { randInt, randFloat } from "../../../src/utils/randomNumber";
import arrayEquals from "../../../src/utils/arrayEquals";
import { Float32 } from "../../../src/utils/numberWrappers";
import AudioDataManager from "../../../src/analyser/AudioDataManager";

const RANDOM_TESTING = true;
const MANAGER_CONFIG = getManagerConfig(RANDOM_TESTING);

const bufSize = AudioDataManager.estimateBufSize(
    MANAGER_CONFIG.sampleFrameLength,
    MANAGER_CONFIG.inputCount,
    MANAGER_CONFIG.maxChannelCount
);
const buf = new ArrayBuffer(bufSize);
const manager = new AudioDataManager(buf);
manager.initHeader(
    MANAGER_CONFIG.sampleRate,
    MANAGER_CONFIG.fftRatio
);

const testHeader: TestFunction = function(context) {
    const headerValues = manager.getHeader("sampleRate", "fftRatio", "headProcessOffset");
    const bodyOffset = AudioDataManager.HEADER_SIZE + (AudioDataManager.RESERVED_BODY_VALUES.headerLayoutEnd.constructor as typeof Float32).BYTES;
    
    expect(headerValues.sampleRate).toBe(MANAGER_CONFIG.sampleRate);
    expect(headerValues.fftRatio).toBe(MANAGER_CONFIG.fftRatio);
    expect(headerValues.headProcessOffset).toBe(BigInt(bodyOffset));
}

const testSampleReadWrite: TestFunction = function(context) {
    const { randomTesting, fftRatio, sampleFrameLength, inputCount, maxChannelCount } = MANAGER_CONFIG;
    console.log(`Manager config: ${JSON.stringify(MANAGER_CONFIG, null, 4)}`);
    const samplesPerProcess = sampleFrameLength * maxChannelCount * inputCount;
    const requiredProcessCount = Math.ceil((2**fftRatio) / samplesPerProcess);
    console.log("required process count: " + requiredProcessCount);
    for (let i=0; i<requiredProcessCount; i++) {
        const inputs: Float32Array[][] = new Array(inputCount)
        .fill(null)
        .map(() => generateInput(
            randomTesting ? randInt(1, maxChannelCount) : maxChannelCount,
            sampleFrameLength,
            randomTesting
        ));

        // console.log(`HEAD_PROCESS_OFFSET (before): ${manager.getHeader("headProcessOffset").headProcessOffset}`);
        const writeStatus = manager.writeProcess(inputs);
        expect(writeStatus, "Write successful?").toBe(0);
        console.log(`HEAD_PROCESS_OFFSET (after): ${manager.getHeader("headProcessOffset").headProcessOffset}`);
    }

    console.log(`All process offsets:\n${JSON.stringify(manager.getAllProcessOffsets(), null, 4)}`);

    const outputs = manager.readProcess(0);
    console.log("outputs:");
    console.log(outputs);
    // expect(arrayEquals(inputs, outputs)).toBe(true);
}

test("Stores and reads values back correctly", testHeader);
test(testSampleReadWrite, testSampleReadWrite);

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
    return Math.sin(deg);
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
        fftRatio = AudioDataManager.FFT_RATIO_MAX.value;
        inputCount = inputRange[1];
        maxChannelCount = channelRange[1];
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