import { initialize, gridSize } from './init.js';
import { writeTexture, GUI } from './utils.js';
import { updateScene } from './scene.js';
import { Transform } from '/core.js';
import { getGlobalViewMatrix, getProjectionMatrix } from "./core/SceneUtils.js";
import { mat4 } from '/glm.js';

async function main() {
    const canvas = document.getElementById("gpuCanvas");

    if (!navigator.gpu) {
        console.error("WebGPU not supported.");
        return;
    }

    const {
        device,
        context,
        computeShaders,
        gridBuffers,
        textures,
        buffers,
        smokeRender,
        debugRender,
        renderer,
        scene,
        camera,
    } = await initialize(canvas);

    let mouseClick = false;
    let jacobi_iterations = 20;
    let diffusion_iterations = 10;
    let debug = false;
    let pause = false;
    let frame_forward = false;

    const gui = new GUI(device,buffers);
    gui.init();

    function resizeCanvasToDisplaySize(canvas) {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const displayWidth = Math.floor(canvas.clientWidth * devicePixelRatio);
        const displayHeight = Math.floor(canvas.clientHeight * devicePixelRatio);

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }
    }

    canvas.addEventListener("click", (event) => {
        /* const rect = canvas.getBoundingClientRect();
        const mouseX = (event.clientX - rect.left) / rect.width * gridSize;
        const mouseY = (event.clientY - rect.top) / rect.height * gridSize;
        device.queue.writeBuffer(buffers.explosionLocation.buffer, 0, new Float32Array([mouseX, mouseY,Math.random() * (18 - 12) + 12])); */
        let low = gridSize.value / 2 - 4;
        let high = gridSize.value / 2 + 4;
        device.queue.writeBuffer(buffers.explosionLocation.buffer, 0, new Float32Array([Math.random() * (high - low) + low, Math.random() * (high - low) + low, Math.random() * (high - low) + low]));
        mouseClick = true;
    });

    document.addEventListener("keydown", (event) => {
        if (event.key >= "1" && event.key <= "4") {
            const renderModeValue = parseInt(event.key);
            device.queue.writeBuffer(buffers.renderMode.buffer,0,new Uint32Array([renderModeValue-1]));
        }
        if (event.code == 'Space'){
            pause = !pause;
            console.log(pause ? "Paused" : "Resumed");
        }
        if(event.code == 'ArrowRight'){
            frame_forward = true;
        }
    });

    function passage(device, pass, workgroup_size){
        if (mouseClick){
        computeShaders.explosion.computePass(
            device,
            pass,
            [gridBuffers.velocity.readBuffer,gridBuffers.density.readBuffer,
            gridBuffers.pressure.readBuffer,gridBuffers.temperature.readBuffer,
            buffers.explosionLocation.buffer,buffers.gridSize.buffer],
            workgroup_size, workgroup_size, workgroup_size);
        console.log("boom");
        mouseClick = false;
        }

        for (let i = 0; i < diffusion_iterations; i++){
            computeShaders.diffuse.computePass(
                device,
                pass,
                [gridBuffers.density, gridBuffers.temperature,
                buffers.gridSize.buffer, buffers.time.buffer, 
                buffers.viscosity.buffer, buffers.tViscosity.buffer],
                workgroup_size,workgroup_size,workgroup_size);
        }

        computeShaders.velocity.computePass(
        device,
        pass,
        [gridBuffers.velocity, gridBuffers.temperature.readBuffer,
        buffers.gridSize.buffer, buffers.time.buffer],
        workgroup_size, workgroup_size, workgroup_size);

        computeShaders.advect.computePass(
        device,
        pass,
        [gridBuffers.velocity.readBuffer, gridBuffers.density,
        buffers.gridSize.buffer, buffers.time.buffer, 
        buffers.decay.buffer],
        workgroup_size, workgroup_size, workgroup_size);

        computeShaders.advect.computePass(
        device,
        pass,
        [gridBuffers.velocity.readBuffer, gridBuffers.temperature, 
        buffers.gridSize.buffer, buffers.time.buffer, 
        buffers.decay.buffer],
        workgroup_size, workgroup_size, workgroup_size);
        
        computeShaders.divergence.computePass(
        device,
        pass,
        [gridBuffers.divergence.readBuffer, gridBuffers.velocity.readBuffer, buffers.gridSize.buffer],
        workgroup_size, workgroup_size, workgroup_size);

        for (let i = 0; i < jacobi_iterations; i++){
        computeShaders.pressure.computePass(
            device,
            pass,
            [gridBuffers.divergence.readBuffer, gridBuffers.pressure, buffers.gridSize.buffer],
            workgroup_size, workgroup_size, workgroup_size);
        }
        
        computeShaders.substract.computePass(
        device,
        pass,
        [gridBuffers.velocity.readBuffer, gridBuffers.pressure.readBuffer, buffers.gridSize.buffer],
        workgroup_size, workgroup_size, workgroup_size);

        writeTexture(device, textures.smokeTexture, gridBuffers.density.readBuffer);
        writeTexture(device, textures.temperatureTexture, gridBuffers.temperature.readBuffer);
        if (debug) {
            writeTexture(device, textures.pressureTexture, gridBuffers.pressure.readBuffer);
            writeTexture(device, textures.divergenceTexture, gridBuffers.divergence.readBuffer);
            writeTexture(device, textures.velocityTexture, gridBuffers.velocity.readBuffer, 4);
        }
    }

    let prevTime = performance.now();
    
    function frame() {
        let currTime = performance.now();
        const deltaTime = (currTime - prevTime) / 1000;
        prevTime = currTime;
        const timeArray = new Float32Array([deltaTime]);
        device.queue.writeBuffer(buffers.time.buffer,0,timeArray.buffer,0,timeArray.byteLength);

        const workgroup_size = gridSize.value / 4;

        resizeCanvasToDisplaySize(canvas);

        const canvasTexture = context.getCurrentTexture();
        const readableTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING
        });

        const commandEncoder = device.createCommandEncoder();

        updateScene(scene, currTime, deltaTime);
        renderer.render(scene, camera);
        
        commandEncoder.copyTextureToTexture(
            { texture: canvasTexture },
            { texture: readableTexture },
            [canvas.width, canvas.height, 1]
        );

        const explosion = new Transform({translation: [0.0, 3.0, -6.0], scale: [3.0, 3.0, 3.0]});

        const transform = camera.getComponentOfType(Transform);

        const viewMatrix = getGlobalViewMatrix(camera);
        const projectionMatrix = getProjectionMatrix(camera);

        const inverseViewMatrix = mat4.invert(mat4.create(), viewMatrix);
        const inverseProjectionMatrix = mat4.invert(mat4.create(), projectionMatrix);

        const uniformMatrices = device.createBuffer({
            size: 192,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
        });

        device.queue.writeBuffer(uniformMatrices, 0, explosion.matrix.buffer);
        device.queue.writeBuffer(uniformMatrices, 64, inverseViewMatrix.buffer);
        device.queue.writeBuffer(uniformMatrices, 128, inverseProjectionMatrix.buffer);

        const cameraPos = device.createBuffer({
            size: 16, // 16 floats * 4 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false,
        });

        const camPos = new Float32Array(transform.translation);

        device.queue.writeBuffer(cameraPos, 0, camPos.buffer);

        const computePass = commandEncoder.beginComputePass();

        if (!pause) {
            passage(device,computePass,workgroup_size);
        } else if(frame_forward) {
            passage(device,computePass,workgroup_size);
            frame_forward = false;
        }

        
        if (debug) debugRender(computePass, canvasTexture, readableTexture, uniformMatrices, cameraPos, canvas.width, canvas.height);
        else smokeRender(computePass, canvasTexture, readableTexture, uniformMatrices, cameraPos, canvas.width, canvas.height);
        computePass.end();

        device.queue.submit([commandEncoder.finish()]);
        
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(() => {frame()});
}

main();