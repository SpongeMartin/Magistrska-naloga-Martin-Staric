import { ComputeShader, borderControl } from "../utils.js";

export function gradientSubstractionShader(device, computeShaders) {
    computeShaders.substract = new ComputeShader("gradient substraction", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read_write> velocity : array<vec3<f32>>;
    @group(0) @binding(1) var<storage, read_write> pressure_in : array<f32>;
    @group(0) @binding(2) var<uniform> gridSize : u32;

    ${borderControl("pressure_in","pressure_in","0")}
    ${borderControl("velocity","velocity","vec3<f32>(0,0,0)","velocityBorder")}

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>){
        let x = global_id.x;
        let y = global_id.y;
        let z = global_id.z;
        let gs = gridSize;
        let gs2 = gs * gs;
        let idx = x + y * gs + z * gs2;
        

        borderControl(1, x, y, z, idx);

        let pL = pressure_in[clamp(x - 1, 0, gs) + y * gs + z * gs2];
        let pR = pressure_in[clamp(x + 1, 0, gs) + y * gs + z * gs2];
        let pB = pressure_in[x + clamp(y - 1, 0, gs) * gs + z * gs2];
        let pT = pressure_in[x + clamp(y + 1, 0, gs) * gs + z * gs2];
        let pF = pressure_in[x + y * gs + clamp(z + 1, 0, gs) * gs2];
        let pBa = pressure_in[x + y * gs + clamp(z - 1, 0, gs) * gs2];
        
        velocity[idx] -= vec3<f32>((pR - pL),(pT - pB),(pF - pBa)) * .5;

        velocityBorder(1, x, y, z, idx);
    }`);
}