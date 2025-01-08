async function loadShader(filePath) {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load shader: ${filePath}`);
  }
  return await response.text();
}

const computeShaderCode = await loadShader('/shaders/compute.wgsl');
const renderShaderCode = await loadShader('/shaders/render.wgsl');

async function init() {
  const canvas = document.getElementById("gpuCanvas");
  if (!navigator.gpu) {
    console.error("WebGPU not supported.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device: device,
    format: format,
    alphaMode: "opaque",
  });

  const gridSize = 128;
  
  const gridSizeBuffer = device.createBuffer({
    size: 4, // 16-bit integer
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(gridSizeBuffer, 0, new Uint32Array([gridSize]));

  const velocityBuffer = device.createBuffer({
    size: gridSize * gridSize * 2 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const densityBuffer = device.createBuffer({
    size: gridSize * gridSize * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const computeModule = device.createShaderModule({
    code: computeShaderCode,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
          minBindingSize: 8, // minBindingSize is 8 because we have 2 * 32f, bindingSize is computed elementwise in buffer, not for whole buffersize.
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
          minBindingSize: 4,
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
          minBindingSize: 4,
        },
      },
    ],
  });
  

  const computePipeline = device.createComputePipeline({
    layout: "auto"/*device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    })*/,
    compute: {
      module: computeModule,
      entryPoint: "main",
    },
  });


  // Create the bind group for the compute pass
  const bindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: densityBuffer },
      },
      {
        binding: 1,
        resource: { buffer: gridSizeBuffer },
      },
    ],
  });

  // Create the render pipeline
  const renderModule = device.createShaderModule({
    code: renderShaderCode,
  });
  
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: renderModule,
      entryPoint: "vertex_main", 
    },
    fragment: {
      module: renderModule,
      entryPoint: "fragment_main",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  // Create the render bind group
  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: densityBuffer }, // Bind density buffer for rendering
      },
    ],
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();

    // Compute pass for advection
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(Math.ceil(gridSize / 16), Math.ceil(gridSize / 16)); // Dispatch compute workgroups
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
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init();

