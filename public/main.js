import { initialize, gridSize } from './init.js';
import { handleInputs, writeTexture } from './utils.js';



async function main() {
    const canvas = document.getElementById("gpuCanvas");

    if (!navigator.gpu) {
        console.error("WebGPU not supported.");
        return;
    }

    const {
        device,
        context,
        timeBuffer,
        explosionLocationBuffer,
        renderModeBuffer,
        viscosityBuffer,
        tViscosityBuffer,
        decayBuffer,
        computeShaders,
        gridBuffers,
        modelBuffer,
        viewBuffer,
        projBuffer,
        invMVPBuffer,
        smokeTexture,
        temperatureTexture,
        inputBuffers,
        smokeRender,
        renderer,
        updateScene,
        scene,
        camera,
    } = await initialize(canvas);


    function resizeCanvasToDisplaySize(canvas) {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const displayWidth = Math.floor(canvas.clientWidth * devicePixelRatio);
        const displayHeight = Math.floor(canvas.clientHeight * devicePixelRatio);

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }
    }

    handleInputs(device, inputBuffers, gridBuffers, gridSize, computeShaders);

    let mouseClick = false;
    let workgroup_size = gridSize / 4;
    let jacobi_iterations = 100;
    let pause = false;
    let frame_forward = false;

    canvas.addEventListener("click", (event) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (event.clientX - rect.left) / rect.width * gridSize;
        const mouseY = (event.clientY - rect.top) / rect.height * gridSize;
        device.queue.writeBuffer(explosionLocationBuffer, 0, new Float32Array([mouseX, mouseY,Math.random() * (18 - 12) + 12]));
        mouseClick = true;
    });

    document.addEventListener("keydown", (event) => {
        if (event.key >= "1" && event.key <= "4") {
            const renderModeValue = parseInt(event.key);
            device.queue.writeBuffer(renderModeBuffer,0,new Uint32Array([renderModeValue-1]));
        }
        if (event.code == 'Space'){
            pause = !pause;
            console.log(pause ? "Paused" : "Resumed");
        }
        if(event.code == 'ArrowRight'){
            frame_forward = true;
        }
    });

    function passage(device,pass,dt){
        if (mouseClick){
        computeShaders.explosion.computePass(
            device,
            pass,
            [gridBuffers.velocity.readBuffer,gridBuffers.density.readBuffer,gridBuffers.pressure.readBuffer,gridBuffers.temperature.readBuffer,explosionLocationBuffer,inputBuffers.gridSizeBuffer],
            workgroup_size, workgroup_size, workgroup_size);
        console.log("boom");
        mouseClick = false;
        }

        for (let i = 0; i < 40; i++){
        computeShaders.diffuse.computePass(
            device,
            pass,
            [gridBuffers.density, gridBuffers.temperature, inputBuffers.gridSizeBuffer, dt, viscosityBuffer, tViscosityBuffer],
            workgroup_size,workgroup_size,workgroup_size);
        }

        computeShaders.velocity.computePass(
        device,
        pass,
        [gridBuffers.velocity, gridBuffers.temperature.readBuffer, inputBuffers.gridSizeBuffer, dt],
        workgroup_size, workgroup_size, workgroup_size);

        computeShaders.advect.computePass(
        device,
        pass,
        [gridBuffers.velocity.readBuffer, gridBuffers.density, inputBuffers.gridSizeBuffer, dt, decayBuffer],
        workgroup_size, workgroup_size, workgroup_size);

        computeShaders.advect.computePass(
        device,
        pass,
        [gridBuffers.velocity.readBuffer, gridBuffers.temperature, inputBuffers.gridSizeBuffer, dt, decayBuffer],
        workgroup_size, workgroup_size, workgroup_size);
        
        computeShaders.divergence.computePass(
        device,
        pass,
        [gridBuffers.divergence.readBuffer, gridBuffers.velocity.readBuffer, inputBuffers.gridSizeBuffer],
        workgroup_size, workgroup_size, workgroup_size);

        for (let i = 0; i < jacobi_iterations; i++){
        computeShaders.pressure.computePass(
            device,
            pass,
            [gridBuffers.divergence.readBuffer, gridBuffers.pressure, inputBuffers.gridSizeBuffer],
            workgroup_size, workgroup_size, workgroup_size);
        }
        
        computeShaders.substract.computePass(
        device,
        pass,
        [gridBuffers.velocity.readBuffer, gridBuffers.pressure.readBuffer, inputBuffers.gridSizeBuffer],
        workgroup_size, workgroup_size, workgroup_size);

        writeTexture(device, smokeTexture, gridBuffers.density.readBuffer, gridSize);
        writeTexture(device, temperatureTexture, gridBuffers.temperature.readBuffer, gridSize);
    }

    let prevTime = performance.now();
    
    function frame() {
        let currTime = performance.now();
        const deltaTime = (currTime - prevTime) / 1000;
        prevTime = currTime
        workgroup_size = gridSize / 4;

        const timeArray = new Float32Array([deltaTime]);

        resizeCanvasToDisplaySize(canvas);

        device.queue.writeBuffer(timeBuffer,0,timeArray.buffer,0,timeArray.byteLength);

        const commandEncoder = device.createCommandEncoder();

        updateScene(currTime, deltaTime);
        renderer.render(scene, camera);

        const canvasTexture = context.getCurrentTexture();
        const readableTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.STORAGE_BINDING
        });
        commandEncoder.copyTextureToTexture(
            { texture: canvasTexture },
            { texture: readableTexture },
            [canvas.width, canvas.height, 1]
        );

        const computePass = commandEncoder.beginComputePass();

        if (!pause){
            passage(device,computePass,timeBuffer);
        } else if(frame_forward){
            passage(device,computePass,timeBuffer);
            frame_forward = false;
        }

        smokeRender(computePass, canvasTexture, readableTexture, canvas.width, canvas.height);
        computePass.end();
        device.queue.submit([commandEncoder.finish()]);
        
        requestAnimationFrame(frame);
    }

    /* const gui = new GUI();
    const controller = camera.getComponentOfType(FirstPersonController);
    gui.add(controller, 'pointerSensitivity', 0.0001, 0.01);
    gui.add(controller, 'maxSpeed', 0, 10);
    gui.add(controller, 'decay', 0, 1);
    gui.add(controller, 'acceleration', 1, 100); */
    

    requestAnimationFrame(() => {frame()});
}

main();