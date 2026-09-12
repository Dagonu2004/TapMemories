import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// Si ya hay un usuario logueado, saltamos el login y vamos al panel principal
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "index.html";
    }
});

const loginForm = document.getElementById('login-form');
const errorMsg = document.getElementById('error-message');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // El observador onAuthStateChanged de arriba detectará el login y redirigirá
        } catch (error) {
            errorMsg.style.display = 'block';
            console.error("Error de acceso:", error);
        }
    });
}