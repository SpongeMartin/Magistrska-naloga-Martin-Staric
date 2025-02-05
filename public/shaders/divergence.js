import { ComputeShader } from "../utils.js";

export function divergenceShader(device, computeShaders) {
    computeShaders.divergence = new ComputeShader("divergence", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read_write> divergence_out : array<f32>;
    @group(0) @binding(1) var<storage, read_write> velocity_in : array<vec2<f32>>;
    @group(0) @binding(2) var<uniform> gridSize : u32;

    @compute @workgroup_size(16,16)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>){
        let x = global_id.x;
        let y = global_id.y;
        let idx = x + y * gridSize;
        let gs = gridSize - 1;
        
        /* let xL = velocity_in[idx - 1];
        let xR = velocity_in[idx + 1];
        let xB = velocity_in[idx - gridSize];
        let xT = velocity_in[idx + gridSize]; */

        let xL = velocity_in[clamp(x - 1, 0, gs) + y * gridSize];
        let xR = velocity_in[clamp(x + 1, 0, gs) + y * gridSize];
        let xB = velocity_in[x + clamp(y - 1, 0, gs) * gridSize];
        let xT = velocity_in[x + clamp(y + 1, 0, gs) * gridSize];
        
        divergence_out[idx] = ((xR.x - xL.x) + (xT.y - xB.y)) * 0.5;
    }`);
}