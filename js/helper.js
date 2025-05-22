import { toggleLoader,checkUserRole } from "./auth.js";
import { auth,onAuthStateChanged } from "./firebase.js";
export  const checkUserLogin = () => {
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

    try {
      const [isAdmin, isUser] = await Promise.all([
        checkUserRole("admin", user.email),
        checkUserRole("users", user.email),
      ]);

      if (isAdmin) {
        if (window.location.pathname.includes("/auth.html")) {
          window.location.href = "../dashboard.html";
        }
      } else if (isUser) {
        if (window.location.pathname.includes("/auth.html")) {
          window.location.href = "../user.html";
        }
      } else {
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

