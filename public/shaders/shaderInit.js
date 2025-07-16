import { advectShader } from "./advect.js";
import { divergenceShader } from "./divergence.js";
import { explosionShader } from "./explosion.js";
import { pressureShader } from "./jacobi.js";
import { gradientSubstractionShader } from "./substraction.js";
import { velocityAdvectionShader } from "./velocity.js";
import { renderingShader } from "./render.js";
import { diffuseShader } from "./diffuse.js";
import { debugShader } from "./debugShader.js";
import { createBuffer, GridBuffer, raycastAABBsFromCamera } from "../utils.js";
import { buffers, allInstanceData } from "../init.js";
import { vec3, vec4 } from "../glm.js";

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

export function explosionInstance(device, gridSize, scene, camera) {
    const instanceBuffers = {};
    const instanceTextures = {};

    instanceBuffers.velocity = new GridBuffer("velocity", device, gridSize, 4);
    
    instanceBuffers.density = new GridBuffer("density", device, gridSize);

    instanceBuffers.divergence = new GridBuffer("divergence", device, gridSize);
    
    instanceBuffers.pressure = new GridBuffer("pressure", device, gridSize);

    instanceBuffers.temperature = new GridBuffer("temperature", device, gridSize);

    instanceTextures.smokeTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float", // 32-bit float for density values
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    instanceTextures.temperatureTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    instanceTextures.pressureTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    instanceTextures.divergenceTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    instanceTextures.velocityTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "rgba32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });

    const calculateLocation = raycastAABBsFromCamera(scene, camera, 5);

    console.log([...calculateLocation.location]);
    // Define custom locations for later testing of multiple explosions - example.
    //const customLoc = vec3.create(0.0, 3.0, -6.0);
    //calculateLocation.location = customLoc;

    allInstanceData.push({instanceBuffers: instanceBuffers, instanceTextures:instanceTextures, instanceLocation: calculateLocation.location})
}

export function initBuffers(device, gridSize){
    createBuffer(device, buffers, "gridSize", "Grid Size", 4, gridSize, 16, 128, 16, true, Int32Array);
    createBuffer(device, buffers, "renderMode", "Render Mode", 4, 0, undefined, undefined, undefined, false, Int32Array);
    createBuffer(device, buffers, "time", "Time", 4);
    createBuffer(device, buffers, "absorption", "Absorption", 4, 1.6, 0.0, 10.0, 0.05, true);
    createBuffer(device, buffers, "scattering", "Scattering", 4, 30.0, 0.0, 100.0, 0.1, true);
    createBuffer(device, buffers, "stepSize", "Step Size", 4, 0.15, 0.02, 0.5, 0.01, true);
    createBuffer(device, buffers, "lightStepSize", "Light Step Size", 4);
    createBuffer(device, buffers, "phase", "Phase", 4, 0.18, -1.0, 1.0, 0.01, true);
    createBuffer(device, buffers, "viscosity", "Viscosity", 4, 1.0, 0.0, 10.0, 0.1, true);
    createBuffer(device, buffers, "decay", "Decay", 4, 0.996, 0.950, 1.0, 0.001, true);
    createBuffer(device, buffers, "tViscosity", "Temperature Viscosity", 4, 1.8, 0.0, 10.0, 0.1, true);
    createBuffer(device, buffers, "explosionLocation", "Explosion Location", 12);
}