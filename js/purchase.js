import { toggleLoader } from "./auth.js";
import {
  auth, onAuthStateChanged, db, doc, getDoc, getDocs,
  setDoc, updateDoc, arrayUnion, collection, addDoc,
  serverTimestamp, query, where, onSnapshot, Timestamp
} from "./firebase.js";

// 🔹 Globals
let userId, purchaseTableBody;
let isEditMode = false;
let editData = null;

const getCurrentMonthKey = (date = new Date()) =>
  `${date.toLocaleString("default", { month: "short" })}-${date.getFullYear()}`;

const formatDate = (date) =>
  date instanceof Timestamp ? date.toDate().toLocaleDateString() : date;

const renderOnUI = (data) => {
  const tr = document.createElement("tr");
  tr.className = "border-b hover:bg-gray-100";
  tr.innerHTML = `
  <tr class="border-b hover:bg-gray-50 transition-colors">
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base whitespace-nowrap">${data.id}</td>
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base whitespace-nowrap">${data.supplier}</td>
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base whitespace-nowrap">${data.product}</td>
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base whitespace-nowrap">${data.category}</td>
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base text-center whitespace-nowrap">${data.quantity}</td>
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base text-center whitespace-nowrap">₨${parseFloat(data.amount).toLocaleString()}</td>
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base text-center whitespace-nowrap">${formatDate(data.date)}</td>
  <td class="py-3 px-4 sm:px-6 text-sm sm:text-base text-center whitespace-nowrap">
    <div class="flex justify-center items-center space-x-2">
      <button class="text-blue-500 hover:text-blue-700 edit-btn" data-fireid="${data.fireId}" data-purchaseid="${data.id}">
        ✏️
      </button>
      <button class="text-red-500 hover:text-red-700 delete-btn" data-fireid="${data.fireId}" data-purchaseid="${data.id}">
        🗑️
      </button>
    </div>
  </td>
</tr>
  `;
  purchaseTableBody.appendChild(tr);
};

const addPurchaseItemToDb = async ({ supplier, product, category, quantity, amount, date, nextId }) => {
  const purchaseRef = doc(db, "users", userId, "purchase", supplier);
  const newPurchase = {
    id: nextId,
    product,
    category,
    quantity: Number(quantity),
    amount: Number(amount),
    date: Timestamp.fromDate(new Date(date)),
  };

  const purchaseSnap = await getDoc(purchaseRef);
  if (purchaseSnap.exists()) {
    await updateDoc(purchaseRef, { purchases: arrayUnion(newPurchase) });
  } else {
    await setDoc(purchaseRef, {
      supplier,
      createdAt: serverTimestamp(),
      purchases: [newPurchase],
    });
  }

  const monthKey = getCurrentMonthKey(new Date(date));
  const categoryCol = collection(db, "users", userId, "products", category, monthKey);
  const q = query(categoryCol, where("product", "==", product), where("supplier", "==", supplier));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    await addDoc(categoryCol, {
      product, supplier, quantity: Number(quantity),
      date: Timestamp.fromDate(new Date(date)),
      addedAt: serverTimestamp(),
    });
  }
};

const fetchAndRenderPurchases = async () => {
  purchaseTableBody.innerHTML = "";
  const snapshot = await getDocs(collection(db, "users", userId, "purchase"));
  const allPurchases = [];

  snapshot.forEach(docSnap => {
    const docData = docSnap.data();
    (docData.purchases || []).forEach(item =>
      allPurchases.push({ ...item, supplier: docData.supplier, fireId: docSnap.id })
    );
  });

  allPurchases.sort((a, b) => b.date.toDate() - a.date.toDate());
  allPurchases.forEach((item, index) => {
    renderOnUI({ ...item, id: item.id || `#P-${index + 1}` });
  });
};


const editPurchaseItem = async (supplierId, purchaseId, updatedData) => {
  const purchaseRef = doc(db, "users", userId, "purchase", supplierId);
  const purchaseSnap = await getDoc(purchaseRef);
  if (!purchaseSnap.exists()) return alert("Purchase not found.");

  const oldPurchase = purchaseSnap.data().purchases.find(p => p.id === purchaseId);
  const updatedPurchases = purchaseSnap.data().purchases.map(p =>
    p.id === purchaseId ? { ...p, ...updatedData } : p
  );

  await updateDoc(purchaseRef, { purchases: updatedPurchases });

  // Update `products` collection
  const oldMonth = getCurrentMonthKey(oldPurchase.date.toDate());
  const newMonth = getCurrentMonthKey(updatedData.date.toDate ? updatedData.date.toDate() : new Date(updatedData.date));

  const oldCategoryCol = collection(db, "users", userId, "products", oldPurchase.category, oldMonth);
  const newCategoryCol = collection(db, "users", userId, "products", updatedData.category, newMonth);

  const qOld = query(oldCategoryCol, where("product", "==", oldPurchase.product), where("supplier", "==", supplierId));
  const qNew = query(newCategoryCol, where("product", "==", updatedData.product), where("supplier", "==", supplierId));

  const oldSnap = await getDocs(qOld);
  const newSnap = await getDocs(qNew);

  if (!oldSnap.empty) {
    const docRef = oldSnap.docs[0].ref;
    await updateDoc(docRef, { quantity: Number(updatedData.quantity) });
  }

  if (oldPurchase.product !== updatedData.product || oldPurchase.category !== updatedData.category || oldMonth !== newMonth) {
    // Optionally handle movement across categories/months
    await addDoc(newCategoryCol, {
      product: updatedData.product,
      supplier: supplierId,
      quantity: Number(updatedData.quantity),
      date: Timestamp.fromDate(new Date(updatedData.date)),
      addedAt: serverTimestamp()
    });
  }

  alert("Updated successfully");
};

const deletePurchaseItem = async (supplierId, purchaseId) => {
  const purchaseRef = doc(db, "users", userId, "purchase", supplierId);
  const purchaseSnap = await getDoc(purchaseRef);
  if (!purchaseSnap.exists()) return;

  const allPurchases = purchaseSnap.data().purchases || [];
  const purchaseToDelete = allPurchases.find(p => p.id === purchaseId);
  const filteredPurchases = allPurchases.filter(p => p.id !== purchaseId);

  await updateDoc(purchaseRef, { purchases: filteredPurchases });

  // Update `products` collection
  const monthKey = getCurrentMonthKey(purchaseToDelete.date.toDate());
  const categoryCol = collection(db, "users", userId, "products", purchaseToDelete.category, monthKey);
  const q = query(categoryCol, where("product", "==", purchaseToDelete.product), where("supplier", "==", supplierId));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const productRef = snap.docs[0].ref;
    const currentQty = snap.docs[0].data().quantity;

    // Adjust quantity or delete the product record if zero
    const remainingQty = currentQty - purchaseToDelete.quantity;
    if (remainingQty > 0) {
      await updateDoc(productRef, { quantity: remainingQty });
    } else {
      await productRef.delete();
    }
  }

  alert("Deleted successfully");
};

const checkUserLogin = () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user || !user.emailVerified) {
      window.location.href = "../auth.html";
      return;
    }

    const userDocSnap = await getDoc(doc(db, "users", user.uid));
    if (!userDocSnap.exists()) {
      window.location.href = "../auth.html";
      return;
    }

    userId = user.uid;
    await fetchAndRenderPurchases();
    toggleLoader(false);
  });
};

// 🔹 Event & UI Binding
document.addEventListener("DOMContentLoaded", () => {
  const loader = document.getElementById("loader");
  const menuButton = document.getElementById("menuButton");
  const sidebar = document.getElementById("sidebar");
  const cutBtn = document.getElementById("cutBtn");
  const showFormBtn = document.getElementById("showFormBtn");
  const purchaseFormContainer = document.getElementById("purchaseForm");
  const purchaseTable = document.getElementById("purchaseTable");
  purchaseTableBody = document.getElementById("purchaseTableBody");
  const addPurchaseForm = document.getElementById("addPurchaseForm");

  toggleLoader(true);
  checkUserLogin();

  menuButton?.addEventListener("click", () => sidebar?.classList.toggle("-translate-x-full"));
  cutBtn?.addEventListener("click", () => sidebar?.classList.add("-translate-x-full"));
  showFormBtn?.addEventListener("click", () => {
    purchaseFormContainer.classList.toggle("hidden");
    purchaseTable.classList.toggle("hidden");
  });

  addPurchaseForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { supplier, product, category, quantity, amount, date } = Object.fromEntries(new FormData(addPurchaseForm));
    if (!supplier || !product || !category || !quantity || !amount || !date) return alert("All fields required");

    toggleLoader(true);

    if (isEditMode && editData) {
      await editPurchaseItem(editData.supplierId, editData.purchaseId, {
        product, category, quantity: Number(quantity), amount: Number(amount),
        date: Timestamp.fromDate(new Date(date))
      });
      
      isEditMode = false;
      editData = null;

    } else {
      const nextId = `#P-${purchaseTableBody.rows.length + 1}`;
      await addPurchaseItemToDb({ supplier, product, category, quantity, amount, date, nextId });
    alert('added successfully')
    }

    addPurchaseForm.reset();
    purchaseFormContainer.classList.add("hidden");
    purchaseTable.classList.remove("hidden");
    await fetchAndRenderPurchases();

    toggleLoader(false);
  });

  purchaseTableBody?.addEventListener("click", async (e) => {
    const target = e.target.closest("button");
    if (!target) return;

    const { fireid, purchaseid } = target.dataset;

    if (target.classList.contains("delete-btn")) {
      toggleLoader(true);
      await deletePurchaseItem(fireid, purchaseid);
      await fetchAndRenderPurchases();
      toggleLoader(false);
    }

    if (target.classList.contains("edit-btn")) {
      isEditMode = true;
      editData = { supplierId: fireid, purchaseId: purchaseid };

      const purchaseRef = doc(db, "users", userId, "purchase", fireid);
      const purchaseSnap = await getDoc(purchaseRef);
      if (!purchaseSnap.exists()) return;

      const targetItem = (purchaseSnap.data().purchases || []).find(p => p.id === purchaseid);
      if (targetItem) {
        const form = addPurchaseForm;
        form.supplier.value = fireid;
        form.product.value = targetItem.product;
        form.category.value = targetItem.category;
        form.quantity.value = targetItem.quantity;
        form.amount.value = targetItem.amount;
        form.date.value = formatDate(targetItem.date);
        purchaseFormContainer.classList.remove("hidden");
        purchaseTable.classList.add("hidden");
      }
    }
  });
});


// 🔐 Auth check

