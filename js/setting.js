// js/setting.js

import {
    auth,
    db,
    onAuthStateChanged,
    updateEmail,
    updatePassword,
    signOut,
    getDoc,
    doc,
    setDoc,
    updateDoc,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "./firebase.js";

// Define appId directly here as it's no longer exported from firebase.js based on your provided firebase.js
// This value should match the 'appId' in your firebaseConfig in firebase.js
const appId = "1:932602981627:web:952125447808c436dbd45e";

let userId = null; // Will store the authenticated user's ID

// UI elements
const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const profileNameSpan = document.getElementById('profileName');
// Removed profileDiv as we will update specific elements directly
const profileAvatarImg = document.getElementById('profileAvatar');
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
const logoutButton = document.getElementById('logoutButton');

// Function to toggle loader visibility (defined in HTML script)
// window.toggleLoader(true) to show, window.toggleLoader(false) to hide
// window.showMessage(message) to show custom message box

/**
 * Checks the user's login status and email verification.
 * Populates UI with user data if logged in and verified.
 * Redirects if not logged in or email not verified.
 */
const checkUserLogin = () => {
    window.toggleLoader(true); // Show loader immediately

    onAuthStateChanged(auth, async (user) => {
        if (!user || !user.emailVerified) {
            console.log("User not logged in or email not verified. Redirecting...");
            window.location.href = "../auth.html"; // Adjust path as necessary
            return;
        }

        userId = user.uid; // Set the global userId

        try {
            // Fetch user profile from Firestore using the path specified by the user:
            // "users" collection with user.uid as the document ID
            const userProfileRef = doc(db, "users", userId);
            const userSnap = await getDoc(userProfileRef);

            let userFullName = user.displayName || 'New User'; // Default from Auth displayName
            let userEmail = user.email; // Default from Auth email

            if (userSnap.exists()) {
                const userData = userSnap.data();
                userFullName = userData.name || user.displayName || 'User';
                userEmail = userData.email || user.email; // Prefer Firestore email, fallback to auth email
            } else {
                console.warn("User profile document not found in Firestore. Creating a new one.");
                // Create a basic profile if it doesn't exist
                await setDoc(userProfileRef, {
                    fullName: userFullName,
                    email: userEmail,
                    createdAt: new Date()
                });
            }

            // Update UI elements with fetched or default data
            fullNameInput.value = userFullName;
            emailInput.value = userEmail;
            profileNameSpan.textContent = userFullName;
            // Update profile avatar with the first letter of the full name
            profileAvatarImg.src = `https://placehold.co/40x40/ADD8E6/000000?text=${userFullName.charAt(0).toUpperCase()}`;

        } catch (error) {
            console.error("Error during user login check or data fetch:", error);
            window.showMessage("Failed to load user data. Please try again.");
            // Consider redirecting or showing a critical error state
            window.location.href = "../auth.html"; // Redirect on critical error
        } finally {
            window.toggleLoader(false); // Hide loader regardless of success/failure
        }
    });
};

/**
 * Handles updating the user's profile information (Full Name and Email).
 */
const handleProfileUpdate = async (event) => {
    event.preventDefault(); // Prevent default form submission
    window.toggleLoader(true);

    const newFullName = fullNameInput.value.trim();
    const newEmail = emailInput.value.trim();
    const currentUser = auth.currentUser;

    if (!currentUser) {
        window.showMessage("No user logged in. Please log in again.");
        window.toggleLoader(false);
        return;
    }

    if (!newFullName || !newEmail) {
        window.showMessage("Full Name and Email cannot be empty.");
        window.toggleLoader(false);
        return;
    }

    try {
        let emailUpdated = false;
        if (newEmail !== currentUser.email) {
            // Only attempt to update email if it has changed
            await updateEmail(currentUser, newEmail);
            emailUpdated = true;
            console.log("Email updated in Firebase Auth.");
        }

        // Update Firestore document using the path specified by the user for reads
        // This assumes the update path should also be "users/{userId}"
        const userProfileRef = doc(db, "users", userId);
        await updateDoc(userProfileRef, {
            fullName: newFullName,
            email: newEmail, // Ensure email in Firestore matches the new email
            updatedAt: new Date()
        });

        profileNameSpan.textContent = newFullName; // Update header name
        // Update profile avatar with the first letter of the new full name
        profileAvatarImg.src = `https://placehold.co/40x40/ADD8E6/000000?text=${newFullName.charAt(0).toUpperCase()}`;

        window.showMessage(`Profile updated successfully! ${emailUpdated ? 'Please re-verify your new email.' : ''}`);
        console.log("Profile updated in Firestore.");

    } catch (error) {
        console.error("Error updating profile:", error);
        if (error.code === 'auth/requires-recent-login') {
            window.showMessage("Please log in again to update your email (sensitive operation).");
            // Optionally, prompt for re-authentication here
        } else if (error.code === 'auth/invalid-email') {
            window.showMessage("The new email address is invalid.");
        } else if (error.code === 'auth/email-already-in-use') {
            window.showMessage("This email is already in use by another account.");
        } else {
            window.showMessage(`Failed to update profile: ${error.message}`);
        }
    } finally {
        window.toggleLoader(false);
    }
};

/**
 * Handles changing the user's password.
 */
const handleChangePassword = async (event) => {
    event.preventDefault(); // Prevent default form submission
    window.toggleLoader(true);

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmNewPassword = confirmNewPasswordInput.value;
    const currentUser = auth.currentUser;

    if (!currentUser) {
        window.showMessage("No user logged in. Please log in again.");
        window.toggleLoader(false);
        return;
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        window.showMessage("All password fields are required.");
        window.toggleLoader(false);
        return;
    }

    if (newPassword !== confirmNewPassword) {
        window.showMessage("New password and confirm password do not match.");
        window.toggleLoader(false);
        return;
    }

    if (newPassword.length < 6) {
        window.showMessage("New password must be at least 6 characters long.");
        window.toggleLoader(false);
        return;
    }

    try {
        // Re-authenticate user before changing password (sensitive operation)
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        console.log("User re-authenticated successfully.");

        await updatePassword(currentUser, newPassword);
        window.showMessage("Password updated successfully!");

        // Clear password fields
        currentPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmNewPasswordInput.value = '';

    } catch (error) {
        console.error("Error changing password:", error);
        if (error.code === 'auth/wrong-password') {
            window.showMessage("Incorrect current password.");
        } else if (error.code === 'auth/requires-recent-login') {
            window.showMessage("Please log in again to change your password (sensitive operation).");
        } else if (error.code === 'auth/weak-password') {
            window.showMessage("The new password is too weak. Please choose a stronger one.");
        } else {
            window.showMessage(`Failed to change password: ${error.message}`);
        }
    } finally {
        window.toggleLoader(false);
    }
};

/**
 * Handles user logout.
 */
const handleLogout = async () => {
    window.toggleLoader(true);
    try {
        await signOut(auth);
        window.location.href = "../auth.html"; // Redirect to login page after logout
    } catch (error) {
        console.error("Error during logout:", error);
        window.showMessage("Failed to log out. Please try again.");
    } finally {
        window.toggleLoader(false);
    }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    checkUserLogin(); // Initial check on page load
    profileForm.addEventListener('submit', handleProfileUpdate);
    passwordForm.addEventListener('submit', handleChangePassword);
    logoutButton.addEventListener('click', handleLogout);
});

