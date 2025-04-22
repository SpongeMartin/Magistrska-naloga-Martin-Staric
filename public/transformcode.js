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