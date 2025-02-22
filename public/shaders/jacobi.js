import { ComputeShader } from "../utils.js";

export function pressureShader(device, computeShaders) {
    computeShaders.pressure = new ComputeShader("jacobi", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> divergence_in : array<f32>;
    @group(0) @binding(1) var<storage, read> pressure_in : array<f32>;
    @group(0) @binding(2) var<storage, read_write> pressure_out: array<f32>;
    @group(0) @binding(3) var<uniform> gridSize : u32;


    @compute @workgroup_size(16,16)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>){
        let x = global_id.x;
        let y = global_id.y;
        let idx = x + y * gridSize;
        let gs = gridSize - 1;

        let xL = pressure_in[clamp(x - 1, 0, gs) + y * gridSize];
        let xR = pressure_in[clamp(x + 1, 0, gs) + y * gridSize];
        let xB = pressure_in[x + clamp(y - 1, 0, gs) * gridSize];
        let xT = pressure_in[x + clamp(y + 1, 0, gs) * gridSize];
        
        let div = divergence_in[idx];
        
        let rBeta = 0.25; // reciporal (neighbour contribution?)
        let alpha = -1.0; // unit grid scaling? todo
        // evaluate Jacobi iteration
        let pressureResult = (xL + xR + xB + xT + alpha * div) * rBeta;

        pressure_out[idx] = pressureResult;

    }`);
}