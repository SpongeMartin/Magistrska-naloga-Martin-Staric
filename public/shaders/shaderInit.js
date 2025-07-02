import { advectShader } from "./advect.js";
import { divergenceShader } from "./divergence.js";
import { explosionShader } from "./explosion.js";
import { pressureShader } from "./jacobi.js";
import { gradientSubstractionShader } from "./substraction.js";
import { velocityAdvectionShader } from "./velocity.js";
import { renderingShader } from "./render.js";
import { diffuseShader } from "./diffuse.js";
import { debugShader } from "./debugShader.js";
import { createBuffer, GridBuffer } from "../utils.js";
import { buffers, gridBuffers, textures } from "../init.js";

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

export function initGPUObjects(device, gridSize){
    createBuffer(device, buffers, "gridSize", "Grid Size", 4, gridSize, 16, 128, 16,Int32Array);
    createBuffer(device, buffers, "renderMode", "Render Mode", 4, 0, undefined, undefined, undefined, Int32Array);
    createBuffer(device, buffers, "time", "Time", 4);
    createBuffer(device, buffers, "absorption", "Absorption", 4, 0.15, 0.0, 10.0, 0.05);
    createBuffer(device, buffers, "scattering", "Scattering", 4, 59.6, 0.0, 100.0, 0.1);
    createBuffer(device, buffers, "stepSize", "Step Size", 4, 0.05, 0.02, 0.5, 0.01);
    createBuffer(device, buffers, "lightStepSize", "Light Step Size", 4);
    createBuffer(device, buffers, "phase", "Phase", 4, 0.08, -1.0, 1.0, 0.01);
    createBuffer(device, buffers, "viscosity", "Viscosity", 4, 1.0, 0.0, 10.0, 0.1);
    createBuffer(device, buffers, "decay", "Decay", 4, 0.999, 0.950, 1.0, 0.001);
    createBuffer(device, buffers, "tViscosity", "Temperature Viscosity", 4, 1.0, 0.0, 10.0, 0.1);
    createBuffer(device, buffers, "explosionLocation", "Explosion Location", 12);

    gridBuffers.velocity = new GridBuffer("velocity", device, gridSize, 4);
    
    gridBuffers.density = new GridBuffer("density", device, gridSize);

    gridBuffers.divergence = new GridBuffer("divergence", device, gridSize);
    
    gridBuffers.pressure = new GridBuffer("pressure", device, gridSize);

    gridBuffers.temperature = new GridBuffer("temperature", device, gridSize);

    textures.smokeTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float", // 32-bit float for density values
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    textures.temperatureTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    textures.pressureTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    textures.divergenceTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    textures.velocityTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "rgba32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
}