import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD-TV-1L_O4NUFXgJ7ULDOtUbIuMUjY1JA",
  authDomain: "tapmemories-2f1e3.firebaseapp.com",
  projectId: "tapmemories-2f1e3",
  storageBucket: "tapmemories-2f1e3.firebasestorage.app",
  messagingSenderId: "734222446010",
  appId: "1:734222446010:web:cf90cb0aaad93d86e64183",
  measurementId: "G-FFX7MPD91H"
};

const app = initializeApp(firebaseConfig);

// Exportamos los servicios para usarlos en los otros archivos
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);