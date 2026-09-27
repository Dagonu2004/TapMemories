import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else loadAlbums();
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

document.getElementById('create-album-btn').addEventListener('click', async () => {
    const title = prompt("Introduce el nombre del viaje/álbum:");
    if (!title) return;
    try {
        const docRef = await addDoc(collection(db, "albums"), { title: title, createdAt: new Date() });
        alert(`Álbum creado.\n\nEste ID va a tu pegatina NFC:\n${docRef.id}`);
        loadAlbums();
    } catch (error) { console.error("Error creando el álbum: ", error); }
});

async function loadAlbums() {
    const q = query(collection(db, "albums"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const grid = document.getElementById('albums-grid');
    grid.innerHTML = '';

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        grid.innerHTML += `
            <div class="bg-white p-4 rounded-xl shadow relative flex flex-col justify-between min-h-[8rem]">
                
                <!-- Título con un poco de margen derecho (pr-8) para que el texto largo no pise los puntos -->
                <h3 class="font-bold text-gray-800 cursor-pointer pr-8" data-action="open" data-id="${doc.id}">${data.title}</h3>
                
                <!-- Contenedor anclado absolutamente arriba a la derecha (top-3 right-3) -->
                <div class="absolute top-3 right-3">
                    <button class="text-gray-400 hover:text-gray-800 font-bold px-2 text-lg focus:outline-none" data-action="toggle" data-id="${doc.id}">⋮</button>
                    
                    <!-- FÍJATE AQUÍ: Hemos cambiado 'right-0' por 'left-4' -->
                    <div id="menu-${doc.id}" class="hidden absolute left-4 mt-1 w-36 bg-white rounded-md shadow-lg z-30 border border-gray-100 overflow-hidden">
                        <button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" data-action="rename" data-id="${doc.id}" data-title="${data.title}">Renombrar</button>
                        <button class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50" data-action="delete" data-id="${doc.id}">Borrar</button>
                    </div>
                </div>

                <p class="text-xs text-gray-400 mt-4">ID: ${doc.id}</p>
            </div>
        `;
    });
}

// Delegación de eventos para capturar los clics en los botones generados
document.addEventListener('click', async (e) => {
    const action = e.target.getAttribute('data-action');
    const id = e.target.getAttribute('data-id');

    // Cerrar los menús si se hace clic fuera
    if (action !== 'toggle') {
        document.querySelectorAll('[id^="menu-"]').forEach(menu => menu.classList.add('hidden'));
    }
    if (!action) return;

    if (action === 'toggle') {
        document.getElementById(`menu-${id}`).classList.toggle('hidden');
    } else if (action === 'open') {
        window.location.href = `album.html?id=${id}`;
    } else if (action === 'rename') {
        const oldTitle = e.target.getAttribute('data-title');
        const newTitle = prompt("Nuevo nombre:", oldTitle);
        if (newTitle && newTitle !== oldTitle) {
            await updateDoc(doc(db, "albums", id), { title: newTitle });
            loadAlbums();
        }
    } else if (action === 'delete') {
        // Llamamos a la función completa pasándole el ID del álbum
        await borrarAlbumCompleto(id);
        // Recargamos la cuadrícula visual de álbumes
        loadAlbums();
    }
});

async function borrarAlbumCompleto(albumId) {
    if (!confirm("¿Seguro que quieres borrar este álbum? Se eliminarán todas las fotos para siempre.")) return;

    try {
        // 1. Buscar todos los documentos de fotos asociados a este álbum
        const fotosRef = collection(db, "imagenes");
        const q = query(fotosRef, where("albumId", "==", albumId));
        const fotosSnapshot = await getDocs(q);

        // 2. Borrar cada archivo físico de Storage y su documento de la base de datos
        const promesasDeBorrado = fotosSnapshot.docs.map(async (fotoDoc) => {
            const fotoData = fotoDoc.data();
            try {
                // Firebase es lo bastante listo para encontrar el archivo físico solo pasándole la URL
                const archivoRef = ref(storage, fotoData.url);
                await deleteObject(archivoRef);
            } catch (error) {
                console.error("No se pudo borrar el archivo de Storage:", error);
            }
            // Borramos el documento de la colección 'imagenes'
            await deleteDoc(doc(db, "imagenes", fotoDoc.id));
        });

        // Esperamos a que todas las fotos se hayan borrado antes de continuar
        await Promise.all(promesasDeBorrado);

        // 3. Una vez vaciado, borramos el documento original del álbum
        await deleteDoc(doc(db, "albums", albumId));
        
        alert("Álbum borrado por completo.");
        // Aquí puedes recargar la lista de álbumes de tu interfaz
        
    } catch (error) {
        console.error("Error borrando el álbum:", error);
    }
}