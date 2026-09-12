import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const urlParams = new URLSearchParams(window.location.search);
const albumId = urlParams.get('id');

// Variable global para saber si eres tú o un invitado
let isAdmin = false;

onAuthStateChanged(auth, (user) => {
    if (user) {
        isAdmin = true;
        // Mostrar botones de administrador
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

    const photosRef = collection(db, `albums/${albumId}/photos`);
    const q = query(photosRef, orderBy("uploadedAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('photos-grid');
        grid.innerHTML = ''; 
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Si es admin, añadimos un botón de la "X" para borrar la foto sobre la imagen
            const deleteButton = isAdmin 
                ? `<button data-action="delete-photo" data-photoid="${doc.id}" class="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow hover:bg-red-700">X</button>` 
                : '';

            grid.innerHTML += `
                <div class="relative group">
                    <img src="${data.url}" class="w-full h-32 sm:h-48 object-cover rounded-lg shadow-sm" alt="Foto">
                    ${deleteButton}
                </div>
            `;
        });
    });
}

// Subida de fotos (solo se activará si el admin hace clic)
document.getElementById('photo-input').addEventListener('change', async (e) => {
    if (!isAdmin) return;
    const files = e.target.files;
    for (let file of files) {
        const storageRef = ref(storage, `albums/${albumId}/${Date.now()}_${file.name}`);
        try {
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);
            await addDoc(collection(db, `albums/${albumId}/photos`), {
                url: downloadURL,
                uploadedAt: new Date()
            });
        } catch (error) { console.error("Error al subir:", error); }
    }
});

// Delegación para borrar fotos individuales
document.addEventListener('click', async (e) => {
    if (e.target.getAttribute('data-action') === 'delete-photo' && isAdmin) {
        if(confirm("¿Borrar esta foto del álbum?")) {
            const photoId = e.target.getAttribute('data-photoid');
            await deleteDoc(doc(db, `albums/${albumId}/photos`, photoId));
        }
    }
});