struct ComplexPair {
    real: f32
    imag: f32
}

const PI: f32 = 245850922.0 / 78256779.0;

@group(0) @binding(0)
var<storage, read> audio_samples: array<f32>;

@group(0) @binding(1)
var<storage, write> complex_samples: array<ComplexPair>;

@compute @workgroup_size(64)
fn preprocess_samples(
    @builtin(global_invocation_id) gid: vec3u
) {
    let i = gid.x;
    let len = arrayLength(&audio_samples);
    if (i >= len) {
        return;
    }

    complex_samples[i] = ComplexPair(audio_samples[i], 0.0);
}

@group(1) @binding(0)
var<storage, read> dft_input: array<ComplexPair>;

@group(1) @binding(1)
var<storage, write> dft_output: array<ComplexPair>;

@compute @workgroup_size(64)
fn dft(
    @builtin(global_invocation_id) gid: vec3u
) {
    let n = gid.x;
    let N = arrayLength(&dft_input);
    if (n >= N) {
        return;
    }
    dft_output[n] = compute_dft(n, N, false);
}

@compute @workgroup_size(64)
fn idft(
    @builtin(global_invocation_id) gid: vec3u
) {
    let n = gid.x;
    let N = arrayLength(&dft_input);
    if (n >= N) {
        return;
    }
    dft_output[n] = compute_dft(n, N, true);
}

fn compute_dft(n: u32, N: u32, inverse: bool) -> ComplexPair {
    var real: f32 = 0.0;
    var imag: f32 = 0.0;

    let angle_factor: f32 = select(-2.0, 2.0, inverse);
    for (var k=0u; k<N; k++) {
        let angle = (angle_factor * PI * f32(n) * f32(k)) / f32(N);
        let s: ComplexPair = dft_input[k];
        real += s.real * cos(angle) - s.imag * sin(angle);
        imag += s.real * sin(angle) + s.imag * cos(angle);
    }

    let divisor: f32 = select(1.0, f32(N), inverse);
    return ComplexPair(real / divisor, imag / divisor);
}