// firebase.js
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
  getDocs,
  onSnapshot,
  Timestamp,
  deleteDoc,
  collectionGroup
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword,signOut ,
  sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  // your firebase config here
  

};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export {
  db,
  auth,
   createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut ,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  collection,
  collectionGroup,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  onSnapshot,
  Timestamp,
  onAuthStateChanged,
};