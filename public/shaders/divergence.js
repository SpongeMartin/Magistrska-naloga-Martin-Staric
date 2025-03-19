import { ComputeShader } from "../utils.js";

export function divergenceShader(device, computeShaders) {
    computeShaders.divergence = new ComputeShader("divergence", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read_write> divergence_out : array<f32>;
    @group(0) @binding(1) var<storage, read_write> velocity_in : array<vec3<f32>>;
    @group(0) @binding(2) var<uniform> gridSize : u32;

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>){
        let x = global_id.x;
        let y = global_id.y;
        let z = global_id.z;
        let gridSize2 = gridSize * gridSize;
        let idx = x + y * gridSize + z * gridSize2;
        let gs = gridSize - 1;
    

        let xL = velocity_in[clamp(x - 1, 0, gs) + y * gridSize + z * gridSize2];
        let xR = velocity_in[clamp(x + 1, 0, gs) + y * gridSize + z * gridSize2];
        let xB = velocity_in[x + clamp(y - 1, 0, gs) * gridSize  + z * gridSize2];
        let xT = velocity_in[x + clamp(y + 1, 0, gs) * gridSize  + z * gridSize2];
        let xF = velocity_in[x + y * gridSize  + clamp(z + 1, 0, gs) * gridSize2];
        let xBa = velocity_in[x + y * gridSize  + clamp(z - 1, 0, gs) * gridSize2];
        
        divergence_out[idx] = ((xR.x - xL.x) + (xT.y - xB.y) + (xF.z - xBa.z)) * 0.5;
    }`);
}