import { GridBuffer, createBuffer } from "./utils.js";

import { shaderInit } from "./shaders/shaderInit.js";

import { sceneInit } from "./scene.js"


export let gridSize = 32;

export async function loadShader(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${filePath}`);
    }
    return await response.text();
}
  
export async function initialize(canvas) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice({requiredFeatures: ["float32-filterable"]});
    const context = canvas.getContext("webgpu");
    const format = "rgba8unorm";
    const usage = GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC;
    context.configure({ device, format, usage });
  
    const buffers = {}

    createBuffer(device, buffers, "gridSize", "Grid Size", 4, gridSize, 16, 128, 16,Int32Array);
    createBuffer(device, buffers, "renderMode", "Render Mode", 4, 0, undefined, undefined, undefined, Int32Array);
    createBuffer(device, buffers, "time", "Time", 4);
    createBuffer(device, buffers, "absorption", "Absorption", 4, 0.35, 0.0, 10.0, 0.05);
    createBuffer(device, buffers, "scattering", "Scattering", 4, 36.0, 0.0, 100.0, 0.1);
    createBuffer(device, buffers, "stepSize", "Step Size", 4, 0.05, 0.02, 0.5, 0.01);
    createBuffer(device, buffers, "lightStepSize", "Light Step Size", 4);
    createBuffer(device, buffers, "phase", "Phase", 4, 0.3, -1.0, 1.0, 0.01);
    createBuffer(device, buffers, "viscosity", "Viscosity", 4, 1.0, 0.0, 10.0, 0.1);
    createBuffer(device, buffers, "decay", "Decay", 4, 0.999, 0.950, 1.0, 0.001);
    createBuffer(device, buffers, "tViscosity", "Temperature Viscosity", 4, 1.0, 0.0, 10.0, 0.1);
    createBuffer(device, buffers, "explosionLocation", "Explosion Location", 12);
  
    const velocity = new GridBuffer("velocity", device, gridSize, 3);

    const density = new GridBuffer("density", device, gridSize);

    const divergence = new GridBuffer("divergence", device, gridSize);
    
    const pressure = new GridBuffer("pressure", device, gridSize);

    const temperature = new GridBuffer("temperature", device, gridSize);

    const smokeTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float", // 32-bit float for density values
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });
    
    const temperatureTexture = device.createTexture({
        size: [gridSize, gridSize, gridSize],
        format: "r32float",
        dimension: "3d",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });

    const textures = {
        smokeTexture: smokeTexture,
        temperatureTexture: temperatureTexture,
    };

    const smokeSampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'linear', // Enables trilinear sampling
        minFilter: 'linear',
    });
    
    const temperatureSampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear',
    });


    const computeShaders = {};
    const gridBuffers = {velocity: velocity, density: density, divergence: divergence, pressure: pressure, temperature: temperature};
    shaderInit(device,computeShaders);

    const sceneProps = await sceneInit(device, canvas, context, format);

    function smokeRender(computePass, canvasTexture, readableTexture, localModel, model, view, projection, camPos, canvasWidth, canvasHeight) {
        computeShaders.render.renderPass(
            device,
            computePass,
            [canvasTexture, readableTexture, smokeTexture, smokeSampler,
            temperatureTexture, temperatureSampler, buffers.stepSize.buffer,
            buffers.lightStepSize.buffer, buffers.absorption.buffer,
            buffers.scattering.buffer, buffers.phase.buffer,
            localModel, model, view, projection, camPos],
            canvasWidth / 8, canvasHeight / 8);
    }
    
    return {
        device,
        context,
        computeShaders,
        gridBuffers,
        textures,
        buffers,
        smokeRender,
        renderer:sceneProps.renderer,
        scene:sceneProps.scene,
        camera:sceneProps.camera,
    };
}
  