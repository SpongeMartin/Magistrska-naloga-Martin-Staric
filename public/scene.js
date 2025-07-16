import * as WebGPU from '/WebGPU.js';

import { GLTFLoader } from '/loaders/GLTFLoader.js';
import { FirstPersonController } from '/controllers/FirstPersonController.js';

import {
    Camera,
    Material,
    Model,
    Node,
    Primitive,
    Sampler,
    Texture,
    Transform,
} from '/core.js';

import {
    calculateAxisAlignedBoundingBox,
    mergeAxisAlignedBoundingBoxes,
} from '/core/MeshUtils.js';

import { loadResources } from '/loaders/resources.js';

import { UnlitRenderer } from '/renderers/UnlitRenderer.js';

export function updateScene(scene, t, dt) {
    scene.traverse(node => {
        for (const component of node.components) {
            component.update?.(t, dt);
        }
    });
}

export async function sceneInit(device, canvas, context, format){
    const renderer = new UnlitRenderer(device, canvas, context, format);
    const loader = new GLTFLoader();
    await loader.load(new URL('./scene.gltf', import.meta.url));
    const resources = await loadResources({
        'mesh': new URL('/floor/floor.json', import.meta.url),
        'image': new URL('/floor/grass2.png', import.meta.url),
    });
    await renderer.initialize();
    
    const scene = new Node();
    
    const camera = new Node();
    camera.addComponent(new Transform({
        translation: [0, 1, 0],
    }));
    camera.addComponent(new Camera());
    camera.addComponent(new FirstPersonController(camera, canvas));

    scene.addChild(camera);
    
    const floor = new Node();
    floor.addComponent(new Transform({
        scale: [10, 1, 10],
    }));
    floor.addComponent(new Model({
        primitives: [
            new Primitive({
                mesh: resources.mesh,
                material: new Material({ 
                    baseTexture: new Texture({
                        image: resources.image,
                        sampler: new Sampler({
                            minFilter: 'nearest',
                            magFilter: 'nearest',
                            addressModeU: 'repeat',
                            addressModeV: 'repeat',
                        }),
                    }),
                }),
            }),
        ],
    }));
    scene.addChild(floor);

    const boxes = Array.from({ length: 6 }, (_, i) => loader.loadNode(`Box.00${i}`));

    boxes.forEach((box) => scene.addChild(box));

    scene.traverse(node => {
        const model = node.getComponentOfType(Model);
        if (!model) {
            return;
        }

        const boxes = model.primitives.map(primitive => calculateAxisAlignedBoundingBox(primitive.mesh));
        node.aabb = mergeAxisAlignedBoundingBoxes(boxes);
    });
    
    console.log(scene);
    
    return { renderer, scene, camera };
}