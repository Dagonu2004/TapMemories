import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, where, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const urlParams = new URLSearchParams(window.location.search);
const albumId = urlParams.get('id');

let isAdmin = false;

onAuthStateChanged(auth, (user) => {
    if (user) {
        isAdmin = true;
        document.getElementById('admin-back-btn').classList.remove('hidden');
        document.getElementById('guest-login-logo').classList.add('hidden');
        document.getElementById('admin-upload-btn').classList.remove('hidden');
    }
    
    if (albumId) {
        initAlbum();
    } else {
        document.getElementById('album-title').innerText = "Imán no reconocido";
    }
});

async function initAlbum() {
    const albumRef = doc(db, "albums", albumId);
    const albumSnap = await getDoc(albumRef);
    
    if (albumSnap.exists()) {
        document.getElementById('album-title').innerText = albumSnap.data().title;
    } else {
        document.getElementById('album-title').innerText = "Álbum vacío o eliminado";
        return;
    }

    const photosRef = collection(db, "imagenes");
    // CAMBIO: Ahora ordenamos por el campo "order" de menor a mayor
    const q = query(photosRef, where("albumId", "==", albumId), orderBy("order", "asc"));
    
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('photos-grid');
        grid.innerHTML = ''; 
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const deleteButton = isAdmin 
                ? `<button data-action="delete-photo" data-photoid="${doc.id}" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs shadow-md hover:bg-red-700 z-10 transition-transform hover:scale-110">X</button>` 
                : '';

            // CAMBIO: Sustituimos 'h-64 sm:h-72' por 'aspect-square'
            grid.innerHTML += `
                <div class="relative group" data-photoid="${doc.id}">
                    <img src="${data.url}" draggable="false" style="-webkit-touch-callout: none;" class="w-full aspect-square object-cover rounded-xl shadow-sm hover:opacity-90 transition-opacity select-none" alt="Foto" data-action="view-photo" data-url="${data.url}">
                    ${deleteButton}
                </div>
            `;
        });

        // NUEVO: Destruimos la instancia de Sortable anterior si existe para evitar duplicados
        if (isAdmin) {
            if (window.miSortable) {
                window.miSortable.destroy();
            }

            window.miSortable = new Sortable(grid, {
                animation: 250, 
                ghostClass: 'opacity-50', 
                delay: 250,
                delayOnTouchOnly: true, 
                touchStartThreshold: 5,
                forceFallback: true, 
                fallbackTolerance: 5, 
                
                onEnd: async function () {
                    const items = grid.querySelectorAll('[data-photoid]');
                    const batch = writeBatch(db);
                    
                    items.forEach((item, index) => {
                        const photoId = item.getAttribute('data-photoid');
                        const docRef = doc(db, "imagenes", photoId);
                        batch.update(docRef, { order: index });
                    });
                    
                    await batch.commit();
                }
            });
        }
    });
}

document.getElementById('photo-input').addEventListener('change', async (e) => {
    if (!isAdmin) return;
    const files = e.target.files;
    if (files.length === 0) return;

    // Cambiar el texto del botón mientras sube para dar feedback al usuario
    const uploadLabel = e.target.parentElement;
    const originalContent = uploadLabel.innerHTML;
    uploadLabel.innerHTML = '<span class="pointer-events-none">Procesando fotos...</span>';
    
    for (let file of files) {
        let uploadFile = file;

        // Detectar si el archivo es HEIC (Formato de iPhone)
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
            try {
                // Convertir el archivo HEIC a un Blob JPG
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: "image/jpeg",
                    quality: 0.8 // Calidad excelente manteniendo un buen peso
                });
                
                // Si la imagen tenía ráfaga, heic2any devuelve un array. Cogemos la principal.
                const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                
                // Renombramos el archivo cambiando la extensión a .jpg
                const newName = file.name.replace(/\.[^/.]+$/, ".jpg");
                uploadFile = new File([finalBlob], newName, { type: "image/jpeg" });
                
            } catch (error) { 
                console.error("Error al convertir HEIC a JPG:", error); 
                continue; // Si falla la conversión de esta foto, saltamos a la siguiente
            }
        }

        // Proceso de subida normal a Firebase (ahora garantizado en JPG o formato original compatible)
        const storageRef = ref(storage, `albums/${albumId}/${Date.now()}_${uploadFile.name}`);
        try {
            const uploadResult = await uploadBytes(storageRef, uploadFile);
            const downloadURL = await getDownloadURL(uploadResult.ref);
            await addDoc(collection(db, "imagenes"), {
                url: downloadURL,
                albumId: albumId,
                uploadedAt: new Date(),
                order: Date.now() // Asigna un número alto para que se coloque al final por defecto
            });
        } catch (error) { 
            console.error("Error al subir:", error); 
        }
    }

    // Restaurar el botón a su estado original
    uploadLabel.innerHTML = originalContent;
    // Limpiar el input para permitir volver a subir la misma foto si se desea
    e.target.value = '';
});

// NUEVO: Gestión de todos los clics de la pantalla
document.addEventListener('click', async (e) => {
    const action = e.target.getAttribute('data-action');
    
    // 1. Si haces clic en la X roja (Borrar foto)
    if (action === 'delete-photo' && isAdmin) {
        if(confirm("¿Borrar esta foto del álbum?")) {
            const photoId = e.target.getAttribute('data-photoid');
            
            try {
                // A. Obtenemos el documento para saber la URL de la imagen
                const fotoDoc = await getDoc(doc(db, "imagenes", photoId));
                
                if (fotoDoc.exists()) {
                    const fotoData = fotoDoc.data();
                    
                    // B. Borramos el archivo físico del Storage (Firebase encuentra el archivo por su URL)
                    const archivoRef = ref(storage, fotoData.url);
                    await deleteObject(archivoRef);
                }
                
                // C. Borramos el documento de texto de Firestore
                await deleteDoc(doc(db, "imagenes", photoId));
                
            } catch (error) {
                console.error("Error al borrar la foto:", error);
                alert("Hubo un problema al borrar la foto.");
            }
        }
    }
    
    // 2. Si haces clic en una foto (Ampliarla)
    if (action === 'view-photo') {
        const url = e.target.getAttribute('data-url');
        const modal = document.getElementById('photo-modal');
        const modalImg = document.getElementById('modal-image');
        const downloadBtn = document.getElementById('download-btn');
        
        modalImg.src = url;
        downloadBtn.setAttribute('data-url', url); // Pasamos la URL al botón de descarga
        modal.classList.remove('hidden');
    }

    // 3. Si haces clic en Descargar / Compartir
    if (action === 'download-photo') {
        const url = e.target.getAttribute('data-url');
        const originalText = e.target.innerHTML;
        
        e.target.innerHTML = '<span class="pointer-events-none">Procesando...</span>';
        
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const fileName = `TapMemories_${Date.now()}.jpg`;
            const file = new File([blob], fileName, { type: blob.type });

            // Comprueba si el dispositivo (como un iPhone) soporta el menú nativo de compartir
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Foto de TapMemories'
                });
            } else {
                // Plan B: Descarga tradicional para ordenadores (Windows/Mac)
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(blobUrl);
            }
        } catch (error) {
            console.error("Error al procesar la imagen:", error);
            window.open(url, '_blank');
        } finally {
            e.target.innerHTML = originalText;
        }
    }
    
    // 4. Si haces clic en el fondo negro, en la X, o en la propia imagen ampliada (Cerrar)
    if (e.target.id === 'photo-modal' || e.target.id === 'close-modal-btn' || action === 'close-modal') {
        document.getElementById('photo-modal').classList.add('hidden');
    }
});



// --- LÓGICA DEL BOTÓN CAMBIAR VISTA ---
// Definimos los 3 tamaños (Móvil / Ordenador)
const viewModes = [
    "grid-cols-1 md:grid-cols-3", // Modo 1: Grande (1 en móvil, 3 en PC)
    "grid-cols-2 md:grid-cols-4", // Modo 2: Mediano (2 en móvil, 4 en PC)
    "grid-cols-3 md:grid-cols-6"  // Modo 3: Pequeño (3 en móvil, 6 en PC)
];

// Empezamos en el Modo 1 (índice 0)
let currentViewIndex = 0;

document.getElementById('toggle-view-btn')?.addEventListener('click', () => {
    const grid = document.getElementById('photos-grid');
    
    // 1. Quitamos las clases del tamaño actual
    const oldClasses = viewModes[currentViewIndex].split(' ');
    grid.classList.remove(...oldClasses);
    
    // 2. Avanzamos al siguiente tamaño (si llega al final, vuelve al principio)
    currentViewIndex = (currentViewIndex + 1) % viewModes.length;
    
    // 3. Aplicamos las clases del nuevo tamaño
    const newClasses = viewModes[currentViewIndex].split(' ');
    grid.classList.add(...newClasses);
});


// --- LÓGICA DEL HEADER INTELIGENTE ---
let lastScrollTop = 0;
const header = document.getElementById('main-header');

window.addEventListener('scroll', () => {
    // Obtenemos la posición actual del scroll
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    
    // Si bajamos (y ya hemos bajado un poco para evitar ocultarlo al mínimo roce)
    if (currentScroll > lastScrollTop && currentScroll > 80) {
        // Le añadimos la clase de Tailwind que lo desplaza hacia arriba al 100% de su tamaño
        header.classList.add('-translate-y-full');
    } else {
        // Si subimos, aunque sea un píxel, le quitamos la clase y vuelve a bajar suavemente
        header.classList.remove('-translate-y-full');
    }
    
    // Actualizamos la última posición. El (currentScroll <= 0 ? 0 : currentScroll) 
    // es un truco para evitar un error visual en el "efecto rebote" de los iPhone (Safari)
    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
});