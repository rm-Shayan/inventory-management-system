// js/report.js - FINAL REVISION FOR PRECISE UI MAPPING AND DEBUGGING

import { auth, db, onAuthStateChanged, signOut, collection, doc, getDocs, query, getDoc, where, limit } from "./firebase.js";

// DOM Elements
const totalProductsElem = document.getElementById('totalProductsElem');
const totalCategoriesElem = document.getElementById('totalCategoriesElem');
const totalSalesElem = document.getElementById('totalSalesElem');
const lowStockItemsElem = document.getElementById('lowStockItemsElem');
const logoutButton = document.getElementById('logoutButton');
const reportMessageDiv = document.getElementById('reportMessage'); // For general messages

// Hamburger menu and overlay
const hamburgerButton = document.getElementById('hamburgerButton');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Theme toggle

    const htmlElement = document.documentElement;

// Profile menu
const profileButton = document.getElementById('profileButton');
const profileMenu = document.getElementById('profileMenu');
const profileNameElem = document.getElementById('profileName');
const profileInitialElem = document.getElementById('profileInitial');

// Chart instances
let monthlySalesChartInstance;
let salesByCategoryChartInstance;

// Global variables to store fetched data for re-rendering charts on theme change
let currentMonthlySalesData = { labels: [], data: [] };
let currentSalesByCategoryData = { labels: [], data: [] };

// --- Helper Functions ---

/**
 * Safely updates the text content of a DOM element.
 * @param {HTMLElement} element - The DOM element to update.
 * @param {number|string} value - The value to set as text content.
 * @param {boolean} isCurrency - True if the value should be formatted as currency.
 */
function updateDOMText(element, value, isCurrency = false) {
    if (element) {
        if (typeof value === 'number' || typeof value === 'string') {
            if (isCurrency) {
                element.textContent = `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            } else {
                element.textContent = value.toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
        } else {
            element.textContent = 'N/A';
        }
    } else {
        console.warn(`DOM Error: Element for updating value '${value}' not found.`);
    }
}

/**
 * Displays a message in the report message div.
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', 'info', or 'warning'.
 */
function displayMessage(message, type = 'info') {
    if (reportMessageDiv) {
        reportMessageDiv.textContent = message;
        reportMessageDiv.className = `p-3 rounded-md text-sm font-medium mt-4`;
        switch (type) {
            case 'success':
                reportMessageDiv.classList.add('bg-green-100', 'text-green-800', 'dark:bg-green-800', 'dark:text-green-100');
                break;
            case 'error':
                reportMessageDiv.classList.add('bg-red-100', 'text-red-800', 'dark:bg-red-800', 'dark:text-red-100');
                break;
            case 'warning':
                reportMessageDiv.classList.add('bg-yellow-100', 'text-yellow-800', 'dark:bg-yellow-800', 'dark:text-yellow-100');
                break;
            case 'info':
            default:
                reportMessageDiv.classList.add('bg-blue-100', 'text-blue-800', 'dark:bg-blue-800', 'dark:text-blue-100');
                break;
        }
        reportMessageDiv.classList.remove('hidden');
        setTimeout(() => reportMessageDiv.classList.add('hidden'), 5000); // Hide after 5 seconds
    }
}

// Utility to get Chart.js colors based on theme
const getChartColors = () => {
    const isDarkMode = htmlElement.classList.contains('dark');
    return {
        textColor: isDarkMode ? '#e0e7ff' : '#374151', // primary-100 or gray-800
        textColorSecondary: isDarkMode ? '#a5b4fc' : '#6b7280', // primary-300 or gray-600
        borderColor: isDarkMode ? '#4b5563' : '#e5e7eb', // gray-600 or gray-200
        cardBg: isDarkMode ? '#1f2937' : '#ffffff', // gray-800 or white
        primaryColor: 'rgb(99, 102, 241)', // primary-500
        primaryColorLight: 'rgba(99, 102, 241, 0.2)',
        secondaryColor: 'rgba(34, 197, 94, 0.7)', // secondary-500
        accentColor: 'rgba(249, 115, 22, 0.7)', // accent-500
        redColor: 'rgba(239, 68, 68, 0.7)',  // red-500
        primaryColorDark: 'rgba(67, 56, 202, 0.7)',  // primary-700
        secondaryColorDark: 'rgba(21, 128, 61, 0.7)',  // secondary-700
    };
};

// --- Theme Toggling ---

// Apply saved theme on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        htmlElement.classList.add('dark');
    } else {
        htmlElement.classList.remove('dark');
    }
});

// --- Sidebar Toggle Functionality ---
hamburgerButton.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    sidebar.classList.toggle('translate-x-0');
    sidebarOverlay.classList.toggle('hidden');
    sidebarOverlay.classList.toggle('opacity-0');
    sidebarOverlay.classList.toggle('opacity-50');
    sidebarOverlay.classList.toggle('pointer-events-none');
});

sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    sidebarOverlay.classList.add('hidden');
    sidebarOverlay.classList.add('opacity-0');
    sidebarOverlay.classList.remove('opacity-50');
    sidebarOverlay.classList.add('pointer-events-none');
});

// --- Profile Menu Toggle Functionality ---
profileButton.addEventListener('click', (event) => {
    event.stopPropagation();
    profileMenu.classList.toggle('hidden');
    if (!profileMenu.classList.contains('hidden')) {
        profileMenu.classList.remove('opacity-0', 'scale-95');
        profileMenu.classList.add('opacity-100', 'scale-100', 'animate-fade-in-down');
    } else {
        profileMenu.classList.remove('opacity-100', 'scale-100', 'animate-fade-in-down');
        profileMenu.classList.add('opacity-0', 'scale-95');
    }
});

// Close profile menu when clicking outside
document.addEventListener('click', (event) => {
    if (!profileButton.contains(event.target) && !profileMenu.contains(event.target)) {
        if (!profileMenu.classList.contains('hidden')) {
            profileMenu.classList.add('hidden', 'opacity-0', 'scale-95');
            profileMenu.classList.remove('opacity-100', 'scale-100', 'animate-fade-in-down');
        }
    }
});

// --- User Authentication and Data Fetching ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("User is logged in:", user.displayName || user.email);

        let userNameToDisplay = 'User'; // Default fallback name
        let userInitialToDisplay = 'U'; // Default fallback initial

        // --- Determine the user's name to display ---
        if (user.displayName) {
            userNameToDisplay = user.displayName;
        } else if (user.email) {
            const atIndex = user.email.indexOf("@");
            if (atIndex !== -1) {
                // Get the part of the email before the '@'
                userNameToDisplay = user.email.slice(0, atIndex);
            } else {
                // If email exists but doesn't contain '@', use the full email
                userNameToDisplay = user.email;
            }
        }
        // If neither displayName nor email is available, userNameToDisplay remains 'User'

        // --- Determine the user's initial ---
        // Prioritize displayName, then the derived name from email
        const sourceForInitial = user.displayName || userNameToDisplay;
        if (sourceForInitial) {
            userInitialToDisplay = sourceForInitial.charAt(0).toUpperCase();
        }
        // If sourceForInitial is empty, userInitialToDisplay remains 'U'

        // --- Update profile display elements ---
        if (profileNameElem) {
            profileNameElem.textContent = userNameToDisplay;
        } else {
            console.warn("Warning: Element with ID 'profile-name' not found in the DOM.");
        }

        if (profileInitialElem) {
            profileInitialElem.textContent = userInitialToDisplay;
        } else {
            console.warn("Warning: Element with ID 'profile-initial' not found in the DOM.");
        }

        // Call your dashboard summary function
        await fetchDashboardSummary(user.uid);

    } else {
        console.log("User is logged out. Redirecting to login page.");
        window.location.href = "index.html"; // Redirect to login
    }
});
// Logout functionality
logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        console.log("User signed out successfully.");
        displayMessage("You have been signed out.", "info");
    } catch (error) {
        console.error("Error signing out:", error);
        displayMessage("Error signing out. Please try again.", "error");
    }
});

// --- Data Fetching and Dashboard Summary ---
async function fetchDashboardSummary(userId) {
    console.log("------------------------------------------");
    console.log("STARTING: fetchDashboardSummary for User ID:", userId);
    console.log("------------------------------------------");

    if (!userId) {
        console.error("CRITICAL ERROR: User ID is null or undefined. Cannot fetch data. Redirecting to login.");
        updateDOMText(totalProductsElem, 0);
        updateDOMText(totalCategoriesElem, 0);
        updateDOMText(totalSalesElem, 0, true); // Format as currency
        updateDOMText(lowStockItemsElem, 0);
        displayMessage("Authentication error. Redirecting to login.", "error");
        setTimeout(() => {
            window.location.href = "index.html";
        }, 100);
        return;
    }

    const purchasedQuantities = {};
    const soldQuantities = {};
    const productCategories = {}; // productName: categoryName
    const allUniqueProductNames = new Set();
    const uniqueCategories = new Set(); // For counting distinct categories

    let totalSalesAmount = 0;
    const monthlySales = {};
    const salesByCategory = {};
    const productSalesData = {}; // For low stock calculation (total sold quantity over time)

    displayMessage("Loading dashboard data...", "info");

    // --- 1. Fetch Purchase Data ---
    try {
        const purchaseCollectionRef = collection(db, "users", userId, "purchase");
        const purchaseSnapshot = await getDocs(purchaseCollectionRef);

        if (purchaseSnapshot.empty) {
            console.warn(`WARN: No purchase data found for this user.`);
        }

        purchaseSnapshot.forEach(purchaseDoc => {
            const purchaseData = purchaseDoc.data();
            if (Array.isArray(purchaseData.purchases)) {
                purchaseData.purchases.forEach(item => {
                    const productName = item.product?.trim();
                    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
                    const category = item.category?.trim();

                    if (productName && quantity > 0) {
                        purchasedQuantities[productName] = (purchasedQuantities[productName] || 0) + quantity;
                        allUniqueProductNames.add(productName);
                        if (category) {
                            productCategories[productName] = category;
                            uniqueCategories.add(category);
                        }
                    } else {
                        console.warn(`WARN: Invalid purchase item in document ${purchaseDoc.id}:`, item);
                    }
                });
            } else {
                console.warn(`WARN: Purchase document ${purchaseDoc.id} does NOT have a 'purchases' array. Skipping.`);
            }
        });
        console.log("Summary: Purchased Quantities:", purchasedQuantities);
        

    }
    catch (error) {
        console.error("ERROR: Error fetching purchase data:", error);
        displayMessage("Error loading purchase data.", "error");
    }

    // --- 2. Fetch Sales Data ---
    try {
        const salesCollectionRef = collection(db, "users", userId, "sales");
        const salesSnapshot = await getDocs(salesCollectionRef);

        if (salesSnapshot.empty) {
            console.warn(`WARN: No sales data found for this user.`);
        }

        salesSnapshot.forEach(saleDoc => {
            const saleData = saleDoc.data();
            
            // Prioritize 'date' field, fallback to 'createdAt', then current date if neither
            let saleDate;
            if (saleData.date && typeof saleData.date.toDate === 'function') {
                saleDate = saleData.date.toDate();
            } else if (saleData.createdAt && typeof saleData.createdAt.toDate === 'function') {
                saleDate = saleData.createdAt.toDate();
            } else {
                saleDate = new Date(); // Fallback to current date for missing dates
            }

            const monthKey = `${saleDate.getFullYear()}-${(saleDate.getMonth() + 1).toString().padStart(2, '0')}`;
            let transactionTotal = 0;

            // Assuming a standardized 'sales' array for sales documents
            if (Array.isArray(saleData.sales)) {
                saleData.sales.forEach(item => {
                    const productName = item.product?.trim();
                    const quantitySold = typeof item.quantity === 'number' ? item.quantity : 0;
                    const itemCategory = item.category?.trim();
                    const itemPrice = typeof item.amount === 'number' ? item.amount : 0; // 'amount' per item

                    const itemTotal = itemPrice * quantitySold;
                    transactionTotal += itemTotal;

                    if (productName && quantitySold > 0) {
                        soldQuantities[productName] = (soldQuantities[productName] || 0) + quantitySold;
                        allUniqueProductNames.add(productName);

                        if (!productSalesData[productName]) {
                            productSalesData[productName] = { totalQuantitySold: 0, lastSaleDate: null };
                        }
                        productSalesData[productName].totalQuantitySold += quantitySold;
                        if (!productSalesData[productName].lastSaleDate || saleDate > productSalesData[productName].lastSaleDate) {
                            productSalesData[productName].lastSaleDate = saleDate;
                        }
                    } else {
                        console.warn(`WARN: Invalid sales item in document ${saleDoc.id}:`, item);
                    }

                    if (itemCategory && itemTotal > 0) {
                        salesByCategory[itemCategory] = (salesByCategory[itemCategory] || 0) + itemTotal;
                    }
                });
            } else {
                // Fallback for older/single-item sales documents if necessary, but standardize is better.
                // If you ensure all sales docs have a 'sales' array, this block can be removed.
                console.warn(`WARN: Sales document ${saleDoc.id} does NOT have a 'sales' array. Processing as single item.`);
                const productName = saleData.product?.trim();
                const quantitySold = typeof saleData.quantity === 'number' ? saleData.quantity : 0;
                const itemCategory = saleData.category?.trim();
                const itemAmount = typeof saleData.amount === 'number' ? saleData.amount : 0;

                transactionTotal = itemAmount; // For single-item doc, total is the top-level amount

                if (productName && quantitySold > 0) {
                    soldQuantities[productName] = (soldQuantities[productName] || 0) + quantitySold;
                    allUniqueProductNames.add(productName);

                    if (!productSalesData[productName]) {
                        productSalesData[productName] = { totalQuantitySold: 0, lastSaleDate: null };
                    }
                    productSalesData[productName].totalQuantitySold += quantitySold;
                    if (!productSalesData[productName].lastSaleDate || saleDate > productSalesData[productName].lastSaleDate) {
                        productSalesData[productName].lastSaleDate = saleDate;
                    }
                }
                if (itemCategory && itemAmount > 0) {
                    salesByCategory[itemCategory] = (salesByCategory[itemCategory] || 0) + itemAmount;
                }
            }
            
            totalSalesAmount += transactionTotal;
            monthlySales[monthKey] = (monthlySales[monthKey] || 0) + transactionTotal;
        });

        console.log("Summary: Sold Quantities:", soldQuantities);
        console.log("Summary: Total Sales Amount:", totalSalesAmount.toFixed(2));
        console.log("Summary: Monthly Sales Data:", monthlySales);
        console.log("Summary: Sales by Category Data:", salesByCategory);

    } catch (error) {
        console.error("ERROR: Error fetching sales data:", error);
        displayMessage("Error loading sales data.", "error");
    }

    // --- 3. Calculate Current Stock and Dashboard Product/Category Stats ---
    let totalUniqueProducts = 0; // Count of distinct product names encountered
    let totalCategoriesCount = uniqueCategories.size; // Count of distinct categories
    let totalStockQuantity = 0; // Sum of current stock quantities

    const productCurrentStock = {};

    for (const productName of allUniqueProductNames) {
        const purchased = purchasedQuantities[productName] || 0;
        const sold = soldQuantities[productName] || 0;
        const currentStock = purchased - sold;

        productCurrentStock[productName] = currentStock;

        if (currentStock > 0) {
            totalStockQuantity += currentStock; // Sum of units in stock
            totalUniqueProducts++; // Count product as 'in stock'
        }
    }

    // Update UI elements for cards
    updateDOMText(totalProductsElem, totalUniqueProducts); // Count of unique products with stock
    updateDOMText(totalCategoriesElem, totalCategoriesCount); // Count of unique categories from purchases
    updateDOMText(totalSalesElem, totalSalesAmount, true); // Total sales formatted as currency

    // --- 4. Calculate Low Stock Items ---
    let lowStockCount = 0;
    const SAFETY_STOCK_DAYS = 7;
    const AVG_SALES_LOOKBACK_DAYS = 90;

    for (const productName in productCurrentStock) {
        const currentQuantity = productCurrentStock[productName];
        const salesInfo = productSalesData[productName];

        let averageDailySales = 0;
        if (salesInfo && salesInfo.totalQuantitySold > 0 && salesInfo.lastSaleDate) {
            const lookbackDate = new Date();
            lookbackDate.setDate(new Date().getDate() - AVG_SALES_LOOKBACK_DAYS);
            
            // Use the salesInfo.lastSaleDate if it's older than the lookback period, else lookbackDate
            const periodStartDate = salesInfo.lastSaleDate < lookbackDate ? salesInfo.lastSaleDate : lookbackDate;
            
            const totalDaysTrackedForAvg = (new Date().getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24);

            if (totalDaysTrackedForAvg > 0) {
                averageDailySales = salesInfo.totalQuantitySold / totalDaysTrackedForAvg;
            }
        }

        const dynamicMinStock = Math.ceil(averageDailySales * SAFETY_STOCK_DAYS);
        
        if (currentQuantity <= dynamicMinStock || currentQuantity === 0) {
            lowStockCount++;
            console.log(`LOW STOCK: '${productName}' - Current: ${currentQuantity}, Min: ${dynamicMinStock.toFixed(0)}, Avg Daily Sales: ${averageDailySales.toFixed(2)}`);
        }
    }
    updateDOMText(lowStockItemsElem, lowStockCount);
    console.log("Summary: Low Stock Items Count:", lowStockCount);

    // Sort monthly sales data for chart
    const sortedMonthlyLabels = Object.keys(monthlySales).sort();
    const sortedMonthlyData = sortedMonthlyLabels.map(key => monthlySales[key]);

    // Store data globally for re-rendering
    currentMonthlySalesData = { labels: sortedMonthlyLabels, data: sortedMonthlyData };
    currentSalesByCategoryData = { 
        labels: Object.keys(salesByCategory), 
        data: Object.values(salesByCategory) 
    };

    // Render Charts
    renderMonthlySalesChart(currentMonthlySalesData.labels, currentMonthlySalesData.data);
    renderSalesByCategoryChart(currentSalesByCategoryData.labels, currentSalesByCategoryData.data);
    
    displayMessage("Dashboard data loaded successfully!", "success");
    console.log("------------------------------------------");
    console.log("FINISHED: fetchDashboardSummary");
    console.log("------------------------------------------");
}

// --- Chart Rendering Functions ---

function renderMonthlySalesChart(labels, data) {
    if (monthlySalesChartInstance) {
        monthlySalesChartInstance.destroy();
    }
    const colors = getChartColors();
    const ctx = document.getElementById('monthlySalesChart').getContext('2d');
    monthlySalesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Sales ($)',
                data: data,
                backgroundColor: colors.primaryColorLight,
                borderColor: colors.primaryColor,
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: colors.primaryColor,
                pointBorderColor: colors.cardBg,
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: colors.borderColor,
                    },
                    ticks: {
                        color: colors.textColor,
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: 'Sales Amount ($)',
                        color: colors.textColorSecondary
                    }
                },
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: colors.textColor
                    },
                    title: {
                        display: true,
                        text: 'Month',
                        color: colors.textColorSecondary
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: colors.textColor,
                        font: {
                            size: 14
                        }
                    }
                },
                tooltip: {
                    backgroundColor: colors.cardBg,
                    titleColor: colors.textColor,
                    bodyColor: colors.textColorSecondary,
                    borderColor: colors.borderColor,
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: $${context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        }
                    }
                }
            }
        }
    });
}

function renderSalesByCategoryChart(labels, data) {
    if (salesByCategoryChartInstance) {
        salesByCategoryChartInstance.destroy();
    }
    const colors = getChartColors();
    const ctx = document.getElementById('salesByCategoryChart').getContext('2d');

    // A more dynamic way to generate colors
    const dynamicBackgroundColors = labels.map((_, index) => {
        const baseColors = [
            colors.primaryColor, colors.secondaryColor, colors.accentColor, colors.redColor,
            colors.primaryColorDark, colors.secondaryColorDark,
        ];
        // Cycle through base colors, add some variations if more categories
        return baseColors[index % baseColors.length];
    });

    salesByCategoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: dynamicBackgroundColors,
                hoverOffset: 10,
                borderColor: colors.cardBg,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: colors.textColor,
                        font: {
                            size: 14
                        },
                        boxWidth: 20,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: colors.cardBg,
                    titleColor: colors.textColor,
                    bodyColor: colors.textColorSecondary,
                    borderColor: colors.borderColor,
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((acc, current) => acc + current, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(2) : '0.00';
                            return `${label}: $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// --- Recent Activities Function ---
async function fetchRecentActivities(userId, limitCount = 5) {
    if (!userId) {
        console.error("User ID is required to fetch recent activities.");
        return [];
    }
    const activities = [];

    try {
        // Fetch recent sales
        const salesRef = collection(db, "users", userId, "sales");
        const salesQuery = query(salesRef, limit(limitCount));
        const salesSnapshot = await getDocs(salesQuery);

        salesSnapshot.forEach(doc => {
            const data = doc.data();
            let saleDate;
            if (data.date && typeof data.date.toDate === 'function') {
                saleDate = data.date.toDate();
            } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                saleDate = data.createdAt.toDate();
            } else {
                saleDate = new Date(); 
            }

            // Assuming sales documents have a 'sales' array for items
            if (Array.isArray(data.sales) && data.sales.length > 0) {
                data.sales.forEach(item => {
                    if (item.product && typeof item.quantity === 'number') {
                        activities.push({
                            type: 'sale',
                            product: item.product,
                            quantity: item.quantity,
                            price: item.amount, // price per unit
                            date: saleDate
                        });
                    }
                });
            } else if (data.product && typeof data.quantity === 'number') {
                // Fallback for single-item sales documents
                 activities.push({
                    type: 'sale',
                    product: data.product,
                    quantity: data.quantity,
                    price: data.amount / data.quantity, // Calculate price per unit if 'amount' is total
                    date: saleDate
                });
            }
        });

        // Fetch recent purchases
        const purchaseRef = collection(db, "users", userId, "purchase");
        const purchaseQuery = query(purchaseRef, limit(limitCount));
        const purchaseSnapshot = await getDocs(purchaseQuery);

        purchaseSnapshot.forEach(doc => {
            const data = doc.data();
            let purchaseDate;
            if (data.date && typeof data.date.toDate === 'function') {
                purchaseDate = data.date.toDate();
            } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                purchaseDate = data.createdAt.toDate();
            } else {
                purchaseDate = new Date(); 
            }

            // Assuming purchase documents have a 'purchases' array for items
            if (Array.isArray(data.purchases) && data.purchases.length > 0) {
                data.purchases.forEach(item => {
                    if (item.product && typeof item.quantity === 'number') {
                        activities.push({
                            type: 'purchase',
                            product: item.product,
                            quantity: item.quantity,
                            date: purchaseDate
                        });
                    }
                });
            }
        });

        // Sort activities by date, newest first
        activities.sort((a, b) => b.date.getTime() - a.date.getTime());

        // Return only the most recent 'limitCount' activities
        return activities.slice(0, limitCount);

    } catch (error) {
        console.error("Error fetching recent activities:", error);
        displayMessage("Error loading recent activities.", "error");
        return [];
    }
}

// Function to display recent activities
async function displayRecentActivitiesToDOM(userId) {
    const activityListElem = document.getElementById('recentActivityList');
    if (!activityListElem) {
        console.error("DOM Error: 'recentActivityList' element not found.");
        return;
    }

    activityListElem.innerHTML = ''; // Clear previous activities
    const activities = await fetchRecentActivities(userId, 5); // Fetch top 5 recent activities

    if (activities.length === 0) {
        activityListElem.innerHTML = `
            <li class="flex items-center text-gray-500 dark:text-gray-400 p-2">
                <span class="mr-2">No recent activities to display.</span>
            </li>
        `;
        return;
    }

    activities.forEach(activity => {
        const date = activity.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const time = activity.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        let iconHtml = '';
        let textClass = '';
        let description = '';

        if (activity.type === 'purchase') {
            iconHtml = '<i class="fas fa-box-open text-blue-500 mr-2"></i>'; // Icon for purchase
            textClass = 'text-primary-600 dark:text-primary-400';
            description = `Purchased <span class="font-semibold">${activity.quantity}</span> units of "<span class="font-medium">${activity.product}</span>"`;
        } else if (activity.type === 'sale') {
            iconHtml = '<i class="fas fa-dollar-sign text-green-500 mr-2"></i>'; // Icon for sale
            textClass = 'text-secondary-600 dark:text-secondary-400';
            description = `Sold <span class="font-semibold">${activity.quantity}</span> units of "<span class="font-medium">${activity.product}</span>" for <span class="font-semibold">$${activity.price ? (activity.quantity * activity.price).toFixed(2) : 'N/A'}</span>`;
        } else {
            iconHtml = '<i class="fas fa-info-circle text-gray-500 mr-2"></i>'; // Generic icon
            textClass = 'text-gray-700 dark:text-gray-300';
            description = `Performed an unknown activity related to "${activity.product}"`;
        }

        const listItem = document.createElement('li');
        listItem.className = `flex items-start text-sm py-2 px-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0`;
        listItem.innerHTML = `
            ${iconHtml}
            <div class="flex-1">
                <p class="${textClass}">${description}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${date} at ${time}</p>
            </div>
        `;
        activityListElem.appendChild(listItem);
    });
}

// Call fetch and display recent activities after user is logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // ... (existing code)
        await fetchDashboardSummary(user.uid);
        await displayRecentActivitiesToDOM(user.uid); // Call this function
    } else {
        // ... (existing code)
    }
});