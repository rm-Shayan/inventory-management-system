import { toggleLoader } from "./auth.js";
import {
    auth, onAuthStateChanged, db, doc, getDoc, getDocs,
    setDoc, updateDoc, arrayRemove, arrayUnion, collection, addDoc,
    serverTimestamp, query, where, Timestamp, deleteDoc
} from "./firebase.js";

// --- Global Variables (DOM Elements and State) ---
let userId;
let purchaseTableBody;
let addPurchaseForm;
let purchaseFormContainer;
let purchaseTableContainer; // New: Reference for the table's parent div

let isEditMode = false;
let editData = null; // Stores { supplierId, purchaseId, oldPurchaseData } for editing

// UI Elements for Sidebar and Loader
let menuButton, sidebar, cutBtn;
let showFormBtn, cancelFormBtn;
let loader;

// Theme elements
let themeToggle, moonIcon, sunIcon;

// --- Utility Functions ---

/**
 * Generates a consistent key for the current month and year (e.g., "May-2025").
 * @param {Date} [date=new Date()] - The date object to use. Defaults to current date.
 * @returns {string} The month-year key.
 */
const getCurrentMonthKey = (date = new Date()) =>
    `${date.toLocaleString("default", { month: "short" })}-${date.getFullYear()}`;

/**
 * Formats a Firestore Timestamp or Date object into an "YYYY-MM-DD" string.
 * @param {Timestamp|Date} date - The date object or Firestore Timestamp.
 * @returns {string} The formatted date string.
 */
const formatDate = (date) =>
    date instanceof Timestamp ? date.toDate().toISOString().split("T")[0] : date;

/**
 * Toggles the disabled state of form inputs and buttons.
 * @param {boolean} disable - True to disable, false to enable.
 */
const toggleFormState = (disable) => {
    const formElements = addPurchaseForm.elements;
    for (let i = 0; i < formElements.length; i++) {
        const element = formElements[i];
        if (element.tagName !== 'BUTTON') { // Don't disable the submit button, handle separately
            element.disabled = disable;
        }
    }
    const submitButton = addPurchaseForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = disable;
    }
};

// --- UI Rendering Functions ---

/**
 * Renders a single purchase item row into the purchases table.
 * @param {object} data - The purchase item data.
 */
const renderOnUI = (data) => {
    const tr = document.createElement("tr");
    tr.className = "bg-white hover:bg-gray-50 transition duration-150 ease-in-out dark:bg-gray-800 dark:hover:bg-gray-700";
    tr.innerHTML = `
        <td class="py-3 px-4 whitespace-nowrap text-gray-800 dark:text-gray-200">${data.id}</td>
        <td class="py-3 px-4 whitespace-nowrap">${data.supplier}</td>
        <td class="py-3 px-4 whitespace-nowrap">${data.product}</td>
        <td class="py-3 px-4 whitespace-nowrap">${data.category}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">${data.quantity}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">₨${parseFloat(data.amount).toLocaleString()}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">${formatDate(data.date)}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
            <div class="flex justify-center items-center space-x-2">
                <button title="Edit" class="edit-btn text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition dark:text-blue-400 dark:hover:text-blue-200 dark:hover:bg-blue-900" data-fireid="${data.fireId}" data-purchaseid="${data.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                    </svg>
                </button>
                <button title="Delete" class="delete-btn text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900" data-fireid="${data.fireId}" data-purchaseid="${data.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4a1 1 0 011 1v1H9V4a1 1 0 011-1zM4 7h16" />
                    </svg>
                </button>
            </div>
        </td>`;
    purchaseTableBody.appendChild(tr);
};

// --- Firestore Data Operations ---

const addPurchaseItemToDb = async ({ supplier, product, category, quantity, amount, date, nextId }) => {
    // 1. Validate incoming purchase quantity and amount
    const purchaseQuantity = Number(quantity);
    if (isNaN(purchaseQuantity) || purchaseQuantity <= 0) {
        throw new Error("Invalid quantity for purchase. Must be a positive number.");
    }
    const purchaseAmount = Number(amount);
    if (isNaN(purchaseAmount) || purchaseAmount < 0) {
        throw new Error("Invalid amount for purchase. Must be a non-negative number.");
    }

    const purchaseDate = new Date(date);
    const monthKey = getCurrentMonthKey(purchaseDate);

    // 2. Create the purchase item to store in the 'purchase' collection
    const newPurchase = {
        id: nextId,
        product,
        category,
        quantity: purchaseQuantity,
        amount: purchaseAmount,
        date: Timestamp.fromDate(purchaseDate),
        createdAt: Timestamp.now(), // Use Timestamp.now() for items within arrays
    };

    // 3. Update or create the main purchase document (keyed by supplier)
    const purchaseRef = doc(db, "users", userId, "purchase", supplier);
    const purchaseSnap = await getDoc(purchaseRef);

    if (purchaseSnap.exists()) {
        const existingPurchases = purchaseSnap.data().purchases || [];
        // Ensure the ID is unique if adding to an existing array
        if (existingPurchases.some(p => p.id === nextId)) {
            const uniqueId = `${nextId}-${Date.now()}`;
            newPurchase.id = uniqueId;
            console.warn(`Duplicate purchase ID encountered, generated new ID: ${uniqueId}`);
        }
        await updateDoc(purchaseRef, { purchases: arrayUnion(newPurchase) });
    } else {
        await setDoc(purchaseRef, {
            supplier,
            createdAt: serverTimestamp(), // serverTimestamp is fine for top-level fields
            purchases: [newPurchase],
        });
    }

    // 4. Update or create the product record in the 'products' collection
    // This maintains the total stock and total value for each product in inventory
    const productCategoryColRef = collection(db, "users", userId, "products", category, monthKey);
    const productQuery = query(
        productCategoryColRef,
        where("product", "==", product),
        where("supplier", "==", supplier) // Consider if supplier is part of product uniqueness
    );
    const productSnap = await getDocs(productQuery);

    if (productSnap.empty) {
        // Product doesn't exist, create a new one
        await addDoc(productCategoryColRef, {
            product,
            supplier, // Store supplier with the product in inventory
            quantity: purchaseQuantity,
            amount: purchaseAmount, // This is the total cost of this stock
            date: Timestamp.fromDate(purchaseDate), // Date of initial purchase
            addedAt: serverTimestamp(),
        });
    } else {
        // Product exists, update quantity and amount
        const productDocRef = productSnap.docs[0].ref;
        const currentProductData = productSnap.docs[0].data();
        const currentProductQuantity = Number(currentProductData.quantity || 0);
        const currentProductAmount = Number(currentProductData.amount || 0);

        await updateDoc(productDocRef, {
            quantity: currentProductQuantity + purchaseQuantity,
            amount: currentProductAmount + purchaseAmount,
            updatedAt: serverTimestamp() // Update timestamp for existing product
        });
    }
};

const fetchAndRenderPurchases = async () => {
    purchaseTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-gray-500 dark:text-gray-400">Loading purchase history...</td></tr>`;
    try {
        const snapshot = await getDocs(collection(db, "users", userId, "purchase"));
        const allPurchases = [];

        snapshot.forEach(docSnap => {
            const docData = docSnap.data();
            // Ensure docData.purchases is an array before trying to iterate
            (docData.purchases || []).forEach(item => {
                allPurchases.push({ ...item, supplier: docData.supplier, fireId: docSnap.id });
            });
        });

        allPurchases.sort((a, b) => b.date.toDate() - a.date.toDate()); // Sort by date, newest first

        purchaseTableBody.innerHTML = ''; // Clear existing rows
        if (allPurchases.length === 0) {
            purchaseTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-600 italic dark:text-gray-400">No purchases recorded yet. Click "Add Purchase" to get started!</td></tr>`;
        } else {
            allPurchases.forEach((item, i) => {
                const displayId = item.id || `#P-${i + 1}`; // Fallback ID if 'id' is missing
                renderOnUI({ ...item, id: displayId });
            });
        }
    } catch (error) {
        console.error("Error fetching and rendering purchases:", error);
        purchaseTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-red-500 dark:text-red-400">Error loading purchases. Please try again: ${error.message}</td></tr>`;
    }
};


const editPurchaseItem = async (supplierId, purchaseId, updatedData) => {
    const purchaseRef = doc(db, "users", userId, "purchase", supplierId);
    const purchaseSnap = await getDoc(purchaseRef);

    if (!purchaseSnap.exists()) {
        throw new Error("Purchase record for supplier not found for editing.");
    }

    const allPurchases = purchaseSnap.data().purchases || [];
    const oldPurchaseIndex = allPurchases.findIndex(p => p.id === purchaseId);

    if (oldPurchaseIndex === -1) {
        throw new Error("Specific purchase item not found for editing.");
    }

    const oldPurchase = allPurchases[oldPurchaseIndex];
    const newQuantity = Number(updatedData.quantity);
    const newAmount = Number(updatedData.amount);

    if (isNaN(newQuantity) || newQuantity <= 0) {
        throw new Error("Invalid new quantity. Must be a positive number.");
    }
    if (isNaN(newAmount) || newAmount < 0) {
        throw new Error("Invalid new amount. Must be a non-negative number.");
    }

    const oldMonthKey = getCurrentMonthKey(oldPurchase.date.toDate());
    const newDate = new Date(updatedData.date);
    const newMonthKey = getCurrentMonthKey(newDate);

    // --- Product Stock Adjustment Logic ---
    let oldProductDocRef = null;
    let newProductDocRef = null;
    let oldProductData = null;
    let newProductData = null;

    // 1. Get Old Product Document
    const oldProductCategoryColRef = collection(db, "users", userId, "products", oldPurchase.category, oldMonthKey);
    const oldProductQuery = query(
        oldProductCategoryColRef,
        where("product", "==", oldPurchase.product),
        where("supplier", "==", supplierId)
    );
    const oldProductSnap = await getDocs(oldProductQuery);

    if (!oldProductSnap.empty) {
        oldProductDocRef = oldProductSnap.docs[0].ref;
        oldProductData = oldProductSnap.docs[0].data();
    } else {
        console.warn(`Original product "${oldPurchase.product}" (category: ${oldPurchase.category}, month: ${oldMonthKey}) not found in inventory for stock adjustment during edit.`);
        // Decide if this should stop the edit. For now, it will proceed but with a warning.
    }

    // 2. Determine if the product/category/month has changed for the inventory update
    const isProductIdentityChanged = (
        oldPurchase.product !== updatedData.product ||
        oldPurchase.category !== updatedData.category ||
        oldMonthKey !== newMonthKey
    );

    if (isProductIdentityChanged) {
        // If product identity changed, we need to find/create the NEW product document
        const newProductCategoryColRef = collection(db, "users", userId, "products", updatedData.category, newMonthKey);
        const newProductQuery = query(
            newProductCategoryColRef,
            where("product", "==", updatedData.product),
            where("supplier", "==", supplierId)
        );
        const newProductSnap = await getDocs(newProductQuery);
        if (!newProductSnap.empty) {
            newProductDocRef = newProductSnap.docs[0].ref;
            newProductData = newProductSnap.docs[0].data();
        }
    } else {
        // If product identity is the same, the new product doc is the old one
        newProductDocRef = oldProductDocRef;
        newProductData = oldProductData;
    }

    // --- Perform Stock and Amount Adjustments ---
    // First, "undo" the old purchase's impact on the old product's stock/amount
    if (oldProductDocRef && oldProductData) {
        const currentStock = Number(oldProductData.quantity || 0);
        const currentAmount = Number(oldProductData.amount || 0);

        const revertedStock = currentStock - oldPurchase.quantity;
        const revertedAmount = currentAmount - oldPurchase.amount; // Use oldPurchase.amount

        if (revertedStock <= 0) {
            await deleteDoc(oldProductDocRef);
        } else {
            await updateDoc(oldProductDocRef, {
                quantity: revertedStock,
                amount: revertedAmount,
                updatedAt: serverTimestamp()
            });
        }
    }

    // Then, "apply" the new purchase's impact to the new product's stock/amount
    if (newProductDocRef && newProductData) {
        const currentStock = Number(newProductData.quantity || 0);
        const currentAmount = Number(newProductData.amount || 0);

        await updateDoc(newProductDocRef, {
            quantity: currentStock + newQuantity,
            amount: currentAmount + newAmount,
            updatedAt: serverTimestamp()
        });
    } else if (newProductDocRef === null) {
        // This means the new product/category/month combination didn't exist before.
        // We need to create a new product document.
        const newProductCategoryColRef = collection(db, "users", userId, "products", updatedData.category, newMonthKey);
        await addDoc(newProductCategoryColRef, {
            product: updatedData.product,
            supplier: supplierId,
            quantity: newQuantity,
            amount: newAmount,
            date: Timestamp.fromDate(newDate),
            addedAt: serverTimestamp(),
        });
    }

    // --- Update Sale Record ---
    const updatedSales = [...allPurchases];
    updatedSales[oldPurchaseIndex] = {
        ...oldPurchase, // Keep old unique ID and createdAt for the purchase item itself
        ...updatedData,
        quantity: newQuantity,
        amount: newAmount,
        date: Timestamp.fromDate(newDate) // Ensure date is a Timestamp object
    };
    await updateDoc(purchaseRef, { purchases: updatedSales });

    alert("✅ Purchase updated successfully!");
};


const deletePurchaseItem = async (supplierId, purchaseId) => {
    try {
        const purchaseRef = doc(db, "users", userId, "purchase", supplierId);
        const purchaseSnap = await getDoc(purchaseRef);
        if (!purchaseSnap.exists()) {
            throw new Error("Purchase supplier record not found for deletion.");
        }

        const allPurchases = purchaseSnap.data().purchases || [];
        const purchaseToDelete = allPurchases.find(p => p.id === purchaseId);
        if (!purchaseToDelete) {
            throw new Error("Specific purchase item not found for deletion.");
        }

        // Determine month key for product lookup
        const purchaseDate = purchaseToDelete.date.toDate();
        const monthKey = getCurrentMonthKey(purchaseDate);

        // 1. Find the product document in 'products' collection
        const productCategoryColRef = collection(db, "users", userId, "products", purchaseToDelete.category, monthKey);
        const productQuery = query(
            productCategoryColRef,
            where("product", "==", purchaseToDelete.product),
            where("supplier", "==", supplierId) // Ensure correct product identification
        );
        const productSnap = await getDocs(productQuery);

        if (!productSnap.empty) {
            const productDoc = productSnap.docs[0];
            const productData = productDoc.data();
            const currentStock = Number(productData.quantity || 0);
            const currentTotalAmount = Number(productData.amount || 0);

            // 2. Deduct the quantity and amount from the product stock
            const newStock = currentStock - Number(purchaseToDelete.quantity);
            const newTotalAmount = currentTotalAmount - Number(purchaseToDelete.amount);

            if (newStock <= 0) {
                await deleteDoc(productDoc.ref); // Delete product document if stock drops to 0 or less
            } else {
                await updateDoc(productDoc.ref, {
                    quantity: newStock,
                    amount: newTotalAmount,
                    updatedAt: serverTimestamp()
                });
            }
        } else {
            console.warn(`Product "${purchaseToDelete.product}" (category: ${purchaseToDelete.category}, month: ${monthKey}) not found in inventory for stock adjustment after deletion. Inventory stock not adjusted.`);
        }

        // 3. Remove the sale from the array and update the sales document
        const filteredPurchases = allPurchases.filter(p => p.id !== purchaseId);
        if (filteredPurchases.length === 0) {
            await deleteDoc(purchaseRef); // If no more purchases for this supplier, delete the document
        } else {
            await updateDoc(purchaseRef, { purchases: filteredPurchases });
        }

        alert("✅ Purchase deleted successfully!");
    } catch (error) {
        console.error("Error deleting purchase:", error);
        alert(`❌ Delete failed: ${error.message}`);
        throw error; // Re-throw to be caught by the outer try-catch
    }
};

// --- Authentication and Initial Load ---
const checkUserLogin = () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user || !user.emailVerified) {
            window.location.href = "../auth.html";
            return;
        }
        try {
            const userSnap = await getDoc(doc(db, "users", user.uid));
            if (!userSnap.exists()) {
                console.error("User document not found in Firestore.");
                window.location.href = "../auth.html";
                return;
            }
            userId = user.uid;
            await fetchAndRenderPurchases();
        } catch (error) {
            console.error("Error during user login check:", error);
            alert("Failed to load user data. Please try again.");
            window.location.href = "../auth.html";
        } finally {
            toggleLoader(false);
        }
    });
};

// --- Theme Management ---
const applyTheme = (theme) => {
    const htmlElement = document.documentElement;
    if (theme === 'dark') {
        htmlElement.classList.add('dark');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
    } else {
        htmlElement.classList.remove('dark');
        moonIcon.classList.remove('hidden');
        sunIcon.classList.add('hidden');
    }
    localStorage.setItem('theme', theme);
};

const initializeTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (prefersDark) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }
};

// --- DOM Content Loaded Event Listener ---
document.addEventListener("DOMContentLoaded", () => {
    // --- Get DOM Elements ---
    loader = document.getElementById("loader");
    menuButton = document.getElementById("menuButton");
    sidebar = document.getElementById("sidebar");
    cutBtn = document.getElementById("cutBtn");
    showFormBtn = document.getElementById("showFormBtn");
    cancelFormBtn = document.getElementById("cancelFormBtn"); // Get cancel button
    purchaseFormContainer = document.getElementById("purchaseFormContainer"); // Updated ID
    purchaseTableContainer = document.getElementById("purchaseTableContainer"); // New reference for table container
    purchaseTableBody = document.getElementById("purchaseTableBody");
    addPurchaseForm = document.getElementById("addPurchaseForm"); // Renamed for clarity

    // Theme elements
    themeToggle = document.getElementById("themeToggle");
    moonIcon = document.getElementById("moonIcon");
    sunIcon = document.getElementById("sunIcon");

    // --- Initial Setup ---
    initializeTheme(); // Initialize theme on page load
    toggleLoader(true);
    checkUserLogin();

    // --- Event Listeners ---

    // Toggle Sidebar
    menuButton?.addEventListener("click", () => {
        sidebar?.classList.toggle("-translate-x-full");
    });
    cutBtn?.addEventListener("click", () => {
        sidebar?.classList.add("-translate-x-full");
    });

    // Show Purchase Form
    showFormBtn?.addEventListener("click", () => {
        purchaseFormContainer.classList.remove("hidden", "animate-fade-out-up");
        purchaseFormContainer.classList.add("animate-fade-in-down");
        addPurchaseForm.reset(); // Reset form when showing
        isEditMode = false;
        editData = null;
        // Update submit button text
        addPurchaseForm.querySelector('button[type="submit"]').innerHTML = `
            <svg class="h-5 w-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            <span>Add Purchase</span>
        `;
        purchaseFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toggleFormState(false); // Enable form inputs
        // Optionally hide table when form is shown
        purchaseTableContainer.classList.add("hidden");
    });

    // Hide Purchase Form (Cancel Button)
    cancelFormBtn?.addEventListener("click", () => {
        purchaseFormContainer.classList.remove("animate-fade-in-down");
        purchaseFormContainer.classList.add("animate-fade-out-up");

        purchaseFormContainer.addEventListener('animationend', function handler() {
            purchaseFormContainer.classList.add("hidden");
            purchaseFormContainer.classList.remove("animate-fade-out-up");
            purchaseFormContainer.removeEventListener('animationend', handler);
            // Show table again after form hides
            purchaseTableContainer.classList.remove("hidden");
        });

        addPurchaseForm.reset();
        isEditMode = false;
        editData = null;
        // Reset submit button text
        addPurchaseForm.querySelector('button[type="submit"]').innerHTML = `
            <svg class="h-5 w-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>Add Purchase</span>
        `;
        toggleFormState(false); // Enable form inputs
    });


    // Handle Purchase Form Submission
    addPurchaseForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(addPurchaseForm).entries());

        if (Object.values(formData).some(val => !val)) {
            alert("All fields are required. Please fill out all fields.");
            return;
        }

        toggleLoader(true);
        toggleFormState(true); // Disable form during submission

        try {
            if (isEditMode && editData) {
                // Ensure supplier can't be changed during edit. It's the document ID.
                if (formData.supplier !== editData.supplierId) {
                    throw new Error("Supplier name cannot be changed during edit. Please delete and re-add if supplier needs to be different.");
                }

                await editPurchaseItem(editData.supplierId, editData.purchaseId, {
                    product: formData.product,
                    category: formData.category,
                    quantity: Number(formData.quantity),
                    amount: Number(formData.amount),
                    date: Timestamp.fromDate(new Date(formData.date)) // Ensure date is a Timestamp
                });
            } else {
                const nextId = `#P-${Date.now()}`; // More unique ID than table length
                await addPurchaseItemToDb({ ...formData, nextId });
                alert("✅ Purchase added successfully!");
            }

            addPurchaseForm.reset();
            // Hide form with animation
            purchaseFormContainer.classList.remove("animate-fade-in-down");
            purchaseFormContainer.classList.add("animate-fade-out-up");

            purchaseFormContainer.addEventListener('animationend', function handler() {
                purchaseFormContainer.classList.add("hidden");
                purchaseFormContainer.classList.remove("animate-fade-out-up");
                purchaseFormContainer.removeEventListener('animationend', handler);
                purchaseTableContainer.classList.remove("hidden"); // Show table
            });

            await fetchAndRenderPurchases(); // Re-fetch to update table
        } catch (error) {
            console.error("Error submitting purchase:", error);
            alert(`❌ Operation failed: ${error.message}`);
        } finally {
            toggleLoader(false);
            toggleFormState(false); // Enable form after submission
            isEditMode = false;
            editData = null;
            // Reset submit button text
            addPurchaseForm.querySelector('button[type="submit"]').innerHTML = `
                <svg class="h-5 w-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>Add Purchase</span>
            `;
        }
    });

    // Handle Edit/Delete Clicks on Table
    purchaseTableBody?.addEventListener("click", async (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const { fireid, purchaseid } = btn.dataset;

        if (btn.classList.contains("delete-btn")) {
            if (confirm("Are you sure you want to delete this purchase? This action cannot be undone and will reduce product stock.")) {
                toggleLoader(true);
                toggleFormState(true); // Disable form during delete
                try {
                    await deletePurchaseItem(fireid, purchaseid);
                    await fetchAndRenderPurchases();
                } catch (error) {
                    console.error("Delete operation failed at event listener:", error);
                } finally {
                    toggleLoader(false);
                    toggleFormState(false); // Enable form after delete
                }
            }
        }

        if (btn.classList.contains("edit-btn")) {
            isEditMode = true;
            editData = { supplierId: fireid, purchaseId: purchaseid }; // Store current IDs for edit

            toggleLoader(true);
            toggleFormState(true); // Disable form while fetching data

            try {
                const snap = await getDoc(doc(db, "users", userId, "purchase", fireid));
                if (!snap.exists()) {
                    alert("Supplier purchase record not found for editing.");
                    return;
                }
                const targetItem = snap.data().purchases.find(p => p.id === purchaseid);

                if (targetItem) {
                    // Populate form fields
                    addPurchaseForm.supplier.value = fireid; // Supplier ID is the doc ID
                    addPurchaseForm.product.value = targetItem.product;
                    addPurchaseForm.category.value = targetItem.category;
                    addPurchaseForm.quantity.value = targetItem.quantity;
                    addPurchaseForm.amount.value = targetItem.amount;
                    addPurchaseForm.date.value = formatDate(targetItem.date);

                    // Show form with animation
                    purchaseFormContainer.classList.remove("hidden", "animate-fade-out-up");
                    purchaseFormContainer.classList.add("animate-fade-in-down");
                    purchaseTableContainer.classList.add("hidden"); // Hide table

                    // Change submit button text to "Update"
                    addPurchaseForm.querySelector('button[type="submit"]').innerHTML = `
                        <svg class="h-5 w-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z"></path></svg>
                        <span>Update Purchase</span>
                    `;
                    purchaseFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    alert("Selected purchase item not found.");
                }
            } catch (error) {
                console.error("Error preparing for edit:", error);
                alert(`Failed to load purchase data for editing: ${error.message}`);
            } finally {
                toggleLoader(false);
                toggleFormState(false); // Enable form after data is loaded
            }
        }
    });

    // --- Theme Toggle Listener ---
    themeToggle?.addEventListener("click", () => {
        const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });
});