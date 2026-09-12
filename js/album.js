import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, where, deleteDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const urlParams = new URLSearchParams(window.location.search);
const albumId = urlParams.get('id');

let isAdmin = false;

onAuthStateChanged(auth, (user) => {
    if (user) {
        isAdmin = true;
        document.getElementById('admin-back-btn').classList.remove('hidden');
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
    const q = query(photosRef, where("albumId", "==", albumId), orderBy("uploadedAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('photos-grid');
        grid.innerHTML = ''; 
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const deleteButton = isAdmin 
                ? `<button data-action="delete-photo" data-photoid="${doc.id}" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs shadow-md hover:bg-red-700 z-10 transition-transform hover:scale-110">X</button>` 
                : '';

            // NUEVO: Hemos añadido la clase cursor-zoom-in y los atributos data-action y data-url a la imagen
            grid.innerHTML += `
                <div class="relative group">
                    <img src="${data.url}" class="w-full h-32 sm:h-48 object-cover rounded-xl shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity" alt="Foto" data-action="view-photo" data-url="${data.url}">
                    ${deleteButton}
                </div>
            `;
        });
    });
}

document.getElementById('photo-input').addEventListener('change', async (e) => {
    if (!isAdmin) return;
    const files = e.target.files;
    
    for (let file of files) {
        const storageRef = ref(storage, `albums/${albumId}/${Date.now()}_${file.name}`);
        try {
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);
            await addDoc(collection(db, "imagenes"), {
                url: downloadURL,
                albumId: albumId,
                uploadedAt: new Date()
            });
        } catch (error) { 
            console.error("Error al subir:", error); 
        }
    }
});

// NUEVO: Gestión de todos los clics de la pantalla
document.addEventListener('click', async (e) => {
    const action = e.target.getAttribute('data-action');
    
    // 1. Si haces clic en la X roja (Borrar foto)
    if (action === 'delete-photo' && isAdmin) {
        if(confirm("¿Borrar esta foto del álbum?")) {
            const photoId = e.target.getAttribute('data-photoid');
            await deleteDoc(doc(db, "imagenes", photoId));
        }
    }
    
    // 2. Si haces clic en una foto (Ampliarla)
    if (action === 'view-photo') {
        const url = e.target.getAttribute('data-url');
        const modal = document.getElementById('photo-modal');
        const modalImg = document.getElementById('modal-image');
        
        modalImg.src = url;
        modal.classList.remove('hidden');
    }
    
    // 3. Si haces clic en el fondo negro o en la X del modal (Cerrarla)
    if (e.target.id === 'photo-modal' || e.target.id === 'close-modal-btn') {
        const modal = document.getElementById('photo-modal');
        modal.classList.add('hidden');
    }
});