import { ComputeShader, borderControl } from "../utils.js";

export function gradientSubtractionShader(device, computeShaders) {
    computeShaders.substract = new ComputeShader("gradient subtraction", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read_write> velocity : array<vec2<f32>>;
    @group(0) @binding(1) var<storage, read_write> pressure_in : array<f32>;
    @group(0) @binding(2) var<uniform> gridSize : u32;

    ${borderControl("pressure_in","pressure_in","0")}
    ${borderControl("velocity","velocity","vec2<f32>(0,0)","velocityBorder")}

    @compute @workgroup_size(16,16)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>){
        let x = global_id.x;
        let y = global_id.y;
        let idx = x + y * gridSize;
        let gs = gridSize - 1;

        // Fix
        borderControl(1, x, y, idx);

        let pL = pressure_in[clamp(x - 1, 0, gs) + y * gridSize];
        let pR = pressure_in[clamp(x + 1, 0, gs) + y * gridSize];
        let pB = pressure_in[x + clamp(y - 1, 0, gs) * gridSize];
        let pT = pressure_in[x + clamp(y + 1, 0, gs) * gridSize];
        
        velocity[idx] -= vec2<f32>((pR - pL),(pT - pB)) * 0.5;

        // Fix
        velocityBorder(1, x, y, idx);
    }`);
}