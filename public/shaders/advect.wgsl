@group(0) @binding(0) var<storage, read_write> velocity : array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> density : array<f32>;
@group(0) @binding(2) var<uniform> gridSize : u32;
@group(0) @binding(3) var<uniform> dt : f32;

fn sample_density_at(position: vec2<f32>) -> f32 {
    // Bilinear interpolation
    let x0 = floor(position.x);
    let y0 = floor(position.y);
    let x1 = x0 + 1.0;
    let y1 = y0 + 1.0;

    let tx = position.x - x0;
    let ty = position.y - y0;

    let ix0 = u32(x0);
    let iy0 = u32(y0);
    let ix1 = u32(x1);
    let iy1 = u32(y1);

    // Fetch densities at the four corners
    let d00 = density[iy0 * gridSize + ix0];
    let d10 = density[iy0 * gridSize + ix1];
    let d01 = density[iy1 * gridSize + ix0];
    let d11 = density[iy1 * gridSize + ix1];

    // Perform bilinear interpolation
    let d0 = mix(d00, d10, tx);
    let d1 = mix(d01, d11, tx);

    return mix(d0, d1, ty);;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    // Advection is computed implicitly, meaning we take the velocities of closest 4 points from previous position and apply it to the quantity, in our case density.
    let x = global_id.x;
    let y = global_id.y;

    if (x >= gridSize || y >= gridSize) {
        return;
    }

    let idx = y * gridSize + x;
    let vel = velocity[idx];

    let prevPos = vec2<f32>(f32(x), f32(y)) - vel * dt;

    // Sample the previous position of the density (with bilinear interpolation)
    let newDensity = sample_density_at(prevPos);

    density[idx] = newDensity;
}