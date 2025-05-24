import { auth, onAuthStateChanged, signOut } from './firebase.js';
import { toggleLoader } from './auth.js';
import { db, doc, getDoc, getDocs, collection,collectionGroup,query } from "./firebase.js"; // ✅ FIXED: Added getDoc and collection

let userId;
let profileDiv, statisticCards;

// ✅ Function to check user login
const checkUserLogin = () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user || !user.emailVerified) {
      window.location.href = "../auth.html";
      return;
    }

    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        window.location.href = "../auth.html";
        return;
      }

      userId = user.uid;

      await showProfile(userId);   // ✅ Show user profile info
      await showCards(userId);     // ✅ Show stat cards

      toggleLoader(false); // ✅ Hide loader after loading

    } catch (error) {
      console.error("Error fetching user data:", error);
      alert("Failed to load user data.");
    }
  });
};

// ✅ Show profile info in header
const showProfile = async (userId) => {
  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      const userData = docSnap.data();
      profileDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="bg-blue-100 text-blue-800 rounded-full w-10 h-10 flex items-center justify-center text-sm font-bold">
            ${userData.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <span class="hidden md:block font-medium text-gray-700">${userData.name || "Unknown"}</span>
          <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading profile info:", error);
  }
};

// ✅ Show statistic cards
const showCards = async (userId) => {
  statisticCards.innerHTML = "";

  try {
  try {
    const productQuery = query(collectionGroup(db, "products"));
    const productSnapshot = await getDocs(productQuery);

    productSnapshot.forEach(doc => {
      console.log(doc.id, doc.data());
    });

  } catch (error) {
    console.error("Error fetching products:", error);
  }
    // Purchases & Sales
    const purchaseRef = collection(db, "users", userId, "purchase");
    const salesRef = collection(db, "users", userId, "sales");

    const [purchaseSnap, salesSnap] = await Promise.all([
      getDocs(purchaseRef),
      getDocs(salesRef)
    ]);

    let totalPurchase = 0, totalSales = 0;

    purchaseSnap.forEach(doc => {
      const data = doc.data().purchases || [];
      data.forEach(p => totalPurchase += Number(p.amount || 0));
    });

    salesSnap.forEach(doc => {
      const data = doc.data().sales || [];
      data.forEach(s => totalSales += Number(s.amount || 0));
    });

    statisticCards.innerHTML = `
      <div>Total Categories: </div>
      <div>Total Products: </div>
      <div>Sales: ₨ ${totalSales.toLocaleString()}</div>
      <div>Purchases: ₨ ${totalPurchase.toLocaleString()}</div>
      <div>Profit: ₨ ${(totalSales - totalPurchase).toLocaleString()}</div>
    `;
  } catch (err) {
    console.error(err);
    statisticCards.innerHTML = `<p class="text-red-500">Error loading data</p>`;
  }
};




// ✅ Logout function
const handleLogout = () => {
  signOut(auth)
    .then(() => {
      alert("Signed out successfully");
      window.location.href = "../auth.html";
    })
    .catch((error) => {
      console.error("Sign-out error:", error);
      alert("Error during sign out: " + error.message);
    });
};

// ✅ When DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  profileDiv = document.getElementById('profileButton');
  statisticCards = document.getElementById('statisticsCards');
  const logoutBtn = document.getElementById("Logout");

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  } else {
    console.warn("Logout button not found in DOM.");
  }

  toggleLoader(true);
  checkUserLogin();
});
