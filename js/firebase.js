// js/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    arrayRemove,
    getDocs,
    onSnapshot,
    Timestamp,
    deleteDoc,
    collectionGroup,
    limit,
    orderBy,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword,signOut , updateEmail,
    updatePassword,
    sendEmailVerification,
    reauthenticateWithCredential, // Added for reauthentication
    EmailAuthProvider // Added for reauthentication
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
    // your firebase config here
  
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Global variables provided by the Canvas environment
// Use the provided __app_id if available, otherwise fallback to a default or the one from firebaseConfig



export {
    db,
    auth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    signOut,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    arrayRemove,
    arrayUnion,
    collection,
    collectionGroup,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    where,
    getDocs,
    updateEmail,
    updatePassword,
    limit,
    onSnapshot,
    Timestamp,
    onAuthStateChanged,
    reauthenticateWithCredential, // Export reauthenticateWithCredential
    EmailAuthProvider, // Export EmailAuthProvider
};
