import { ComputeShader, borderControl } from "../utils.js";
//     ${borderControl("density_in","density_out","0")}
export function diffuseShader(device, computeShaders) {
    computeShaders.diffuse = new ComputeShader("diffuse", device, /*wgsl*/`
    @group(0) @binding(0) var<storage, read> density_in : array<f32>;
    @group(0) @binding(1) var<storage, read_write> density_out : array<f32>;
    @group(0) @binding(2) var<storage, read> temperature_in : array<f32>;
    @group(0) @binding(3) var<storage, read_write> temperature_out : array<f32>;
    @group(0) @binding(4) var<uniform> gridSize : u32;
    @group(0) @binding(5) var<uniform> dt : f32;
    @group(0) @binding(6) var<uniform> viscosity : f32;
    @group(0) @binding(7) var<uniform> t_viscosity : f32;

    @compute @workgroup_size(4,4,4)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        let x = global_id.x;
        let y = global_id.y;
        let z = global_id.z;
        let gs = gridSize - 1;
        let gridSize2 = gridSize * gridSize;
        let idx = x + y * gridSize + z * gridSize2;

        let iL = clamp(x - 1, 0, gs) + y * gridSize + z * gridSize2;
        let iR = clamp(x + 1, 0, gs) + y * gridSize + z * gridSize2;
        let iB = x + clamp(y - 1, 0, gs) * gridSize + z * gridSize2;
        let iT = x + clamp(y + 1, 0, gs) * gridSize + z * gridSize2;
        let iF = x + y * gridSize + clamp(z + 1, 0, gs) * gridSize2;
        let iBa = x + y * gridSize + clamp(z - 1, 0, gs) * gridSize2;

        // Smoke

        let xL = density_out[iL];
        let xR = density_out[iR];
        let xB = density_out[iB];
        let xT = density_out[iT];
        let xF = density_out[iF];
        let xBa = density_out[iBa];

        let xC = density_in[idx];

        let xAlpha = viscosity * dt * f32(gridSize2);
        let xBeta = 1 / (1 + 6 * xAlpha);
        
        //density_out[idx] = (xC + xAlpha * (xL + xR + xB + xT + xF + xBa)) * xBeta;
        
        // Temperature

        let tL = temperature_out[iL];
        let tR = temperature_out[iR];
        let tB = temperature_out[iB];
        let tT = temperature_out[iT];
        let tF = temperature_out[iF];
        let tBa = temperature_out[iBa];

        let tC = temperature_in[idx];

        let tAlpha = t_viscosity * dt * f32(gridSize2);
        let tBeta = 1 / (1 + 6 * tAlpha);
        
        temperature_out[idx] = (tC + tAlpha * (tL + tR + tB + tT + tF + tBa)) * tBeta;
    }`);
}