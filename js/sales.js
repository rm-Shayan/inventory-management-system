import { toggleLoader } from "./auth.js";
import {
    auth, onAuthStateChanged, db, doc, getDoc, getDocs,
    setDoc, updateDoc, arrayUnion, collection, addDoc,
    serverTimestamp, query, where, Timestamp, deleteDoc // serverTimestamp is still imported, but not used for array items.
} from "./firebase.js";

// --- Global Variables (DOM Elements and State) ---
let userId;
let salesTableBody;
let salesForm;
let salesFormContainer;
let salesTableContainer;

let isEditMode = false;
let editData = null;

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
    const formElements = salesForm.elements;
    for (let i = 0; i < formElements.length; i++) {
        const element = formElements[i];
        if (element.tagName !== 'BUTTON') { // Don't disable the submit button, handle separately
            element.disabled = disable;
        }
    }
    const submitButton = salesForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = disable;
    }
};

// --- UI Rendering Functions ---

/**
 * Renders a single sales item row into the sales table.
 * @param {object} data - The sales item data.
 */
const renderSalesOnUI = (data) => {
    const tr = document.createElement("tr");
    tr.className = "bg-white hover:bg-gray-50 transition duration-150 ease-in-out dark:bg-gray-800 dark:hover:bg-gray-700";
    tr.innerHTML = `
        <td class="py-3 px-4 whitespace-nowrap text-gray-800 dark:text-gray-200">${data.id}</td>
        <td class="py-3 px-4 whitespace-nowrap">${data.customer}</td>
        <td class="py-3 px-4 whitespace-nowrap">${data.product}</td>
        <td class="py-3 px-4 whitespace-nowrap">${data.category}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">${data.quantity}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">₨${parseFloat(data.amount).toLocaleString()}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">${formatDate(data.date)}</td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
            <div class="flex justify-center items-center space-x-2">
                <button title="Edit" class="edit-sales-btn text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition dark:text-blue-400 dark:hover:text-blue-200 dark:hover:bg-blue-900" data-customerid="${data.fireId}" data-saleid="${data.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                    </svg>
                </button>
                <button title="Delete" class="delete-sales-btn text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900" data-customerid="${data.fireId}" data-saleid="${data.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4a1 1 0 011 1v1H9V4a1 1 0 011-1zM4 7h16" />
                    </svg>
                </button>
            </div>
        </td>`;
    salesTableBody.appendChild(tr);
};

// --- Firestore Data Operations ---

const addSalesItemToDb = async ({ customer, product, category, quantity, amount, date, nextId }) => {
    // 1. Validate incoming sale quantity
    const saleQuantity = Number(quantity);
    if (isNaN(saleQuantity) || saleQuantity <= 0) {
        throw new Error("Invalid quantity for sale. Must be a positive number.");
    }

    // Determine the month key for the product lookup
    const saleDate = new Date(date);
    const monthKey = getCurrentMonthKey(saleDate);

    // 2. Find the product document in the 'products' collection (under category and month sub-collections)
    const productCategoryColRef = collection(db, "users", userId, "products", category, monthKey);
    const productQuery = query(
        productCategoryColRef,
        where("product", "==", product) // Assuming 'product' field matches the product name
    );
    const productSnap = await getDocs(productQuery);

    if (productSnap.empty) {
        throw new Error(`Product "${product}" in category "${category}" for "${monthKey}" not found in inventory.`);
    }

    const productDoc = productSnap.docs[0];
    const productData = productDoc.data();
    const currentStock = Number(productData.quantity || 0); // Assuming 'quantity' is the stock field
    const currentTotalAmount = Number(productData.amount || 0); // Assuming 'amount' is the total value field

    // 3. Check for sufficient stock
    if (currentStock < saleQuantity) {
        throw new Error(`Not enough stock for "${product}" in category "${category}". Available: ${currentStock}.`);
    }

    // 4. Calculate new stock and adjusted amount
    const newStock = currentStock - saleQuantity;
    let newTotalAmount = currentTotalAmount;

    // Adjust the product's total amount proportionally
    // This assumes currentTotalAmount represents the total value of currentStock
    if (currentStock > 0) { // Avoid division by zero
        const amountPerUnit = currentTotalAmount / currentStock;
        newTotalAmount = currentTotalAmount - (amountPerUnit * saleQuantity);
    } else {
        newTotalAmount = 0; // If stock was 0, amount should be 0
    }

    // 5. Create the sale item to store
    const saleToStore = {
        id: nextId,
        customer: customer, // Add customer field here for individual sale item, useful for lookup later
        product,
        category,
        quantity: saleQuantity,
        amount: Number(amount), // This is the sales amount, not the inventory cost
        date: Timestamp.fromDate(saleDate),
        createdAt: Timestamp.now() // CORRECTED: Use Timestamp.now() for items in arrays
    };

    // 6. Update the product document (stock and amount)
    if (newStock <= 0) {
        await deleteDoc(productDoc.ref); // Delete product document if stock is 0 or less
    } else {
        await updateDoc(productDoc.ref, {
            quantity: newStock,
            amount: newTotalAmount // Update the remaining value
        });
    }

    // 7. Add the sale record to the 'sales' collection
    // The main sales document is structured as users/{userId}/sales/{customerId}
    const salesRef = doc(db, "users", userId, "sales", customer);
    const salesSnap = await getDoc(salesRef);

    if (salesSnap.exists()) {
        const existingSales = salesSnap.data().sales || [];
        // Important: check if the new sale ID already exists to avoid issues with arrayUnion.
        // If it does, generate a truly unique one.
        if (existingSales.some(sale => sale.id === nextId)) {
            const uniqueId = `${nextId}-${Date.now()}`; // Add a timestamp suffix for uniqueness
            saleToStore.id = uniqueId;
            console.warn(`Duplicate sale ID encountered, generated new ID: ${uniqueId}`);
        }
        await updateDoc(salesRef, { sales: arrayUnion(saleToStore) });
    } else {
        // If no sales document exists for this customer, create a new one with the first sale.
        await setDoc(salesRef, { customerName: customer, sales: [saleToStore] });
    }
};

const fetchAndRenderSales = async () => {
    salesTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-gray-500 dark:text-gray-400">Loading sales history...</td></tr>`;
    try {
        const snapshot = await getDocs(collection(db, "users", userId, "sales"));
        const allSales = [];

        snapshot.forEach(docSnap => {
            const { sales = [], customerName } = docSnap.data();
            sales.forEach(item => allSales.push({ ...item, customer: customerName, fireId: docSnap.id }));
        });

        allSales.sort((a, b) => b.date.toDate() - a.date.toDate());

        salesTableBody.innerHTML = ''; // Clear existing rows
        if (allSales.length === 0) {
            salesTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-gray-600 italic dark:text-gray-400">No sales recorded yet. Click "Add New Sale" to get started!</td></tr>`;
        } else {
            allSales.forEach((item, i) => {
                const displayId = item.id || `#S-${i + 1}`;
                renderSalesOnUI({ ...item, id: displayId });
            });
        }
    } catch (error) {
        console.error("Error fetching and rendering sales:", error);
        salesTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-red-500 dark:text-red-400">Error loading sales. Please try again: ${error.message}</td></tr>`;
    }
};

const editSalesItem = async (customerId, saleId, updatedData) => {
    const salesRef = doc(db, "users", userId, "sales", customerId);
    const salesSnap = await getDoc(salesRef);
    if (!salesSnap.exists()) {
        throw new Error("Sale customer record not found for editing.");
    }

    const allSales = salesSnap.data().sales || [];
    const oldSaleIndex = allSales.findIndex(s => s.id === saleId);
    if (oldSaleIndex === -1) {
        throw new Error("Specific sale item not found for editing.");
    }

    const oldSale = allSales[oldSaleIndex];
    const newSaleQuantity = Number(updatedData.quantity);
    const oldSaleQuantity = Number(oldSale.quantity);

    if (isNaN(newSaleQuantity) || newSaleQuantity <= 0) {
        throw new Error("Invalid new quantity for sale. Must be a positive number.");
    }

    // Determine month keys for product lookups
    const oldMonthKey = getCurrentMonthKey(oldSale.date.toDate());
    const newMonthKey = getCurrentMonthKey(new Date(updatedData.date));

    // --- Product Stock Adjustment Logic ---
    let oldProductDocRef = null;
    let newProductDocRef = null; // Will be null if old and new product/category/month are the same
    let oldProductData = null;
    let newProductData = null;

    // 1. Get Old Product Document
    const oldProductCategoryColRef = collection(db, "users", userId, "products", oldSale.category, oldMonthKey);
    const oldProductQuery = query(oldProductCategoryColRef, where("product", "==", oldSale.product));
    const oldProductSnap = await getDocs(oldProductQuery);
    if (!oldProductSnap.empty) {
        oldProductDocRef = oldProductSnap.docs[0].ref;
        oldProductData = oldProductSnap.docs[0].data();
    } else {
        console.warn(`Original product "${oldSale.product}" (category: ${oldSale.category}, month: ${oldMonthKey}) not found for stock adjustment during edit.`);
        // Proceed cautiously, or throw an error if original product MUST exist
        throw new Error("Original product in inventory not found. Cannot proceed with edit.");
    }

    // 2. Get New Product Document (if different from old)
    const isProductChanged = (oldSale.product !== updatedData.product ||
                              oldSale.category !== updatedData.category ||
                              oldMonthKey !== newMonthKey);

    if (isProductChanged) {
        const newProductCategoryColRef = collection(db, "users", userId, "products", updatedData.category, newMonthKey);
        const newProductQuery = query(newProductCategoryColRef, where("product", "==", updatedData.product));
        const newProductSnap = await getDocs(newProductQuery);
        if (!newProductSnap.empty) {
            newProductDocRef = newProductSnap.docs[0].ref;
            newProductData = newProductSnap.docs[0].data();
        } else {
            // New product must exist to be sold
            throw new Error(`New product "${updatedData.product}" in category "${updatedData.category}" for "${newMonthKey}" not found in inventory.`);
        }
    } else {
        // If product, category, and month are the same, new product is the old product
        newProductDocRef = oldProductDocRef;
        newProductData = oldProductData;
    }

    // --- Perform Stock and Amount Adjustments ---
    // Calculate difference in quantity for the *same* product or the amount to add back for the old product
    const quantityDifference = newSaleQuantity - oldSaleQuantity;

    // IMPORTANT: Temporarily store current stock/amount to revert if transaction fails
    const oldProductCurrentStock = Number(oldProductData.quantity || 0);
    const oldProductCurrentAmount = Number(oldProductData.amount || 0);

    const newProductCurrentStock = Number(newProductData.quantity || 0);
    const newProductCurrentAmount = Number(newProductData.amount || 0);

    // 1. Revert stock for the old product (add back old sale quantity)
    let tempOldProductStock = oldProductCurrentStock + oldSaleQuantity;
    let tempOldProductAmount = oldProductCurrentAmount;
    if (oldProductCurrentStock > 0) { // If there was stock to calculate from
        const amountPerUnit = oldProductCurrentAmount / oldProductCurrentStock;
        tempOldProductAmount = oldProductCurrentAmount + (amountPerUnit * oldSaleQuantity);
    }
    // Update old product doc with reverted values
    await updateDoc(oldProductDocRef, {
        quantity: tempOldProductStock,
        amount: tempOldProductAmount
    });


    // 2. Check stock for the new product (after old has been "returned")
    // If it's the same product, stock is already updated by the revert
    let effectiveStockForNewProduct = newProductDocRef === oldProductDocRef ? tempOldProductStock : newProductCurrentStock;

    if (effectiveStockForNewProduct < newSaleQuantity) {
        // If not enough stock for the new quantity, revert old product stock again (undoing the revert)
        await updateDoc(oldProductDocRef, {
            quantity: oldProductCurrentStock,
            amount: oldProductCurrentAmount
        });
        throw new Error(`Not enough stock for "${updatedData.product}". Available: ${effectiveStockForNewProduct}. Reverted changes.`);
    }

    // 3. Deduct stock for the new product
    const finalNewProductStock = effectiveStockForNewProduct - newSaleQuantity;
    let finalNewProductAmount = newProductCurrentAmount;

    if (effectiveStockForNewProduct > 0) { // Avoid division by zero
        const amountPerUnit = newProductCurrentAmount / effectiveStockForNewProduct; // Recalculate based on current stock
        finalNewProductAmount = newProductCurrentAmount - (amountPerUnit * newSaleQuantity);
    } else {
        finalNewProductAmount = 0;
    }

    if (finalNewProductStock <= 0) {
        await deleteDoc(newProductDocRef);
    } else {
        await updateDoc(newProductDocRef, {
            quantity: finalNewProductStock,
            amount: finalNewProductAmount
        });
    }

    // --- Update Sale Record ---
    const updatedSales = [...allSales];
    updatedSales[oldSaleIndex] = {
        ...oldSale,
        ...updatedData,
        quantity: newSaleQuantity,
        amount: Number(updatedData.amount), // This is the new sale price
        date: Timestamp.fromDate(new Date(updatedData.date))
    };
    await updateDoc(salesRef, { sales: updatedSales });

    alert("✅ Sale updated successfully!");
};

const deleteSalesItem = async (customerId, saleId) => {
    try {
        const salesRef = doc(db, "users", userId, "sales", customerId);
        const salesSnap = await getDoc(salesRef);
        if (!salesSnap.exists()) {
            throw new Error("Sale customer record not found for deletion.");
        }

        const allSales = salesSnap.data().sales || [];
        const saleToDelete = allSales.find(s => s.id === saleId);
        if (!saleToDelete) {
            throw new Error("Specific sale item not found for deletion.");
        }

        // Determine month key for product lookup
        const saleDate = saleToDelete.date.toDate();
        const monthKey = getCurrentMonthKey(saleDate);

        // 1. Find the product document in 'products' collection
        const productCategoryColRef = collection(db, "users", userId, "products", saleToDelete.category, monthKey);
        const productQuery = query(
            productCategoryColRef,
            where("product", "==", saleToDelete.product)
        );
        const productSnap = await getDocs(productQuery);

        if (!productSnap.empty) {
            const productDoc = productSnap.docs[0];
            const productData = productDoc.data();
            const currentStock = Number(productData.quantity || 0);
            const currentTotalAmount = Number(productData.amount || 0);

            // 2. Add back the quantity to the product stock
            const newStock = currentStock + Number(saleToDelete.quantity);
            let newTotalAmount = currentTotalAmount;

            // Adjust amount based on original amount per unit, if possible
            if (currentStock > 0) {
                const amountPerUnit = currentTotalAmount / currentStock;
                newTotalAmount = currentTotalAmount + (amountPerUnit * Number(saleToDelete.quantity));
            } else {
                // If stock was 0, and we're adding back, assume we're restoring the original value if it was deleted
                // Or simply add the sales item's cost back (less precise if original cost wasn't in sale item)
                // For simplicity, let's just use the current logic which assumes it's being added to existing stock.
                // If the product doc was deleted, it would need to be re-created which is handled by purchase.js logic.
                // For a sale reversal, just adding back the quantity is typically sufficient.
                // For now, if currentStock was 0, and we're adding back, we can't reliably calculate amountPerUnit from currentTotalAmount.
                // A safer approach might be to store the product's original 'cost_per_unit' in the sale record.
                // For now, we'll just add back quantity. If amount is critical to restore, it needs deeper thought.
                 console.warn("Product stock was 0 when trying to add back. Amount adjustment might be imprecise.");
                 // A basic restoration if the product didn't exist (i.e. was deleted because stock hit 0)
                 // This would be better if you had a clear unit cost
            }

            if (newStock > 0 && productDoc.exists) { // Ensure doc exists to update, or if deleted, re-create (complex for sales.js)
                await updateDoc(productDoc.ref, {
                    quantity: newStock,
                    amount: newTotalAmount // Update the remaining value
                });
            } else if (!productDoc.exists && newStock > 0) {
                // This scenario means the product was deleted from inventory because stock hit 0.
                // Now, we need to re-add it. This requires supplier and original product info which is not in saleToDelete.
                // This is a complex transactional issue. For now, we'll log a warning.
                // A full solution might involve recreating the product doc with default values or requiring a re-purchase.
                console.warn(`Product "${saleToDelete.product}" was deleted from inventory. Cannot automatically re-create on sale deletion. Stock will not be fully restored.`);
            }

        } else {
            console.warn(`Product "${saleToDelete.product}" (category: ${saleToDelete.category}) not found in inventory for stock adjustment after deletion. Stock not restored.`);
        }

        // 3. Update or delete the sales document
        const filteredSales = allSales.filter(s => s.id !== saleId);
        if (filteredSales.length === 0) {
            await deleteDoc(salesRef);
        } else {
            await updateDoc(salesRef, { sales: filteredSales });
        }

        alert("✅ Sale deleted successfully!");
    } catch (error) {
        console.error("Error deleting sale:", error);
        alert(`❌ Delete failed: ${error.message}`);
        throw error;
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
            await fetchAndRenderSales();
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
    cancelFormBtn = document.getElementById("cancelFormBtn");
    salesFormContainer = document.getElementById("salesFormContainer");
    salesTableContainer = document.getElementById("salesTableContainer");
    salesTableBody = document.getElementById("salesTableBody");
    salesForm = document.getElementById("salesForm");

    // Theme elements
    themeToggle = document.getElementById("themeToggle");
    moonIcon = document.getElementById("moonIcon");
    sunIcon = document.getElementById("sunIcon");

    // --- Initial Setup ---
    initializeTheme();
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

    // Show Sales Form
    showFormBtn?.addEventListener("click", () => {
        salesFormContainer.classList.remove("hidden", "animate-fade-out-up");
        salesFormContainer.classList.add("animate-fade-in-down");
        salesForm.reset();
        isEditMode = false;
        editData = null;
        salesForm.querySelector('button[type="submit"]').innerHTML = `
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            <span>Add Sale</span>
        `;
        salesFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toggleFormState(false);
    });

    // Hide Sales Form (Cancel Button)
    cancelFormBtn?.addEventListener("click", () => {
        salesFormContainer.classList.remove("animate-fade-in-down");
        salesFormContainer.classList.add("animate-fade-out-up");

        salesFormContainer.addEventListener('animationend', function handler() {
            salesFormContainer.classList.add("hidden");
            salesFormContainer.classList.remove("animate-fade-out-up");
            salesFormContainer.removeEventListener('animationend', handler);
        });

        salesForm.reset();
        isEditMode = false;
        editData = null;
        salesForm.querySelector('button[type="submit"]').innerHTML = `
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>Submit Sale</span>
        `;
        toggleFormState(false);
    });

    // Handle Sales Form Submission
    salesForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(salesForm).entries());

        if (Object.values(formData).some(val => !val)) {
            alert("All fields are required. Please fill out all fields.");
            return;
        }

        toggleLoader(true);
        toggleFormState(true);

        try {
            if (isEditMode && editData) {
                if (formData.customer !== editData.customerId) {
                    throw new Error("Customer name cannot be changed during edit. Please delete and re-add if customer needs to be different.");
                }

                await editSalesItem(editData.customerId, editData.saleId, {
                    ...formData,
                    quantity: Number(formData.quantity),
                    amount: Number(formData.amount),
                    date: Timestamp.fromDate(new Date(formData.date))
                });
            } else {
                const nextId = `#S-${Date.now()}`;
                await addSalesItemToDb({ ...formData, nextId });
                alert("✅ Sale added successfully!");
            }

            salesForm.reset();
            salesFormContainer.classList.remove("animate-fade-in-down");
            salesFormContainer.classList.add("animate-fade-out-up");

            salesFormContainer.addEventListener('animationend', function handler() {
                salesFormContainer.classList.add("hidden");
                salesFormContainer.classList.remove("animate-fade-out-up");
                salesFormContainer.removeEventListener('animationend', handler);
            });

            await fetchAndRenderSales();
        } catch (error) {
            console.error("Error submitting sale:", error);
            alert(`❌ Operation failed: ${error.message}`);
        } finally {
            toggleLoader(false);
            toggleFormState(false);
            isEditMode = false;
            editData = null;
            salesForm.querySelector('button[type="submit"]').innerHTML = `
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>Submit Sale</span>
            `;
        }
    });

    // Handle Edit/Delete Clicks on Table
    salesTableBody?.addEventListener("click", async (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const { customerid, saleid } = btn.dataset;

        if (btn.classList.contains("delete-sales-btn")) {
            if (confirm("Are you sure you want to delete this sale? This action cannot be undone and will restore product stock.")) {
                toggleLoader(true);
                try {
                    await deleteSalesItem(customerid, saleid);
                    await fetchAndRenderSales();
                } catch (error) {
                    console.error("Delete operation failed at event listener:", error);
                } finally {
                    toggleLoader(false);
                }
            }
        }

        if (btn.classList.contains("edit-sales-btn")) {
            isEditMode = true;
            editData = { customerId: customerid, saleId: saleid };

            toggleLoader(true);
            toggleFormState(true);
            try {
                const snap = await getDoc(doc(db, "users", userId, "sales", customerid));
                if (!snap.exists()) {
                    alert("Customer sales record not found for editing.");
                    return;
                }
                const targetItem = snap.data().sales.find(s => s.id === saleid);

                if (targetItem) {
                    salesForm.customer.value = customerid;
                    salesForm.product.value = targetItem.product;
                    salesForm.category.value = targetItem.category;
                    salesForm.quantity.value = targetItem.quantity;
                    salesForm.amount.value = targetItem.amount;
                    salesForm.date.value = formatDate(targetItem.date);

                    salesFormContainer.classList.remove("hidden", "animate-fade-out-up");
                    salesFormContainer.classList.add("animate-fade-in-down");
                    salesForm.querySelector('button[type="submit"]').innerHTML = `
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z"></path></svg>
                        <span>Update Sale</span>
                    `;
                    salesFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    alert("Selected sale item not found.");
                }
            } catch (error) {
                console.error("Error preparing for edit:", error);
                alert(`Failed to load sale data for editing: ${error.message}`);
            } finally {
                toggleLoader(false);
                toggleFormState(false);
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