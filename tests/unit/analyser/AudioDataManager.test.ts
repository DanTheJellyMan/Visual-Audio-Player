import { TestFunction, test, expect } from "vitest";
import { randInt, randFloat } from "../../../src/utils/randomNumber";
import AudioDataManager from "../../../src/analyser/AudioDataManager";

const sampleRate = 48000;
const fftRatio = 15;
const buf = new ArrayBuffer(AudioDataManager.estimateBufSize(sampleRate));
const manager = new AudioDataManager(buf);
manager.initHeader(sampleRate, fftRatio);

const testHeader: TestFunction = function(context) {
    const headerValues = manager.getHeader("sampleRate", "fftRatio", "headProcessOffset");
    const bodyOffset = AudioDataManager.HEADER_SIZE + AudioDataManager.RESERVED_BODY_VALUES.headerLayoutEnd.bytes;
    
    expect(headerValues.sampleRate).toBe(sampleRate);
    expect(headerValues.fftRatio).toBe(fftRatio);
    expect(headerValues.headProcessOffset).toBe(BigInt(bodyOffset));
}

const testSampleReadWrite: TestFunction = function(context) {
    const sampleFrameLength = 512;
    const inputs = new Array(randInt(1, 10)).fill(null)
        .map(() => generateInput(randInt(1, 12), sampleFrameLength));

    const writeStatus = manager.writeProcess(inputs);
    expect(writeStatus, "Write successful?").toBeFalsy();

    const { headProcessOffset } = manager.getHeader("headProcessOffset");
    const outputs = manager.readProcess(Number(headProcessOffset));
    
}

test("Stores and reads values back correctly", testHeader);
test(testSampleReadWrite, testSampleReadWrite);

function generateInput(channelCount: number, sampleCount: number): Float32Array[] {
    const input = new Array(channelCount);
    for (let c=0; c<channelCount; c++) {
        const channel = new Float32Array(sampleCount);
        for (let s=0; s<sampleCount; s++) {
            channel[s] = randSample();
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