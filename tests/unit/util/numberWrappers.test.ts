import { TestFunction, test, expect } from "vitest";
import { randInt, randFloat } from "../../../src/utils/randomNumber";
import { NumberWrapper, Float16, Float32 } from "../../../src/utils/numberWrappers";

const NUMBER_TEST_COUNT = 1_000_000;

const testFloat32: TestFunction = function(context) {
    const { MIN, MAX } = new Float32(0);
    const values: number[] = new Array(NUMBER_TEST_COUNT)
        .fill(null)
        .map(() => randFloat(MIN, MAX));
    const floats: Float32[] = values.map((value) => new Float32(value));

    for (let i=0; i<values.length; i++) {
        expect(values[i]).toBe(floats[i].value);
    }
}

test(testFloat32, testFloat32);