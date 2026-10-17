import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  AmbientLight,
  DirectionalLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

@Component({
  imports: [],
  selector: 'app-three-scene',
  styleUrl: './three-scene.scss',
  templateUrl: './three-scene.html',
})
export class ThreeScene {
  protected readonly unsupported = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.init());
  }

  private init(): void {
    if (!WebGL.isWebGL2Available()) {
      this.unsupported.set(true);
      return;
    }

    const renderer = new WebGLRenderer({ canvas: this.canvas().nativeElement, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene  = new Scene();
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 4);

    const geometry = new IcosahedronGeometry(1, 1);
    const material = new MeshStandardMaterial({ color: 0x76b900, flatShading: true });
    const mesh     = new Mesh(geometry, material);
    const light    = new DirectionalLight(0xffffff, 2);
    light.position.set(3, 4, 5);
    scene.add(mesh, light, new AmbientLight(0xffffff, 0.4));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // The canvas fills the host via CSS; keep the drawing buffer and camera in sync with it.
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(this.host.nativeElement);

    // Zoneless app: the render loop never triggers change detection.
    renderer.setAnimationLoop((time) => {
      mesh.rotation.y = time / 2000;
      controls.update();
      renderer.render(scene, camera);
    });

    this.destroyRef.onDestroy(() => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    });
  }
}
