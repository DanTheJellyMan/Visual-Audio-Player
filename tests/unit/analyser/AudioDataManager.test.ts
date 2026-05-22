import { test, expect } from "vitest";
import AudioDataManager from "../../../src/analyser/AudioDataManager";

const sampleRate = 44100;
const fftRatio = 15;
const buf = new ArrayBuffer(AudioDataManager.estimateMaxBufSize(sampleRate, fftRatio));
const manager = new AudioDataManager(buf);
manager.initHeader(sampleRate, BigInt(fftRatio));

test("AudioDataManager stores values properly and can read them back", (context) => {
    const headerValues = manager.getHeader("sampleRate", "fftRatio");
    expect(headerValues.sampleRate).toBe(sampleRate);
    expect(headerValues.fftRatio).toBe(fftRatio);
});