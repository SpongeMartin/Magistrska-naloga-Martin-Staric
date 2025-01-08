@group(0) @binding(0) var<storage, read_write> density : array<f32>;
@group(0) @binding(1) var<uniform> gridSize : u32;


@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let x = global_id.x;
  let y = global_id.y;
  let idx = y * gridSize + x;

  if (x < gridSize && y < gridSize) {
    density[idx] += 0.001 * f32(x + 1);
  }
}
