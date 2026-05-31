/**
 * @param min Inclusive
 * @param max Exclusive
 * @returns 
 */
export function randFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/**
 * @param min Inclusive integer
 * @param max Inclusive integer
 */
export function randInt(min: number, max: number): number {
    min = Math.min(min);
    max = Math.max(max);
    return Math.floor(Math.random() * (max-min+1) + min);
}