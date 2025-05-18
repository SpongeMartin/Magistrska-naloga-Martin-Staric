import { advectShader } from "./advect.js";
import { divergenceShader } from "./divergence.js";
import { explosionShader } from "./explosion.js";
import { pressureShader } from "./jacobi.js";
import { gradientSubstractionShader } from "./substraction.js";
import { velocityAdvectionShader } from "./velocity.js";
import { renderingShader } from "./render.js";
import { diffuseShader } from "./diffuse.js";
import { debugShader } from "./debugShader.js";

export function shaderInit(device, computeShaders) {
    explosionShader(device,computeShaders);
    advectShader(device,computeShaders);
    diffuseShader(device,computeShaders);
    velocityAdvectionShader(device,computeShaders);
    divergenceShader(device,computeShaders);
    pressureShader(device,computeShaders);
    gradientSubstractionShader(device,computeShaders);
    renderingShader(device,computeShaders);
    debugShader(device,computeShaders);
}