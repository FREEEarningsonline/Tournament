const firebaseConfig = {
    apiKey: "AIzaSyDR2OugzoVNnKN6OUKsPxC9ajldlhanteE",
    authDomain: "tournament-af6dd.firebaseapp.com",
    projectId: "tournament-af6dd",
    storageBucket: "tournament-af6dd.firebasestorage.app",
    messagingSenderId: "726964405659",
    appId: "1:726964405659:web:d03f72c2d6f8721bc98d3e",
    measurementId: "G-GK0JNQ44N7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let currentUserData = null;
let pendingAction = null; // Global to store action after login

// Dynamic app settings (will be loaded from Firebase)
let adminDepositNumber = '03105784772';
let minWithdrawalAmount = 120;
let referralBonusAmount = 25;
let signupBonusAmount = 80;


function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId)?.classList.add('active');
    loadPageContent(pageId);

    document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.getAttribute('onclick').includes(pageId);
        item.className = 'nav-item text-center transition-all duration-300';

        if (isActive) {
            item.classList.add('text-white', 'scale-125', '-translate-y-1', 'font-bold', 'drop-shadow-md');
        } else {
            item.classList.add('text-white/60', 'scale-100');
        }
    });
    window.scrollTo(0, 0);
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `fixed top-5 right-5 text-white py-2 px-4 rounded-lg shadow-lg ${isError ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-green-500 to-green-600'}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function formatCurrency(amount) {
    return `PKR ${new Intl.NumberFormat('en-PK', { minimumFractionDigits: 0 }).format(amount)}`;
}

function toggleModal(modalId, show) { document.getElementById(modalId).classList.toggle('active', show); }

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
                // The signup form will later *confirm* this by writing to DB.
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
            // set up the *real-time* listener. This will keep `currentUserData` up-to-date.
            db.ref('users/' + user.uid).on('value', snap => {
                const updatedDataFromListener = snap.val();
                if (updatedDataFromListener) {
                    currentUserData = { uid: user.uid, ...updatedDataFromListener };
                    console.log("DEBUG (Real-time listener): Updated currentUserData:", currentUserData);
                } else {
                    // This is the CRITICAL change: If the listener gets a null snapshot,
                    // we *do not* overwrite currentUserData with a new default 0.
                    // We let currentUserData retain its current (likely correct) state.
                    console.warn(`DEBUG (Real-time listener): Received null data for ${user.uid}. Ignoring to prevent overwrite.`);
                    return; // ❌ overwrite band
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

            // The code below should now run *after* the initial `currentUserData` is set.
            // If it's a new signup, the `signupForm` handler will write data, and *then* this listener will pick it up.

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
        navigateTo('homePage'); // Redirect to home or login page
    }
});

function loadPageContent(pageId) {
    const pageContainer = document.getElementById(pageId);
    if (!pageContainer) return;
    switch (pageId) {
        case 'loginPage': /* container.innerHTML = ''; */ break; // loginPage is primarily handled by authModal
        case 'homePage': renderHomePage(pageContainer); break;
        case 'myTournamentsPage': renderMyTournamentsPage(pageContainer); break;
        case 'walletPage': renderWalletPage(pageContainer); break;
        case 'profilePage': renderProfilePage(pageContainer); break;
    }
}

async function renderHomePage(container) {
    container.innerHTML = `
                <div class="p-4 bg-orange-50 min-h-screen">
                    <h2 class="text-2xl font-black mb-4 text-gray-800">Play Games <span class="text-xs font-normal bg-green-100 text-green-700 px-2 py-1 rounded ml-2">Earn PKR 1/play</span></h2>
                    <div id="games-grid" class="grid grid-cols-2 gap-4 mb-8">
                        <div class="col-span-2 text-center py-10"><i class="fas fa-spinner fa-spin fa-2x text-red-500"></i></div>
                    </div>

                    <h2 class="text-xl font-bold mb-4 text-gray-700 mt-6 border-t border-orange-200 pt-4">Live & Upcoming Tournaments</h2>
                    <div id="tournament-list" class="space-y-4"></div>
                </div>`;

    db.ref('games').on('value', snapshot => {
        const games = snapshot.val();
        const gridEl = document.getElementById('games-grid');
        if (!gridEl) return;

        if (!games) {
            gridEl.innerHTML = `<div class="col-span-2 text-center text-gray-500">No games available yet.</div>`;
            return;
        }

        gridEl.innerHTML = Object.entries(games).map(([id, game]) => `
                    <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-orange-100 transform transition duration-300 hover:scale-105">
                        <div class="h-32 bg-gray-200 relative">
                            <img src="${game.image_url || 'https://via.placeholder.com/300x200?text=Game'}" class="w-full h-full object-cover">
                            <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/70 to-transparent p-2">
                                <h3 class="text-white font-bold text-sm shadow-black drop-shadow-md">${game.title}</h3>
                            </div>
                        </div>
                        <div class="p-3">
                            <button onclick="checkLoginAndAct(event, 'playGameUrl', '${game.game_url}')" class="w-full text-white bg-gradient-to-r from-red-600 to-yellow-500 hover:from-red-700 hover:to-yellow-600 py-2 rounded-lg font-bold text-sm shadow-md">
                                <i class="fas fa-play mr-1"></i> PLAY NOW
                            </button>
                        </div>
                    </div>
                `).join('');
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
            const buttonAction = isUserLoggedIn ? `joinTournament(event, '${id}', ${t.entry_fee})` : `checkLoginAndAct(event, 'joinTournament', '${id}', ${t.entry_fee})`;

            return `
                        <div class="bg-gradient-to-br from-red-50 to-yellow-50 rounded-xl shadow-md border border-red-100 overflow-hidden">
                            <div class="p-4 flex justify-between items-start border-b border-red-100/50">
                                <div><h3 class="font-bold text-lg text-red-900">${t.title}</h3><span class="text-xs font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1 rounded-full shadow-sm">${formatCurrency(t.prize_pool)} Pool</span>
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

function playGameUrl(url, tournamentId = null) {
    if (!auth.currentUser) {
        return showToast('Login required to play!', true);
    }
    if (!url) return showToast("Game URL missing!", true);

    if (tournamentId) {
        localStorage.setItem('active_tournament_id', tournamentId);
        localStorage.setItem('game_start_time', Date.now());
    } 
    window.location.href = url;
}

function renderWalletPage(container) {
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
                            <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-lg text-gray-800">${t.title}</h3><span class="text-xs font-bold ${t.status === 'Live' ? 'text-white bg-red-600 animate-pulse' : 'text-yellow-800 bg-yellow-200'} px-2 py-1 rounded-full">${t.status}</span></div>
                            <p class="text-sm text-gray-500 mb-2">${t.game_name}</p>
                            ${t.status === 'Live' ? `
                                ${t.room_id ? `<div class="bg-gray-100 p-3 rounded text-sm mb-3"><p><span class="font-bold text-gray-600">Room ID:</span> ${t.room_id}</p><p><span class="font-bold text-gray-600">Pass:</span> ${t.room_password}</p></div>` : ''}
                                <button onclick="checkLoginAndAct(event, 'playGameUrl', '${t.game_url}', '${tId}')" class="w-full text-white bg-gradient-to-r from-green-500 to-green-600 font-bold py-3 rounded-lg shadow-lg hover:shadow-xl transition transform active:scale-95 animate-pulse">PLAY LIVE MATCH</button>
                            ` : `<p class="text-xs text-gray-400 italic mb-3">Room details appear here when Live.</p>`}
                        </div>`;
            } else {
                hasCompleted = true;
                completedHtml += `<div class="bg-gray-100 border border-gray-200 rounded-lg p-4 flex justify-between items-center shadow-sm opacity-80">
                            <div><h3 class="font-bold text-gray-700">${t.title}</h3><p class="text-xs text-gray-500">${new Date(t.match_time).toLocaleDateString()}</p></div>
                            <span class="font-bold ${participant.status === 'Winner' ? 'text-green-600' : 'text-gray-500'}">${participant.status || 'Played'}</span>
                        </div>`;
            }
        }
    }
    document.getElementById('upcomingLiveContent').innerHTML = hasUpcoming ? upcomingHtml : `<p class="text-center text-gray-500 py-8">No matches joined.</p>`;
    document.getElementById('completedContent').innerHTML = hasCompleted ? completedHtml : `<p class="text-center text-gray-500 py-8">No history available.</p>`;
}

async function renderProfilePage(container) {
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
                            <p class="text-xl font-bold text-gray-800">${currentUserData?.username || 'User'}</p>
                            <p class="text-sm text-gray-500">${currentUserData?.email || auth.currentUser?.email || 'N/A'}</p>
                            <div class="mt-4 pt-4 border-t border-orange-100">
                                <p class="text-md font-semibold text-gray-700">Referrals Joined: <span class="font-bold text-green-600" id="profile-referrals-count">${referralsEarned}</span></p>
                            </div>
                        </div>

                        <!-- Referral Code Section -->
                        <div class="bg-white border border-orange-100 p-6 rounded-xl shadow-md space-y-4">
                            <h3 class="font-bold text-lg text-gray-800">Invite Friends & Earn!</h3>
                            <p class="text-sm text-gray-600">Share your username as referral code. You get <span class="font-bold text-green-600">PKR <span id="referral-bonus-text">${referralBonusAmount}</span></span> for every friend who signs up!</p>
                            <div class="flex items-center space-x-2">
                                <input type="text" id="referralLinkInput" value="${userReferralCode}" readonly class="flex-1 p-2 bg-gray-100 rounded border border-gray-200 text-sm overflow-hidden text-ellipsis">
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
                        
                        <!-- Direct link buttons for Deposit and Withdrawal Rules -->
                        <button onclick="showPolicySection('deposit_rules')" class="w-full bg-white text-gray-700 border border-gray-300 p-3 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95">
                            <span><i class="fas fa-money-bill-wave mr-3 text-orange-500"></i>View Deposit Rules</span> <i class="fas fa-chevron-right text-gray-400"></i>
                        </button>
                        <button onclick="showPolicySection('withdrawal_rules')" class="w-full bg-white text-gray-700 border border-gray-300 p-3 rounded-xl font-bold shadow-sm flex items-center justify-between transition transform hover:scale-105 active:scale-95">
                            <span><i class="fas fa-cash-register mr-3 text-teal-500"></i>View Withdrawal Rules</span> <i class="fas fa-chevron-right text-gray-400"></i>
                        </button>

                        <!-- Add New Game Button -->
                        <button onclick="toggleModal('addGameModal', true)" class="w-full bg-gradient-to-r from-orange-500 to-yellow-500 text-white p-3 rounded-xl font-bold shadow-md hover:from-orange-600 hover:to-yellow-600 transition">
                            <i class="fas fa-plus-circle mr-2"></i> Add New Game
                        </button>

                        <!-- Reset Password Button -->
                        <button onclick="changePassword()" class="w-full bg-white text-gray-700 border border-gray-300 p-3 rounded-xl font-bold shadow-sm">Reset Password</button>

                        <!-- Policies & Contact -->
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
                ? `<div class="bg-blue-50 p-2 rounded-md mt-2 text-sm border border-blue-200"><strong class="text-blue-700">Admin Reply:</strong> ${msg.adminReply.replace(/\n/g, '<br>')}</div>`
                : `<p class="text-xs text-gray-500 italic mt-2">Admin has not replied yet.</p>`;

            messagesHtml += `
                <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div class="flex justify-between items-center mb-2">
                        <p class="font-bold text-gray-800">${msg.subject}</p>
                        <span class="text-xs font-semibold px-2 py-1 rounded-full ${statusClass}"><i class="${icon} mr-1"></i>${msg.status.toUpperCase()}</span>
                    </div>
                    <p class="text-sm text-gray-600">Message: <span class="block mt-1 bg-gray-50 p-2 rounded text-xs">${msg.message.replace(/\n/g, '<br>')}</span></p>
                    ${adminReplyHtml}
                    <p class="text-xs text-gray-400 mt-2">Sent: ${new Date(msg.timestamp).toLocaleString()}</p>
                </div>
            `;
        }
        listEl.innerHTML = messagesHtml;
    });

    window.scrollTo(0, 0);
}

function showMainProfileView() {
    document.getElementById('mainProfileView').style.display = 'block';
    document.getElementById('policyContentArea').style.display = 'none';
    document.getElementById('policy-content-display').style.display = 'none';
    document.getElementById('mySupportMessagesSection').style.display = 'none';
    window.scrollTo(0, 0);
}

function updateProfileContent() {
    if (currentUserData) {
        const usernameEl = document.querySelector('#mainProfileView .text-xl.font-bold');
        if (usernameEl) usernameEl.textContent = currentUserData.username || 'User';
        const emailEl = document.querySelector('#mainProfileView .text-sm.text-gray-500');
        if (emailEl) emailEl.textContent = currentUserData.email || auth.currentUser?.email || 'N/A';

        // Update profile page referral count
        const referralsEarnedEl = document.getElementById('profile-referrals-count'); 
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
    }
}

function generateReferralLink(uid) {
    return currentUserData?.username || '';
}

function copyReferralLink() {
    const referralLinkInput = document.getElementById('referralLinkInput');
    if (referralLinkInput) {
        referralLinkInput.select();
        referralLinkInput.setSelectionRange(0, 99999);
        document.execCommand('copy');
        showToast('Referral username copied!');
    }
}

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

    // ------------------------------------------------------------------------
    // 🔥 FINAL SIGNUP + REFERRAL CODE LOGIC
    // ------------------------------------------------------------------------
    signupForm.addEventListener('submit', async e => {
        e.preventDefault();
        const { signupUsernameModal, signupEmailModal, signupPasswordModal, signupReferralCodeModal } = e.target;
        
        // 1. ALWAYS LOWERCASE (Username & Referral)
        const username = signupUsernameModal.value.trim().toLowerCase(); 
        const enteredReferralCode = signupReferralCodeModal.value.trim().toLowerCase();

        // --- Username Already Exist Check ---
        const finalCheckSnap = await db.ref('usernames/' + username).once('value');
        if (finalCheckSnap.exists()) {
            showToast('Username is already taken. Please choose another.', true);
            signupUsernameModal.focus();
            return;
        }

        try {
            const cred = await auth.createUserWithEmailAndPassword(signupEmailModal.value, signupPasswordModal.value);
            const newUserId = cred.user.uid;

            const initialSignupBonus = signupBonusAmount; // 80 PKR
            const referralBonus = referralBonusAmount;

            // 2. DATA PREPARATION (referred_by_username is NEVER undefined)
            let newUserData = {
                username: username, // Saved as lowercase
                email: signupEmailModal.value,
                wallet_balance: initialSignupBonus, // ✅ ALWAYS 80
                referrals_earned_count: 0,
                referral_code: username,
                referred_by_username: enteredReferralCode || null, // ✅ Use null if empty
                created_at: new Date().toISOString(),
                locked: false,
                lockReason: ""
            };

            let feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} 🎉`;

            // 3. REFERRAL LINKING LOGIC
            if (enteredReferralCode && enteredReferralCode !== username) {
                // Fast lookup using usernames mapping instead of looping all users
                const refSnap = await db.ref('usernames/' + enteredReferralCode).once('value');

                if (refSnap.exists()) {
                    const referrerUid = refSnap.val();

                    // ✅ Referrer ka wallet update
                    await db.ref(`users/${referrerUid}`).transaction((data) => {
                        if (data) {
                            data.wallet_balance = (data.wallet_balance || 0) + referralBonus;
                            data.referrals_earned_count = (data.referrals_earned_count || 0) + 1;
                        }
                        return data;
                    });

                    // ✅ Referrer transaction history
                    await db.ref(`transactions/${referrerUid}`).push({
                        amount: referralBonus,
                        type: "credit",
                        description: `Referral bonus from ${username}`,
                        created_at: new Date().toISOString()
                    });

                    // Linked successfully
                    newUserData.referred_by_username = enteredReferralCode;
                    feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} & referrer rewarded 🎉`;
                } else {
                    // Invalid referral code -> ensure it stays null
                    newUserData.referred_by_username = null;
                    feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} (Invalid referral code)`;
                }
            } else if (enteredReferralCode === username) {
                newUserData.referred_by_username = null;
                feedbackMessage = `Signup successful! You got PKR ${initialSignupBonus} (Cannot refer yourself)`;
            }

            // 4. DATABASE WRITE (🔥 ONLY ONCE & LAST)
            const userRef = db.ref('users/' + newUserId);
            const snap = await userRef.once('value');

            if (!snap.exists()) { 
                await userRef.set(newUserData); 
            } else {
                await userRef.update(newUserData); 
            }

            // Save username mapping
            await db.ref('usernames/' + username).set(newUserId);

            // Signup Bonus Transaction
            await db.ref(`transactions/${newUserId}`).push({
                amount: initialSignupBonus,
                type: "credit",
                description: "Signup Bonus",
                created_at: new Date().toISOString()
            });

            // Reset UI
            showToast(feedbackMessage);
            toggleModal('authModal', false);
            signupForm.reset();
            signupReferralCodeModal.value = '';
            document.getElementById('usernameAvailability').textContent = '';

        } catch (err) {
            console.error("Signup Error:", err);
            showToast(err.message, true);
        }
    });
}
// --- END REFERRAL LOGIC ---

// --- NEW FUNCTION: Claim Daily Bonus ---
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
        const twentyFourHours = 24 * 60 * 60 * 1000; 

        if (Date.now() - lastClaimTimestamp < twentyFourHours) {
            const timeLeft = twentyFourHours - (Date.now() - lastClaimTimestamp);
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            showToast(`You can claim your next daily bonus in ${hours}h ${minutes}m.`, true);
            window.open('https://toolswebsite205.blogspot.com', '_blank'); 
            return;
        }

        const randomBonus = Math.floor(Math.random() * 80) + 10;
        
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
            }
        });

    } catch (error) {
        console.error("Error claiming daily bonus:", error);
        showToast('An error occurred while claiming bonus.', true);
        window.open('https://toolswebsite205.blogspot.com', '_blank');
    }
}
// --- END NEW FUNCTION: Claim Daily Bonus ---

function attachMyTournamentsListeners() {
    const upcomingTab = document.getElementById('upcomingLiveTab');
    const completedTab = document.getElementById('completedTab');
    const upcomingContent = document.getElementById('upcomingLiveContent');
    const completedContent = document.getElementById('completedContent');

    if (!upcomingTab || !completedTab || !upcomingContent || !completedContent) {
        return;
    }

    upcomingTab.addEventListener('click', () => { upcomingTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600"; completedTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent"; upcomingContent.style.display = 'block'; completedContent.style.display = 'none'; });
    completedTab.addEventListener('click', () => { completedTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600"; upcomingTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent"; completedContent.style.display = 'block'; upcomingContent.style.display = 'none'; });
}

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
    acceptRulesCheckbox.checked = false; 
}

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

    if (currentUserData.daily_bonus_withdrawal_condition_active) {
        const requiredReferrals = 10; 
        if ((currentUserData.referrals_earned_count || 0) < requiredReferrals) {
            showToast(`Withdrawal requires at least ${requiredReferrals} referrals for bonus funds. You have ${currentUserData.referrals_earned_count || 0}.`, true);
            return;
        }
    }

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

        showToast("Withdrawal request sent! Waiting for admin approval.");
        toggleModal("withdrawMoneyModal", false);
        event.target.reset();
        acceptRulesCheckbox.checked = false;

    } catch (error) {
        console.error("Error during withdrawal request:", error);
        showToast("Withdrawal failed. Please try again.", true);
    }
}

async function addNewGame(event) {
    event.preventDefault();
    const acceptGameRulesCheckbox = document.getElementById('acceptGameSubmissionRules'); 

    if (!acceptGameRulesCheckbox.checked) {
        showToast('Please accept the Game Submission Policy to add a game.', true);
        return;
    }

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

    if (!gameTitle || !gameImageUrl || !gameUrl) {
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
                acceptGameRulesCheckbox.checked = false; 
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

function logout() {
    auth.signOut();
}

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

document.addEventListener('DOMContentLoaded', async () => {
    if (firebase.apps.length) {
        attachLoginListeners();
        document.getElementById('addMoneyForm').addEventListener('submit', addMoney);
        document.getElementById('withdrawMoneyForm').addEventListener('submit', withdrawMoney);
        document.getElementById('addGameForm').addEventListener('submit', addNewGame);
        document.getElementById('contactUsForm').addEventListener('submit', sendContactMessage);

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

        navigateTo('homePage');
    }
});
