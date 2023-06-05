import * as THREE from 'https://cdn.skypack.dev/three@0.150.0';
import { EffectComposer } from 'https://unpkg.com/three@0.150.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.150.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.150.0/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'https://unpkg.com/three@0.150.0/examples/jsm/postprocessing/SMAAPass.js';
import { GammaCorrectionShader } from 'https://unpkg.com/three@0.150.0/examples/jsm/shaders/GammaCorrectionShader.js';
import { EffectShader } from "./EffectShader.js";
import { OrbitControls } from 'https://unpkg.com/three@0.150.0/examples/jsm/controls/OrbitControls.js';
import { makeSDFGenerator } from './sdfGenerator.js';
import { AssetManager } from './AssetManager.js';
import { Stats } from "./stats.js";
async function main() {
    // Setup basic renderer, controls, and profiler
    const clientWidth = window.innerWidth * 0.99;
    const clientHeight = window.innerHeight * 0.98;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 1);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(clientWidth, clientHeight);
    document.body.appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);
    // Setup scene
    // Skybox
    // Objects
    const mask = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshBasicMaterial({
        alphaMap: await new THREE.TextureLoader().loadAsync('manman.jpeg'),
        alphaTest: 0.5
    }));
    mask.castShadow = true;
    mask.receiveShadow = true;
    const boundingBox = new THREE.Box3().setFromObject(mask);
    //scene.add(mask);
    const orthoCam = new THREE.OrthographicCamera(boundingBox.min.x - 2 / 1024, boundingBox.max.x + 2 / 1024, boundingBox.max.y + 2 / 1024, boundingBox.min.y - 2 / 1024, 0.1, 1000);
    orthoCam.position.set(0, 0, 1);
    orthoCam.lookAt(0, 0, 0);
    const camHelper = new THREE.CameraHelper(orthoCam);
    scene.add(camHelper);
    const maskRenderTarget = new THREE.WebGLRenderTarget(1024, 1024, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
    });
    renderer.setRenderTarget(maskRenderTarget);
    renderer.render(mask, orthoCam);
    console.time();
    const sg = makeSDFGenerator(1024, 1024, renderer);
    const sdf = sg(maskRenderTarget.texture);
    const readSdf = new Float32Array(1024 * 1024);
    renderer.readRenderTargetPixels(sdf, 0, 0, 1024, 1024, readSdf);
    // Get smallest value in sdf
    let min = Infinity;
    for (let i = 0; i < readSdf.length; i++) {
        if (readSdf[i] < min) {
            min = readSdf[i];
        }
    }
    min = -min;
    console.timeEnd();
    const maskWorld = new THREE.Mesh(mask.geometry, new THREE.ShaderMaterial({
        uniforms: {
            sdf: { value: sdf.texture },
            size: { value: min },
            time: { value: 0 }
        },
        transparent: true,
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D sdf;
            uniform float size;
            uniform float time;
            varying vec2 vUv;
            #include <packing>
            void main() {
                float k = 0.5 + 0.5 * sin(time);
                float d = texture2D(sdf, vUv).r/size;
                gl_FragColor = vec4(vec3(
                   1.0
                ),  1.0 - smoothstep(0.0, 1.0, 
                    clamp(d/k + 1.0, 0.0, 1.0)
                    ));
            }
        `,

    }));
    scene.add(maskWorld);
    // Build postprocessing stack
    // Render Targets
    const defaultTexture = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter
    });
    defaultTexture.depthTexture = new THREE.DepthTexture(clientWidth, clientHeight, THREE.FloatType);
    // Post Effects
    const composer = new EffectComposer(renderer);
    const smaaPass = new SMAAPass(clientWidth, clientHeight);
    const effectPass = new ShaderPass(EffectShader);
    composer.addPass(effectPass);
    composer.addPass(new ShaderPass(GammaCorrectionShader));
    composer.addPass(smaaPass);

    function animate() {
        maskWorld.material.uniforms.time.value = performance.now() / 1000;
        renderer.setRenderTarget(defaultTexture);
        renderer.clear();
        renderer.render(scene, camera);
        effectPass.uniforms["sceneDiffuse"].value = defaultTexture.texture;
        composer.render();
        controls.update();
        stats.update();
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}
main();