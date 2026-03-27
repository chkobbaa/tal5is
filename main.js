import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ==================== THREE.JS HERO ====================
const canvas = document.getElementById('hero-canvas');
const cssContainer = document.getElementById('css-container');

// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // Matched to R3F exact tone mapping

// CSS3D Renderer
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.left = '0';
cssRenderer.domElement.style.pointerEvents = 'none';
cssContainer.appendChild(cssRenderer.domElement);

const scene = new THREE.Scene();

// Camera (Matched to R3F Ref + Mobile specific dynamic view)
const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 0, 7);
camera.lookAt(0, 0, 0);

// Lighting (Matched to R3F Ref: PointLight behind and to the side to create atmospheric rim lighting!)
const pointLight = new THREE.PointLight(0xffffff, 1.5);
pointLight.position.set(10, 10, -10); // Placed at -Z to oppose our camera at +Z
scene.add(pointLight);

// Environment setup (Exact R3F City Preset using Drei's exact HDRI for perfect reflections)
const rgbeLoader = new RGBELoader();
rgbeLoader.load('https://raw.githubusercontent.com/pmndrs/drei-assets/master/hdri/potsdamer_platz_1k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
});

// (Shadow plane removed — was rendering as visible dark box)

// Load the provided mac.glb model
let laptopGroup = null;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-10, -10);
let isMeshHovered = false;
let isScreenHovered = false;
let isFocused = false;
let timeSpeed = 1;
let t = 0;

// Create CSS3D element using Shadow DOM
const screenDiv = document.createElement('div');
screenDiv.style.width = '1024px';
screenDiv.style.height = '668px';
screenDiv.style.border = '0';
screenDiv.style.backgroundColor = '#1a1b26';
screenDiv.style.pointerEvents = 'auto'; // Ensure interaction
screenDiv.style.userSelect = 'auto'; // Ensure text selectability

// Track hover on the HTML screen seamlessly
screenDiv.addEventListener('mouseenter', () => isScreenHovered = true);
screenDiv.addEventListener('mouseleave', () => isScreenHovered = false);

// Global mouse tracking for the 3D canvas
const canvasWrap = document.querySelector('.hero-canvas-wrap');
canvasWrap.addEventListener('mousemove', (e) => {
    const rect = canvasWrap.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (laptopGroup) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(laptopGroup, true);
        isMeshHovered = intersects.length > 0;
    }
});
canvasWrap.addEventListener('mouseleave', () => {
    mouse.x = -10;
    mouse.y = -10;
    isMeshHovered = false;
});

canvasWrap.addEventListener('click', (e) => {
    if (isMeshHovered || isScreenHovered) {
        isFocused = !isFocused;
        if (isFocused) {
            document.body.classList.add('focused-mode');
        } else {
            document.body.classList.remove('focused-mode');
        }
    } else if (isFocused) {
        // Unfocus if clicked off the laptop
        isFocused = false;
        document.body.classList.remove('focused-mode');
    }
});

const shadowRoot = screenDiv.attachShadow({ mode: 'open' });

// Fetch the HTML content
fetch('demo-screen.html')
    .then(response => response.text())
    .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // Extract style tags and the app-root
        const styles = Array.from(doc.head.querySelectorAll('style'));
        styles.forEach(s => shadowRoot.appendChild(s.cloneNode(true)));

        const rootContent = doc.querySelector('.app-root');
        if (rootContent) {
            shadowRoot.appendChild(rootContent.cloneNode(true));
        }
    });

const screenObject = new CSS3DObject(screenDiv);// Note: We DO NOT add screenObject to the scene root. We will add it directly to the screen mesh!

loader.load(
    'mac.glb',
    (gltf) => {
        laptopGroup = gltf.scene;

        // Auto-center
        const box = new THREE.Box3().setFromObject(laptopGroup);
        const center = box.getCenter(new THREE.Vector3());
        laptopGroup.position.sub(center);

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        // Base scale setup
        const isMobile = window.innerWidth < 900;
        const scale = (isMobile ? 11 : 5.8) / maxDim; // Adjust scale dynamically
        laptopGroup.scale.setScalar(scale);

        // Initial rotation
        laptopGroup.rotation.y = 0; // Forward facing

        // Find the specific display mesh (Cube008_2 in R3F ref)
        laptopGroup.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                if (child.material) {
                    child.material.envMapIntensity = 1.0;
                }

                if (child.name === 'Cube008_2') {
                    child.material.transparent = true;
                    child.material.opacity = 0; // Make mesh invisible to reveal iframe

                    // Attach CSS screen directly to this mesh
                    child.geometry.computeBoundingBox();
                    const bbox = child.geometry.boundingBox;
                    const localWidth = bbox.max.x - bbox.min.x;

                    // Convert 1024 pixels to local mesh geometry units
                    const screenScale = localWidth / 1024;
                    screenObject.scale.set(screenScale, screenScale, screenScale);

                    // EXACT R3F Ref offsets from your code
                    screenObject.position.set(0, 0.05, -0.09);
                    screenObject.rotation.x = -Math.PI / 2;

                    // The MAGIC: adding the CSS object to the mesh so it perfectly inherits all rotations/scaling automatically!
                    child.add(screenObject);
                }
            }
        });

        scene.add(laptopGroup);
    },
    undefined,
    (err) => console.error('Model load error:', err)
);

// Animation variables
const clock = new THREE.Clock();
let currentWidth = 0;
let currentHeight = 0;

function animate() {
    requestAnimationFrame(animate);

    // 1. Robust auto-resize
    // Always use the physical dimensions of the container. 
    // When focused-mode CSS is active, this will automatically read the full screen dimensions.
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;

    // Only update sizes and projection if dimensions change
    if (w > 0 && h > 0 && (currentWidth !== w || currentHeight !== h)) {
        currentWidth = w;
        currentHeight = h;

        // Force both renderers to exactly match the physical pixel bounds of the wrapper
        renderer.setSize(w, h, true);
        cssRenderer.setSize(w, h); 
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    const isMobileViewport = window.innerWidth < 900;
    const delta = clock.getDelta();

    // Smoothly transition time speed based on hover state
    const isHovered = isScreenHovered || isMeshHovered;
    timeSpeed = THREE.MathUtils.lerp(timeSpeed, (isHovered || isFocused) ? 0 : 1, 0.05);

    // Accumulate custom time to pause physics smoothly
    t += delta * timeSpeed;

    if (laptopGroup) {
        // Build base layout values
        let targetX = isMobileViewport ? 0 : 2;
        let targetYPos = isMobileViewport ? 3 : 0; 
        let floatY = (-0.5 + Math.sin(t / 2)) / 2;
        
        let targetXRot = Math.cos(t / 2) / 20 + 0.25;
        let targetYRot = (isMobileViewport ? 0 : -0.55) + Math.sin(t / 4) / 20;
        let targetZRot = Math.sin(t / 8) / 20;

        if (isFocused) {
            targetX = 0;
            // Now that the canvas strictly enforces 100vh overlay via CSS, we ensure perfect vertical centering.
            targetYPos = isMobileViewport ? -1.2 : -0.6;
            targetYRot = 0;   
            targetZRot = 0;
        }

        laptopGroup.position.x = THREE.MathUtils.lerp(laptopGroup.position.x, targetX, 0.08);
        laptopGroup.position.y = THREE.MathUtils.lerp(laptopGroup.position.y, targetYPos + floatY, 0.08);

        laptopGroup.rotation.x = THREE.MathUtils.lerp(laptopGroup.rotation.x, targetXRot, 0.08);
        laptopGroup.rotation.y = THREE.MathUtils.lerp(laptopGroup.rotation.y, targetYRot, 0.08);
        laptopGroup.rotation.z = THREE.MathUtils.lerp(laptopGroup.rotation.z, targetZRot, 0.08);
    }

    // 2. Dynamic Camera Adjustment for Mobile Viewport
    const aspectCorrection = Math.min(1.3, camera.aspect) / 1.3;
    const baseZ = isMobileViewport ? 10 : 7;
    let targetZ = baseZ / aspectCorrection;

    let targetFov = isMobileViewport ? 65 : 55;
    let targetYCam = isMobileViewport ? 0.5 : 0;

    if (isFocused) {
        // Apply the same aspect correction to the focused zoom so it never clips on mobile or thin desktop screens
        // Pushing the camera much closer for a larger, more dramatic view of the screen
        const focusBaseZ = isMobileViewport ? 7 : 5.0;
        targetZ = focusBaseZ / aspectCorrection;
        targetYCam = 0; 
    }

    if (Math.abs(camera.fov - targetFov) > 0.1 || Math.abs(camera.position.z - targetZ) > 0.01) {
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.08);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetYCam, 0.08);
        camera.fov = targetFov; // We don't lerp fov directly often due to projection calculation costs, but here it's fine
        camera.updateProjectionMatrix();
    }

    renderer.render(scene, camera);
    cssRenderer.render(scene, camera);

    // Smooth parallax (lerp-based, runs in rAF for buttery performance)
    const scrollY = window.scrollY;
    parallaxLayers.forEach(layer => {
        const speed = parseFloat(layer.dataset.speed) || 0.3;
        const target = scrollY * speed;
        const current = parseFloat(layer.dataset.currentY) || 0;
        const smoothed = current + (target - current) * 0.08;
        layer.dataset.currentY = smoothed;
        layer.style.transform = `translateY(${smoothed}px)`;
    });
}

// ==================== PARALLAX LAYERS ====================
const parallaxLayers = document.querySelectorAll('.parallax-layer');

animate();

// ==================== SCROLL REVEAL ====================
const revealElements = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.15 });

revealElements.forEach(el => observer.observe(el));

// ==================== SMOOTH NAV SCROLL ====================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});
