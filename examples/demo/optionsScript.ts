import AudioDataManager from "../../src/analyser/AudioDataManager";
import { WorkerMessagePayload } from "../../src/render-engine/worker";
import estimateRefreshRate from "./estimateRefreshRate";
import { getRenderWorker } from "./script";

const fpsInput: HTMLInputElement =
    document.querySelector("input#fps-input[type='range']")!;

const fpsInputLbl: HTMLLabelElement =
    document.querySelector("label[for='fps-input']")!;
setFpsLabel(parseInt(fpsInput.value));

const fftRatioInput: HTMLInputElement =
    document.querySelector("input#fft-ratio-input[type='range']")!;
fftRatioInput.max = String(AudioDataManager.FFT_RATIO_MAX.value);
fftRatioInput.min = String(AudioDataManager.FFT_RATIO_MIN.value);

const fftRatioLbl: HTMLLabelElement =
    document.querySelector("label[for='fft-ratio-input']")!;
setFFTRatioLabel(parseInt(fftRatioInput.value));

fpsInput.addEventListener("change", handleFpsChange);
fpsInput.addEventListener("input", handleFpsInput);

fftRatioInput.addEventListener("change", handleFFTRatioChange);
fftRatioInput.addEventListener("input", handleFFTRatioInput);

function handleFpsChange(e: Event) {
    const fps = fpsInput.value;
    const worker = getRenderWorker();
    if (!worker) return;

    worker.postMessage({
        type: "config-update",
        data: { fps: parseInt(fps) }
    } as WorkerMessagePayload);
}
function handleFpsInput(e: Event) {
    const fps = fpsInput.value;
    setFpsLabel(parseInt(fps));
}

function handleFFTRatioChange(e: Event) {
    const ratio = fftRatioInput.value;
    const worker = getRenderWorker();
    if (!worker) return;

    worker.postMessage({
        type: "config-update",
        data: { fftRatio: parseInt(ratio) }
    } as WorkerMessagePayload);
}
function handleFFTRatioInput(e: Event) {
    const ratio = fftRatioInput.value;
    setFFTRatio(parseInt(ratio));
}

/**
 * Meant for setting FPS onto UI. Use actual WorkerConfig values for input
 * @param value 
 */
export function setFps(value: number): void {
    if (value < 0) {
        // Rendering at refresh rate a specific amount of frames
        value = Infinity;
    }
    if (value === Infinity) {
        value = parseInt(fpsInput.max);
    }
    fpsInput.value = String(value);
    setFpsLabel(parseInt(fpsInput.value));
}

function setFpsLabel(fps: number): void {
    fpsInputLbl.textContent = `FPS: ${fps}`
}

/**
 * Meant for accessing FPS from UI for WorkerConfig
 * @returns 
 */
export function getFps(): number {
    const max = parseInt(fpsInput.max);
    let value = parseInt(fpsInput.value);
    if (value >= max) value = Infinity;

    return value;
}

/**
 * Meant for setting FFT ratio onto UI. Use actual WorkerConfig values for input
 * @param value 
 */ 
export function setFFTRatio(value: number): void {
    fftRatioInput.classList.remove("danger");
    fftRatioInput.classList.remove("warn");
    if (value >= 15) {
        fftRatioInput.classList.add("danger");
    } else if (value >= 12) {
        fftRatioInput.classList.add("warn");
    }
    fftRatioInput.value = String(value);
    setFFTRatioLabel(parseInt(fftRatioInput.value));
}

function setFFTRatioLabel(ratio: number): void {
    const fftSize = 2 ** ratio;
    fftRatioLbl.innerHTML = `FFT Size: ${fftSize} samples (2<sup>${ratio}</sup>)`;
}

/**
 * Meant for accessing FFT ratio from UI for WorkerConfig
 * @returns 
 */
export function getFFTRatio(): number {
    const ratio = parseInt(fftRatioInput.value);
    
    return ratio;
}

const rrValues: number[] = [];
let checkRRInt: number;
checkRRInt = setInterval(() => {
    const oldMax = fpsInput.max;
    const fpsEstimate = estimateRefreshRate();
    rrValues.push(fpsEstimate);
    fpsInput.max = String(fpsEstimate);
    
    if (fpsInput.value === oldMax) {
        setFps(Infinity);
        
        const renderWorker = getRenderWorker();
        if (renderWorker) {
            renderWorker.postMessage({
                type: "config-update",
                data: { fps: getFps() }
            } as WorkerMessagePayload);
        }
    }

    const reqMatchingRRValues = 25;
    if (rrValues.length > reqMatchingRRValues) {
        for (let i=rrValues.length-reqMatchingRRValues; i<rrValues.length; i++) {
            if (rrValues[i-1] !== rrValues[i]) {
                rrValues.shift();
                return;
            };
        }
        clearInterval(checkRRInt);
        console.log(
            `Final refresh rate estimate: ${rrValues[rrValues.length-1]}hz`
        );
    }
}, 1 * 1000);