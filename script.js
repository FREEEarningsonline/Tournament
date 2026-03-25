// Firebase Configuration (DO NOT modify these values directly if they are sensitive)
const firebaseConfig = {
    apiKey: "AIzaSyDR2OugzoVNnKN6OUKsPxC9ajldlhanteE",
    authDomain: "tournament-af6dd.firebaseapp.com",
    projectId: "tournament-af6dd",
    storageBucket: "tournament-af6dd.firebasestorage.app",
    messagingSenderId: "726964405659",
    appId: "1:726964405659:web:d03f72c2d6f8721bc98d3e",
    measurementId: "G-GK0JNQ44N7"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Global variables
let currentUserData = null;
let pendingAction = null; // To store action after login
let unreadNotificationsCount = 0; // Global counter for unread notifications

// Dynamic app settings (will be loaded from Firebase, with defaults)
let adminDepositNumber = '03105784772';
let minWithdrawalAmount = 120;
let referralBonusAmount = 25;
let signupBonusAmount = 80;


/**
 * Navigates to a specified page and updates the navigation bar.
 * @param {string} pageId - The ID of the page to navigate to.
 */
function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId)?.classList.add('active');
    loadPageContent(pageId); // Load content for the new active page

    document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.getAttribute('onclick').includes(pageId);
        item.className = 'nav-item text-center transition-all duration-300';

        // Check if the current nav-item is the notification button
        const isNotificationNav = item.querySelector('.fa-bell');

        if (isActive) {
            item.classList.add('text-white', 'scale-125', '-translate-y-1', 'font-bold', 'drop-shadow-md');
        } else {
            item.classList.add('text-white/60', 'scale-100');
        }

        // Keep notification badge visible regardless of active state if unread count > 0
        const notificationBadge = document.getElementById('unread-notifications-count');
        if (isNotificationNav && notificationBadge) {
            if (unreadNotificationsCount > 0) {
                notificationBadge.style.display = 'block';
                notificationBadge.textContent = unreadNotificationsCount;
            } else {
                notificationBadge.style.display = 'none';
            }
        }
    });
    window.scrollTo(0, 0); // Scroll to top of the new page
}

/**
 * Displays a toast message.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - Whether the message is an error.
 */
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `fixed top-5 right-5 text-white py-2 px-4 rounded-lg shadow-lg ${isError ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-green-500 to-green-600'}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

/**
 * Formats a number as a Pakistani Rupee currency string.
 * @param {number} amount - The amount to format.
 * @returns {string} The formatted currency string.
 */
function formatCurrency(amount) {
    return `PKR ${new Intl.NumberFormat('en-PK', { minimumFractionDigits: 0 }).format(amount)}`;
}

/**
 * Toggles the visibility of a modal.
 * @param {string} modalId - The ID of the modal to toggle.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleModal(modalId, show) {
    document.getElementById(modalId).classList.toggle('active', show);
}

/**
 * Checks if the user is logged in before proceeding with an action.
 * If not logged in, opens the auth modal and queues the action.
 * @param {Event} event - The DOM event that triggered the action.
 * @param {string} actionType - The type of action to perform ('playGameUrl' or 'joinTournament').
 * @param {...any} args - Arguments to pass to the action function.
 */
function checkLoginAndAct(event, actionType, ...args) {
    event.preventDefault();

    if (!auth.currentUser) {
        pendingAction = { type: actionType, args: args };
        toggleModal('authModal', true);
        return;
    }

    if (actionType === 'playGameUrl') {
        playGameUrl(...args);
    } else if (actionType === 'joinTournament') {
        joinTournament(event, ...args);
    }
}

/**
 * Firebase Authentication state change listener.
 * Manages UI visibility and user data loading upon login/logout.
 */
auth.onAuthStateChanged(async user => {
    const showAppControls = user ? true : false;
    document.getElementById('app-header').style.display = showAppControls ? 'flex' : 'none';
    document.getElementById('user-bottom-nav').style.display = showAppControls ? 'block' : 'none';

    // Fetch app settings early (on auth state change)
    const appSettingsSnap = await db.ref('app_settings').once('value');
    const appSettings = appSettingsSnap.val();
    if (appSettings) {
        adminDepositNumber = appSettings.adminDepositNumber || adminDepositNumber;
        minWithdrawalAmount = appSettings.minWithdrawalAmount || minWithdrawalAmount;
        referralBonusAmount = appSettings.referralBonusAmount || referralBonusAmount;
        signupBonusAmount = appSettings.signupBonusAmount || signupBonusAmount;

        const adminDepositNumEl = document.getElementById('admin-deposit-number');
        if (adminDepositNumEl) adminDepositNumEl.textContent = adminDepositNumber;
        const withdrawAmountInput = document.getElementById('withdraw-amount');
        if (withdrawAmountInput) withdrawAmountInput.placeholder = `Enter amount min ${minWithdrawalAmount} (PKR)`;
        const referralBonusTextEl = document.getElementById('referral-bonus-text');
        if (referralBonusTextEl) referralBonusTextEl.textContent = referralBonusAmount;
    }

    if (user) {
        try {
            // First, fetch the user's data once to get the definitive state.
            const userSnap = await db.ref('users/' + user.uid).once('value');
            const fetchedUserData = userSnap.val();

            if (fetchedUserData) {
                currentUserData = { uid: user.uid, ...fetchedUserData };
                console.log("DEBUG (onAuthStateChanged): Fetched existing user data:", currentUserData);
            } else {
                // If it's a brand new user and no data is in DB yet, initialize with signup bonus.
                console.log(`DEBUG (onAuthStateChanged): No existing data for user ${user.uid}. Initializing with signup defaults.`);
                currentUserData = {
                    uid: user.uid,
                    email: user.email || 'N/A',
                    username: user.email ? user.email.split('@')[0] : 'User',
                    wallet_balance: signupBonusAmount, // Initialize with signup bonus
                    referrals_earned_count: 0,
                    referral_code: user.email ? user.email.split('@')[0] : 'User',
                    locked: false,
                    lockReason: null
                };
            }

            // After initial `currentUserData` is set (either from DB or with signup defaults),
            // set up the *real-time* listener for user data AND notifications.
            db.ref('users/' + user.uid).on('value', snap => {
                const updatedDataFromListener = snap.val();
                if (updatedDataFromListener) {
                    currentUserData = { uid: user.uid, ...updatedDataFromListener };
                    console.log("DEBUG (Real-time listener): Updated currentUserData:", currentUserData);
                } else {
                    console.warn(`DEBUG (Real-time listener): Received null data for ${user.uid}. Ignoring to prevent overwrite.`);
                    return; 
                }

                // --- UI UPDATES (Always reflect current `currentUserData`) ---
                const headerWalletBalanceEl = document.getElementById('header-wallet-balance');
                if (headerWalletBalanceEl) headerWalletBalanceEl.textContent = formatCurrency(currentUserData.wallet_balance || 0);

                if (document.getElementById('profilePage').classList.contains('active')) {
                    updateProfileContent();
                }
                if (document.getElementById('walletPage').classList.contains('active')) {
                    const mainBalanceEl = document.getElementById('wallet-main-balance');
                    if (mainBalanceEl) mainBalanceEl.textContent = formatCurrency(currentUserData.wallet_balance || 0);
                }
                // --- END UI UPDATES ---

                // Handle account locked status
                if (currentUserData.locked) {
                    if (auth.currentUser && auth.currentUser.uid === user.uid) {
                        auth.signOut();
                        const lockReason = currentUserData.lockReason ? `Reason: ${currentUserData.lockReason}` : 'No specific reason provided.';
                        showToast(`Your account has been locked. Please contact support. ${lockReason}`, true);
                    }
                    return;
                }
            });

            // NEW: Real-time listener for unread notifications count
            db.ref(`notifications/${user.uid}`).orderByChild('status').equalTo('unread').on('value', snapshot => {
                unreadNotificationsCount = snapshot.numChildren();
                const notificationBadge = document.getElementById('unread-notifications-count');
                if (notificationBadge) {
                    if (unreadNotificationsCount > 0) {
                        notificationBadge.textContent = unreadNotificationsCount;
                        notificationBadge.style.display = 'block';
                    } else {
                        notificationBadge.style.display = 'none';
                    }
                }
                // If on notifications page, re-render to update highlights/counts
                if (document.getElementById('notificationsPage').classList.contains('active')) {
                    renderNotificationsPage(document.getElementById('notificationsPage'));
                }
            });


            // The code below should now run *after* the initial `currentUserData` is set.
            // If it's a new signup, the `signupForm` handler will write data, and *then* this listener will pick it up.

            // Re-added: Game play reward logic for standalone games
            if (localStorage.getItem('game_played_pending') === 'true') {
                localStorage.removeItem('game_played_pending'); // Clear the flag immediately
                console.log("DEBUG: game_played_pending detected. Attempting to add 1 PKR.");
                const walletRef = db.ref(`users/${user.uid}/wallet_balance`);
                walletRef.transaction((currentBalance) => {
                    // Ensure currentBalance is a number and non-null/undefined
                    const balance = currentBalance !== null && typeof currentBalance === 'number' ? currentBalance : 0;
                    console.log(`DEBUG: Current balance before transaction for game play: ${balance}`);
                    return balance + 1; // Add 1 PKR
                }, (error, committed, snapshot) => {
                    if (error) {
                        console.error('Transaction for Game Play Reward failed', error);
                        showToast('Failed to add game play reward.', true);
                    } else if (committed) {
                        console.log(`DEBUG: Game Play Reward transaction committed. New balance: ${snapshot.val()}`);
                        db.ref(`transactions/${user.uid}`).push({
                            amount: 1,
                            type: 'credit',
                            description: 'Game Play Reward',
                            created_at: new Date().toISOString()
                        });
                        showToast('🎉 You earned PKR 1 for playing!');
                    } else {
                        // Transaction aborted by Firebase (e.g., another client wrote to the path)
                        console.log('DEBUG: Game Play Reward transaction aborted (not committed).');
                    }
                });
            }

            const activeTid = localStorage.getItem('active_tournament_id');
            if (activeTid) {
                const startTime = parseInt(localStorage.getItem('game_start_time'));
                if (startTime) {
                    const duration = Math.floor((Date.now() - startTime) / 1000);
                    localStorage.removeItem('active_tournament_id');
                    localStorage.removeItem('game_start_time');

                    db.ref(`participants/${activeTid}/${user.uid}`).update({
                        score: duration,
                        gameResult: `Survived: ${duration}s`
                    });
                    showToast(`Played for ${duration} seconds! Score updated.`);
                }
            }

            if (pendingAction) {
                const { type, args } = pendingAction;
                pendingAction = null;
                toggleModal('authModal', false);
                if (type === 'playGameUrl') {
                    playGameUrl(...args);
                } else if (type === 'joinTournament') {
                    const dummyEvent = { preventDefault: () => { }, target: { closest: () => ({ parentElement: { querySelector: () => ({ textContent: 'Tournament' }) } }) } };
                    joinTournament(dummyEvent, ...args);
                }
            }

            // NEW: Check for game deletion notifications upon login/app load
            checkAndDisplayGameDeletionNotifications(user.uid);

            const initialPageId = document.querySelector('.page.active')?.id || 'homePage';
            navigateTo(initialPageId);

        } catch (error) {
            console.error("Error in onAuthStateChanged for user:", error);
            showToast("Failed to load user data. Please try again.", true);
            auth.signOut(); // Force logout on critical errors during user data load
        }

    } else { // User is logged out
        // Clear global currentUserData and update UI for logged-out state
        currentUserData = null;
        document.getElementById('header-wallet-balance').textContent = `PKR...`;
        
        // Hide notification badge when logged out
        const notificationBadge = document.getElementById('unread-notifications-count');
        if (notificationBadge) {
            notificationBadge.style.display = 'none';
            unreadNotificationsCount = 0;
        }

        navigateTo('homePage'); // Redirect to home or login page
    }
});

/**
 * Checks for and displays any unread game deletion notifications as a persistent modal popup.
 * Marks the displayed notification as read.
 * @param {string} userId - The current user's UID.
 */
async function checkAndDisplayGameDeletionNotifications(userId) {
    if (!userId) return;

    const notificationsRef = db.ref(`notifications/${userId}`);
    const snapshot = await notificationsRef.orderByChild('status').equalTo('unread').once('value');
    const notifications = snapshot.val();

    if (notifications) {
        for (const notificationId in notifications) {
            const notification = notifications[notificationId];
            if (notification.type === 'game_deletion') {
                document.getElementById('deletion-notification-title').textContent = notification.message.split('. Reason:')[0] || 'Your game has been deleted.';
                document.getElementById('deletion-notification-message').innerHTML = notification.message.includes('. Reason:') 
                    ? `<strong>Reason:</strong> ${notification.message.split('. Reason:')[1]}`
                    : 'No specific reason was provided by the admin.';
                
                toggleModal('gameDeletionNotificationModal', true);
                
                // Mark as read in Firebase
                await notificationsRef.child(notificationId).update({ status: 'read', read_at: new Date().toISOString() });
                
                // Only show one deletion notification at a time, then break
                break; 
            }
        }
    }
}


/**
 * Loads content into the main content area based on the pageId.
 * @param {string} pageId - The ID of the page to load content for.
 */
function loadPageContent(pageId) {
    const pageContainer = document.getElementById(pageId);
    if (!pageContainer) return;
    switch (pageId) {
        case 'loginPage': /* container.innerHTML = ''; */ break; // loginPage is primarily handled by authModal
        case 'homePage': renderHomePage(pageContainer); break;
        case 'myTournamentsPage': renderMyTournamentsPage(pageContainer); break;
        case 'walletPage': renderWalletPage(pageContainer); break;
        case 'profilePage': renderProfilePage(pageContainer); break;
        case 'notificationsPage': renderNotificationsPage(pageContainer); break; // Render Notifications Page
    }
}

/**
 * Helper function to safely escape strings for JavaScript in HTML attribute context.
 * Prevents issues with quotes or special characters breaking JS parsing.
 * @param {string} s - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeJsStringForHtmlAttribute(s) {
    const str = String(s || '');
    return str.replace(/\\/g, '\\\\')
              .replace(/'/g, '\\\'')
              .replace(/"/g, '&quot;')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r');
}


/**
 * Renders the Home Page content dynamically.
 * @param {HTMLElement} container - The container element for the home page.
 */
async function renderHomePage(container) {
    container.innerHTML = `
        <div class="p-4 bg-orange-50 min-h-screen">
            <h2 class="text-2xl font-black mb-4 text-gray-800">Play Games <span class="text-xs font-normal bg-green-100 text-green-700 px-2 py-1 rounded ml-2">Earn PKR 1/play</span></h2>
            
            <div id="games-by-category-container" class="grid grid-cols-2 gap-4 mb-8"> <!-- Main grid for games -->
                <div class="col-span-2 text-center py-10"><i class="fas fa-spinner fa-spin fa-2x text-red-500"></i><p class="mt-2 text-gray-400">Loading games...</p></div>
            </div>

            <!-- NEW: Live Event/Game Section -->
            <div id="live-event-section" class="mb-8">
                <h2 class="text-xl font-bold mb-4 text-gray-700 mt-6 border-t border-orange-200 pt-4">Live Event / Game</h2>
                <div id="live-event-content" class="bg-white p-4 rounded-xl shadow-md border border-red-100">
                    <p class="text-center text-gray-500 italic">Loading live event info...</p>
                </div>
            </div>

            <!-- NEW: Video Content Sections -->
            <div id="video-content-sections" class="mb-8">
                <h2 class="text-xl font-bold mb-4 text-gray-700 mt-6 border-t border-orange-200 pt-4">Video Content</h2>
                <div id="video-sections-list-home" class="space-y-3">
                    <p class="text-center text-gray-500 italic">Loading video sections...</p>
                </div>
            </div>

            <h2 class="text-xl font-bold mb-4 text-gray-700 mt-6 border-t border-orange-200 pt-4">Live & Upcoming Tournaments</h2>
            <div id="tournament-list" class="space-y-4"></div>
        </div>`;

    const gamesByCategoryContainer = document.getElementById('games-by-category-container');

    // Listener for games data (real-time updates)
    db.ref('games').on('value', snapshot => {
        const gamesData = snapshot.val();
        if (!gamesByCategoryContainer) return;

        if (!gamesData) {
            gamesByCategoryContainer.innerHTML = `<div class="col-span-2 text-center text-gray-500">No games available yet.</div>`;
            return;
        }

        const groupedGames = {};
        Object.entries(gamesData).forEach(([id, game]) => {
            // Use 'Uncategorized' if game.category is missing or empty
            const category = (game.category && String(game.category).trim()) ? String(game.category).trim() : 'Uncategorized';
            if (!groupedGames[category]) {
                groupedGames[category] = [];
            }
            groupedGames[category].push({ id, ...game });
        });

        let gamesHtml = '';
        // Sort categories alphabetically, put 'Uncategorized' last if it exists
        const sortedCategories = Object.keys(groupedGames).sort((a, b) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            return a.localeCompare(b);
        });

        sortedCategories.forEach(category => {
            // Add category heading as a spanning item in the grid
            gamesHtml += `<h3 class="col-span-2 text-xl font-bold mt-6 mb-3 text-gray-700">${escapeJsStringForHtmlAttribute(category)}</h3>`;
            
            // Add game cards for this category
            groupedGames[category].sort((a, b) => a.title.localeCompare(b.title)).forEach(game => {
                gamesHtml += `
                    <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-orange-100 transform transition duration-300 hover:scale-105">
                        <div class="h-32 bg-gray-200 relative">
                            <img src="${escapeJsStringForHtmlAttribute(game.image_url || 'https://via.placeholder.com/300x200?text=Game')}" class="w-full h-full object-cover">
                            <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/70 to-transparent p-2">
                                <h3 class="text-white font-bold text-sm shadow-black drop-shadow-md">${escapeJsStringForHtmlAttribute(game.title)}</h3>
                            </div>
                        </div>
                        <div class="p-3">
                            <button onclick="checkLoginAndAct(event, 'playGameUrl', '${escapeJsStringForHtmlAttribute(game.game_url)}')" class="w-full text-white bg-gradient-to-r from-red-600 to-yellow-500 hover:from-red-700 hover:to-yellow-600 py-2 rounded-lg font-bold text-sm shadow-md">
                                <i class="fas fa-play mr-1"></i> PLAY NOW
                            </button>
                        </div>
                    </div>
                `;
            });
        });
        gamesByCategoryContainer.innerHTML = gamesHtml; // Replace spinner with actual content
    });

    // NEW: Load Live Game Info
    const liveEventContentEl = document.getElementById('live-event-content');
    db.ref('live_game').on('value', snap => {
        const liveGameData = snap.val();
        if (liveGameData && liveGameData.status !== 'inactive' && (liveGameData.title || liveGameData.url)) {
            let statusText = '';
            let actionButton = '';
            if (liveGameData.status === 'live') {
                statusText = '<span class="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-semibold animate-pulse">LIVE NOW</span>';
                actionButton = `<a href="${escapeJsStringForHtmlAttribute(liveGameData.url)}" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-600 transition">Watch Live <i class="fas fa-play-circle ml-1"></i></a>`;
            } else if (liveGameData.status === 'upcoming') {
                statusText = '<span class="bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-semibold">UPCOMING</span>';
                if (liveGameData.url) {
                    actionButton = `<a href="${escapeJsStringForHtmlAttribute(liveGameData.url)}" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-600 transition">View Details <i class="fas fa-info-circle ml-1"></i></a>`;
                }
            }
            liveEventContentEl.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-bold text-lg text-gray-800">${escapeJsStringForHtmlAttribute(liveGameData.title || 'Live Event')}</h3>
                    ${statusText}
                </div>
                <p class="text-sm text-gray-600">${escapeJsStringForHtmlAttribute(liveGameData.description || 'No description available.')}</p>
                ${actionButton}
            `;
        } else {
            liveEventContentEl.innerHTML = `<p class="text-center text-gray-500 italic py-4">No live or upcoming event information available.</p>`;
        }
    });

    // NEW: Load Video Content Sections
    const videoSectionsListHomeEl = document.getElementById('video-sections-list-home');
    db.ref('video_sections').on('value', snap => {
        const sections = snap.val();
        if (!sections) {
            videoSectionsListHomeEl.innerHTML = `<p class="text-center text-gray-500 italic py-4">No video content sections available yet.</p>`;
            return;
        }
        let sectionsHtml = '';
        const sectionsArray = Object.entries(sections).map(([id, section]) => ({id, ...section}));
        sectionsArray.sort((a, b) => a.title.localeCompare(b.title)); // Sort alphabetically

        sectionsArray.forEach(section => {
            sectionsHtml += `
                <div class="bg-white p-3 rounded-xl shadow-sm border border-green-100 flex items-center justify-between cursor-pointer hover:bg-green-50 transition-colors">
                    <div>
                        <h4 class="font-bold text-gray-800">${escapeJsStringForHtmlAttribute(section.title)}</h4>
                        <p class="text-sm text-gray-600">${escapeJsStringForHtmlAttribute(section.description || 'No description')}</p>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </div>
            `;
        });
        videoSectionsListHomeEl.innerHTML = sectionsHtml;
    });


    const listEl = document.getElementById('tournament-list');
    listEl.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin fa-2x text-red-500"></i></div>`;

    const tournaments = (await db.ref('tournaments').orderByChild('status').equalTo('Upcoming').once('value')).val();
    if (!tournaments) {
        listEl.innerHTML = `<div class="text-center text-gray-400 py-8"><p>No upcoming tournaments.</p></div>`;
    } else {
        listEl.innerHTML = Object.entries(tournaments).map(([id, t]) => {
            const isUserLoggedIn = auth.currentUser;
            const buttonText = isUserLoggedIn ? 'Join Match' : 'Login to Join';
            const buttonAction = isUserLoggedIn ? `joinTournament(event, '${escapeJsStringForHtmlAttribute(id)}', ${t.entry_fee})` : `checkLoginAndAct(event, 'joinTournament', '${escapeJsStringForHtmlAttribute(id)}', ${t.entry_fee})`;

            return `
                        <div class="bg-gradient-to-br from-red-50 to-yellow-50 rounded-xl shadow-md border border-red-100 overflow-hidden">
                            <div class="p-4 flex justify-between items-start border-b border-red-100/50">
                                <div><h3 class="font-bold text-lg text-red-900">${escapeJsStringForHtmlAttribute(t.title)}</h3><span class="text-xs font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1 rounded-full shadow-sm">${formatCurrency(t.prize_pool)} Pool</span>
                            </div>
                            <div class="p-4 grid grid-cols-2 gap-4 text-sm">
                                <div class="bg-white/60 p-2 rounded border border-red-100"><p class="text-gray-500 text-xs">Entry Fee</p><p class="font-bold text-gray-800">${formatCurrency(t.entry_fee)}</p></div>
                                <div class="bg-white/60 p-2 rounded border border-red-100"><p class="text-gray-500 text-xs">Time</p><p class="font-bold text-gray-800">${new Date(t.match_time).toLocaleDateString()}</p></div>
                            </div>
                            <div class="p-3">
                                <button onclick="${buttonAction}" class="w-full text-white bg-gradient-to-r from-red-600 to-orange-500 font-bold py-2 rounded-lg shadow-lg hover:shadow-lg transition">${buttonText}</button>
                            </div>
                        </div>`;
        }).join('');
    }
}

/**
 * Initiates playing a game URL, optionally as part of a tournament.
 * @param {string} url - The URL of the game.
 * @param {string} [tournamentId=null] - The ID of the tournament, if applicable.
 */
function playGameUrl(url, tournamentId = null) {
    if (!auth.currentUser) {
        return showToast('Login required to play!', true);
    }
    if (!url) return showToast("Game URL missing!", true);

    if (tournamentId) {
        localStorage.setItem('active_tournament_id', tournamentId);
        localStorage.setItem('game_start_time', Date.now());
    } else { // Set flag for non-tournament game play reward
        localStorage.setItem('game_played_pending', 'true');
    }
    window.location.href = url;
}

/**
 * Renders the Wallet Page content dynamically.
 * @param {HTMLElement} container - The container element for the wallet page.
 */
async function renderWalletPage(container) {
    // Check for auth.currentUser, not currentUserData, for initial login state
    if (!auth.currentUser) {
        container.innerHTML = `
                    <div class="p-4 bg-orange-50 min-h-screen flex flex-col items-center justify-center text-center">
                        <i class="fas fa-wallet fa-5x text-gray-400 mb-6"></i>
                        <p class="text-xl text-gray-700 font-semibold mb-4">Login to view your wallet balance and transactions.</p>
                        <button onclick="toggleModal('authModal', true)" class="text-white bg-gradient-to-r from-red-600 to-yellow-500 hover:from-red-700 hover:to-yellow-600 p-3 rounded-lg font-bold shadow-md transition-all">
                            Login / Sign Up
                        </button>
                    </div>`;
        return;
    }

    container.innerHTML = `<div class="p-4 bg-orange-50 min-h-screen">
                <h2 class="text-2xl font-black mb-4 text-gray-800">Wallet</h2>
                <div class="bg-gradient-to-br from-red-600 to-yellow-500 text-white p-8 rounded-2xl text-center shadow-lg mb-6 relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-full bg-white/10" style="clip-path: polygon(0 0, 100% 0, 100% 20%, 0 100%);"></div>
                    <p class="text-lg text-red-100 relative z-10">Current Balance</p>
                    <p id="wallet-main-balance" class="text-5xl font-black tracking-tight relative z-10 drop-shadow-md">${formatCurrency(currentUserData?.wallet_balance || 0)}</p>
                </div>
                <div class="flex gap-4 mb-8">
                    <button onclick="toggleModal('addMoneyModal', true)" class="flex-1 text-white bg-green-500 hover:bg-green-600 font-bold p-4 rounded-xl shadow-md transition transform active:scale-95"><i class="fas fa-plus-circle mr-2"></i>Add Cash</button>
                    <button onclick="toggleModal('withdrawMoneyModal', true)" class="flex-1 text-white bg-blue-500 hover:bg-blue-600 font-bold p-4 rounded-xl shadow-md transition transform active:scale-95"><i class="fas fa-arrow-circle-down mr-2"></i>Withdraw</button>
                </div>
                <div>
                    <h3 class="text-lg font-bold mb-3 text-gray-700">Transaction History</h3>
                    <div id="transaction-list" class="space-y-3 pb-20"></div>
                </div>
            </div>`;

    const listEl = document.getElementById('transaction-list');
    if (!listEl) {
        console.error("transaction-list element not found in renderWalletPage!");
        return;
    }
    listEl.innerHTML = `<p class="text-center text-gray-400 py-8 italic">Loading transactions...</p>`;

    // Ensure currentUserData is available before proceeding
    if (!currentUserData || !currentUserData.uid) {
        listEl.innerHTML = `<p class="text-center text-red-400 py-8 italic">User data not fully loaded. Please refresh or try again.</p>`;
        return;
    }

    const transactionsRef = db.ref(`transactions/${currentUserData.uid}`).orderByChild('created_at').limitToLast(20);
    const pendingDepositsRef = db.ref(`pending_deposits/${currentUserData.uid}`).orderByChild('created_at').limitToLast(10);
    const pendingWithdrawalsRef = db.ref(`pending_withdrawals/${currentUserData.uid}`).orderByChild('created_at').limitToLast(10);

    Promise.all([
        transactionsRef.once('value'),
        pendingDepositsRef.once('value'),
        pendingWithdrawalsRef.once('value')
    ])
        .then(([transactionsSnap, pendingDepositsSnap, pendingWithdrawalsSnap]) => {
            let allRecords = [];

            transactionsSnap.forEach(childSnap => {
                allRecords.push({ id: childSnap.key, ...childSnap.val() });
            });

            pendingDepositsSnap.forEach(childSnap => {
                const deposit = childSnap.val();
                allRecords.push({
                    id: childSnap.key,
                    amount: deposit.amount,
                    type: `deposit_${deposit.status}`,
                    description: `Deposit (${deposit.source_details || 'N/A'}) (TID: ${deposit.tid || 'N/A'})`,
                    status_text: deposit.status.charAt(0).toUpperCase() + deposit.status.slice(1),
                    created_at: deposit.created_at
                });
            });

            pendingWithdrawalsSnap.forEach(childSnap => {
                const withdrawal = childSnap.val();
                allRecords.push({
                    id: childSnap.key,
                    amount: withdrawal.amount,
                    type: `withdrawal_${withdrawal.status}`,
                    description: `Withdrawal to ${withdrawal.withdrawal_account_type || ''} (${withdrawal.withdrawal_account})`,
                    status_text: withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1),
                    created_at: withdrawal.created_at
                });
            });


            if (allRecords.length === 0) {
                listEl.innerHTML = `<p class="text-center text-gray-400 py-8 italic">No transactions yet.</p>`;
                return;
            }

            allRecords.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            listEl.innerHTML = allRecords.map(t => {
                let bgColorClass, borderColorClass, amountClass, descriptionText;
                let icon = '';
                let statusBadge = '';

                if (t.type === 'credit') {
                    bgColorClass = 'bg-green-50';
                    borderColorClass = 'border-green-200';
                    amountClass = 'text-green-600';
                    descriptionText = t.description;
                    icon = `<i class="fas fa-arrow-up text-green-500 mr-2"></i>`;
                } else if (t.type === 'debit') {
                    bgColorClass = 'bg-red-50';
                    borderColorClass = 'border-red-200';
                    amountClass = 'text-red-600';
                    descriptionText = t.description;
                    icon = `<i class="fas fa-arrow-down text-red-500 mr-2"></i>`;
                } else if (t.type.startsWith('deposit_')) {
                    if (t.type === 'deposit_pending') {
                        bgColorClass = 'bg-yellow-50';
                        borderColorClass = 'border-yellow-200';
                        amountClass = 'text-yellow-600';
                        icon = `<i class="fas fa-hourglass-half text-yellow-500 mr-2"></i>`;
                    } else if (t.type === 'deposit_approved') {
                        bgColorClass = 'bg-green-50';
                        borderColorClass = 'border-green-200';
                        amountClass = 'text-green-600';
                        icon = `<i class="fas fa-check-circle text-green-500 mr-2"></i>`;
                    } else if (t.type === 'deposit_rejected') {
                        bgColorClass = 'bg-red-50';
                        borderColorClass = 'border-red-200';
                        amountClass = 'text-red-600';
                        icon = `<i class="fas fa-times-circle text-red-500 mr-2"></i>`;
                    }
                    descriptionText = t.description;
                    statusBadge = `<span class="text-xs ${t.type === 'deposit_pending' ? 'text-yellow-600' : (t.type === 'deposit_approved' ? 'text-green-600' : 'text-red-600')} block mt-1">${t.status_text}</span>`;
                } else if (t.type.startsWith('withdrawal_')) {
                    if (t.type === 'withdrawal_pending') {
                        bgColorClass = 'bg-blue-50';
                        borderColorClass = 'border-blue-200';
                        amountClass = 'text-blue-600';
                        icon = `<i class="fas fa-hourglass-half text-blue-500 mr-2"></i>`;
                    } else if (t.type === 'withdrawal_completed') {
                        bgColorClass = 'bg-green-50';
                        borderColorClass = 'border-green-200';
                        amountClass = 'text-green-600';
                        icon = `<i class="fas fa-check-circle text-green-500 mr-2"></i>`;
                    } else if (t.type === 'withdrawal_cancelled') {
                        bgColorClass = 'bg-red-50';
                        borderColorClass = 'border-red-200';
                        amountClass = 'text-red-600';
                        icon = `<i class="fas fa-times-circle text-red-500 mr-2"></i>`;
                    }
                    descriptionText = t.description;
                    statusBadge = `<span class="text-xs ${t.type === 'withdrawal_pending' ? 'text-blue-600' : (t.type === 'withdrawal_completed' ? 'text-green-600' : 'text-red-600')} block mt-1">${t.status_text}</span>`;
                }

                return `
                            <div class="p-4 rounded-xl flex justify-between items-center shadow-sm border ${bgColorClass} ${borderColorClass}">
                                <div>
                                    <p class="font-bold text-sm text-gray-800">${icon}${descriptionText}</p>
                                    <p class="text-xs text-gray-500 mt-1">${new Date(t.created_at).toLocaleString()}</p>
                                </div>
                                <p class="font-black text-lg ${amountClass}">
                                    ${t.type === 'credit' || t.type === 'deposit_approved' ? '+' : (t.type === 'deposit_rejected' || t.type === 'withdrawal_cancelled' ? '' : '-')}${formatCurrency(t.amount)}
                                    ${statusBadge}
                                </p>
                            </div>`;
            }).join('');
        })
        .catch(error => {
            console.error("Error fetching transactions:", error);
            listEl.innerHTML = `<p class="text-center text-red-400 py-8 italic">Error loading transactions. Check console for details.</p>`;
        });
}

/**
 * Renders the My Tournaments Page content dynamically.
 * @param {HTMLElement} container - The container element for the My Tournaments page.
 */
async function renderMyTournamentsPage(container) {
    if (!auth.currentUser) {
        container.innerHTML = `
                    <div class="p-4 bg-orange-50 min-h-screen flex flex-col items-center justify-center text-center">
                        <i class="fas fa-trophy fa-5x text-gray-400 mb-6"></i>
                        <p class="text-xl text-gray-700 font-semibold mb-4">Login to view your joined tournaments and match history.</p>
                        <button onclick="toggleModal('authModal', true)" class="text-white bg-gradient-to-r from-red-600 to-yellow-500 hover:from-red-700 hover:to-yellow-600 p-3 rounded-lg font-bold shadow-md transition-all">
                            Login / Sign Up
                        </button>
                    </div>`;
        return;
    }

    container.innerHTML = `<div class="p-4 bg-orange-50 min-h-screen"><h2 class="text-2xl font-black mb-4 text-gray-800">My Matches</h2><div class="flex border-b border-gray-300 mb-4"><button id="upcomingLiveTab" class="flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600">Upcoming/Live</button><button id="completedTab" class="flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent">Completed</button></div><div id="upcomingLiveContent" class="space-y-4"></div><div id="completedContent" class="space-y-4" style="display:none;"></div></div>`;
    attachMyTournamentsListeners();

    const allTournaments = (await db.ref('tournaments').once('value')).val() || {};
    let upcomingHtml = '', completedHtml = '', hasUpcoming = false, hasCompleted = false;
    for (const tId in allTournaments) {
        // Ensure currentUserData exists and has uid before attempting to read participants
        if (!currentUserData || !currentUserData.uid) {
            console.warn("currentUserData or UID missing in renderMyTournamentsPage, skipping participant check.");
            continue;
        }
        const participant = (await db.ref(`participants/${tId}/${currentUserData.uid}`).once('value')).val();
        if (participant) {
            const t = allTournaments[tId];
            if (t.status !== 'Completed') {
                hasUpcoming = true;
                upcomingHtml += `<div class="bg-white border-l-4 border-red-500 rounded-lg p-4 shadow-md">
                            <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-lg text-gray-800">${escapeJsStringForHtmlAttribute(t.title)}</h3><span class="text-xs font-bold ${t.status === 'Live' ? 'text-white bg-red-600 animate-pulse' : 'text-yellow-800 bg-yellow-200'} px-2 py-1 rounded-full">${t.status}</span></div>
                            <p class="text-sm text-gray-500 mb-2">${escapeJsStringForHtmlAttribute(t.game_name)}</p>
                            ${t.status === 'Live' ? `
                                ${t.room_id ? `<div class="bg-gray-100 p-3 rounded text-sm mb-3"><p><span class="font-bold text-gray-600">Room ID:</span> ${escapeJsStringForHtmlAttribute(t.room_id)}</p><p><span class="font-bold text-gray-600">Pass:</span> ${escapeJsStringForHtmlAttribute(t.room_password)}</p></div>` : ''}
                                <button onclick="checkLoginAndAct(event, 'playGameUrl', '${escapeJsStringForHtmlAttribute(t.game_url)}', '${escapeJsStringForHtmlAttribute(tId)}')" class="w-full text-white bg-gradient-to-r from-green-500 to-green-600 font-bold py-3 rounded-lg shadow-lg hover:shadow-xl transition transform active:scale-95 animate-pulse">PLAY LIVE MATCH</button>
                            ` : `<p class="text-xs text-gray-400 italic mb-3">Room details appear here when Live.</p>`}
                        </div>`;
            } else {
                hasCompleted = true;
                completedHtml += `<div class="bg-gray-100 border border-gray-200 rounded-lg p-4 flex justify-between items-center shadow-sm opacity-80">
                            <div><h3 class="font-bold text-gray-700">${escapeJsStringForHtmlAttribute(t.title)}</h3><p class="text-xs text-gray-500">${new Date(t.match_time).toLocaleDateString()}</p></div>
                            <span class="font-bold ${participant.status === 'Winner' ? 'text-green-600' : 'text-gray-500'}">${participant.status || 'Played'}</span>
                        </div>`;
            }
        }
    }
    document.getElementById('upcomingLiveContent').innerHTML = hasUpcoming ? upcomingHtml : `<p class="text-center text-gray-500 py-8">No matches joined.</p>`;
    document.getElementById('completedContent').innerHTML = hasCompleted ? completedHtml : `<p class="text-center text-gray-500 py-8">No history available.</p>`;
}

/**
 * Renders the Notifications Page content dynamically.
 * @param {HTMLElement} container - The container element for the notifications page.
 */
async function renderNotificationsPage(container) {
    if (!auth.currentUser) {
        container.innerHTML = `
            <div class="p-4 bg-orange-50 min-h-screen flex flex-col items-center justify-center text-center">
                <i class="fas fa-bell fa-5x text-gray-400 mb-6"></i>
                <p class="text-xl text-gray-700 font-semibold mb-4">Login to view your notifications.</p>
                <button onclick="toggleModal('authModal', true)" class="text-white bg-gradient-to-r from-red-600 to-yellow-500 hover:from-red-700 hover:to-yellow-600 p-3 rounded-lg font-bold shadow-md transition-all">
                    Login / Sign Up
                </button>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="p-4 bg-orange-50 min-h-screen">
            <h2 class="text-2xl font-black mb-4 text-gray-800">Your Notifications</h2>
            <div class="flex justify-end mb-4">
                <button onclick="markAllNotificationsAsRead()" class="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors">
                    Mark All as Read
                </button>
            </div>
            <div id="notifications-list" class="space-y-3 pb-20">
                <p class="text-center text-gray-400 italic">Loading notifications...</p>
            </div>
        </div>`;

    const listEl = document.getElementById('notifications-list');
    const userId = auth.currentUser.uid;

    // Listen for real-time updates to notifications
    db.ref(`notifications/${userId}`).orderByChild('timestamp').on('value', snapshot => {
        const notificationsData = snapshot.val();
        if (!notificationsData) {
            listEl.innerHTML = `<p class="text-center text-gray-400 italic">No notifications yet.</p>`;
            return;
        }

        const notificationsArray = [];
        for (const id in notificationsData) {
            notificationsArray.push({ id, ...notificationsData[id] });
        }

        // Sort by timestamp (latest first)
        notificationsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        listEl.innerHTML = notificationsArray.map(notif => {
            const isUnread = notif.status === 'unread';
            const itemClass = isUnread ? 'notification-item unread' : 'notification-item';
            const timeAgo = formatTimeAgo(notif.timestamp);

            return `
                <div class="${itemClass} p-4 rounded-xl shadow-sm border border-orange-100 cursor-pointer" onclick="markNotificationAsRead('${escapeJsStringForHtmlAttribute(notif.id)}')">
                    <h3 class="font-bold text-gray-800">${escapeJsStringForHtmlAttribute(notif.title || 'Notification')}</h3>
                    <p class="text-sm text-gray-600 mt-1">${escapeJsStringForHtmlAttribute(notif.message)}</p>
                    <p class="text-xs text-gray-500 mt-2">${timeAgo}</p>
                </div>
            `;
        }).join('');
    });
}

/**
 * Formats a timestamp into a human-readable "time ago" string.
 * @param {string} timestamp - The ISO string timestamp.
 * @returns {string} The formatted time ago string.
 */
function formatTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffSeconds = Math.round((now.getTime() - past.getTime()) / 1000);

    const minutes = Math.round(diffSeconds / 60);
    const hours = Math.round(diffSeconds / 3600);
    const days = Math.round(diffSeconds / (3600 * 24));

    if (diffSeconds < 60) return `${diffSeconds} sec ago`;
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
}


/**
 * Marks a single notification as read in Firebase.
 * @param {string} notificationId - The ID of the notification to mark as read.
 */
async function markNotificationAsRead(notificationId) {
    if (!auth.currentUser || !notificationId) return;
    try {
        await db.ref(`notifications/${auth.currentUser.uid}/${notificationId}`).update({ status: 'read', read_at: new Date().toISOString() });
        // UI will update automatically due to real-time listener
    } catch (error) {
        console.error("Error marking notification as read:", error);
        showToast('Failed to mark notification as read.', true);
    }
}

/**
 * Marks all unread notifications for the current user as read.
 */
async function markAllNotificationsAsRead() {
    if (!auth.currentUser) return;
    try {
        const unreadSnap = await db.ref(`notifications/${auth.currentUser.uid}`).orderByChild('status').equalTo('unread').once('value');
        const updates = {};
        unreadSnap.forEach(childSnap => {
            updates[`notifications/${auth.currentUser.uid}/${childSnap.key}/status`] = 'read';
            updates[`notifications/${auth.currentUser.uid}/${childSnap.key}/read_at`] = new Date().toISOString();
        });
        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
            showToast('All notifications marked as read!');
        } else {
            showToast('No unread notifications to mark.', false);
        }
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        showToast('Failed to mark all notifications as read.', true);
    }
}


/**
 * Renders the Profile Page content dynamically.
 * @param {HTMLElement} container - The container element for the profile page.
 */
function renderProfilePage(container) {
    if (!auth.currentUser) {
        container.innerHTML = `
                    <div class="p-4 bg-orange-50 min-h-screen flex flex-col items-center justify-center text-center">
                        <i class="fas fa-user-cog fa-5x text-gray-400 mb-6"></i>
                        <p class="text-xl text-gray-700 font-semibold mb-4">Login to view and manage your profile.</p>
                        <button onclick="toggleModal('authModal', true)" class="text-white bg-gradient-to-r from-red-600 to-yellow-500 hover:from-red-700 hover:to-yellow-600 p-3 rounded-lg font-bold shadow-md transition-all">
                            Login / Sign Up
                        </button>
                    </div>`;
        return;
    }

    // Ensure currentUserData is initialized before accessing properties
    const userReferralCode = currentUserData?.username || '';
    const referralsEarned = currentUserData?.referrals_earned_count || 0;

    container.innerHTML = `
                <div class="p-4 space-y-6 bg-orange-50 min-h-screen">
                    <h2 class="text-2xl font-black mb-4 text-gray-800">Profile & Settings</h2>

                    <div id="mainProfileView" class="space-y-6">
                        <!-- User Profile Details -->
                        <div class="bg-white border border-orange-100 p-6 rounded-xl shadow-md text-center">
                            <div class="w-20 h-20 bg-gradient-to-br from-red-500 to-yellow-500 rounded-full mx-auto flex items-center justify-center text-3xl text-white font-bold mb-3">
                                ${currentUserData?.username ? currentUserData.username[0].toUpperCase() : 'U'}
                            </div>
                            <p class="text-xl font-bold text-gray-800">${escapeJsStringForHtmlAttribute(currentUserData?.username || 'User')}</p>
                            <p class="text-sm text-gray-500">${escapeJsStringForHtmlAttribute(currentUserData?.email || auth.currentUser?.email || 'N/A')}</p>
                            <div class="mt-4 pt-4 border-t border-orange-100">
                                <p class="text-md font-semibold text-gray-700">Referrals Joined: <span class="font-bold text-green-600" id="profile-referrals-count">${referralsEarned}</span></p>
                            </div>
                        </div>

                        <!-- Referral Code Section (Updated) -->
                        <div class="bg-white border border-orange-100 p-6 rounded-xl shadow-md space-y-4">
                            <h3 class="font-bold text-lg text-gray-800">Invite Friends & Earn!</h3>
                            <p class="text-sm text-gray-600">Share your username as referral code. You get <span class="font-bold text-green-600">PKR <span id="referral-bonus-text">${referralBonusAmount}</span></span> for every friend who signs up!</p>
                            <div class="flex items-center space-x-2">
                                <input type="text" id="referralLinkInput" value="${escapeJsStringForHtmlAttribute(userReferralCode)}" readonly class="flex-1 p-2 bg-gray-100 rounded border border-gray-200 text-sm overflow-hidden text-ellipsis">
                                <button onclick="copyReferralLink()" class="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-600 transition">Copy Code</button>
                            </div>
                            <p class="text-xs text-gray-500 italic mt-2">Friends must enter your username during signup to count as your referral.</p>
                        </div>

                        <!-- Download App Button Section -->
                        <div class="bg-gradient-to-r from-red-600 to-red-700 text-white p-6 rounded-xl shadow-lg text-center mt-6">
                            <h3 class="font-bold text-xl mb-3">Get the Full App Experience!</h3>
                            <p class="text-sm text-red-100 mb-4">Download our app from the Play Store for exclusive features and a smoother experience.</p>
                            <a href="https://play.google.com/store/apps/details?id=com.edu.my" target="_blank" rel="noopener noreferrer"
                               class="inline-block bg-white text-red-600 px-6 py-3 rounded-full font-bold shadow-md hover:shadow-xl transition transform hover:scale-105 active:scale-95">
                                <i class="fab fa-google-play mr-2"></i> Download on Play Store
                            </a>
                        </div>

                        <!-- Claim Daily Bonus Button -->
                        <button onclick="claimDailyBonus()" class="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white p-3 rounded-xl font-bold shadow-md hover:from-green-600 hover:to-blue-600 transition">
                            <i class="fas fa-gift mr-2"></i> Claim Daily Bonus
                        </button>
                        <p class="text-xs text-gray-600 text-center mt-2">
                            Claim <strong>PKR 10 - 1000</strong> daily! <br>
                            Withdrawal requires <strong>10 referrals</strong> who each deposited <strong>PKR 100</strong>.
                        </p>
                        
                        <!-- Add New Game Button -->
                        <button onclick="toggleModal('addGameModal', true)" class="w-full bg-gradient-to-r from-orange-500 to-yellow-500 text-white p-3 rounded-xl font-bold shadow-md hover:from-orange-600 hover:to-yellow-600 transition">
                            <i class="fas fa-plus-circle mr-2"></i> Add New Game
                        </button>

                        <!-- Reset Password Button -->
                        <button onclick="changePassword()" class="w-full bg-white text-gray-700 border border-gray-300 p-3 rounded-xl font-bold shadow-sm">Reset Password</button>

                        <!-- NEW MENU for Policies & Contact -->
                        <div id="policyMenuButtons" class="space-y-4 pt-4 border-t border-orange-100">
                            <button class="w-full bg-white text-gray-700 border border-gray-300 p-4 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95" onclick="showPolicySection('privacy_policy')">
                                <span><i class="fas fa-shield-alt mr-3 text-blue-500"></i>Privacy Policy</span> <i class="fas fa-chevron-right text-gray-400"></i>
                            </button>
                            <button class="w-full bg-white text-gray-700 border border-gray-300 p-4 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95" onclick="showPolicySection('about_us')">
                                <span><i class="fas fa-info-circle mr-3 text-green-500"></i>About Us</span> <i class="fas fa-chevron-right text-gray-400"></i>
                            </button>
                            <button class="w-full bg-white text-gray-700 border border-gray-300 p-4 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95" onclick="showPolicySection('terms_conditions')">
                                <span><i class="fas fa-file-contract mr-3 text-purple-500"></i>Terms & Conditions</span> <i class="fas fa-chevron-right text-gray-400"></i>
                            </button>
                            <button class="w-full bg-white text-gray-700 border border-gray-300 p-4 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95" onclick="showPolicySection('deposit_rules')">
                                <span><i class="fas fa-money-bill-wave mr-3 text-orange-500"></i>Deposit Rules</span> <i class="fas fa-chevron-right text-gray-400"></i>
                            </button>
                            <button class="w-full bg-white text-gray-700 border border-gray-300 p-4 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95" onclick="showPolicySection('withdrawal_rules')">
                                <span><i class="fas fa-cash-register mr-3 text-teal-500"></i>Withdrawal Rules</span> <i class="fas fa-chevron-right text-gray-400"></i>
                            </button>
                            <button class="w-full bg-white text-gray-700 border border-gray-300 p-4 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95" onclick="showMySupportMessages()">
                                <span><i class="fas fa-inbox mr-3 text-gray-500"></i>My Support Messages</span> <i class="fas fa-chevron-right text-gray-400"></i>
                            </button>
                        </div>

                        <button onclick="logout()" class="w-full text-white bg-gradient-to-r from-red-500 to-red-700 p-3 rounded-xl font-bold shadow-md">Logout</button>
                    </div>

                    <!-- Policy Content Sections (initially hidden) -->
                    <div id="policyContentArea" class="space-y-4" style="display:none;">
                        <button onclick="showMainProfileView()" class="w-full bg-gray-200 text-gray-700 p-3 rounded-xl font-bold shadow-sm mb-4 transition transform hover:scale-105 active:scale-95"><i class="fas fa-arrow-left mr-2"></i>Back to Profile</button>

                        <div id="policy-content-display" class="bg-white border border-orange-100 p-6 rounded-xl shadow-md" style="display:none;">
                            <h3 class="font-bold text-lg mb-4 text-gradient" id="policy-display-title"></h3>
                            <div class="text-gray-700 text-sm leading-relaxed space-y-3" id="policy-display-body"></div>
                        </div>

                        <!-- NEW: My Support Messages Section -->
                        <div id="mySupportMessagesSection" class="bg-white border border-orange-100 p-6 rounded-xl shadow-md" style="display:none;">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-bold text-lg text-gradient">My Support Messages</h3>
                                <button onclick="toggleModal('contactUsModal', true)" class="bg-red-500 text-white px-3 py-2 rounded-lg text-xs font-bold shadow"><i class="fas fa-plus-circle mr-1"></i> New Message</button>
                            </div>
                            <div id="user-contact-messages-list" class="space-y-3">
                                <p class="text-center text-gray-400 italic">Loading your messages...</p>
                            </div>
                        </div>
                    </div>
                </div>`;
    updateProfileContent();
}

/**
 * Shows a specific policy section by hiding the main profile view.
 * @param {string} contentKey - The key for the policy content in Firebase.
 */
function showPolicySection(contentKey) {
    document.getElementById('mainProfileView').style.display = 'none';
    document.getElementById('policyContentArea').style.display = 'block';

    document.getElementById('policy-content-display').style.display = 'none';
    document.getElementById('mySupportMessagesSection').style.display = 'none';

    document.getElementById('policy-content-display').style.display = 'block';

    db.ref(`app_content/${contentKey}`).once('value').then(contentSnap => {
        const contentData = contentSnap.val();
        if (contentData) {
            document.getElementById('policy-display-title').textContent = contentData.displayTitle;
            document.getElementById('policy-display-body').innerHTML = contentData.body.replace(/\n/g, '<br>');
        } else {
            document.getElementById('policy-display-title').textContent = 'Content Not Found';
            document.getElementById('policy-display-body').textContent = 'The requested content is not available. Please contact support.';
        }
        window.scrollTo(0, 0);
    }).catch(error => {
        console.error("Error fetching policy content:", error);
        showToast("Failed to load policy content.", true);
    });
}

/**
 * Displays the user's support messages.
 */
async function showMySupportMessages() {
    document.getElementById('mainProfileView').style.display = 'none';
    document.getElementById('policyContentArea').style.display = 'block';

    document.getElementById('policy-content-display').style.display = 'none';

    document.getElementById('mySupportMessagesSection').style.display = 'block';

    const listEl = document.getElementById('user-contact-messages-list');
    listEl.innerHTML = `<p class="text-center text-gray-400 italic">Loading your messages...</p>`;

    if (!auth.currentUser) {
        listEl.innerHTML = `<p class="text-center text-red-500 italic">Login required to view messages.</p>`;
        return;
    }

    db.ref('contact_messages').orderByChild('userId').equalTo(auth.currentUser.uid).on('value', snap => {
        const messages = snap.val();

        if (!messages) {
            listEl.innerHTML = `<p class="text-center text-gray-400 italic">You have not sent any messages yet.</p>`;
            return;
        }

        let messagesHtml = '';
        const messageArray = Object.entries(messages).map(([id, msg]) => ({id, ...msg}));
        messageArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const msg of messageArray) {
            const statusClass = msg.status === 'pending' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
            const icon = msg.status === 'pending' ? 'fas fa-hourglass-half' : 'fas fa-check-circle';
            const adminReplyHtml = msg.adminReply
                ? `<div class="bg-blue-50 p-2 rounded-md mt-2 text-sm border border-blue-200"><strong class="text-blue-700">Admin Reply:</strong> ${escapeJsStringForHtmlAttribute(msg.adminReply).replace(/\n/g, '<br>')}</div>`
                : `<p class="text-xs text-gray-500 italic mt-2">Admin has not replied yet.</p>`;

            messagesHtml += `
                <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div class="flex justify-between items-center mb-2">
                        <p class="font-bold text-gray-800">${escapeJsStringForHtmlAttribute(msg.subject)}</p>
                        <span class="text-xs font-semibold px-2 py-1 rounded-full ${statusClass}"><i class="${icon} mr-1"></i>${msg.status.toUpperCase()}</span>
                    </div>
                    <p class="text-sm text-gray-600">Message: <span class="block mt-1 bg-gray-50 p-2 rounded text-xs">${escapeJsStringForHtmlAttribute(msg.message).replace(/\n/g, '<br>')}</span></p>
                    ${adminReplyHtml}
                    <p class="text-xs text-gray-400 mt-2">Sent: ${new Date(msg.timestamp).toLocaleString()}</p>
                </div>
            `;
        }
        listEl.innerHTML = messagesHtml;
    });

    window.scrollTo(0, 0);
}

/**
 * Shows the main profile view and hides policy/messages sections.
 */
function showMainProfileView() {
    document.getElementById('mainProfileView').style.display = 'block';
    document.getElementById('policyContentArea').style.display = 'none';
    document.getElementById('policy-content-display').style.display = 'none';
    document.getElementById('mySupportMessagesSection').style.display = 'none';
    window.scrollTo(0, 0);
}

/**
 * Updates dynamic content on the profile page based on `currentUserData`.
 */
function updateProfileContent() {
    if (currentUserData) {
        const usernameEl = document.querySelector('#mainProfileView .text-xl.font-bold');
        if (usernameEl) usernameEl.textContent = currentUserData.username || 'User';
        const emailEl = document.querySelector('#mainProfileView .text-sm.text-gray-500');
        if (emailEl) emailEl.textContent = currentUserData.email || auth.currentUser?.email || 'N/A';

        // Update profile page referral count
        const referralsEarnedEl = document.getElementById('profile-referrals-count'); // Using new ID
        if (referralsEarnedEl) {
            const countToDisplay = currentUserData.referrals_earned_count || 0;
            referralsEarnedEl.textContent = countToDisplay;
        }

        const referralLinkInput = document.getElementById('referralLinkInput');
        if (referralLinkInput) {
            referralLinkInput.value = currentUserData.username || '';
        }

        const referralBonusTextEl = document.getElementById('referral-bonus-text');
        if (referralBonusTextEl) {
            referralBonusTextEl.textContent = referralBonusAmount;
        }

        const withdrawAmountInput = document.getElementById('withdraw-amount');
        if (withdrawAmountInput) {
            withdrawAmountInput.placeholder = `Enter amount min ${minWithdrawalAmount} (PKR)`;
        }

        const adminDepositNumEl = document.getElementById('admin-deposit-number');
        if (adminDepositNumEl) {
            adminDepositNumEl.textContent = adminDepositNumber;
        }
    } else {
        console.warn("DEBUG: updateProfileContent called but currentUserData is null.");
    }
}

// NOTE: The `generateReferralLink(uid)` function is not strictly needed anymore as the referral code is just the username.
// Keeping it for completeness if needed for a different "link" format later.
function generateReferralLink(uid) {
    return currentUserData?.username || '';
}

/**
 * Copies the referral username to the clipboard.
 */
function copyReferralLink() {
    const referralLinkInput = document.getElementById('referralLinkInput');
    if (referralLinkInput) {
        referralLinkInput.select();
        referralLinkInput.setSelectionRange(0, 99999);
        document.execCommand('copy');
        showToast('Referral username copied!');
    }
}

/**
 * Attaches event listeners for the login/signup tabs and forms in the auth modal.
 */
function attachLoginListeners() {
    const loginTab = document.getElementById('loginTabBtnModal');
    const signupTab = document.getElementById('signupTabBtnModal');
    const loginForm = document.getElementById('loginFormModal');
    const signupForm = document.getElementById('signupFormModal');

    const signupUsernameModal = document.getElementById('signupUsernameModal');
    const usernameAvailability = document.getElementById('usernameAvailability');
    const signupSubmitBtn = document.getElementById('signupSubmitBtn');
    const signupReferralCodeModal = document.getElementById('signupReferralCodeModal');

    if (!loginTab || !signupTab || !loginForm || !signupForm || !signupUsernameModal || !usernameAvailability || !signupSubmitBtn || !signupReferralCodeModal) {
        console.warn("Auth modal elements not found, skipping attaching listeners.");
        return;
    }

    signupSubmitBtn.disabled = true;

    loginTab.addEventListener('click', () => {
        loginTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600";
        signupTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent";
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
        signupSubmitBtn.disabled = true;
        usernameAvailability.textContent = '';
        signupUsernameModal.value = '';
        signupReferralCodeModal.value = '';
    });

    signupTab.addEventListener('click', () => {
        signupTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600";
        loginTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent";
        signupForm.style.display = 'block';
        loginForm.style.display = 'none';
        signupSubmitBtn.disabled = true;
        usernameAvailability.textContent = '';
        signupUsernameModal.value = '';
        signupReferralCodeModal.value = '';
    });

    let usernameTimer;
    signupUsernameModal.addEventListener('input', () => {
        clearTimeout(usernameTimer);
        const username = signupUsernameModal.value.trim();

        if (username.length < 3) {
            usernameAvailability.textContent = 'Username must be at least 3 characters.';
            usernameAvailability.className = 'text-xs mt-1 text-red-500';
            signupSubmitBtn.disabled = true;
            return;
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
            usernameAvailability.textContent = 'Invalid characters. Use letters, numbers, _, ., -';
            usernameAvailability.className = 'text-xs mt-1 text-red-500';
            signupSubmitBtn.disabled = true;
            return;
        }

        usernameAvailability.textContent = 'Checking availability...';
        usernameAvailability.className = 'text-xs mt-1 text-gray-500';
        signupSubmitBtn.disabled = true;

        usernameTimer = setTimeout(async () => {
            const snap = await db.ref('usernames/' + username.toLowerCase()).once('value');
            if (snap.exists()) {
                usernameAvailability.textContent = 'Username is already taken.';
                usernameAvailability.className = 'text-xs mt-1 text-red-500';
                signupSubmitBtn.disabled = true;
            } else {
                usernameAvailability.textContent = 'Username is available!';
                usernameAvailability.className = 'text-xs mt-1 text-green-500';
                signupSubmitBtn.disabled = false;
            }
        }, 500);
    });

    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await auth.signInWithEmailAndPassword(e.target.loginEmailModal.value, e.target.loginPasswordModal.value);
            showToast('Login successful!');
            toggleModal('authModal', false);
            e.target.reset();
        } catch (err) {
            showToast(err.message, true);
        }
    });

    signupForm.addEventListener('submit', async e => {
        e.preventDefault();
        const { signupUsernameModal, signupEmailModal, signupPasswordModal, signupReferralCodeModal } = e.target;
        const enteredReferralCode = signupReferralCodeModal.value.trim().toLowerCase();
        const username = signupUsernameModal.value.trim(); // User-entered username, may not be lowercase yet for display purposes.

        // --- Username Already Exist Check (Final Check before Auth Create) ---
        const finalCheckSnap = await db.ref('usernames/' + username.toLowerCase()).once('value');
        if (finalCheckSnap.exists()) {
            showToast('Username is already taken. Please choose another.', true);
            signupUsernameModal.focus();
            return;
        }
        // --- END Username Already Exist Check ---

        try {
            const cred = await auth.createUserWithEmailAndPassword(signupEmailModal.value, signupPasswordModal.value);
            const newUserId = cred.user.uid;

            // --- START OF USER'S PROVIDED FINAL SIGNUP + REFERRAL CODE ---
            // The global signupBonusAmount and referralBonusAmount are used here.

            const initialSignupBonus = signupBonusAmount; // Use the globally defined signupBonusAmount
            const referralBonus = referralBonusAmount;   // Use the globally defined referralBonusAmount

            let newUserData = {
                username: username, // Keep original casing for display, but use .toLowerCase() for DB keys/lookups where needed
                email: signupEmailModal.value,
                wallet_balance: initialSignupBonus, // ALWAYS initial signup bonus (80)
                referrals_earned_count: 0,
                created_at: new Date().toISOString(),
                locked: false,
                lockReason: null
            };
            // Set the new user's own referral_code based on their username
            newUserData.referral_code = username.toLowerCase(); // Store as lowercase for consistency

            // Debugging line: Check the data being prepared BEFORE referral logic
            console.log("DEBUG (Signup): newUserData initialized with signup bonus:", { ...newUserData });

            let feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} 🎉`; // Default message for new user

            // --- REFERRAL LOGIC ---
            if (enteredReferralCode && enteredReferralCode !== username.toLowerCase()) { // Compare entered code (lowercase) with new user's username (lowercase)
                console.log("DEBUG (Signup): Referral code detected:", enteredReferralCode);

                // Use lowercase for DB lookup for referrer's UID
                const refSnap = await db.ref('usernames/' + enteredReferralCode).once('value');

                if (refSnap.exists()) {
                    const referrerUid = refSnap.val();
                    console.log("DEBUG (Signup): Referrer found. UID:", referrerUid);

                    // Referrer wallet update
                    await db.ref(`users/${referrerUid}`).transaction((data) => {
                        if (data) {
                            data.wallet_balance = (data.wallet_balance || 0) + referralBonus; // Use referralBonus
                            data.referrals_earned_count = (data.referrals_earned_count || 0) + 1;
                        }
                        return data;
                    });
                    console.log("DEBUG (Signup): Referrer wallet updated via transaction. New user wallet_balance is untouched and still:", newUserData.wallet_balance);

                    // Referrer transaction history
                    await db.ref(`transactions/${referrerUid}`).push({
                        amount: referralBonus, // Use referralBonus
                        type: "credit",
                        description: `Referral bonus from ${username}`, // Show new user's username
                        created_at: new Date().toISOString()
                    });
                    console.log("DEBUG (Signup): Referrer transaction logged.");

                    // Save referral info for new user (IMPORTANT)
                    newUserData.referred_by_username = enteredReferralCode; // Save the entered referral username
                    console.log("DEBUG (Signup): newUserData updated with referred_by_username:", newUserData.referred_by_username);
                    feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} & referrer rewarded 🎉`; // Update message
                } else {
                    console.warn("DEBUG (Signup): Invalid referral username entered. Applying only signup bonus to new user.");
                    feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} (Invalid referral code)`; // Inform user, but still apply bonus
                }
            } else if (enteredReferralCode === username.toLowerCase()) { // Compare lowercase
                console.warn("DEBUG (Signup): User tried to refer self. Applying only signup bonus to new user.");
                feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} (Cannot refer yourself)`; // Inform user, but still apply bonus
            }

            // --- SAVE USER DATA (ONLY ONCE & LAST) ---
            console.log("DEBUG (Signup): newUserData BEFORE final set for UID:", newUserId, { ...newUserData });

            const userRef = db.ref('users/' + newUserId);
            // Pehle check karo data hai ya nahi (IMPORTANT: to prevent accidental overwrite if onAuthStateChanged creates a default)
            const snap = await userRef.once('value');

            if (!snap.exists()) { // ONLY IF NOT EXISTS
                await userRef.set(newUserData);
                console.log("DEBUG (Signup): New user data saved successfully to Firebase (initially did not exist).");
            } else {
                console.warn("DEBUG (Signup): User node already existed before signupForm.set(). Updating with correct data.");
                await userRef.update({
                    wallet_balance: newUserData.wallet_balance,
                    username: newUserData.username,
                    email: newUserData.email,
                    referral_code: newUserData.referral_code,
                    referred_by_username: newUserData.referred_by_username || null,
                    created_at: newUserData.created_at,
                    locked: newUserData.locked,
                    lockReason: newUserData.lockReason
                });
                console.log("DEBUG (Signup): Existing user node updated with correct wallet_balance and other data after signup.");
            }

            // --- USERNAME MAPPING SAVE (using lowercase for consistency in 'usernames' node) ---
            await db.ref('usernames/' + username.toLowerCase()).set(newUserId);
            console.log("DEBUG (Signup): Username mapping saved for:", username.toLowerCase());

            // --- NEW USER TRANSACTION (Signup Bonus) ---
            await db.ref(`transactions/${newUserId}`).push({
                amount: initialSignupBonus,
                type: "credit",
                description: "Signup Bonus",
                created_at: new Date().toISOString()
            });
            console.log("DEBUG (Signup): Signup bonus transaction logged for new user.");

            // Now display the toast message after all database writes for the new user are done.
            showToast(feedbackMessage);

            // --- END OF USER'S PROVIDED FINAL SIGNUP + REFERRAL CODE ---

            // Reset UI
            toggleModal('authModal', false);
            signupForm.reset();
            signupReferralCodeModal.value = '';
            usernameAvailability.textContent = '';

        } catch (err) {
            console.error("Signup Error:", err);
            showToast(err.message, true);
        }
    });
}

/**
 * Handles the "Claim Daily Bonus" action.
 */
async function claimDailyBonus() {
    if (!auth.currentUser) {
        showToast('Login required to claim daily bonus!', true);
        return;
    }
    if (!currentUserData || currentUserData.locked) {
        auth.signOut();
        const lockReason = currentUserData?.lockReason ? `Reason: ${currentUserData.lockReason}` : '';
        return showToast(`Your account is locked. Please contact support. ${lockReason}`, true);
    }

    const userUid = auth.currentUser.uid;
    const userRef = db.ref(`users/${userUid}`);

    try {
        const snap = await userRef.once('value');
        const userData = snap.val();

        if (!userData) {
            showToast('User data not found. Please try logging in again.', true);
            window.open('https://toolswebsite205.blogspot.com', '_blank'); 
            return;
        }

        const lastClaimTimestamp = userData.last_daily_bonus_claim_timestamp || 0;
        const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        if (Date.now() - lastClaimTimestamp < twentyFourHours) {
            const timeLeft = twentyFourHours - (Date.now() - lastClaimTimestamp);
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            showToast(`You can claim your next daily bonus in ${hours}h ${minutes}m.`, true);
            
            window.open('https://toolswebsite205.blogspot.com', '_blank'); 
            return;
        }

        // Generate random bonus between 10 and 1000 (inclusive)
        const randomBonus = Math.floor(Math.random() * 91) + 10;
        
        let committed = false;
        await userRef.transaction(data => {
            if (data) {
                data.wallet_balance = (data.wallet_balance || 0) + randomBonus;
                data.last_daily_bonus_claim_timestamp = Date.now();
                data.daily_bonus_withdrawal_condition_active = true; 
            }
            return data;
        }, (error, _committed, snapshot) => {
            if (error) {
                console.error("Daily bonus transaction failed: ", error);
                showToast("Failed to claim daily bonus. Please try again.", true);
            } else if (_committed) {
                committed = true;
                db.ref(`transactions/${userUid}`).push({
                    amount: randomBonus,
                    type: 'credit',
                    description: 'Daily Bonus',
                    created_at: new Date().toISOString()
                });
                showToast(`💰 You claimed PKR ${randomBonus} daily bonus!`, false);
                window.open('https://toolswebsite205.blogspot.com', '_blank'); 
                if (document.getElementById('walletPage').classList.contains('active')) {
                     renderWalletPage(document.getElementById('walletPage'));
                }
                if (document.getElementById('profilePage').classList.contains('active')) {
                    updateProfileContent();
                }
            } else {
                console.log("Daily bonus transaction aborted.");
            }
        });

    } catch (error) {
        console.error("Error claiming daily bonus:", error);
        showToast('An error occurred while claiming bonus.', true);
        window.open('https://toolswebsite205.blogspot.com', '_blank');
    }
}

/**
 * Attaches event listeners for the tabs on the My Tournaments page.
 */
function attachMyTournamentsListeners() {
    const upcomingTab = document.getElementById('upcomingLiveTab');
    const completedTab = document.getElementById('completedTab');
    const upcomingContent = document.getElementById('upcomingLiveContent');
    const completedContent = document.getElementById('completedContent');

    if (!upcomingTab || !completedTab || !upcomingContent || !completedContent) {
        console.warn("My Tournaments tab elements not found, skipping attaching listeners.");
        return;
    }

    upcomingTab.addEventListener('click', () => { upcomingTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600"; completedTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent"; upcomingContent.style.display = 'block'; completedContent.style.display = 'none'; });
    completedTab.addEventListener('click', () => { completedTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600"; upcomingTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent"; completedContent.style.display = 'block'; upcomingContent.style.display = 'none'; });
}

/**
 * Handles joining a tournament. Deducts entry fee and adds user as participant.
 * @param {Event} event - The form submission event.
 * @param {string} tournamentId - The ID of the tournament.
 * @param {number} entryFee - The entry fee for the tournament.
 */
async function joinTournament(event, tournamentId, entryFee) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return showToast('Login required!', true);
    if (!currentUserData || currentUserData.locked) { 
        auth.signOut();
        const lockReason = currentUserData?.lockReason ? `Reason: ${currentUserData.lockReason}` : '';
        return showToast(`Your account is locked. Please contact support. ${lockReason}`, true);
    }
    if (currentUserData.wallet_balance < entryFee) return showToast('Insufficient balance!', true);
    if ((await db.ref(`participants/${tournamentId}/${user.uid}`).once('value')).exists()) return showToast("Already joined!", true);

    const tournamentSnap = await db.ref(`tournaments/${tournamentId}/title`).once('value');
    const tournamentTitle = tournamentSnap.val() || 'Unknown Tournament';

    const newTransactionKey = db.ref().child('transactions').child(user.uid).push().key;

    const updates = {
        [`/users/${user.uid}/wallet_balance`]: currentUserData.wallet_balance - entryFee,
        [`/participants/${tournamentId}/${user.uid}`]: { status: 'Participated', joined_at: new Date().toISOString() },
        [`/transactions/${user.uid}/${newTransactionKey}`]: { amount: entryFee, type: 'debit', description: `Entry: ${tournamentTitle}`, created_at: new Date().toISOString() }
    };
    await db.ref().update(updates);
    showToast('Joined successfully!');

    if (document.getElementById('myTournamentsPage').classList.contains('active')) {
        renderMyTournamentsPage(document.getElementById('myTournamentsPage'));
    }
}

/**
 * Handles adding money to the user's account via deposit request.
 * @param {Event} event - The form submission event.
 */
async function addMoney(event) {
    event.preventDefault();
    const amount = Number(document.getElementById('add-amount').value);
    const tid = document.getElementById('deposit-tid').value.trim();
    const sourceType = document.getElementById('deposit-source-type').value.trim();
    const acceptRulesCheckbox = document.getElementById('acceptDepositRules'); 

    if (amount <= 0) {
        return showToast('Amount must be positive!', true);
    }
    if (!tid) {
        return showToast('Please enter the Transaction ID (TID)!', true);
    }
    if (!sourceType) {
        return showToast('Please specify EasyPaisa or JazzCash!', true);
    }
    if (!acceptRulesCheckbox.checked) {
        return showToast('Please accept the Deposit Rules to proceed.', true);
    }

    const user = auth.currentUser;
    if (!user) return showToast('Login required!', true);
    if (!currentUserData || currentUserData.locked) { 
        auth.signOut();
        const lockReason = currentUserData?.lockReason ? `Reason: ${currentUserData.lockReason}` : '';
        return showToast(`Your account is locked. Please contact support. ${lockReason}`, true);
    }

    await db.ref(`pending_deposits/${user.uid}`).push({
        amount: amount,
        tid: tid,
        source_details: sourceType,
        status: 'pending',
        created_at: new Date().toISOString(),
        user_email: currentUserData.email || user.email,
        user_username: currentUserData.username || 'N/A'
    });

    showToast('Deposit request submitted! Awaiting verification.');
    toggleModal('addMoneyModal', false);
    event.target.reset();
    acceptRulesCheckbox.checked = false; // Reset checkbox after submission
}

/**
 * Handles withdrawal requests from the user's account.
 * @param {Event} event - The form submission event.
 */
async function withdrawMoney(event) {
    event.preventDefault();

    const amount = Number(document.getElementById('withdraw-amount').value);
    const withdrawNumber = document.getElementById('withdraw-number').value.trim();
    const ownerName = document.getElementById('withdraw-owner-name').value.trim();
    const accountType = document.getElementById('withdraw-account-type').value.trim();
    const acceptRulesCheckbox = document.getElementById('acceptWithdrawalRules'); 

    if (amount < minWithdrawalAmount) {
        return showToast(`Minimum withdrawal amount is ${formatCurrency(minWithdrawalAmount)}`, true);
    }

    if (!withdrawNumber || !ownerName || !accountType) {
        return showToast('Please fill all withdrawal details!', true);
    }
    if (!acceptRulesCheckbox.checked) {
        return showToast('Please accept the Withdrawal Rules to proceed.', true);
    }

    const user = auth.currentUser;
    if (!user) {
        return showToast('Login required!', true);
    }
    if (!currentUserData || currentUserData.locked) { 
        auth.signOut();
        const lockReason = currentUserData?.lockReason ? `Reason: ${currentUserData.lockReason}` : '';
        return showToast(`Your account is locked. Please contact support. ${lockReason}`, true);
    }
    if (amount > currentUserData.wallet_balance) {
        return showToast('Insufficient funds!', true);
    }

    // --- NEW WITHDRAWAL RULE CHECK FOR DAILY BONUS ---
    if (currentUserData.daily_bonus_withdrawal_condition_active) {
        console.log("DEBUG: Daily bonus withdrawal condition is active.");
        const requiredReferrals = 10; 

        if ((currentUserData.referrals_earned_count || 0) < requiredReferrals) {
            showToast(`Withdrawal requires at least ${requiredReferrals} referrals for bonus funds. You have ${currentUserData.referrals_earned_count || 0}.`, true);
            return;
        }
        
        console.log(`DEBUG: Daily bonus withdrawal conditions (referral count) met: ${currentUserData.referrals_earned_count}. Proceeding.`);
    }
    // --- END NEW WITHDRAWAL RULE CHECK ---

    const uid = user.uid;

    try {
        const withdrawalRequestKey = db.ref("pending_withdrawals/" + uid).push().key;

        await db.ref("pending_withdrawals/" + uid + "/" + withdrawalRequestKey).set({
            amount: amount,
            status: "pending",
            withdrawal_account: withdrawNumber,
            withdrawal_owner_name: ownerName,
            withdrawal_account_type: accountType,
            created_at: new Date().toISOString(),
            user_uid: uid,
            user_email: currentUserData.email || user.email,
            user_username: currentUserData.username || "N/A"
        });

        showToast("Withdrawal request sent! Waiting for admin approval. Amount will be deducted upon approval.");
        toggleModal("withdrawMoneyModal", false);
        event.target.reset();
        acceptRulesCheckbox.checked = false; // Reset checkbox after submission

    } catch (error) {
        console.error("Error during withdrawal request:", error);
        showToast("Withdrawal failed. Please try again.", true);
    }
}

/**
 * Handles adding a new game submitted by a user.
 * Deducts cost from wallet and adds game to Firebase.
 * @param {Event} event - The form submission event.
 */
async function addNewGame(event) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        showToast('Login required to add games!', true);
        return;
    }
    if (!currentUserData || currentUserData.locked) { 
        auth.signOut();
        const lockReason = currentUserData?.lockReason ? `Reason: ${currentUserData.lockReason}` : '';
        return showToast(`Your account is locked. Please contact support. ${lockReason}`, true);
    }

    const gameTitle = document.getElementById('gameTitleInput').value.trim();
    const gameImageUrl = document.getElementById('gameImageUrlInput').value.trim();
    const gameUrl = document.getElementById('gameUrlInput').value.trim();
    const gameCategory = document.getElementById('gameCategoryInput').value.trim(); 

    if (!gameTitle || !gameImageUrl || !gameUrl || !gameCategory) { 
        showToast('All fields are required!', true);
        return;
    }

    const gameCost = 100;

    if (!currentUserData || (currentUserData.wallet_balance || 0) < gameCost) {
        showToast(`Insufficient balance. You need ${formatCurrency(gameCost)} to add a game.`, true);
        return;
    }

    try {
        const userWalletRef = db.ref(`users/${user.uid}/wallet_balance`);
        const gameRef = db.ref('games').push();
        const transactionRef = db.ref(`transactions/${user.uid}`).push();

        let committed = false;
        await userWalletRef.transaction(currentBalance => {
            if (currentBalance !== null && currentBalance >= gameCost) {
                return currentBalance - gameCost;
            }
            return undefined;
        }, async (error, _committed, snapshot) => {
            if (error) {
                console.error("Transaction failed: ", error);
                showToast("Failed to deduct game cost. Please try again.", true);
            } else if (_committed) {
                committed = true;
                await gameRef.set({
                    title: gameTitle,
                    image_url: gameImageUrl,
                    game_url: gameUrl,
                    category: gameCategory, 
                    created_by: user.uid,
                    created_at: new Date().toISOString()
                });
                await transactionRef.set({
                    amount: gameCost,
                    type: 'debit',
                    description: `Cost to add new game: ${gameTitle}`,
                    created_at: new Date().toISOString()
                });

                showToast('Game added successfully and PKR 100 deducted from your wallet!');
                toggleModal('addGameModal', false);
                event.target.reset();
                loadPageContent('homePage');
            } else {
                showToast(`Transaction aborted: Insufficient balance. You need ${formatCurrency(gameCost)} to add a game.`, true);
            }
        });

    } catch (error) {
        console.error("Error adding game or deducting balance:", error);
        showToast('Failed to add game. Please try again.', true);
    }
}

/**
 * Handles sending a contact message from the user to admin.
 * @param {Event} event - The form submission event.
 */
async function sendContactMessage(event) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        showToast('Login required to send a message!', true);
        return;
    }
    if (!currentUserData || currentUserData.locked) { 
        auth.signOut();
        const lockReason = currentUserData?.lockReason ? `Reason: ${currentUserData.lockReason}` : '';
        return showToast(`Your account is locked. Please contact support. ${lockReason}`, true);
    }

    const subject = document.getElementById('contactSubject').value.trim();
    const message = document.getElementById('contactMessage').value.trim();

    if (!subject || !message) {
        showToast('Subject and Message cannot be empty!', true);
        return;
    }

    try {
        await db.ref('contact_messages').push({
            userId: user.uid,
            username: currentUserData.username || 'N/A',
            email: currentUserData.email || user.email,
            subject: subject,
            message: message,
            timestamp: new Date().toISOString(),
            status: 'pending'
        });
        showToast('Message sent successfully!');
        toggleModal('contactUsModal', false);
        event.target.reset();
    } catch (error) {
        console.error("Error sending contact message:", error);
        showToast('Failed to send message. Please try again.', true);
    }
}


/**
 * Logs the current user out of the application.
 */
function logout() {
    auth.signOut();
}

/**
 * Sends a password reset email to the current user.
 */
function changePassword() {
    const user = auth.currentUser;
    if (user && user.email) {
        auth.sendPasswordResetEmail(user.email)
            .then(() => showToast(`Password reset link sent to ${user.email}.`))
            .catch(err => showToast(err.message, true));
    } else {
        showToast("No active user or email found.", true);
    }
}

/**
 * Initializes the application once the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {

    // Attach event listeners for forms and buttons
    attachLoginListeners();
    document.getElementById('addMoneyForm').addEventListener('submit', addMoney);
    document.getElementById('withdrawMoneyForm').addEventListener('submit', withdrawMoney);
    document.getElementById('addGameForm').addEventListener('submit', addNewGame);
    document.getElementById('contactUsForm').addEventListener('submit', sendContactMessage);

    // Fetch global app settings from Firebase and update UI elements
    const appSettingsSnap = await db.ref('app_settings').once('value');
    const appSettings = appSettingsSnap.val();
    if (appSettings) {
        adminDepositNumber = appSettings.adminDepositNumber || adminDepositNumber;
        minWithdrawalAmount = appSettings.minWithdrawalAmount || minWithdrawalAmount;
        referralBonusAmount = appSettings.referralBonusAmount || referralBonusAmount;
        signupBonusAmount = appSettings.signupBonusAmount || signupBonusAmount;

        const adminDepositNumEl = document.getElementById('admin-deposit-number');
        if (adminDepositNumEl) adminDepositNumEl.textContent = adminDepositNumber;
        const withdrawAmountInput = document.getElementById('withdraw-amount');
        if (withdrawAmountInput) withdrawAmountInput.placeholder = `Enter amount min ${minWithdrawalAmount} (PKR)`;
        const referralBonusTextEl = document.getElementById('referral-bonus-text');
        if (referralBonusTextEl) referralBonusTextEl.textContent = referralBonusAmount;
    }

    // Set initial page view
    navigateTo('homePage');
});
