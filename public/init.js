import { shaderInit, initGPUObjects } from "./shaders/shaderInit.js";

import { sceneInit } from "./scene.js"


export const gridSize = {value: 32};

export async function loadShader(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${filePath}`);
    }
    return await response.text();
}

export const buffers = {};
export const gridBuffers = {};
export const textures = {};
  
export async function initialize(canvas) {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice({requiredFeatures: ["float32-filterable"]});
    const context = canvas.getContext("webgpu");
    const format = "rgba8unorm";
    const usage = GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC;
    context.configure({ device, format, usage });
    

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
    
    const velocitySampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'nearest',
        minFilter: 'nearest',
    });
    
    const pressureSampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'nearest',
        minFilter: 'nearest',
    });
    
    const divergenceSampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
        magFilter: 'nearest',
        minFilter: 'nearest',
    });

    const computeShaders = {}
    shaderInit(device, computeShaders);
    initGPUObjects(device, gridSize.value);

    const sceneProps = await sceneInit(device, canvas, context, format);

    function smokeRender(computePass, canvasTexture, readableTexture, uniformMatrices, camPos, canvasWidth, canvasHeight) {
        computeShaders.render.renderPass(
            device,
            computePass,
            {0:[canvasTexture, readableTexture, textures.smokeTexture, smokeSampler,
                textures.temperatureTexture, temperatureSampler],
             1:[buffers.stepSize.buffer,
                buffers.lightStepSize.buffer, buffers.absorption.buffer,
                buffers.scattering.buffer, buffers.phase.buffer, camPos],
             2:[uniformMatrices]},
            canvasWidth / 8, canvasHeight / 8);
    }

    function debugRender(computePass, canvasTexture, readableTexture, uniformMatrices, camPos, canvasWidth, canvasHeight) {
        computeShaders.debug.renderPass(
            device,
            computePass,
            {0:[canvasTexture, readableTexture, textures.pressureTexture, textures.velocityTexture, textures.divergenceTexture], 
             1:[pressureSampler, velocitySampler, divergenceSampler],
             2:[uniformMatrices],
             3:[camPos, buffers.renderMode.buffer, buffers.stepSize.buffer]},
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
        debugRender,
        renderer:sceneProps.renderer,
        scene:sceneProps.scene,
        camera:sceneProps.camera,
    };
}
  