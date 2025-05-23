import { ComputeShader } from "../utils.js";

export function pressureShader(device, computeShaders) {
    computeShaders.pressure = new ComputeShader("jacobi", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> divergence_in : array<f32>;
    @group(0) @binding(1) var<storage, read> pressure_in : array<f32>;
    @group(0) @binding(2) var<storage, read_write> pressure_out: array<f32>;
    @group(0) @binding(3) var<uniform> gridSize : u32;

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>){
        let x = global_id.x;
        let y = global_id.y;
        let z = global_id.z;
        let gs = gridSize;
        let gs2 = gs * gs;
        let idx = x + y * gs + z * gs2;

        let xL = pressure_in[clamp(x - 1, 0, gs) + y * gs + z * gs2];
        let xR = pressure_in[clamp(x + 1, 0, gs) + y * gs + z * gs2];
        let xB = pressure_in[x + clamp(y - 1, 0, gs) * gs + z * gs2];
        let xT = pressure_in[x + clamp(y + 1, 0, gs) * gs + z * gs2];
        let xF = pressure_in[x + y * gs + clamp(z + 1, 0, gs) * gs2];
        let xBa = pressure_in[x + y * gs + clamp(z - 1, 0, gs) * gs2];
        
        let div = divergence_in[idx];
        
        let rBeta = 1.0/6.0; // reciporal (neighbour contribution?)
        let alpha = -1.0; // unit grid scaling? todo
        // evaluate Jacobi iteration TODO: Replace with Conjugate gradient.
        let pressureResult = (xL + xR + xB + xT + xF + xBa + alpha * div) * rBeta;

        pressure_out[idx] = pressureResult;
    }`);
}