import { toggleLoader } from "./auth.js";
import {
  auth, onAuthStateChanged, db, doc, getDoc, getDocs,
  setDoc, updateDoc, arrayUnion, collection, addDoc,
  serverTimestamp, query, where, Timestamp, deleteDoc
} from "./firebase.js";

let userId, purchaseTableBody;
let isEditMode = false;
let editData = null;

const getCurrentMonthKey = (date = new Date()) =>
  `${date.toLocaleString("default", { month: "short" })}-${date.getFullYear()}`;

const formatDate = (date) =>
  date instanceof Timestamp ? date.toDate().toISOString().split("T")[0] : date;

const renderSalesOnUI = (data) => {
  const tr = document.createElement("tr");
  tr.className = "border-b hover:bg-gray-100 transition-colors";
  tr.innerHTML = `
    <td class="py-3 px-4 text-sm whitespace-nowrap">${data.id}</td>
    <td class="py-3 px-4 text-sm whitespace-nowrap">${data.customer}</td>
    <td class="py-3 px-4 text-sm whitespace-nowrap">${data.product}</td>
    <td class="py-3 px-4 text-sm whitespace-nowrap">${data.category}</td>
    <td class="py-3 px-4 text-sm text-center whitespace-nowrap">${data.quantity}</td>
    <td class="py-3 px-4 text-sm text-center whitespace-nowrap">₨${parseFloat(data.amount).toLocaleString()}</td>
    <td class="py-3 px-4 text-sm text-center whitespace-nowrap">${formatDate(data.date)}</td>
    <td class="py-3 px-4 text-sm text-center whitespace-nowrap">
      <div class="flex justify-center items-center space-x-2">
        <button class="edit-sales-btn text-blue-500" data-fireid="${data.fireId}" data-saleid="${data.id}">✏️</button>
        <button class="delete-sales-btn text-red-500" data-fireid="${data.fireId}" data-saleid="${data.id}">🗑️</button>
      </div>
    </td>`;
  purchaseTableBody.appendChild(tr);
};

const addSalesItemToDb = async ({ customer, product, category, quantity, amount, date, nextId }) => {
  const monthKey = getCurrentMonthKey(new Date(date));
  const productCol = collection(db, "users", userId, "products", category, monthKey);
  const productQuery = query(productCol, where("product", "==", product));
  const productSnap = await getDocs(productQuery);

  if (productSnap.empty) {
    toggleLoader(false);
    return alert(`❌ Product "${product}" not found.`);
  }

  const productDoc = productSnap.docs[0];
  const productData = productDoc.data();

  if (productData.quantity < Number(quantity)) {
    toggleLoader(false);
    return alert(`❌ Not enough quantity. Available: ${productData.quantity}`);
  }

  const unitPrice = productData.amount / productData.quantity;
  const expectedAmount = unitPrice * Number(quantity);

  if (Math.abs(expectedAmount - Number(amount)) > 1) {
    toggleLoader(false);
    return alert(`❌ Price mismatch. Expected ₨${expectedAmount.toFixed(2)}`);
  }

  const saleData = {
    id: nextId,
    product,
    category,
    quantity: Number(quantity),
    amount: Number(amount),
    date: Timestamp.fromDate(new Date(date))
  };

  const salesRef = doc(db, "users", userId, "sales", customer);
  const salesSnap = await getDoc(salesRef);
  if (salesSnap.exists()) {
    await updateDoc(salesRef, { sales: arrayUnion(saleData) });
  } else {
    await setDoc(salesRef, { customer, createdAt: serverTimestamp(), sales: [saleData] });
  }

  // Update product quantity after sale
  await updateDoc(productDoc.ref, { quantity: productData.quantity - Number(quantity) });

  // Track customer purchase under products if not already tracked
  const customerTracking = query(productCol, where("product", "==", product), where("customer", "==", customer));
  const customerSnap = await getDocs(customerTracking);
  if (customerSnap.empty) {
    await addDoc(productCol, {
      product,
      customer,
      quantity: Number(quantity),
      date: Timestamp.fromDate(new Date(date)),
      addedAt: serverTimestamp()
    });
  }
};

const fetchAndRenderSales = async () => {
  purchaseTableBody.innerHTML = "";
  const snapshot = await getDocs(collection(db, "users", userId, "sales"));
  const allSales = [];

  snapshot.forEach(docSnap => {
    const { sales = [], customer } = docSnap.data();
    sales.forEach(item => allSales.push({ ...item, customer, fireId: docSnap.id }));
  });

  allSales.sort((a, b) => b.date.toDate() - a.date.toDate());
  allSales.forEach((item, i) => renderSalesOnUI({ ...item, id: item.id || `#S-${i + 1}` }));
};

const editSalesItem = async (customerId, saleId, updatedData) => {
  const salesRef = doc(db, "users", userId, "sales", customerId);
  const salesSnap = await getDoc(salesRef);
  if (!salesSnap.exists()) return alert("Sale not found.");

  const oldSale = salesSnap.data().sales.find(s => s.id === saleId);
  if (!oldSale) return alert("Sale not found.");

  const updatedSales = salesSnap.data().sales.map(s => s.id === saleId ? { ...s, ...updatedData } : s);
  await updateDoc(salesRef, { sales: updatedSales });

  const oldMonth = getCurrentMonthKey(oldSale.date.toDate());
  const newMonth = getCurrentMonthKey(updatedData.date.toDate ? updatedData.date.toDate() : new Date(updatedData.date));
  const oldCatCol = collection(db, "users", userId, "products", oldSale.category, oldMonth);
  const newCatCol = collection(db, "users", userId, "products", updatedData.category, newMonth);

  const qOld = query(oldCatCol, where("product", "==", oldSale.product), where("customer", "==", customerId));
  const qNew = query(newCatCol, where("product", "==", updatedData.product), where("customer", "==", customerId));

  const oldSnap = await getDocs(qOld);
  const newSnap = await getDocs(qNew);

  // Adjust old product quantity if exists
  if (!oldSnap.empty) {
    const oldProductDoc = oldSnap.docs[0];
    const oldQuantity = oldProductDoc.data().quantity || 0;
    // Calculate quantity difference (old - new)
    const quantityDiff = oldQuantity - Number(updatedData.quantity);
    // Update quantity safely (not negative)
    await updateDoc(oldProductDoc.ref, { quantity: Math.max(0, quantityDiff) });
  }

  // Add new product tracking if changed product/category/month
  if (oldSale.product !== updatedData.product || oldSale.category !== updatedData.category || oldMonth !== newMonth) {
    await addDoc(newCatCol, {
      product: updatedData.product,
      customer: customerId,
      quantity: Number(updatedData.quantity),
      date: Timestamp.fromDate(new Date(updatedData.date)),
      addedAt: serverTimestamp()
    });
  }

  alert("✅ Sale updated.");
};

const deleteSalesItem = async (customerId, saleId) => {
  try {
    const salesRef = doc(db, "users", userId, "sales", customerId);
    const salesSnap = await getDoc(salesRef);
    if (!salesSnap.exists()) return;

    const allSales = salesSnap.data().sales || [];
    const saleToDelete = allSales.find(s => s.id === saleId);
    if (!saleToDelete) {
      alert("Sale to delete not found.");
      return;
    }

    const filteredSales = allSales.filter(s => s.id !== saleId);
    await updateDoc(salesRef, { sales: filteredSales });

    const monthKey = getCurrentMonthKey(saleToDelete.date.toDate());
    const catCol = collection(db, "users", userId, "products", saleToDelete.category, monthKey);
    const snap = await getDocs(query(catCol, where("product", "==", saleToDelete.product), where("customer", "==", customerId)));

    if (!snap.empty) {
      const productDoc = snap.docs[0];
      const productData = productDoc.data();

      // Recalculate quantity safely: add back the deleted sale quantity
      const newQuantity = (productData.quantity || 0) + saleToDelete.quantity;

      await updateDoc(productDoc.ref, { quantity: newQuantity });
    }

    alert("✅ Sale deleted.");
  } catch (error) {
    alert(`❌ Delete failed: ${error.message}`);
  }
};

const checkUserLogin = () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user || !user.emailVerified) return location.href = "../auth.html";
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) return location.href = "../auth.html";

    userId = user.uid;
    await fetchAndRenderSales();
    toggleLoader(false);
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const loader = document.getElementById("loader");
  const menuButton = document.getElementById("menuButton");
  const sidebar = document.getElementById("sidebar");
  const cutBtn = document.getElementById("cutBtn");
  const showFormBtn = document.getElementById("showFormBtn");
  const formContainer = document.getElementById("purchaseForm");
  const purchaseTable = document.getElementById("purchaseTable");
  purchaseTableBody = document.getElementById("purchaseTableBody");
  const form = document.getElementById("addPurchaseForm");

  toggleLoader(true);
  checkUserLogin();

  menuButton?.addEventListener("click", () => sidebar?.classList.toggle("-translate-x-full"));
  cutBtn?.addEventListener("click", () => sidebar?.classList.add("-translate-x-full"));
  showFormBtn?.addEventListener("click", () => {
    formContainer.classList.toggle("hidden");
    purchaseTable.classList.toggle("hidden");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(form).entries());
    if (Object.values(formData).some(val => !val)) return alert("All fields required.");

    toggleLoader(true);

    if (isEditMode && editData) {
      await editSalesItem(editData.customerId, editData.saleId, {
        ...formData,
        quantity: Number(formData.quantity),
        amount: Number(formData.amount),
        date: Timestamp.fromDate(new Date(formData.date))
      });
      isEditMode = false;
      editData = null;
    } else {
      const nextId = `#S-${purchaseTableBody.rows.length + 1}`;
      await addSalesItemToDb({ ...formData, date: formData.date, nextId });
      alert("✅ Sale added.");
    }

    form.reset();
    formContainer.classList.add("hidden");
    purchaseTable.classList.remove("hidden");
    await fetchAndRenderSales();
    toggleLoader(false);
  });

  purchaseTableBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const { fireid, saleid } = btn.dataset;

    if (btn.classList.contains("delete-sales-btn")) {
      toggleLoader(true);
      await deleteSalesItem(fireid, saleid);
      await fetchAndRenderSales();
      toggleLoader(false);
    }

    if (btn.classList.contains("edit-sales-btn")) {
      isEditMode = true;
      editData = { customerId: fireid, saleId: saleid };

      const snap = await getDoc(doc(db, "users", userId, "sales", fireid));
      const targetItem = snap.data().sales.find(s => s.id === saleid);
      if (targetItem) {
        form.customer.value = fireid;
        form.product.value = targetItem.product;
        form.category.value = targetItem.category;
        form.quantity.value = targetItem.quantity;
        form.amount.value = targetItem.amount;
        form.date.value = formatDate(targetItem.date);
        formContainer.classList.remove("hidden");
        purchaseTable.classList.add("hidden");
      }
    }
  });
});
