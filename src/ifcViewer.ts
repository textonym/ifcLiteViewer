// src/ifcViewer.ts
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class IfcViewer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private animationId: number | null = null;
    private loader: GLTFLoader;
    private currentModel: THREE.Object3D | null = null;
    private controls: OrbitControls;
    private dirLight: THREE.DirectionalLight;

    onProgress?: (message: string) => void;

    constructor(private canvas: HTMLCanvasElement) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        const fov = 50;
        const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
        this.camera.position.set(2, 2, 3);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        
        // High quality rendering settings
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for performance but keep sharp
        
        // Better color processing
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.resizeRendererToDisplaySize();

        // Mouse controls (orbit + zoom + pan)
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.screenSpacePanning = true;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        this.controls.zoomSpeed = 1.0;

        // Prevent right-click menu from stealing interaction
        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.dirLight.position.set(5, 10, 7);
        this.scene.add(this.dirLight);

        this.loader = new GLTFLoader();

        // Placeholder (so you see something immediately)
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new THREE.MeshStandardMaterial({ color: 0x4f46e5 });
        const cube = new THREE.Mesh(geometry, material);
        cube.name = "placeholderCube";
        this.scene.add(cube);
    }

    async init(): Promise<void> {
        this.startRenderLoop();
        if (this.onProgress) {
            this.onProgress("Three.js viewer ready (load a .glb/.gltf)");
        }
    }

    async loadFromFile(file: File): Promise<void> {
        const url = URL.createObjectURL(file);
        try {
            if (this.onProgress) {
                this.onProgress(`Loading ${file.name}...`);
            }
            await this.loadFromUrl(url);
            if (this.onProgress) {
                this.onProgress(`Loaded ${file.name}`);
            }
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    async loadFromArrayBuffer(arrayBuffer: ArrayBuffer, label?: string): Promise<void> {
        // Prefer GLB for URL mode; GLTF JSON is trickier because it can reference external .bin / textures.
        if (this.onProgress) {
            this.onProgress(label ? `${label}...` : "Loading...");
        }

        const blob = new Blob([arrayBuffer], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        try {
            await this.loadFromUrl(url);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    private async loadFromUrl(url: string): Promise<void> {
        const gltf = await this.loader.loadAsync(url);

        // Remove placeholder cube
        const placeholder = this.scene.getObjectByName("placeholderCube");
        if (placeholder) {
            this.scene.remove(placeholder);
        }

        // Replace previous model
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.disposeObject(this.currentModel);
            this.currentModel = null;
        }

        this.currentModel = gltf.scene;
        
        // Enhance materials
        this.currentModel.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                // Add EdgesGeometry for architectural clarity
                const edges = new THREE.EdgesGeometry(child.geometry, 35);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x222222 }));
                child.add(line);
                
                // Enhance material properties if available
                if (child.material) {
                    const material = child.material as THREE.MeshStandardMaterial;
                    
                    // Reduce shiny aliasing artifacts & prevent plastic look
                    if (material.roughness !== undefined && material.roughness < 0.4) {
                        material.roughness = 0.5; 
                    }
                    if (material.metalness !== undefined && material.metalness > 0) {
                        material.metalness = 0.0;
                    }
                    
                    material.needsUpdate = true;
                }
            }
        });

        this.scene.add(gltf.scene);

        this.fitToView(gltf.scene);
    }

    private fitToView(object: THREE.Object3D): void {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim > 0 ? maxDim * 1.5 : 3;

        this.camera.position.set(center.x + distance, center.y + distance, center.z + distance);
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
    }

    private disposeObject(object: THREE.Object3D): void {
        object.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }
            const material = (mesh as any).material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(material)) {
                material.forEach((m) => m.dispose());
            } else if (material) {
                material.dispose();
            }
        });
    }

    private resizeRendererToDisplaySize(): void {
        const width = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 400;
        const height = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 300;

        if (width === 0 || height === 0) {
            return;
        }

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    private startRenderLoop(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
        }

        const animate = () => {
            this.resizeRendererToDisplaySize();
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    setBackgroundColor(colorHex: string): void {
        const color = new THREE.Color(colorHex);
        this.scene.background = color;
    }

    setLightIntensity(intensity: number): void {
        this.dirLight.intensity = intensity;
    }

    setOrbitControlsEnabled(enabled: boolean): void {
        this.controls.enabled = enabled;
    }

    dispose(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
        }
        this.renderer.dispose();
    }
}