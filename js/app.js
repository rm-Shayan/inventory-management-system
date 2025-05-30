// js/app.js - FINAL REVISION FOR PRECISE UI MAPPING AND DEBUGGING

import { auth, db, onAuthStateChanged, signOut, collection, doc, getDocs, query, where, limit } from "./firebase.js";

// DOM Elements
const totalProductsElem = document.getElementById('totalProductsElem');
const totalCategoriesElem = document.getElementById('totalCategoriesElem');
const totalSalesElem = document.getElementById('totalSalesElem');
const lowStockItemsElem = document.getElementById('lowStockItemsElem');
const logoutButton = document.getElementById('logoutButton');

// Hamburger menu and overlay
const hamburgerButton = document.getElementById('hamburgerButton');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');



// Profile menu
const profileButton = document.getElementById('profileButton');
const profileMenu = document.getElementById('profileMenu');
const profileNameElem = document.getElementById('profileName');
const profileInitialElem = document.getElementById('profileInitial');

   const htmlElement = document.documentElement;

// Chart instances
let monthlySalesChartInstance;
let salesByCategoryChartInstance;

// Global variables to store fetched data for re-rendering charts on theme change
let currentMonthlySalesData = {};
let currentSalesByCategoryData = {};

// Helper function for safe DOM updates
function updateDOMText(element, value) {
    if (element) {
        element.textContent = (typeof value === 'number' || typeof value === 'string')
            ? value.toLocaleString('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 })
            : 'N/A';
    } else {
        console.warn(`DOM Error: Element for updating value '${value}' not found.`);
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

// Function to fetch and update dashboard summary
async function fetchDashboardSummary(userId) {
    console.log("------------------------------------------");
    console.log("STARTING: fetchDashboardSummary for User ID:", userId);
    console.log("------------------------------------------");

    if (!userId) {
        console.error("CRITICAL ERROR: User ID is null or undefined. Cannot fetch data. Redirecting to login.");
        updateDOMText(totalProductsElem, 0);
        updateDOMText(totalCategoriesElem, 0);
        updateDOMText(totalSalesElem, 0);
        updateDOMText(lowStockItemsElem, 0);
        setTimeout(() => { // Small delay before redirecting to allow console messages to be seen
            window.location.href = "index.html";
        }, 100);
        return;
    }

    // Data structures for stock calculation
    const purchasedQuantities = {}; // productName: total_quantity_purchased
    const soldQuantities = {};      // productName: total_quantity_sold
    const productCategories = {};   // productName: categoryName (from purchase data)
    const allUniqueProductNames = new Set(); // All distinct product names found in purchases or sales

    let totalSalesAmount = 0; // Will be accumulated from individual sale item calculations
    const monthlySales = {};
    const salesByCategory = {};
    const productSalesData = {}; // For low stock calculation (total sold quantity over time)

    // --- 1. Fetch Purchase Data to establish initial stock ---
    try {
        console.log(`DEBUG: Fetching purchase data from: users/${userId}/purchase`);
        const purchaseCollectionRef = collection(db, "users", userId, "purchase");
        const purchaseSnapshot = await getDocs(purchaseCollectionRef);

        if (purchaseSnapshot.empty) {
            console.warn(`WARN: No purchase data found for this user in 'users/${userId}/purchase'. Stock will be zero from purchases.`);
        } else {
            console.log(`DEBUG: Found ${purchaseSnapshot.docs.length} purchase documents.`);
        }

        purchaseSnapshot.forEach(purchaseDoc => {
            console.log(`DEBUG: Processing purchase document ID: ${purchaseDoc.id}`);
            const purchaseData = purchaseDoc.data();
            console.log("DEBUG: Raw purchase document data:", purchaseData);

            // Assuming 'purchases' is the array field name in your purchase documents
            if (Array.isArray(purchaseData.purchases)) {
                console.log(`DEBUG: Found 'purchases' array with ${purchaseData.purchases.length} items in document ${purchaseDoc.id}.`);
                purchaseData.purchases.forEach((item, index) => {
                    const productName = item.product; // Key for product name in purchase item
                    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
                    const category = item.category;

                    console.log(`  DEBUG: Purchase Item ${index}: Product: '${productName}', Quantity: ${quantity}, Category: '${category}'`);

                    if (productName) {
                        purchasedQuantities[productName] = (purchasedQuantities[productName] || 0) + quantity;
                        allUniqueProductNames.add(productName);
                        if (category) {
                           productCategories[productName] = category; // Store category for unique category count
                        }
                    } else {
                        console.warn(`  WARN: Purchase item ${index} in document ${purchaseDoc.id} is missing 'product' name. Skipping.`);
                    }
                });
            } else {
                console.warn(`WARN: Purchase document ${purchaseDoc.id} does NOT have a 'purchases' array or it's not an array. Please check data structure. Skipping processing.`);
            }
        });
        console.log("Summary: Final Purchased Quantities:", purchasedQuantities);

    } catch (error) {
        console.error("ERROR: Error fetching purchase data:", error);
    }

    // --- 2. Fetch Sales Data to calculate sold quantities and sales metrics ---
    try {
        console.log(`DEBUG: Fetching sales data from: users/${userId}/sales`);
        const salesCollectionRef = collection(db, "users", userId, "sales");
        const salesSnapshot = await getDocs(salesCollectionRef);

        if (salesSnapshot.empty) {
            console.warn(`WARN: No sales data found for this user in 'users/${userId}/sales'. Dashboard sales stats will be zero.`);
        } else {
            console.log(`DEBUG: Found ${salesSnapshot.docs.length} sales documents.`);
        }

        salesSnapshot.forEach(saleDoc => {
            console.log(`DEBUG: Processing sale document ID: ${saleDoc.id}`);
            const saleData = saleDoc.data();
            console.log("DEBUG: Raw sales document data:", saleData); // IMPORTANT: Check this in your console!

            // Determine the sale date (prioritize 'date' field, fallback to 'createdAt')
            const saleDate = (saleData.date instanceof Date) ? saleData.date :
                             (saleData.date && typeof saleData.date.toDate === 'function' ? saleData.date.toDate() :
                             (saleData.createdAt instanceof Date) ? saleData.createdAt :
                             (saleData.createdAt && typeof saleData.createdAt.toDate === 'function' ? saleData.createdAt.toDate() :
                             null));

            const monthKey = saleDate ? `${saleDate.getFullYear()}-${(saleDate.getMonth() + 1).toString().padStart(2, '0')}` : 'Unknown';

            let currentTransactionTotal = 0; // Initialize total for *this specific sales document*

            // Check if 'sales' array is present as indicated by the user
            if (Array.isArray(saleData.sales)) {
                console.log(`DEBUG: Found 'sales' array with ${saleData.sales.length} items in document ${saleDoc.id}. Processing items.`);
                saleData.sales.forEach((item, index) => {
                    const productId = item.product; // Assuming 'product' is the field in the nested item
                    const quantitySold = typeof item.quantity === 'number' ? item.quantity : 0;
                    const itemCategory = item.category;
                    const itemPrice = typeof item.amount === 'number' ? item.amount : 0; // Assuming 'price' per item

                    const itemTotal = itemPrice * quantitySold;
                    currentTransactionTotal += itemTotal; // Sum up for this transaction's total

                    console.log(`  DEBUG: Sales Item ${index} (from 'sales' array): Product: '${productId}', Quantity: ${quantitySold}, Category: '${itemCategory}', Price: ${itemPrice}, Item Total: ${itemTotal}`);

                    if (productId) {
                        soldQuantities[productId] = (soldQuantities[productId] || 0) + quantitySold;
                        allUniqueProductNames.add(productId);

                        // For low stock calculation's average daily sales
                        if (!productSalesData[productId]) {
                            productSalesData[productId] = { totalQuantitySold: 0, lastSaleDate: null };
                        }
                        productSalesData[productId].totalQuantitySold += quantitySold;
                        if (saleDate && (!productSalesData[productId].lastSaleDate || saleDate > productSalesData[productId].lastSaleDate)) {
                            productSalesData[productId].lastSaleDate = saleDate;
                        }
                    } else {
                        console.warn(`  WARN: Sales item ${index} in document ${saleDoc.id} is missing 'product' name. Skipping.`);
                    }

                    // For Sales by Category Chart, sum amount per category based on item total
                    if (itemCategory && typeof itemCategory === 'string' && itemTotal > 0) {
                        salesByCategory[itemCategory] = (salesByCategory[itemCategory] || 0) + itemTotal;
                    } else if (!itemCategory) {
                        console.warn(`  WARN: Sales item ${index} in document ${saleDoc.id} is missing 'category' field. Skipping for category chart.`);
                    }
                });
            } else {
                // FALLBACK: If 'sales' array is NOT found, revert to previous single-item-per-document logic
                console.warn(`WARN: Sales document ${saleDoc.id} does NOT have a 'sales' array. Attempting to read as single-item document (like original screenshot).`);
                
                const productId = saleData.product;
                const quantitySold = typeof saleData.quantity === 'number' ? saleData.quantity : 0;
                const itemCategory = saleData.category;
                const itemAmount = typeof saleData.amount === 'number' ? saleData.amount : 0; // Use top-level amount if available

                currentTransactionTotal = itemAmount; // For single-item, this is the total

                console.log(`  DEBUG: Sales Document (Single Item Fallback): Product: '${productId}', Quantity Sold: ${quantitySold}, Category: '${itemCategory}', Sale Amount: $${itemAmount.toFixed(2)}`);


                if (productId) {
                    soldQuantities[productId] = (soldQuantities[productId] || 0) + quantitySold;
                    allUniqueProductNames.add(productId);

                    if (!productSalesData[productId]) {
                        productSalesData[productId] = { totalQuantitySold: 0, lastSaleDate: null };
                    }
                    productSalesData[productId].totalQuantitySold += quantitySold;
                    if (saleDate && (!productSalesData[productId].lastSaleDate || saleDate > productSalesData[productId].lastSaleDate)) {
                        productSalesData[productId].lastSaleDate = saleDate;
                    }
                } else {
                    console.warn(`  WARN: Sales document ${saleDoc.id} (single-item) is missing 'product' name. Skipping.`);
                }

                if (itemCategory && typeof itemCategory === 'string' && itemAmount > 0) {
                    salesByCategory[itemCategory] = (salesByCategory[itemCategory] || 0) + itemAmount;
                } else if (!itemCategory) {
                    console.warn(`  WARN: Sales document ${saleDoc.id} (single-item) is missing 'category' field. Skipping for category chart.`);
                }
            }
            
            // Add this transaction's calculated total to the grand total sales amount
            totalSalesAmount += currentTransactionTotal; 
            // Aggregate monthly sales using this transaction's calculated total
            monthlySales[monthKey] = (monthlySales[monthKey] || 0) + currentTransactionTotal;

        }); // End of salesSnapshot.forEach

        console.log("Summary: Final Sold Quantities:", soldQuantities);
        console.log("Summary: Total Sales Amount (collected from 'sales' array or top-level 'amount'):", totalSalesAmount.toFixed(2));
        console.log("Summary: Monthly Sales Data:", monthlySales);
        console.log("Summary: Sales by Category Data:", salesByCategory);

    } catch (error) {
        console.error("ERROR: Error fetching sales data:", error);
    }

    // --- 3. Calculate Current Stock and Dashboard Product/Category Stats ---
    let totalProductsInStock = 0; // Count of unique product types with current stock > 0
    let totalStockQuantity = 0; // SUM of current stock quantities across all products
    const uniqueCategoriesWithStock = new Set(); // Categories of products that *currently* have stock

    const productCurrentStock = {}; // Final calculated current stock for each product, used for low stock

    console.log("DEBUG: Calculating current stock and dashboard stats...");
    if (allUniqueProductNames.size === 0) {
        console.warn("WARN: No unique product names found across purchases or sales. Stock and related stats will be zero.");
    }

    for (const productName of allUniqueProductNames) {
        const purchased = purchasedQuantities[productName] || 0;
        const sold = soldQuantities[productName] || 0;
        const currentStock = purchased - sold;

        productCurrentStock[productName] = currentStock; // Store current stock for low stock calculation

        if (currentStock > 0) {
            totalProductsInStock++; // Count of unique product types with positive stock
            totalStockQuantity += currentStock; // Sum of units for products with positive stock
            if (productCategories[productName]) {
                uniqueCategoriesWithStock.add(productCategories[productName]);
            } else {
                console.warn(`  WARN: Product '${productName}' has stock but no category assigned from purchase data. Will not be counted in category total.`);
            }
        }
        console.log(`  DEBUG: Product: '${productName}', Purchased: ${purchased}, Sold: ${sold}, Current Stock: ${currentStock}`);
    }

    console.log("Summary: Total unique product types currently in stock (for 'Categories' card):", totalProductsInStock);
    console.log("Summary: Total STOCK QUANTITY (sum of current stock for all products, for 'Total Products' card):", totalStockQuantity);
    console.log("Summary: Total unique categories with stock (for internal tracking, not directly on UI as per request):", uniqueCategoriesWithStock.size);

    // Update UI elements for cards
    // "Total Products" card should show the SUM of current stock quantities
    updateDOMText(totalProductsElem, totalStockQuantity);
    // "Categories" card should show the COUNT of unique product types with stock
    updateDOMText(totalCategoriesElem, totalProductsInStock);
    // Total Sales card
    console.log("DEBUG: Value being passed to totalSalesElem (Final Total Sales Amount):", totalSalesAmount.toFixed(0));
    updateDOMText(totalSalesElem, totalSalesAmount.toFixed(0));


    // --- 4. Calculate Low Stock Items ---
    let lowStockCount = 0;
    const SAFETY_STOCK_DAYS = 7; // Number of days of average sales to keep as buffer
    const AVG_SALES_LOOKBACK_DAYS = 90; // Period (in days) to calculate average daily sales from

    console.log("DEBUG: Calculating low stock items...");
    for (const productName in productCurrentStock) {
        const currentQuantity = productCurrentStock[productName];
        const salesInfo = productSalesData[productName];

        let averageDailySales = 0;
        // Calculate average daily sales only if there's sales data for the product
        if (salesInfo && salesInfo.totalQuantitySold > 0 && salesInfo.lastSaleDate) {
            // Determine the start date for calculating average sales (either lookback or oldest sale date)
            const oldestSaleDateForPeriod = new Date();
            oldestSaleDateForPeriod.setDate(new Date().getDate() - AVG_SALES_LOOKBACK_DAYS);

            // Use the later of the oldest sale date for the product or the lookback period start date
            const periodStartDate = salesInfo.lastSaleDate < oldestSaleDateForPeriod ? salesInfo.lastSaleDate : oldestSaleDateForPeriod;
            
            // Calculate total days over which sales occurred for this period
            const totalDaysTrackedForAvg = (new Date().getTime() - periodStartDate.getTime()) / (1000 * 60 * 60 * 24);

            if (totalDaysTrackedForAvg > 0) {
                averageDailySales = salesInfo.totalQuantitySold / totalDaysTrackedForAvg;
            }
        }

        // Dynamic minimum stock based on average daily sales
        const dynamicMinStock = Math.ceil(averageDailySales * SAFETY_STOCK_DAYS);

        // A product is low stock if its current quantity is less than or equal to its calculated min stock
        // Also consider it low stock if current quantity is 0 or less (even if no sales history)
        if (currentQuantity <= dynamicMinStock) { // Use <= for strict low stock, or currentQuantity < dynamicMinStock
            lowStockCount++;
            console.log(`  LOW STOCK ALERT: Product: '${productName}' (Current: ${currentQuantity}, Calculated Min: ${dynamicMinStock.toFixed(0)}, Avg Daily Sales: ${averageDailySales.toFixed(2)})`);
        }
    }
    console.log("Summary: Low Stock Items Count:", lowStockCount);

    updateDOMText(lowStockItemsElem, lowStockCount);

    // Store data globally for potential re-rendering (e.g., theme change)
    currentMonthlySalesData = monthlySales;
    currentSalesByCategoryData = salesByCategory;

    // Render Charts
    createCharts(currentMonthlySalesData, currentSalesByCategoryData);
    console.log("------------------------------------------");
    console.log("FINISHED: fetchDashboardSummary");
    console.log("------------------------------------------");
}


// Chart rendering functions (NO CHANGE HERE, they rely on data passed to them)
function createCharts(monthlySalesData, salesByCategoryData) {
    if (monthlySalesChartInstance) {
        monthlySalesChartInstance.destroy();
    }
    if (salesByCategoryChartInstance) {
        salesByCategoryChartInstance.destroy();
    }

    const colors = getChartColors();

    const monthlySalesCtx = document.getElementById('monthlySalesChart');
    if (monthlySalesCtx) {
        // Sort months for consistent chart order
        const sortedMonths = Object.keys(monthlySalesData).sort();
        const monthlyValues = sortedMonths.map(month => monthlySalesData[month]);

        monthlySalesChartInstance = new Chart(monthlySalesCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [{
                    label: 'Monthly Sales ($)',
                    data: monthlyValues,
                    borderColor: colors.primaryColor,
                    backgroundColor: colors.primaryColorLight,
                    tension: 0.3, // Smoother line
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: colors.textColor
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: colors.borderColor
                        },
                        ticks: {
                            color: colors.textColorSecondary
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: colors.borderColor
                        },
                        ticks: {
                            color: colors.textColorSecondary,
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    } else {
        console.warn("monthlySalesChart canvas element not found.");
    }

    const salesByCategoryCtx = document.getElementById('salesByCategoryChart');
    if (salesByCategoryCtx) {
        const categoryLabels = Object.keys(salesByCategoryData);
        const categoryValues = Object.values(salesByCategoryData);

        // Only create chart if there's data to display
        if (categoryLabels.length > 0 && categoryValues.some(val => val > 0)) {
            salesByCategoryChartInstance = new Chart(salesByCategoryCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: categoryLabels,
                    datasets: [{
                        label: 'Sales by Category ($)',
                        data: categoryValues,
                        backgroundColor: [
                            colors.primaryColor,
                            colors.secondaryColor,
                            colors.accentColor,
                            colors.redColor,
                            colors.primaryColorDark,
                            colors.secondaryColorDark,
                            'rgba(128, 0, 128, 0.7)', // Purple
                            'rgba(0, 128, 128, 0.7)', // Teal
                            'rgba(255, 165, 0, 0.7)', // Orange
                            'rgba(0, 0, 128, 0.7)'    // Navy
                        ],
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
                                color: colors.textColor
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed) {
                                        label += '$' + context.parsed.toLocaleString();
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            console.warn("No sales by category data to display for pie chart.");
            // Optionally, clear the canvas or display a message
            const ctx = salesByCategoryCtx.getContext('2d');
            ctx.clearRect(0, 0, salesByCategoryCtx.width, salesByCategoryCtx.height);
            ctx.font = "16px Arial";
            ctx.fillStyle = colors.textColorSecondary;
            ctx.textAlign = "center";
            ctx.fillText("No Category Sales Data", salesByCategoryCtx.width / 2, salesByCategoryCtx.height / 2);
        }
    } else {
        console.warn("salesByCategoryChart canvas element not found.");
    }
}

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
             profileInitialElem.classList.add(
                    'flex', 'items-center', 'justify-center',
                    'w-10', 'h-10', 'rounded-full',
                    'bg-primary-500', 'text-white', 'font-bold', 'text-lg',
                    'shadow-md'
                );
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

// Logout button handler
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User logged out successfully.");
            window.location.href = "index.html";
        } catch (error) {
            console.error("Error logging out:", error);
            alert("Logout failed. Please try again.");
        }
    });
}

// Hamburger menu toggle
if (hamburgerButton && sidebar && sidebarOverlay) {
    hamburgerButton.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
        sidebarOverlay.classList.toggle('opacity-0');
        sidebarOverlay.classList.toggle('pointer-events-none');
    });

    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('opacity-0');
        sidebarOverlay.classList.add('pointer-events-none');
    });
}

// Theme toggle functionality
if ( htmlElement) {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
        htmlElement.classList.add('dark');
        
    } else {
        htmlElement.classList.remove('dark');
      
    }

  
}

// Profile menu toggle
if (profileButton && profileMenu) {
    profileButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent document click from closing it immediately
        const isHidden = profileMenu.classList.contains('hidden');
        if (isHidden) {
            profileMenu.classList.remove('hidden');
            setTimeout(() => { // Small delay for transition to apply
                profileMenu.classList.remove('opacity-0', 'scale-95');
                profileMenu.classList.add('opacity-100', 'scale-100');
            }, 10);
        } else {
            profileMenu.classList.add('opacity-0', 'scale-95');
            profileMenu.addEventListener('transitionend', function handler() {
                profileMenu.classList.add('hidden');
                profileMenu.removeEventListener('transitionend', handler);
            }, { once: true });
        }
    });

    // Close profile menu if clicked outside
    document.addEventListener('click', (event) => {
        if (!profileButton.contains(event.target) && !profileMenu.contains(event.target)) {
            if (!profileMenu.classList.contains('hidden')) {
                profileMenu.classList.add('opacity-0', 'scale-95');
                profileMenu.addEventListener('transitionend', function handler() {
                    profileMenu.classList.add('hidden');
                    profileMenu.removeEventListener('transitionend', handler);
                }, { once: true });
            }
        }
    });
}