import { initialize, gridSize } from './init.js';
import { handleInputs } from './utils.js';

async function main() {
  const canvas = document.getElementById("gpuCanvas");
  console.log(canvas);
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
    cubeBuffer,
    computeShaders,
    density,
    velocity,
    pressure,
    divergence,
    temperature,
    modelBuffer,
    viewBuffer,
    projBuffer,
    invMVPBuffer,
    smokeTexture,
    temperatureTexture,
    inputBuffers,
    writeTexture,
    render,
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

  const aspectRatio = canvas.width / canvas.height;

  handleInputs(device,inputBuffers);

  let previousTime = 0;
  let mouseClick = false;
  let workgroup_size = gridSize / 4;
  let jacobi_iterations = 100;
  let pause = false;

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
  });


  function passage(device,pass,velocity,density,pressure,divergence,gridSizeBuffer,explosionLocationBuffer,dt,commandEncoder){
    if (mouseClick){
      computeShaders.explosion.computePass(
        device,
        pass,
        [velocity.readBuffer,density.readBuffer,pressure.readBuffer,temperature.readBuffer,explosionLocationBuffer,gridSizeBuffer],
        workgroup_size, workgroup_size, workgroup_size);
      console.log("boom");
      mouseClick = false;
    }

    for (let i = 0; i < 30; i++){
      computeShaders.diffuse.computePass(
        device,
        pass,
        [density, temperature, gridSizeBuffer, dt, viscosityBuffer, tViscosityBuffer],
        workgroup_size,workgroup_size,workgroup_size);
    }

    computeShaders.velocity.computePass(
      device,
      pass,
      [velocity, temperature.readBuffer, gridSizeBuffer, dt],
      workgroup_size, workgroup_size, workgroup_size);

    computeShaders.advect.computePass(
      device,
      pass,
      [velocity.readBuffer, density, gridSizeBuffer, dt, decayBuffer],
      workgroup_size, workgroup_size, workgroup_size);

    computeShaders.advect.computePass(
      device,
      pass,
      [velocity.readBuffer, temperature, gridSizeBuffer, dt, decayBuffer],
      workgroup_size, workgroup_size, workgroup_size);
    
    computeShaders.divergence.computePass(
      device,
      pass,
      [divergence.readBuffer, velocity.readBuffer, gridSizeBuffer],
      workgroup_size, workgroup_size, workgroup_size);

    for (let i = 0; i < jacobi_iterations; i++){
      computeShaders.pressure.computePass(
        device,
        pass,
        [divergence.readBuffer, pressure, gridSizeBuffer],
        workgroup_size, workgroup_size, workgroup_size);
    }
    
    computeShaders.substract.computePass(
      device,
      pass,
      [velocity.readBuffer, pressure.readBuffer, gridSizeBuffer],
      workgroup_size, workgroup_size, workgroup_size);

    writeTexture(smokeTexture,density.readBuffer);
    writeTexture(temperatureTexture,temperature.readBuffer);
  }

  function frame(currentTime) {
    const deltaTime = (currentTime - previousTime) / 1000;

    const timeArray = new Float32Array([deltaTime]);

    resizeCanvasToDisplaySize(canvas);

    device.queue.writeBuffer(timeBuffer,0,timeArray.buffer,0,timeArray.byteLength);

    const commandEncoder = device.createCommandEncoder();

    // Compute pass for advection
    /* readBuffer(device,density.readBuffer,commandEncoder); */
    const computePass = commandEncoder.beginComputePass();
    if (!pause){
        passage(device,computePass,velocity,density,pressure,divergence,inputBuffers.gridSizeBuffer,explosionLocationBuffer,timeBuffer,commandEncoder);
    }
    render(computePass,canvas.width, canvas.height);
    computePass.end();
    device.queue.submit([commandEncoder.finish()]);
    
    setTimeout(() => {
      requestAnimationFrame(frame);
    }, 0);
  }

  requestAnimationFrame((time) => {
    previousTime = time;
    frame(time)});
  }

main();