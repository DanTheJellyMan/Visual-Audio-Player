struct ComplexPair {
    real: f32,
    imag: f32
}

const PI: f32 = 245850922.0 / 78256779.0;

@group(0) @binding(1)
var<storage, read> audio_samples: array<f32>;
@group(0) @binding(2)
var<storage, read_write> complex_samples: array<ComplexPair>;

@compute @workgroup_size(64)
fn preprocess_samples(
    @builtin(global_invocation_id) gid: vec3u
) {
    let i = gid.x;
    let len = gl_uniforms.fft.size;
    if (i >= len) {
        return;
    }

    complex_samples[i] = ComplexPair(audio_samples[i], 0.0);
}

@group(0) @binding(1)
var<storage, read> fft_input: array<ComplexPair>;
@group(0) @binding(2)
var<storage, read_write> fft_output: array<ComplexPair>;

fn complex_mul(a: ComplexPair, b: ComplexPair) -> ComplexPair {
    return ComplexPair(
        a.real * b.real - a.imag * b.imag,
        a.real * b.imag + a.imag * b.real
    );
}
fn complex_add(a: ComplexPair, b: ComplexPair) -> ComplexPair {
    return ComplexPair(
        a.real + b.real,
        a.imag + b.imag
    );
}
fn complex_sub(a: ComplexPair, b: ComplexPair) -> ComplexPair {
    return ComplexPair(
        a.real - b.real,
        a.imag - b.imag
    );
}
@compute @workgroup_size(64)
fn fft_stage(
    @builtin(global_invocation_id) gid: vec3u
) {
    let i = gid.x;
    if (i >= gl_uniforms.fft.size / 2u) {
        return;
    }

    // The size of each butterfly group.
    //
    // stage 0 -> 2
    // stage 1 -> 4
    // stage 2 -> 8
    // ...
    let half_size = 1u << gl_uniforms.fft.stage;
    let butterfly_size = half_size * 2u;

    // Which butterfly group are we in?
    let group = i / half_size;

    // Which position inside that butterfly?
    let j = i % half_size;

    // First element of this butterfly.
    let even_index = group * butterfly_size + j;

    // Second element of this butterfly.
    let odd_index = even_index + half_size;

    let even = fft_input[even_index];
    let odd = fft_input[odd_index];

    // ω^j
    let angle = -2.0 * PI * f32(j) / f32(butterfly_size);
    let omega = ComplexPair(cos(angle), sin(angle));
    let t = complex_mul(omega, odd);

    fft_output[even_index] = complex_add(even, t);
    fft_output[odd_index] = complex_sub(even, t);
}

fn compute_dft(n: u32, N: u32) -> ComplexPair {
    var complex_output = ComplexPair(0.0, 0.0);
    let inverse = bool(gl_uniforms.fft.inverse_bool);
    let angle_factor: f32 = select(-2.0, 2.0, inverse);

    for (var k=0u; k<N; k++) {
        let s: ComplexPair = fft_input[k];
        let angle = (angle_factor * PI * f32(n) * f32(k)) / f32(N);
        let omega = ComplexPair(cos(angle), sin(angle));
        let t = complex_mul(s, omega);
        complex_output = complex_add(complex_output, t);
    }

    let divisor: f32 = select(1.0, f32(N), inverse);
    return complex_output;
}
@compute @workgroup_size(64)
fn dft(
    @builtin(global_invocation_id) gid: vec3u
) {
    let n = gid.x;
    let N = gl_uniforms.fft.size;
    if (n >= N) {
        return;
    }
    fft_output[n] = compute_dft(n, N);
}

@group(0) @binding(1)
var<storage, read> mag_input: array<ComplexPair>;
@group(0) @binding(2)
var<storage, read_write> mag_output: array<f32>;

@compute @workgroup_size(64)
fn magnitude(
    @builtin(global_invocation_id) gid: vec3u
) {
    let i = gid.x;
    let size = gl_uniforms.fft.size;
    if (i >= size) {
        return;
    }

    let real = mag_input[i].real;
    let imag = mag_input[i].imag;
    let mag = sqrt(pow(real, 2.0) + pow(imag, 2.0)); // Pythagorean theorem
    var norm = mag * 2.0 / f32(size);
    let db = 20.0 * log10(max(norm, 1e-6));

    mag_output[i] = db;
}

fn log10(x: f32) -> f32 {
    // Logarithm base-change identity
    return log2(x) / log2(10.0);
}