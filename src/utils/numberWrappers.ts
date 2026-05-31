export abstract class NumberWrapper {
    protected __value: number | bigint;

    public abstract readonly bytes: number;
    public abstract readonly signed: boolean;
    public abstract readonly float: boolean;
    public abstract readonly MIN: number | bigint;
    public abstract readonly MAX: number | bigint;

    constructor(value: number | bigint) {
        this.__value = value;
    }

    public abstract get value(): number | bigint;

    public abstract set value(newValue: number | bigint);

    public abstract normalizeValue(value: number | bigint): number | bigint;
}
// interface WrapperConstructor {
//     new (value: number | bigint): WrapperInterface;
// }
// interface WrapperInterface {
//     __value: number | bigint;
//     readonly bytes: number;
//     readonly signed: boolean;
//     readonly float: boolean;
//     readonly MIN: number | bigint;
//     readonly MAX: number | bigint;

//     get value(): number | bigint;
//     set value(newValue: number | bigint);
//     normalizeValue(value: number | bigint): number | bigint;
// }

abstract class IntegerWrapper extends NumberWrapper {
    declare protected __value: number | bigint;

    public override readonly float = false;

    public override get value(): number | bigint {
        return this.__value;
    };
    public override set value(newValue: number | bigint) {
        this.__value = this.normalizeValue(newValue);
    }

    public override normalizeValue(value: number | bigint): number | bigint {
        const min = BigInt(this.MIN);
        const max = BigInt(this.MAX);

        let newValue = BigInt(value);
        newValue = newValue < min ? min : newValue;
        newValue = newValue > max ? max : newValue;

        if (typeof value === "number") return Number(newValue);
        return newValue;
    }
}

abstract class FloatWrapper extends NumberWrapper {
    protected __value: number = 0;

    public override readonly signed = true;
    public override readonly float = true;
    public readonly MIN: number = 0;
    public readonly MAX: number = 0;

    protected abstract readonly decimalDigits: number;

    constructor(value: number) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): number {
        // console.log("bruhhhh", this.__value)
        return this.__value;
    };
    public override set value(newValue: number) {
        this.__value = this.normalizeValue(newValue);
    }

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
    declare public readonly MIN: 0 | 0n;
}

export class Int8 extends SignedIntegerWrapper {
    declare protected __value: number;
    
    public override readonly bytes = 1;
    public override readonly MIN = (-2) ** (this.bytes*8 - 1);
    public override readonly MAX = (2 ** (this.bytes*8 - 1)) - 1;

    constructor(value: number) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): number {
        return this.__value;
    };
    public override set value(newValue: number) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: number): number {
        return super.normalizeValue(value) as number;
    };
}

export class Int16 extends SignedIntegerWrapper {
    declare protected __value: number;
    
    public override readonly bytes = 2;
    public override readonly MIN = (-2) ** (this.bytes*8 - 1);
    public override readonly MAX = (2 ** (this.bytes*8 - 1)) - 1;

    constructor(value: number) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): number {
        return this.__value;
    };
    public override set value(newValue: number) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: number): number {
        return super.normalizeValue(value) as number;
    };
}

export class Int32 extends SignedIntegerWrapper {
    declare protected __value: number;
    
    public override readonly bytes = 4;
    public override readonly MIN = (-2) ** (this.bytes*8 - 1);
    public override readonly MAX = (2 ** (this.bytes*8 - 1)) - 1;

    constructor(value: number) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): number {
        return this.__value;
    };
    public override set value(newValue: number) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: number): number {
        return super.normalizeValue(value) as number;
    };
}

export class Int64 extends SignedIntegerWrapper {
    declare protected __value: bigint;
    
    public override readonly bytes = 8;
    public override readonly MIN = (-2n) ** BigInt(this.bytes*8 - 1);
    public override readonly MAX = (2n ** BigInt(this.bytes*8 - 1)) - 1n;

    constructor(value: bigint) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): bigint {
        return this.__value;
    };
    public override set value(newValue: bigint) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: bigint): bigint {
        return super.normalizeValue(value) as bigint;
    };
}

export class Uint8 extends UnsignedIntegerWrapper {
    declare protected __value: number;
    
    public override readonly bytes = 1;
    public override readonly MIN = 0;
    public override readonly MAX = (2**(this.bytes*8)) - 1;

    constructor(value: number) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): number {
        return this.__value;
    };
    public override set value(newValue: number) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: number): number {
        return super.normalizeValue(value) as number;
    };
}

export class Uint16 extends UnsignedIntegerWrapper {
    declare protected __value: number;
    
    public override readonly bytes = 2;
    public override readonly MIN = 0;
    public override readonly MAX = (2**(this.bytes*8)) - 1;

    constructor(value: number) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): number {
        return this.__value;
    };
    public override set value(newValue: number) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: number): number {
        return super.normalizeValue(value) as number;
    };
}

export class Uint32 extends UnsignedIntegerWrapper {
    declare protected __value: number;
    
    public override readonly bytes = 4;
    public override readonly MIN = 0;
    public override readonly MAX = (2**(this.bytes*8)) - 1;

    constructor(value: number) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): number {
        return this.__value;
    };
    public override set value(newValue: number) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: number): number {
        return super.normalizeValue(value) as number;
    };
}

export class Uint64 extends UnsignedIntegerWrapper {
    declare protected __value: bigint;
    
    public override readonly bytes = 8;
    public override readonly MIN = 0n;
    public override readonly MAX = BigInt(2**(this.bytes*8)) - 1n;

    constructor(value: bigint) {
        super(value);
        this.__value = this.normalizeValue(value);
    }

    public override get value(): bigint {
        return this.__value;
    };
    public override set value(newValue: bigint) {
        this.__value = this.normalizeValue(newValue);
    };

    public override normalizeValue(value: bigint): bigint {
        return super.normalizeValue(value) as bigint;
    };
}

export class Float16 extends FloatWrapper {
    public override readonly bytes = 2;
    public override readonly MIN = -1 * (2 - (2**-10)) * (2**15);
    public override readonly MAX = -1 * this.MIN;
    protected override readonly decimalDigits = 4;;
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
    typeof Float64
;

function roundToDecimal(num: number, decimalDigits: number): number {
    const factor = 10 ** decimalDigits;
    return Math.round(num * factor) / factor;
}