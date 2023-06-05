import * as THREE from 'https://cdn.skypack.dev/three@0.150.0';
import { FullScreenQuad } from 'https://unpkg.com/three@0.150.0/examples/jsm/postprocessing/Pass.js';
const makeSDFGenerator = (clientWidth, clientHeight, renderer) => {
    let finalTarget = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        type: THREE.FloatType,
        format: THREE.RedFormat,
    });
    let outsideRenderTarget = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
    });
    let insideRenderTarget = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
    });
    let outsideRenderTarget2 = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
    });
    let insideRenderTarget2 = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
    });
    let outsideRenderTargetFinal = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.FloatType,
        format: THREE.RedFormat
    });
    let insideRenderTargetFinal = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.FloatType,
        format: THREE.RedFormat,
    });
    const uvRender = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            tex: { value: null }
        },
        vertexShader: /*glsl*/ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
    `,
        fragmentShader: /*glsl*/ `
    uniform sampler2D tex;
    varying vec2 vUv;
    #include <packing>
    void main() {
        gl_FragColor = pack2HalfToRGBA(vUv * (round(texture2D(tex, vUv).x)));
    }
    `
    }));
    const uvRenderInside = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            tex: { value: null }
        },
        vertexShader: /*glsl*/ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`,
        fragmentShader: /*glsl*/ `
uniform sampler2D tex;
varying vec2 vUv;
#include <packing>
void main() {
    gl_FragColor = pack2HalfToRGBA(vUv * (1.0 - round(texture2D(tex, vUv).x)));

}
`
    }));
    const jumpFloodRender = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            tex: { value: null },
            offset: { value: 0.0 },
            level: { value: 0.0 },
            maxSteps: { value: 0.0 }
        },
        vertexShader: /*glsl*/ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
    `,
        fragmentShader: /*glsl*/ `
    varying vec2 vUv;
    uniform sampler2D tex;
    uniform float offset;
    uniform float level;
    uniform float maxSteps;
    #include <packing>
    void main() {
        float closestDist = 9999999.9;
        vec2 closestPos = vec2(0.0);
        for(float x = -1.0; x <= 1.0; x += 1.0)
        {
           for(float y = -1.0; y <= 1.0; y += 1.0)
           {
              vec2 voffset = vUv;
              voffset += vec2(x, y) * vec2(${1/clientWidth}, ${1/clientHeight}) * offset;
     
              vec2 pos = unpackRGBATo2Half(texture2D(tex, voffset));
              float dist = distance(pos.xy, vUv);
     
              if(pos.x != 0.0 && pos.y != 0.0 && dist < closestDist)
              {
                closestDist = dist;
                closestPos = pos;
              }
           }
        }
        gl_FragColor = pack2HalfToRGBA(closestPos);
    }
    `
    }));
    const distanceFieldRender = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            tex: { value: null },
            size: { value: new THREE.Vector2(clientWidth, clientHeight) }
        },
        vertexShader: /*glsl*/ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
    `,
        fragmentShader: /*glsl*/ `
    varying vec2 vUv;
    uniform sampler2D tex;
    uniform vec2 size;
    #include <packing>
    void main() {
        gl_FragColor = vec4(distance(size * unpackRGBATo2Half(texture2D(tex, vUv)), size * vUv), 0.0, 0.0, 0.0);
    }
    `
    }));
    const compositeRender = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            inside: { value: insideRenderTargetFinal.texture },
            outside: { value: outsideRenderTargetFinal.texture },
            tex: { value: null }
        },
        vertexShader: /*glsl*/ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
        `,
        fragmentShader: /*glsl*/ `
        varying vec2 vUv;
        uniform sampler2D inside;
        uniform sampler2D outside;
        uniform sampler2D tex;
        #include <packing>
        void main() {
            float i = texture2D(inside, vUv).x;
            float o =texture2D(outside, vUv).x;
            if (texture2D(tex, vUv).x == 0.0) {
                gl_FragColor = vec4(o, 0.0, 0.0, 0.0);
            } else {
                gl_FragColor = vec4(-i, 0.0, 0.0, 0.0);
            }
            //gl_FragColor = vec4(vec3(i), 1.0);
        }
        `
    }));
    return (image, unique = true) => {
        let ft = finalTarget;
        if (unique) {
            ft = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
                minFilter: THREE.LinearMipmapLinearFilter,
                magFilter: THREE.LinearFilter,
                type: THREE.FloatType,
                format: THREE.RedFormat,
                generateMipmaps: true
            });
        }
        image.minFilter = THREE.NearestFilter;
        image.maxFilter = THREE.NearestFilter;
        uvRender.material.uniforms.tex.value = image;
        renderer.setRenderTarget(outsideRenderTarget);
        uvRender.render(renderer);

        const passes = Math.ceil(Math.log(Math.max(clientWidth, clientHeight)) / Math.log(2.0));
        let lastTarget = outsideRenderTarget;
        let target;
        for (let i = 0; i < passes; i++) {
            const offset = Math.pow(2, passes - i - 1);
            target = lastTarget === outsideRenderTarget ? outsideRenderTarget2 : outsideRenderTarget;
            jumpFloodRender.material.uniforms.level.value = i;
            jumpFloodRender.material.uniforms.maxSteps.value = passes;
            jumpFloodRender.material.uniforms.offset.value = offset;
            jumpFloodRender.material.uniforms.tex.value = lastTarget.texture;
            renderer.setRenderTarget(target);
            jumpFloodRender.render(renderer);
            lastTarget = target;
        }
        renderer.setRenderTarget(outsideRenderTargetFinal);
        distanceFieldRender.material.uniforms.tex.value = target.texture;
        distanceFieldRender.render(renderer);
        uvRenderInside.material.uniforms.tex.value = image;
        renderer.setRenderTarget(insideRenderTarget);
        uvRenderInside.render(renderer);
        lastTarget = insideRenderTarget;
        target = undefined;
        for (let i = 0; i < passes; i++) {
            const offset = Math.pow(2, passes - i - 1);
            target = lastTarget === insideRenderTarget ? insideRenderTarget2 : insideRenderTarget;
            jumpFloodRender.material.uniforms.level.value = i;
            jumpFloodRender.material.uniforms.maxSteps.value = passes;
            jumpFloodRender.material.uniforms.offset.value = offset;
            jumpFloodRender.material.uniforms.tex.value = lastTarget.texture;
            renderer.setRenderTarget(target);
            jumpFloodRender.render(renderer);
            lastTarget = target;
        }
        renderer.setRenderTarget(insideRenderTargetFinal);
        distanceFieldRender.material.uniforms.tex.value = target.texture;
        distanceFieldRender.render(renderer);
        renderer.setRenderTarget(ft);
        compositeRender.material.uniforms.tex.value = image;
        compositeRender.render(renderer);
        return ft;
    }
}
export { makeSDFGenerator };