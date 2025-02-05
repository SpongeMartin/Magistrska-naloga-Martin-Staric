import { ComputeShader } from "../utils.js";

export function gradientSubstractionShader(device, computeShaders) {
    computeShaders.substract = new ComputeShader("gradient substraction", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read_write> velocity : array<vec2<f32>>;
    @group(0) @binding(1) var<storage, read_write> pressure_in : array<f32>;
    @group(0) @binding(2) var<uniform> gridSize : u32;

    @compute @workgroup_size(16,16)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>){
        let x = global_id.x;
        let y = global_id.y;
        let idx = x + y * gridSize;
        let gs = gridSize - 1;

        let atLeft = (x == 0);
        let atRight = (x == gridSize - 1);
        let atTop = (y == gridSize - 1);
        let atBottom = (y == 0);

        if (atLeft) {
            pressure_in[idx] = pressure_in[idx + 1]; // Copy from inside
        }
        if (atRight) {
            pressure_in[idx] = pressure_in[idx - 1];
        }
        if (atTop) {
            pressure_in[idx] = pressure_in[idx - gridSize];
        }
        if (atBottom) {
            pressure_in[idx] = pressure_in[idx + gridSize];
        }

        let pL = pressure_in[clamp(x - 1, 0, gs) + y * gridSize];
        let pR = pressure_in[clamp(x + 1, 0, gs) + y * gridSize];
        let pB = pressure_in[x + clamp(y - 1, 0, gs) * gridSize];
        let pT = pressure_in[x + clamp(y + 1, 0, gs) * gridSize];
        
        velocity[idx] -= vec2<f32>((pR - pL),(pT - pB)) * 0.5;

        if (atLeft) {
            velocity[idx] = velocity[idx + 1]; // Copy velocity from the inside
        }
        if (atRight) {
            velocity[idx] = velocity[idx - 1];
        }
        if (atTop) {
            velocity[idx] = velocity[idx - gridSize];
        }
        if (atBottom) {
            velocity[idx] = velocity[idx + gridSize];
        }
    }`);
}