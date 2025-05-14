import * as WebGPU from '/WebGPU.js';

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
    const resources = await loadResources({
        'mesh': new URL('/floor/floor.json', import.meta.url),
        'image': new URL('/floor/grass.png', import.meta.url),
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

    const explosion = new Node();
    explosion.addComponent(new Transform());
    scene.addChild(explosion);
    
    return { renderer, scene, camera };
}