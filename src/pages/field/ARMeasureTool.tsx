import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Trash2, Save, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { PhotoMeasureFallback } from "./PhotoMeasureFallback";

export function ARMeasureTool() {
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const [forceFallback, setForceFallback] = useState(false);
    const [isSupported, setIsSupported] = useState<boolean | null>(null);
    
    const [totalDistance, setTotalDistance] = useState(0);
    
    // We use a ref to store state that needs to be accessed inside the render loop
    const stateRef = useRef({
        points: [] as THREE.Vector3[],
        lines: [] as THREE.Line[],
        markers: [] as THREE.Mesh[],
        totalDistance: 0,
        isLoopRunning: false
    });

    useEffect(() => {
        if ('xr' in navigator) {
            (navigator as any).xr?.isSessionSupported?.('immersive-ar')
                .then((supported: boolean) => setIsSupported(supported))
                .catch(() => setIsSupported(false));
        } else {
            setIsSupported(false);
        }
    }, []);

    useEffect(() => {
        if (!isSupported || !containerRef.current) return;
        const container = containerRef.current;
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        try {
            container.appendChild(renderer.domElement);
        } catch (e) { console.error(e); }
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
        scene.add(light);

        const reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.05, 0.06, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0x10b981 })
        );
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);

        const arButton = ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] });
        arButton.style.position = 'absolute';
        arButton.style.bottom = '120px';
        arButton.style.left = '50%';
        arButton.style.transform = 'translateX(-50%)';
        arButton.style.zIndex = '50';
        try { container.appendChild(arButton); } catch(e){}

        let hitTestSource: any = null;
        let hitTestSourceRequested = false;

        const controller = renderer.xr.getController(0);
        scene.add(controller);

        const onSelect = () => {
            if (!reticle.visible) return;
            
            const position = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(0.02, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0xf59e0b })
            );
            sphere.position.copy(position);
            scene.add(sphere);
            
            const { points, lines, markers } = stateRef.current;
            markers.push(sphere);
            points.push(position);

            if (points.length > 1) {
                const p1 = points[points.length - 2];
                const p2 = points[points.length - 1];
                
                const material = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 5 });
                const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                lines.push(line);

                const dist = p1.distanceTo(p2);
                stateRef.current.totalDistance += dist;
                setTotalDistance(stateRef.current.totalDistance);
            }
        };
        controller.addEventListener('select', onSelect);
        
        if (stateRef.current.isLoopRunning) return;
        stateRef.current.isLoopRunning = true;

        renderer.setAnimationLoop((timestamp: number, frame: any) => {
            if (frame) {
                const referenceSpace = renderer.xr.getReferenceSpace();
                const session = renderer.xr.getSession();

                if (hitTestSourceRequested === false && session) {
                    session.requestReferenceSpace('viewer').then((refSpace) => {
                        session.requestHitTestSource({ space: refSpace }).then((source) => {
                            hitTestSource = source;
                        });
                    });
                    session.addEventListener('end', () => {
                        hitTestSourceRequested = false;
                        hitTestSource = null;
                    });
                    hitTestSourceRequested = true;
                }

                if (hitTestSource && referenceSpace) {
                    const hitTestResults = frame.getHitTestResults(hitTestSource);
                    if (hitTestResults.length > 0) {
                        const hit = hitTestResults[0];
                        const pose = hit.getPose(referenceSpace);
                        if (pose) {
                            reticle.visible = true;
                            reticle.matrix.fromArray(pose.transform.matrix);
                        }
                    } else {
                        reticle.visible = false;
                    }
                }
            }
            renderer.render(scene, camera);
        });

        return () => {
            renderer.setAnimationLoop(null);
            container.removeChild(renderer.domElement);
            stateRef.current.isLoopRunning = false;
            try {
                if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
                if (container.contains(arButton)) container.removeChild(arButton);
            } catch(e) {}
        };
    }, [isSupported, forceFallback]);

    const resetDraw = () => {
        // Full reset by reloading to wipe WebGL state clearly
        window.location.reload(); 
    };

    const lubangBor = Math.round(totalDistance / 0.35);
    const kebutuhanObat = totalDistance * 5;
    if (isSupported === false || forceFallback) {
        return <PhotoMeasureFallback onBack={() => navigate(-1)} />;
    }

    return (
        <div className="flex flex-col h-screen bg-black text-white relative overflow-hidden">
            <div className="absolute top-0 w-full p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/70 to-transparent">

                <button onClick={() => navigate(-1)} className="p-2 bg-black/50 rounded-full text-white">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="font-bold text-lg text-white">Kamera AR (Estimasi)</h1>
                <div className="w-9" />
            </div>

            {/* 3D AR Viewfinder */}
            <div ref={containerRef} className="flex-1 bg-gray-900 relative">
            </div>
            
            {/* Bottom HUD */}
            <div className="bg-gray-900 pb-safe z-10 rounded-t-2xl border-t border-gray-800 absolute bottom-0 w-full">
                <div className="p-4 flex gap-4">
                    <div className="flex-1 bg-gray-800 rounded-lg p-3">
                        <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wide">Total Panjang Tembok</div>
                        <div className="font-mono text-2xl font-bold text-emerald-400">{totalDistance.toFixed(2)} <span className="text-sm">m'</span></div>
                    </div>
                    <div className="flex-1 bg-gray-800 rounded-lg p-3">
                        <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wide">Estimasi Titik Bor</div>
                        <div className="font-mono text-2xl font-bold text-amber-400">{lubangBor} <span className="text-xs">titik</span></div>
                    </div>
                </div>
                
                <div className="px-4 pb-4">
                    <div className="mb-3 text-xs text-center text-gray-400">
                        {totalDistance > 0 
                            ? `Kebutuhan Obat Kimia: ${kebutuhanObat.toFixed(1)} Liter. Ketuk layar untuk menambah garis.` 
                            : "Ketuk tombol 'START AR' lalu arahkan kamera ke lantai hingga muncul cincin hijau. Ketuk layar untuk menaruh titik ukur."}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={resetDraw} className="p-4 bg-rose-900/50 text-rose-400 rounded-xl flex items-center justify-center">
                            <Trash2 size={20} />
                        </button>
                        <button onClick={() => setForceFallback(true)} className="flex-1 bg-amber-600 active:bg-amber-700 py-4 rounded-xl flex items-center justify-center font-bold text-white text-xs">
                            Mode Foto
                        </button>
                        <button onClick={() => navigate(-1)} className="flex-1 bg-emerald-600 active:bg-emerald-700 py-4 rounded-xl flex items-center justify-center font-bold gap-2 text-white">
                            <Save size={20} />
                            Simpan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
