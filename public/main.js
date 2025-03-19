import { initialize, gridSize } from './init.js';

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
    gridSizeBuffer,
    timeBuffer,
    explosionLocationBuffer,
    renderModeBuffer,
    cubeBuffer,
    renderPassDescriptor,
    computeShaders,
    renderPipeline,
    renderBindGroup,
    density,
    velocity,
    pressure,
    divergence,
    modelBuffer,
    viewBuffer,
    projBuffer,
    invMVPBuffer,
    densityTexture,
    writeTexture
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

  function createViewMatrix() {
    let cameraPos = glMatrix.vec3.fromValues(0, 0, 0);
    let target = glMatrix.vec3.fromValues(0, 0, 0);
    let upDir = glMatrix.vec3.fromValues(0, 0, 1);
    let viewMatrix = glMatrix.mat4.create();
    glMatrix.mat4.lookAt(viewMatrix, cameraPos, target, upDir);
    return viewMatrix;
  }

  function createProjectionMatrix(aspectRatio, fov = 40, near = 0.1, far = 100) {
    let projMatrix = glMatrix.mat4.create();
    glMatrix.mat4.perspective(projMatrix, fov * (Math.PI / 180), aspectRatio, near, far);
    return projMatrix;
  }
  const projectionMatrix = createProjectionMatrix(aspectRatio);

  function createInverseMVP(viewMatrix, projMatrix) {
    let mvpMatrix = glMatrix.mat4.create();
    let inverseMvpMatrix = glMatrix.mat4.create();

    glMatrix.mat4.multiply(mvpMatrix, projMatrix, viewMatrix);
    glMatrix.mat4.invert(inverseMvpMatrix, mvpMatrix);

    return inverseMvpMatrix;
  }

  function createModelMatrix(){
    let modelMatrix = glMatrix.mat4.create();
    let angle = Date.now() / 3000;
    let translation = glMatrix.vec3.fromValues(0, 0, -8);
    glMatrix.mat4.translate(modelMatrix, modelMatrix, translation);
    glMatrix.mat4.rotateY(modelMatrix, modelMatrix, angle);
    glMatrix.mat4.rotateX(modelMatrix, modelMatrix, angle);
    return modelMatrix;
  }

  function getMatrices() {
    const viewMatrix = createViewMatrix();
    const modelMatrix = createModelMatrix();
    const invMvpMatrix = createInverseMVP(viewMatrix, projectionMatrix);
    device.queue.writeBuffer(modelBuffer, 0, modelMatrix.buffer);
    device.queue.writeBuffer(viewBuffer, 0, viewMatrix.buffer);
    device.queue.writeBuffer(projBuffer, 0, projectionMatrix.buffer);
    device.queue.writeBuffer(invMVPBuffer, 0, invMvpMatrix.buffer);
  }

  getMatrices();

  let previousTime = 0
  let mouseClick = false;
  let workgroup_size = gridSize / 4;

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) / rect.width * gridSize;
    const mouseY = (1 - (event.clientY - rect.top) / rect.height) * gridSize;
    device.queue.writeBuffer(explosionLocationBuffer, 0, new Float32Array([mouseX, mouseY, 16.0]));
    mouseClick = true;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key >= "1" && event.key <= "4") {
        const renderModeValue = parseInt(event.key);
        device.queue.writeBuffer(renderModeBuffer,0,new Uint32Array([renderModeValue-1]));
    }
  });

  function passage(device,pass,velocity,density,pressure,divergence,gridSizeBuffer,explosionLocationBuffer,dt,commandEncoder){
    if (mouseClick){
      computeShaders.explosion.computePass(
        device,
        pass,
        [velocity.readBuffer,density.readBuffer,pressure.readBuffer,explosionLocationBuffer,gridSizeBuffer],
        workgroup_size, workgroup_size, workgroup_size);
      mouseClick = false;
      console.log("boom");
    }

    computeShaders.velocity.computePass(
      device,
      pass,
      [velocity, gridSizeBuffer, dt],
      workgroup_size, workgroup_size, workgroup_size);

    computeShaders.advect.computePass(
      device,
      pass,
      [velocity.readBuffer, density, gridSizeBuffer, dt],
      workgroup_size, workgroup_size, workgroup_size);
    
    computeShaders.divergence.computePass(
      device,
      pass,
      [divergence.readBuffer, velocity.readBuffer, gridSizeBuffer],
      workgroup_size, workgroup_size, workgroup_size);

    for (let i = 0; i < 100; i++){
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

    //writeTexture(densityTexture,density.readBuffer);
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
    passage(device,computePass,velocity,density,pressure,divergence,gridSizeBuffer,explosionLocationBuffer,timeBuffer,commandEncoder);
    computePass.end();

    getMatrices();

    // Rendering pass
    renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();
    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.setVertexBuffer(0, cubeBuffer);
    renderPass.draw(36);
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