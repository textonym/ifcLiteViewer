import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GeometryProcessor, type MeshData } from "@ifc-lite/geometry";

export class IfcThreeViewer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private dirLight: THREE.DirectionalLight;
    private animationId: number | null = null;
    private currentModel: THREE.Group | null = null;
    private processor: GeometryProcessor | null = null;

    onProgress?: (message: string) => void;

    constructor(private canvas: HTMLCanvasElement) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 10000);
        this.camera.position.set(20, 20, 20);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.resizeRendererToDisplaySize();

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.screenSpacePanning = true;
        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.dirLight.position.set(5, 10, 7);
        this.scene.add(this.dirLight);
    }

    async init(): Promise<void> {
        this.processor = new GeometryProcessor();
        await this.processor.init();
        this.startRenderLoop();
        this.onProgress?.("Viewer ready");
    }

    async loadFromUrl(url: string): Promise<void> {
        if (!this.processor) throw new Error("Viewer not initialized");

        this.onProgress?.("Downloading IFC file...");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        this.clearModel();

        this.onProgress?.("Processing geometry...");
        const group = new THREE.Group();

        let meshCount = 0;
        for await (const event of this.processor.processStreaming(buffer)) {
            if (event.type === "batch") {
                for (const meshData of event.meshes) {
                    const threeMesh = this.meshDataToThree(meshData);
                    if (threeMesh) {
                        group.add(threeMesh);
                        meshCount++;
                    }
                }
                this.onProgress?.(`Loaded ${meshCount} meshes...`);
            }
        }

        this.scene.add(group);
        this.currentModel = group;
        this.fitToView(group);
        this.onProgress?.(`Model loaded (${meshCount} meshes)`);
    }

    private meshDataToThree(meshData: MeshData): THREE.Mesh | null {
        if (!meshData.positions.length || !meshData.indices.length) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
        if (meshData.normals.length) {
            geometry.setAttribute("normal", new THREE.BufferAttribute(meshData.normals, 3));
        }
        geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

        if (!meshData.normals.length) {
            geometry.computeVertexNormals();
        }

        const [r, g, b, a] = meshData.color;
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(r, g, b),
            transparent: a < 1,
            opacity: a,
            roughness: 0.6,
            metalness: 0.0,
            side: a < 1 ? THREE.DoubleSide : THREE.FrontSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.expressId = meshData.expressId;
        mesh.userData.ifcType = meshData.ifcType;
        return mesh;
    }

    private fitToView(object: THREE.Object3D): void {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim > 0 ? maxDim * 1.5 : 3;

        this.camera.position.set(
            center.x + distance,
            center.y + distance,
            center.z + distance,
        );
        this.camera.lookAt(center);
        this.controls.target.copy(center);
        this.controls.update();
    }

    private clearModel(): void {
        if (this.currentModel) {
            this.currentModel.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (mesh.geometry) mesh.geometry.dispose();
                const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
                if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
                else if (mat) mat.dispose();
            });
            this.scene.remove(this.currentModel);
            this.currentModel = null;
        }
    }

    private resizeRendererToDisplaySize(): void {
        const width = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 400;
        const height = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 300;
        if (width === 0 || height === 0) return;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    private startRenderLoop(): void {
        if (this.animationId !== null) cancelAnimationFrame(this.animationId);
        const animate = () => {
            this.resizeRendererToDisplaySize();
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    setBackgroundColor(hex: string): void {
        this.scene.background = new THREE.Color(hex);
    }

    dispose(): void {
        if (this.animationId !== null) cancelAnimationFrame(this.animationId);
        this.clearModel();
        this.renderer.dispose();
        this.processor?.dispose();
    }
}
