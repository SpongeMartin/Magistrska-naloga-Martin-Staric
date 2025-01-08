@group(0) @binding(0) var<storage, read_write> pressure : array<f32>;
@group(0) @binding(1) var<uniform> gridSize : u32;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    // Computing pressure with Jacobi iteration.
    // How many iterations? Where to define stop condition? Could just use different method
    let x = global_id.x;
    let y = global_id.y;

    if (x >= gridSize || y >= gridSize) {
        return;
    }

    let idx = y * gridSize + x;

    if (x == 0u || y == 0u || x == gridSize - 1u || y == gridSize - 1u) {
        return;
    }

    let left = idx - 1u;
    let right = idx + 1u;
    let up = idx - gridSize;
    let down = idx + gridSize;

    pressure[idx] = 0.25 * (pressure[left] + pressure[right] + pressure[up] + pressure[down] - (1.0 / (f32(gridSize) * f32(gridSize))) * pressure[idx]);
}