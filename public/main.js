import { initialize } from './init.js';



async function main() {
  const canvas = document.getElementById("gpuCanvas");
  if (!navigator.gpu) {
    console.error("WebGPU not supported.");
    return;
  }

  const {
    device,
    context,
    gridSizeBuffer,
    timeBuffer,
    explosionLocationBuffer,
    computeShaders,
    renderPipeline,
    renderBindGroup,
    density,
    velocity,
    pressure,
    divergence
  } = await initialize(canvas);

  let gridSize = 256;
  let previousTime = 0
  let mouseClick = false;
  let workgroup_size = Math.ceil(gridSize / 16);

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) / rect.width * gridSize;
    const mouseY = (1 - (event.clientY - rect.top) / rect.height) * gridSize;
    device.queue.writeBuffer(explosionLocationBuffer, 0, new Float32Array([mouseX, mouseY]));
    mouseClick = true;
  });

  function passage(device,pass,velocity,density,pressure,divergence,gridSizeBuffer,explosionLocationBuffer,dt){
    if (mouseClick){
      computeShaders.explosion.computePass(
        device,
        pass,
        [velocity.readBuffer,density.readBuffer,pressure.readBuffer,explosionLocationBuffer,gridSizeBuffer],
        workgroup_size, workgroup_size);
      mouseClick = false;
    }

    computeShaders.velocity.computePass(
      device,
      pass,
      [velocity, gridSizeBuffer, dt],
      workgroup_size, workgroup_size);

    computeShaders.advect.computePass(
      device,
      pass,
      [velocity.readBuffer, density, gridSizeBuffer, dt],
      workgroup_size, workgroup_size);
    
    computeShaders.divergence.computePass(
      device,
      pass,
      [divergence.readBuffer, velocity.readBuffer, gridSizeBuffer],
      workgroup_size, workgroup_size);

    for (let i = 0; i < 40; i++){
      computeShaders.pressure.computePass(
        device,
        pass,
        [divergence.readBuffer, pressure, gridSizeBuffer],
        workgroup_size, workgroup_size);
    }
    
    computeShaders.substract.computePass(
      device,
      pass,
      [velocity.readBuffer, pressure.readBuffer, gridSizeBuffer],
      workgroup_size, workgroup_size);
  }

  
  function frame(currentTime) {
    const deltaTime = (currentTime - previousTime) / 1000;

    const timeArray = new Float32Array([deltaTime]);

    device.queue.writeBuffer(timeBuffer,0,timeArray.buffer,0,timeArray.byteLength);

    const commandEncoder = device.createCommandEncoder();

    // Compute pass for advection
    const computePass = commandEncoder.beginComputePass();
    passage(device,computePass,velocity,density,pressure,divergence,gridSizeBuffer,explosionLocationBuffer,timeBuffer);
    computePass.end();

    // Rendering (visualize the density buffer)
    const textureView = context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(6);
    renderPass.end();

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

