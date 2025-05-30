// firebase.js
import {
  auth,
  db,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  getDoc,
} from "./firebase.js";

// ELEMENTS
const loader = document.getElementById("loader");
const signUpForm = document.getElementById("signupForm");
const loginForm = document.getElementById("loginForm");
const go = document.querySelector('.go');

// Show or hide loader
const toggleLoader = (show) => {
  loader.classList.toggle("hidden", !show);
};

// 🔐 Check if user is logged in and redirect appropriately
const emailVerifyMsg = document.getElementById("emailVerifyMsg");

const checkUserLogin = () => {
  onAuthStateChanged(auth, async (user) => {
    toggleLoader(true);

    if (!user) {
      if (!window.location.pathname.includes("/auth.html")) {
        window.location.href = "../auth.html";
      } else {
        toggleLoader(false);
      }
      return;
    }

    // 📧 Check if email is verified
    if (!user.emailVerified) {
      if (emailVerifyMsg) emailVerifyMsg.classList.remove("hidden");
      go?.classList.add('hidden');
      toggleLoader(false);
      return;
    }

    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const role = userData.role;

        if (window.location.pathname.includes("/auth.html")) {
          if (role === "admin") {
            window.location.href = "../index.html";
          } else {
            window.location.href = "../index.html";
          }
        }
      } else {
        // User document does not exist
        if (!window.location.pathname.includes("/auth.html")) {
          window.location.href = "../auth.html";
        }
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      alert("Something went wrong, please try again.");
    } finally {
      toggleLoader(false);
    }
  });
};

// 🧠 Handle signup/login form submission
const handleAuthForm = async (e, type) => {
  e.preventDefault();
  toggleLoader(true);

  const form = e.target;
  const name = form.querySelector("input[name='name']")?.value.trim() || "";
  const email = form.querySelector("input[name='email']")?.value.trim() || "";
  const password = form.querySelector("input[name='password']")?.value || "";
  const confirmPassword = form.querySelector("input[name='confirmPassword']")?.value || "";

  // Validation
  if (!email || !password || (type === "signup" && (!name || !confirmPassword))) {
    alert("Please fill all required fields.");
    toggleLoader(false);
    return;
  }

  if (type === "signup" && password !== confirmPassword) {
    alert("Passwords do not match.");
    toggleLoader(false);
    return;
  }

  try {
    if (type === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const userDocRef = doc(db, "users", cred.user.uid);

      const role = email === "raomuhammadshayan897@gmail.com" ? "admin" : "user";

      await setDoc(userDocRef, {
        name,
        email,
        role,
        createdAt: new Date().toISOString(),
      });

      await sendEmailVerification(cred.user);
      alert("Signup successful! Verification email sent.");

      toggleLoader(true);
      signUpForm.classList.add("hidden");
      checkUserLogin();
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Login successful!");
      toggleLoader(true);
      checkUserLogin();
    }
  } catch (err) {
    console.error("Auth Error:", err);
    alert(`Auth Error: ${err.message}`);
  } finally {
    toggleLoader(false);
  }
};

// 🌐 On DOM ready
document.addEventListener("DOMContentLoaded", () => {
  toggleLoader(true);

  if (signUpForm) {
    signUpForm.addEventListener("submit", (e) => handleAuthForm(e, "signup"));
  }
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => handleAuthForm(e, "login"));
  }

  checkUserLogin();
});

export {
  toggleLoader,
};
