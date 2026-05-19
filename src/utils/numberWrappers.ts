export abstract class NumberWrapper {
    protected __value: number | bigint;

    public abstract readonly bytes: number;
    public abstract readonly signed: boolean;
    public abstract readonly float: boolean;
    public abstract readonly MIN: number | bigint;
    public abstract readonly MAX: number | bigint;

    constructor(value: number | bigint) {
        this.__value = this.normalizeValue(value);
    }

    get value(): number | bigint {
        return this.__value;
    }

    set value(newValue: number | bigint) {
        this.__value = this.normalizeValue(newValue);
    }

    public abstract normalizeValue(value: number | bigint): number | bigint;
}

abstract class IntegerWrapper extends NumberWrapper {
    declare protected __value: bigint;

    public override readonly float = false;
    declare public readonly MIN: bigint;
    declare public readonly MAX: bigint;

    public override normalizeValue(value: number | bigint): bigint {
        if (typeof value === "number") {
            value = BigInt(value);
        }
        value = value < this.MIN ? this.MIN : value;
        value = value > this.MAX ? this.MAX : value;
        return value;
    }
}

abstract class FloatWrapper extends NumberWrapper {
    declare protected __value: number;

    public override readonly signed = true;
    public override readonly float = true;
    declare public readonly MIN: number;
    declare public readonly MAX: number;

    protected abstract readonly decimalDigits: number;

    public override normalizeValue(value: number): number {
        value = Math.max(this.MIN, value);
        value = Math.min(value, this.MAX);
        value = roundToDecimal(value, this.decimalDigits);
        return value;
    }
}

abstract class SignedIntegerWrapper extends IntegerWrapper {
    public override readonly signed = true;
}

abstract class UnsignedIntegerWrapper extends IntegerWrapper {
    public override readonly signed = false;
    public override readonly MIN = 0n;
}

export class Int8 extends SignedIntegerWrapper {
    public override readonly bytes = 1;
    public override readonly MIN = (-2n) ** BigInt(this.bytes*8 - 1);
    public override readonly MAX = (2n ** BigInt(this.bytes*8 - 1)) - 1n;
}

export class Int16 extends SignedIntegerWrapper {
    public override readonly bytes = 2;
    public override readonly MIN = (-2n) ** BigInt(this.bytes*8 - 1);
    public override readonly MAX = (2n ** BigInt(this.bytes*8 - 1)) - 1n;
}

export class Int32 extends SignedIntegerWrapper {
    public override readonly bytes = 4;
    public override readonly MIN = (-2n) ** BigInt(this.bytes*8 - 1);
    public override readonly MAX = (2n ** BigInt(this.bytes*8 - 1)) - 1n;
}

export class Int64 extends SignedIntegerWrapper {
    public override readonly bytes = 8;
    public override readonly MIN = (-2n) ** BigInt(this.bytes*8 - 1);
    public override readonly MAX = (2n ** BigInt(this.bytes*8 - 1)) - 1n;
}

export class Uint8 extends UnsignedIntegerWrapper {
    public override readonly bytes = 1;
    public override readonly MAX = BigInt(2**(this.bytes*8)) - 1n;
}

export class Uint16 extends UnsignedIntegerWrapper {
    public override readonly bytes = 2;
    public override readonly MAX = BigInt(2**(this.bytes*8)) - 1n;
}

export class Uint32 extends UnsignedIntegerWrapper {
    public override readonly bytes = 4;
    public override readonly MAX = BigInt(2**(this.bytes*8)) - 1n;
}

export class Uint64 extends UnsignedIntegerWrapper {
    public override readonly bytes = 8;
    public override readonly MAX = BigInt(2**(this.bytes*8)) - 1n;
}

export class Float16 extends FloatWrapper {
    public override readonly bytes = 2;
    public override readonly MIN = -1 * (2 - (2**-10)) * (2**15);
    public override readonly MAX = -1 * this.MIN;
    protected override readonly decimalDigits = 4;
}

export class Float32 extends FloatWrapper {
    public override readonly bytes = 4;
    public override readonly MIN = -1 * (2 - (2**-23)) * (2**127);
    public override readonly MAX = -1 * this.MIN;
    protected override readonly decimalDigits = 6;
}

export class Float64 extends FloatWrapper {
    public override readonly bytes = 8;
    public override readonly MIN = -1 * (2 - (2**-52)) * (2**1023);
    public override readonly MAX = -1 * this.MIN;
    protected override readonly decimalDigits = 15;
}

export type NumberWrapperTypes =
    typeof Int8 |
    typeof Int16 |
    typeof Int32 |
    typeof Int64 |
    typeof Uint8 |
    typeof Uint16 |
    typeof Uint32 |
    typeof Uint64 |
    typeof Float16 |
    typeof Float32 |
    typeof Float64;

function roundToDecimal(num: number, decimalDigits: number): number {
    const factor = 10 ** decimalDigits;
    return Math.round(num * factor) / factor;
}