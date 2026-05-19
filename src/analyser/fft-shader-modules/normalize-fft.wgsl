// TODO: compute magnitude with Pythagorean theorum
// magnitude^2 = real^2 + imag^2
// normalized = magnitude * 2 / fftSize
// clamped = max(1e-6, normalized)
// db = 20 * log10(clamped)

// fn log10(x) -> f32 {
//   return log2(x) / log2(10);
// }