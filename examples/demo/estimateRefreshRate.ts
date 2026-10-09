import { Float64 } from "../../src/utils/numberWrappers";

const commonRefreshRates = ([24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 160, 165, 170, 175, 180, 200, 240, 280, 300, 320, 360, 480, 500, 540, 600, 720] as const)
.toSorted((a, b) => a-b);

const OUTLIER_VALUE = Float64.normalizeValue(0.0);
const frametimes = new Float64Array(1_000);
let frametimesI = 0;
let lastTs: DOMHighResTimeStamp = performance.now();
let reqAnimFrameId: number = NaN;

const animCb = (ts: DOMHighResTimeStamp) => {
    const frametime = ts - lastTs;
    writeFrametime(frametime);
    lastTs = ts;

    reqAnimFrameId = requestAnimationFrame(animCb);
};
reqAnimFrameId = requestAnimationFrame(animCb);

function writeFrametime(value: number) {
    frametimes[frametimesI] = value;
    frametimesI = (frametimesI+1) % frametimes.length;
}

export default function estimateRefreshRate(): number {
    if (frametimes.length < 3) {
        return Infinity;
    }

    filterOutliers(4);
    const meanFrametime = getMeanFrametime();
    const rr = matchRefreshRate(1000 / meanFrametime);

    return rr;
}

/**
 * Matches inputted refresh rate to the closest common one
 * @param refreshRate 
 */
function matchRefreshRate(refreshRate: number): typeof commonRefreshRates[number] {
    refreshRate = Math.ceil(refreshRate);

    const closestRR = commonRefreshRates.reduce((prev, curr) => {
        const prevDiff = Math.abs(refreshRate-prev);
        const currDiff = Math.abs(refreshRate-curr)
        if (currDiff <= prevDiff) {
            return curr;
        } else {
            return prev;
        }
    });

    return closestRR;
}

function getMeanFrametime(): number {
    let ct = 0;
    let sum = 0;

    for (let i=0; i<frametimes.length; i++) {
        const value = Float64.normalizeValue(frametimes[i]);
        if (value === OUTLIER_VALUE) continue;

        sum += value;
        ct++;
    }

    const mean = (ct === 0) ? 0 : (sum / ct);
    return mean;
}

/**
 * Writes 0.0 to the outlier frametime values
 * @param ct 
 */
function filterOutliers(ct: number): void {
    ct = Math.min(Math.max(1, ct), Number.MAX_SAFE_INTEGER/2);

    // Filter high values
    for (let i=0; i<ct; i++) {
        let highIndex = 0;
        for (let j=1; j<frametimes.length; j++) {
            const prevValue = Float64.normalizeValue(frametimes[highIndex]);
            const currValue = Float64.normalizeValue(frametimes[j]);
            if (currValue > OUTLIER_VALUE && currValue > prevValue) {
                highIndex = j;
            }
        }
        
        const highValue = Float64.normalizeValue(frametimes[highIndex]);
        if (highValue === OUTLIER_VALUE) continue;

        frametimes[highIndex] = OUTLIER_VALUE;
    }

    // Filter low values
    for (let i=0; i<ct; i++) {
        let lowIndex = 0;
        for (let j=1; j<frametimes.length; j++) {
            const prevValue = Float64.normalizeValue(frametimes[lowIndex]);
            const currValue = Float64.normalizeValue(frametimes[j]);
            if (currValue > OUTLIER_VALUE && currValue < prevValue) {
                lowIndex = j;
            }
        }
        
        const lowValue = Float64.normalizeValue(frametimes[lowIndex]);
        if (lowValue === OUTLIER_VALUE) continue;
        
        frametimes[lowIndex] = OUTLIER_VALUE;
    }
}