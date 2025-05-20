// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-analytics.js";
import { getFirestore,getDoc, collection, addDoc, getDocs, doc, setDoc, updateDoc, arrayUnion, arrayRemove, increment, deleteDoc, deleteField, query, where, orderBy } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile, sendEmailVerification, updateEmail, updatePassword, deleteUser } from "https://www.gstatic.com/firebasejs/11.7.3/firebase-auth.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
   
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
export {
    db, auth,
    collection, addDoc,
    getDoc,
    getDocs, doc, setDoc, updateDoc, arrayUnion,
    arrayRemove, increment,
    deleteDoc,
    deleteField,
    query, where, orderBy,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, updateProfile,
    sendEmailVerification, updateEmail,
    updatePassword, deleteUser
} 