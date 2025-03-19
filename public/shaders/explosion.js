import { ComputeShader } from "../utils.js";

export function explosionShader(device, computeShaders) {
    computeShaders.explosion = new ComputeShader("explosion", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read_write> velocity : array<vec3<f32>>;
    @group(0) @binding(1) var<storage, read_write> density : array<f32>;
    @group(0) @binding(2) var<storage, read_write> pressure : array<f32>;
    @group(0) @binding(3) var<uniform> explosionPos : vec3<f32>;
    @group(0) @binding(4) var<uniform> gridSize : u32;

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let x = global_id.x;
        let y = global_id.y;
        let z = global_id.z;
        let idx = x + y * gridSize + z * gridSize * gridSize;

        let cellPos = vec3<f32>(f32(x), f32(y), f32(z));
        let toCell = cellPos - explosionPos;
        let dist = length(toCell);
        let rad = 5.0; // Effected area
        let strength = 5.0; // How much force is applied
        let dissipate = 1.0;
        let density_factor = 0.05;

        let atLeft = (x == 0);
        let atRight = (x == gridSize - 1);
        let atTop = (y == gridSize - 1);
        let atBottom = (y == 0);
        let atFront = (z == 0);
        let atBack = (z == gridSize - 1);
        let edgeConditions = atLeft || atRight || atTop || atBottom || atFront || atBack;

        if (dist < rad && !edgeConditions) {
            let force = normalize(toCell) * (strength * (1.0 - (dist * dissipate) / rad));
            velocity[idx] += force;

            let densityIncrease = 3.0 * (1.0 - dist / rad);
            density[idx] += densityIncrease * density_factor;

            let pressureIncrease = 1.0 * (1.0 - dist / rad);
            pressure[idx] += pressureIncrease;

            if (density[idx] > 1.0){
                density[idx] = 1.0;
            }
        }
    }`);
}