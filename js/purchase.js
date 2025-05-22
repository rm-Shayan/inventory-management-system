import {
  toggleLoader,
  checkUserRole,
} from "./auth.js";

import {
  auth,
  onAuthStateChanged,
  db,
  doc,
  getDoc,
  getDocs, // ✅ Missing import added
  setDoc,
  updateDoc,
  arrayUnion,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  Timestamp,
} from "./firebase.js";

// ✅ Move global variables outside so other functions can access them
let purchaseTable, purchaseTableBody;

const getCurrentMonthKey = (date = new Date()) =>
  `${date.toLocaleString("default", { month: "short" })}-${date.getFullYear()}`;

const addPurchaseItemToDb = async ({
  supplier,
  product,
  category,
  quantity,
  amount,
  date,
  nextId,
}) => {
  try {
    const purchaseRef = doc(db, "purchase", supplier);
    const purchaseSnap = await getDoc(purchaseRef);

    // Remove createdAt from the purchase item inside the array
    const newPurchase = {
      id: nextId,
      product,
      category,
      quantity: Number(quantity),
      amount: Number(amount),
      date: Timestamp.fromDate(new Date(date)),
      // createdAt: serverTimestamp(), // Remove this here
    };

    if (purchaseSnap.exists()) {
      await updateDoc(purchaseRef, {
        purchases: arrayUnion(newPurchase),
      });
    } else {
      // Here, set the timestamp at document root level, NOT inside array
      await setDoc(purchaseRef, {
        supplier,
        createdAt: serverTimestamp(), // Add here
        purchases: [newPurchase],
      });
    }

    // Add product by category/month if not exists
    const monthKey = getCurrentMonthKey(new Date(date));
    const categoryCol = collection(db, "products", category, monthKey);

    const q = query(
      categoryCol,
      where("product", "==", product),
      where("supplier", "==", supplier)
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      await addDoc(categoryCol, {
        product,
        supplier,
        quantity: Number(quantity),
        date: Timestamp.fromDate(new Date(date)),
        addedAt: serverTimestamp(),
      });
    }

    console.log("Purchase added successfully!");
  } catch (error) {
    console.error("Failed to add purchase:", error);
    alert("Failed to save purchase. Try again.");
  }
};


function renderOnUI(data) {
  const tr = document.createElement("tr");
  tr.className = "border-b hover:bg-gray-100";

  const formattedDate = data.date instanceof Timestamp
    ? data.date.toDate().toLocaleDateString()
    : data.date;

  tr.innerHTML = `
    <td class="py-3 px-6">${data.id}</td>
    <td class="py-3 px-6">${data.supplier}</td>
    <td class="py-3 px-6">${data.product}</td>
    <td class="py-3 px-6">${data.category}</td>
    <td class="py-3 px-6 text-center">${data.quantity}</td>
    <td class="py-3 px-6 text-center">₨${parseFloat(data.amount).toLocaleString()}</td>
    <td class="py-3 px-6 text-center">${formattedDate}</td>
    <td class="py-3 px-6 text-center">
      <div class="flex justify-center items-center space-x-2">
        <button title="Edit" class="text-blue-500 hover:text-blue-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
               viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
          </svg>
        </button>
        <button title="Delete" class="text-red-500 hover:text-red-700 delete-btn" data-id="${data.fireId}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
               viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4a1 1 0 011 1v1H9V4a1 1 0 011-1zM4 7h16" />
          </svg>
        </button>
      </div>
    </td>
  `;

  purchaseTableBody.appendChild(tr);
}

async function fetchAndRenderPurchases() {
  purchaseTableBody.innerHTML = ""; // ✅ Fixed to clear tbody, not the entire table
  const snapshot = await getDocs(collection(db, "purchase"));

  let index = 1;
  snapshot.forEach((docSnap) => {
    const docData = docSnap.data();
    const purchases = docData.purchases || [];

    purchases.forEach((item) => {
      renderOnUI({
        ...item,
        supplier: docData.supplier,
        fireId: docSnap.id,
        id: item.id || `#P-${index++}`,
      });
    });
  });
}

const checkUserLogin = () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "/auth.html";
      return;
    }
    if (!user.email) {
  alert("User email not found. Please login with email.");
  window.location.href = "/auth.html";
  return;
}
    try {
      const [isAdmin, isUser] = await Promise.all([
        checkUserRole("admin", user.email),
        checkUserRole("users", user.email),
      ]);

      if (isAdmin && window.location.pathname.includes("/auth.html")) {
        window.location.href = "/dashboard.html";
      } else if (isUser && window.location.pathname.includes("/auth.html")) {
        window.location.href = "/user.html";
      } else if (!isAdmin && !isUser) {
        window.location.href = "/auth.html";
      }

    try {
  await fetchAndRenderPurchases();
}catch(err){
  console.error(err);
}; // ✅ Wait to finish fetching before proceeding
    } catch {
      alert("Authentication error");
    } finally {
      toggleLoader(false);
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const loader = document.getElementById("loader");
  const menuButton = document.getElementById("menuButton");
  const sidebar = document.getElementById("sidebar");
  const cutBtn = document.getElementById("cutBtn");
  const showFormBtn = document.getElementById("showFormBtn");
  const purchaseFormContainer = document.getElementById("purchaseForm");
  const addPurchaseForm = document.getElementById("addPurchaseForm");

  // ✅ Set global table references
  purchaseTable = document.getElementById("purchaseTable");
  purchaseTableBody = document.getElementById("purchaseTableBody");

  toggleLoader(true); // Initial loader on page load
  checkUserLogin();   // Handles login check and data rendering

  // Sidebar toggle
 menuButton?.addEventListener("click", () => {
  if (sidebar) sidebar.classList.toggle("-translate-x-full");
});
cutBtn?.addEventListener("click", () => {
  if (sidebar) sidebar.classList.add("-translate-x-full");
});


 showFormBtn?.addEventListener("click", () => {
    if (!purchaseFormContainer || !purchaseTable) return;

   purchaseFormContainer.classList.toggle("hidden");

    if (!purchaseForm.classList.contains("hidden")) {
      // Form is now visible → hide table
      purchaseTable.classList.add("hidden");
    } else {
      // Form is now hidden → show table
      purchaseTable.classList.remove("hidden");
    }
  });

addPurchaseForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const supplier = addPurchaseForm.supplier.value.trim();
  const product = addPurchaseForm.product.value.trim();
  const category = addPurchaseForm.category.value;
  const quantity = addPurchaseForm.quantity.value;
  const amount = addPurchaseForm.amount.value;
  const date = addPurchaseForm.date.value;

  if (!supplier || !product || !category || !quantity || !amount || !date) {
    alert("Please fill all fields.");
    return;
  }

  const nextId = "#P-" + (purchaseTableBody.rows.length + 1);
  toggleLoader(true);
  await addPurchaseItemToDb({
    supplier,
    product,
    category,
    quantity,
    amount,
    date,
    nextId,
  });
  toggleLoader(false);

  addPurchaseForm.reset();

  // ✅ Hide form, Show table after save
  purchaseFormContainer?.classList.add("hidden");
  purchaseTable?.classList.remove("hidden");

  await fetchAndRenderPurchases(); // ✅ Refresh table
});


  // UI Delete only
  purchaseTableBody?.addEventListener("click", (e) => {
    if (e.target.closest(".delete-btn")) {
      const row = e.target.closest("tr");
      row?.remove();
      // ✅ You can later add Firestore delete logic here
    }
  });
});
