document.addEventListener('contextmenu', event => event.preventDefault());
document.body.style.userSelect = 'none';

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
let incomingReferralCode = null; // Global to store referral code from URL

// Parse URL for referral code on initial load
const urlParams = new URLSearchParams(window.location.search);
incomingReferralCode = urlParams.get('ref');
if (incomingReferralCode) {
    console.log('Incoming referral code:', incomingReferralCode);
    // Optionally, clear the 'ref' from URL to make it cleaner, but browser history might be an issue.
    // history.replaceState({}, document.title, window.location.pathname);
}

// Navigation Logic for White Icons
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

// Generic function to check login and then perform an action or show auth modal
function checkLoginAndAct(event, actionType, ...args) {
    event.preventDefault(); // Always prevent default button behavior

    if (!auth.currentUser) {
        pendingAction = { type: actionType, args: args };
        toggleModal('authModal', true); // Show the login/signup modal
        return;
    }

    // If logged in, execute the action directly
    if (actionType === 'playGameUrl') {
        playGameUrl(...args);
    } else if (actionType === 'joinTournament') {
        joinTournament(event, ...args);
    }
    // Add other actions as needed if they require login check
}

auth.onAuthStateChanged(async user => {
    const showAppControls = user ? true : false;
    document.getElementById('app-header').style.display = showAppControls ? 'flex' : 'none';
    document.getElementById('user-bottom-nav').style.display = showAppControls ? 'block' : 'none';

    // Always navigate to homePage first, regardless of login status
    // This ensures public games are always visible
    navigateTo('homePage');

    if (user) {
        // 1. Check for GENERAL GAME REWARD (From Dashboard)
        if (localStorage.getItem('game_played_pending') === 'true') {
            localStorage.removeItem('game_played_pending');
            const walletRef = db.ref(`users/${user.uid}/wallet_balance`);
            walletRef.transaction((currentBalance) => {
                return (currentBalance || 0) + 1;
            }, (error, committed, snapshot) => {
                if (error) { console.error('Transaction failed', error); }
                else if (committed) {
                    db.ref(`transactions/${user.uid}`).push({
                        amount: 1, type: 'credit', description: 'Game Play Reward', created_at: new Date().toISOString()
                    });
                    showToast('🎉 You earned PKR 1 for playing!');
                }
            });
        }

        // 2. Check for TOURNAMENT SCORE UPDATE (Survival Time)
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

        // --- ENSURE currentUserData is loaded ONCE before initial render of user-specific content ---
        try {
            const userSnap = await db.ref('users/' + user.uid).once('value');
            currentUserData = { uid: user.uid, ...userSnap.val() };

            // Update header balance with initial data
            const newBalanceFormatted = formatCurrency(currentUserData.wallet_balance || 0);
            document.getElementById('wallet-balance-header').innerHTML = `<i class="fas fa-wallet text-red-500"></i> ${newBalanceFormatted}`;

            // Re-render the current active page to update with user data
            // Only if it's not the homePage, or if homePage needs user-specific elements to update
            const currentPageId = document.querySelector('.page.active')?.id;
            if (currentPageId && currentPageId !== 'homePage') {
                loadPageContent(currentPageId);
            } else if (!currentPageId) { // Fallback if no active page set (shouldn't happen with navigateTo('homePage'))
                navigateTo('homePage');
            }


            // Handle pending action after successful login
            if (pendingAction) {
                const { type, args } = pendingAction;
                pendingAction = null; // Clear the pending action
                toggleModal('authModal', false); // Close modal
                if (type === 'playGameUrl') {
                    playGameUrl(...args);
                } else if (type === 'joinTournament') {
                    // Synthesize a minimal event object needed by joinTournament
                    const dummyEvent = { preventDefault: () => { }, target: { closest: () => ({ parentElement: { querySelector: () => ({ textContent: 'Tournament' }) } }) } };
                    joinTournament(dummyEvent, ...args);
                }
            }

            // --- Attach real-time listener for subsequent updates AFTER initial render ---
            db.ref('users/' + user.uid).on('value', snap => {
                currentUserData = { uid: user.uid, ...snap.val() };
                const updatedBalanceFormatted = formatCurrency(currentUserData.wallet_balance || 0);
                document.getElementById('wallet-balance-header').innerHTML = `<i class="fas fa-wallet text-red-500"></i> ${updatedBalanceFormatted}`;
                const mainBalanceEl = document.getElementById('wallet-main-balance');
                // Update main wallet balance if user is currently on the wallet page
                if (mainBalanceEl && document.getElementById('walletPage').classList.contains('active')) {
                    mainBalanceEl.textContent = updatedBalanceFormatted;
                }
            });

        } catch (error) {
            console.error("Error loading initial user data:", error);
            showToast("Failed to load user data. Please try again.", true);
            auth.signOut(); // Force logout if initial data fails
        }

    } else {
        currentUserData = null;
        // Reset header balance when logged out
        document.getElementById('wallet-balance-header').innerHTML = `<i class="fas fa-wallet text-red-500"></i> PKR...`;
        // Re-render the current active page to display "login required" messages
        loadPageContent(document.querySelector('.page.active')?.id || 'homePage'); // Ensure current page updates for non-logged-in state
    }
});

function loadPageContent(pageId) {
    const pageContainer = document.getElementById(pageId);
    if (!pageContainer) return;
    switch (pageId) {
        case 'loginPage': renderLoginPage(pageContainer); break; // This will now be empty or handled by modal
        case 'homePage': renderHomePage(pageContainer); break;
        case 'myTournamentsPage': renderMyTournamentsPage(pageContainer); break;
        case 'walletPage': renderWalletPage(pageContainer); break;
        case 'profilePage': renderProfilePage(pageContainer); break;
    }
}

// renderLoginPage is no longer needed as a full page, login is via modal
function renderLoginPage(container) {
    container.innerHTML = ''; // Keep it empty as the modal handles login/signup
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

    // Fetch Games (always public)
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

    // Fetch Tournaments (publicly visible, but 'Join' button changes based on login)
    const listEl = document.getElementById('tournament-list');
    listEl.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin fa-2x text-red-500"></i></div>`; // Loading spinner for tournaments

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
                                <div><h3 class="font-bold text-lg text-red-900">${t.title}</h3><p class="text-xs text-red-600 uppercase font-semibold tracking-wide">${t.game_name}</p></div>
                                <span class="text-xs font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1 rounded-full shadow-sm">${formatCurrency(t.prize_pool)} Pool</span>
                            </div>
                            <div class="p-4 grid grid-cols-2 gap-4 text-sm">
                                <div class="bg-white/60 p-2 rounded border border-red-100"><p class="text-gray-500 text-xs">Entry Fee</p><p class="font-bold text-gray-800">${formatCurrency(t.entry_fee)}</p></div>
                                <div class="bg-white/60 p-2 rounded border border-red-100"><p class="text-gray-500 text-xs">Time</p><p class="font-bold text-gray-800">${new Date(t.match_time).toLocaleDateString()}</p></div>
                            </div>
                            <div class="p-3">
                                <button onclick="${buttonAction}" class="w-full text-white bg-gradient-to-r from-red-600 to-orange-500 font-bold py-2 rounded-lg shadow hover:shadow-lg transition">${buttonText}</button>
                            </div>
                        </div>`;
        }).join('');
    }
}

// Logic to track game play for reward OR score
function playGameUrl(url, tournamentId = null) {
    if (!auth.currentUser) { // Defensive check, should be caught by checkLoginAndAct
        return showToast('Login required to play!', true);
    }
    if (!url) return showToast("Game URL missing!", true);

    if (tournamentId) {
        // It's a tournament game - track time for survival score
        localStorage.setItem('active_tournament_id', tournamentId);
        localStorage.setItem('game_start_time', Date.now());
    } else {
        // It's a dashboard game - track for PKR 1 reward
        localStorage.setItem('game_played_pending', 'true');
    }
    window.location.href = url;
}

function renderWalletPage(container) {
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
                    <p id="wallet-main-balance" class="text-5xl font-black tracking-tight relative z-10 drop-shadow-md">${formatCurrency(currentUserData.wallet_balance || 0)}</p>
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
        const participant = (await db.ref(`participants/${tId}/${auth.currentUser.uid}`).once('value')).val();
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

    console.log("Rendering Profile Page with currentUserData:", currentUserData); // Debug log

    // Generate referral link for the current user (PWA's own tracking)
    const userReferralLink = generateReferralLink(currentUserData.uid);
    const referralsEarned = currentUserData.referrals_earned_count || 0;

    container.innerHTML = `
                <div class="p-4 space-y-6 bg-orange-50 min-h-screen">
                    <div>
                        <h2 class="text-2xl font-black mb-4 text-gray-800">Profile</h2>
                        <div class="bg-white border border-orange-100 p-6 rounded-xl shadow-md text-center">
                            <div class="w-20 h-20 bg-gradient-to-br from-red-500 to-yellow-500 rounded-full mx-auto flex items-center justify-center text-3xl text-white font-bold mb-3">
                                ${currentUserData.username ? currentUserData.username[0].toUpperCase() : 'U'}
                            </div>
                            <p class="text-xl font-bold text-gray-800">${currentUserData.username || 'User'}</p>
                            <p class="text-sm text-gray-500">${currentUserData.email}</p>
                            <div class="mt-4 pt-4 border-t border-orange-100">
                                <p class="text-md font-semibold text-gray-700">Referrals Joined: <span class="font-bold text-green-600">${referralsEarned}</span></p>
                            </div>
                        </div>
                    </div>

                    <!-- Referral Link Section -->
                    <div class="bg-white border border-orange-100 p-6 rounded-xl shadow-md space-y-4">
                        <h3 class="font-bold text-lg text-gray-800">Invite Friends & Earn!</h3>
                        <p class="text-sm text-gray-600">Share this link. You get <span class="font-bold text-green-600">PKR 10</span> for every friend who signs up!</p>
                        <div class="flex items-center space-x-2">
                            <input type="text" id="referralLinkInput" value="${userReferralLink}" readonly class="flex-1 p-2 bg-gray-100 rounded border border-gray-200 text-sm overflow-hidden text-ellipsis">
                            <button onclick="copyReferralLink()" class="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-600 transition">Copy</button>
                        </div>
                        <p class="text-xs text-gray-500 italic mt-2">Friends must click your link and sign up on this web app to count as your referral.</p>
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

                    <div class="space-y-3">
                        <button onclick="changePassword()" class="w-full bg-white text-gray-700 border border-gray-300 p-3 rounded-xl font-bold shadow-sm">Reset Password</button>
                        <button onclick="logout()" class="w-full text-white bg-gradient-to-r from-red-500 to-red-700 p-3 rounded-xl font-bold shadow-md">Logout</button>
                    </div>
                </div>`;
}

// Helper function to generate referral link
function generateReferralLink(uid) {
    // This link is for tracking referrals *within this web application*.
    // The Google Play Store 'referrer' parameter works differently and is typically for native Android apps.
    return `https://freeearningsonline.github.io/Tournament/?ref=${encodeURIComponent(uid)}`;
}

// Function to copy referral link to clipboard
function copyReferralLink() {
    const referralLinkInput = document.getElementById('referralLinkInput');
    if (referralLinkInput) {
        referralLinkInput.select();
        referralLinkInput.setSelectionRange(0, 99999); // For mobile devices
        document.execCommand('copy');
        showToast('Referral link copied!');
    }
}

function attachLoginListeners() {
    const loginTab = document.getElementById('loginTabBtnModal');
    const signupTab = document.getElementById('signupTabBtnModal');
    const loginForm = document.getElementById('loginFormModal');
    const signupForm = document.getElementById('signupFormModal');

    if (!loginTab || !signupTab || !loginForm || !signupForm) {
        console.warn("Auth modal elements not found, skipping attaching listeners.");
        return;
    }

    loginTab.addEventListener('click', () => {
        loginTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600";
        signupTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent";
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
    });

    signupTab.addEventListener('click', () => {
        signupTab.className = "flex-1 py-2 text-center font-bold border-b-4 border-red-500 text-red-600";
        loginTab.className = "flex-1 py-2 text-center font-bold text-gray-400 border-b-4 border-transparent";
        signupForm.style.display = 'block';
        loginForm.style.display = 'none';
    });

    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await auth.signInWithEmailAndPassword(e.target.loginEmailModal.value, e.target.loginPasswordModal.value);
            showToast('Login successful!');
            toggleModal('authModal', false); // Close modal on success
            e.target.reset(); // Clear form
        } catch (err) {
            showToast(err.message, true);
        }
    });

    signupForm.addEventListener('submit', async e => {
        e.preventDefault();
        const { signupUsernameModal, signupEmailModal, signupPasswordModal } = e.target;
        try {
            const cred = await auth.createUserWithEmailAndPassword(signupEmailModal.value, signupPasswordModal.value);
            await db.ref('users/' + cred.user.uid).set({
                username: signupUsernameModal.value,
                email: signupEmailModal.value,
                wallet_balance: 0,
                created_at: new Date().toISOString(),
                referral_code: cred.user.uid, // Store their own referral code
                referrals_earned_count: 0 // Initialize count of referrals they brought in
            });

            // --- Referral Bonus Logic ---
            if (incomingReferralCode && incomingReferralCode !== cred.user.uid) { // Ensure self-referral is not allowed
                const referrerRef = db.ref(`users/${incomingReferralCode}`);
                const referrerSnap = await referrerRef.once('value');
                if (referrerSnap.exists()) {
                    const referrerData = referrerSnap.val();
                    const referralBonusAmount = 10; // 10 PKR

                    // Update referrer's balance
                    await referrerRef.update({
                        wallet_balance: (referrerData.wallet_balance || 0) + referralBonusAmount,
                        referrals_earned_count: (referrerData.referrals_earned_count || 0) + 1
                    });

                    // Record transaction for the referrer
                    db.ref(`transactions/${incomingReferralCode}`).push({
                        amount: referralBonusAmount,
                        type: 'credit',
                        description: `Referral bonus for new user: ${signupUsernameModal.value}`,
                        created_at: new Date().toISOString()
                    });
                    // No toast for referrer, it's a background process from the new user's perspective
                    console.log(`Referral bonus of ${referralBonusAmount} PKR added for ${referrerData.username}!`);
                }
            }
            incomingReferralCode = null; // Clear after use

            showToast('Account created and logged in!');
            toggleModal('authModal', false); // Close modal on success
            e.target.reset(); // Clear form

        } catch (err) {
            showToast(err.message, true);
        }
    });
}

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

async function joinTournament(event, tournamentId, entryFee) {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return showToast('Login required!', true); // Defensive check
    if (currentUserData.wallet_balance < entryFee) return showToast('Insufficient balance!', true);
    if ((await db.ref(`participants/${tournamentId}/${user.uid}`).once('value')).exists()) return showToast("Already joined!", true);

    // Fetch tournament title for transaction description
    const tournamentSnap = await db.ref(`tournaments/${tournamentId}/title`).once('value');
    const tournamentTitle = tournamentSnap.val() || 'Unknown Tournament';

    // Generate a unique key for the transaction
    const newTransactionKey = db.ref().child('transactions').child(user.uid).push().key;

    const updates = {
        [`/users/${user.uid}/wallet_balance`]: currentUserData.wallet_balance - entryFee,
        [`/participants/${tournamentId}/${user.uid}`]: { status: 'Participated', joined_at: new Date().toISOString() },
        [`/transactions/${user.uid}/${newTransactionKey}`]: { amount: entryFee, type: 'debit', description: `Entry: ${tournamentTitle}`, created_at: new Date().toISOString() }
    };
    await db.ref().update(updates);
    showToast('Joined successfully!');

    // After joining, re-render myTournamentsPage if the user is currently on it
    if (document.getElementById('myTournamentsPage').classList.contains('active')) {
        renderMyTournamentsPage(document.getElementById('myTournamentsPage'));
    }
}

// Updated addMoney function for EasyPaisa/JazzCash deposit with TID and source type
async function addMoney(event) {
    event.preventDefault();
    const amount = Number(document.getElementById('add-amount').value);
    const tid = document.getElementById('deposit-tid').value.trim();
    const sourceType = document.getElementById('deposit-source-type').value.trim();

    if (amount <= 0) {
        return showToast('Amount must be positive!', true);
    }
    if (!tid) {
        return showToast('Please enter the Transaction ID (TID)!', true);
    }
    if (!sourceType) {
        return showToast('Please specify EasyPaisa or JazzCash!', true);
    }

    const user = auth.currentUser;
    if (!user) return showToast('Login required!', true);

    // Create a pending deposit request in Firebase
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
}

// Updated withdrawMoney function for EasyPaisa/JazzCash withdrawal
async function withdrawMoney(event) {
    event.preventDefault();

    const amount = Number(document.getElementById('withdraw-amount').value);
    const withdrawNumber = document.getElementById('withdraw-number').value.trim();
    const ownerName = document.getElementById('withdraw-owner-name').value.trim();
    const accountType = document.getElementById('withdraw-account-type').value.trim();

    if (amount <= 0) {
        return showToast('Amount must be positive!', true);
    }

    if (!withdrawNumber || !ownerName || !accountType) {
        return showToast('Please fill all withdrawal details!', true);
    }

    if (amount > currentUserData.wallet_balance) {
        return showToast('Insufficient funds!', true);
    }

    const user = auth.currentUser;

    if (!user) {
        return showToast('Login required!', true);
    }

    const uid = user.uid;
    const newBalance = currentUserData.wallet_balance - amount;

    try {

        // Transaction reference
        const transactionRef = db.ref("transactions/" + uid).push();

        // Pending withdrawal reference
        const withdrawalRef = db.ref("pending_withdrawals/" + uid).push();

        // Save transaction
        await transactionRef.set({
            amount: amount,
            type: "debit",
            description: "Withdrawal initiated",
            status: "requested",
            created_at: Date.now()
        });

        // Save withdrawal request
        await withdrawalRef.set({
            amount: amount,
            status: "pending",
            withdrawal_account: withdrawNumber,
            withdrawal_owner_name: ownerName,
            withdrawal_account_type: accountType,
            created_at: Date.now(),
            user_uid: uid,
            user_email: currentUserData.email || user.email,
            user_username: currentUserData.username || "N/A",
            transaction_id: transactionRef.key
        });

        // Update wallet balance
        await db.ref("users/" + uid + "/wallet_balance").set(newBalance);

        showToast("Withdrawal request sent! Waiting for admin approval.");

        toggleModal("withdrawMoneyModal", false);

        event.target.reset();

    } catch (error) {

        console.error(error);
        showToast("Withdrawal failed. Please try again.", true);

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

document.addEventListener('DOMContentLoaded', () => {

    if (firebase.apps.length) {

        attachLoginListeners();

        document.getElementById('addMoneyForm').addEventListener('submit', addMoney);

        document.getElementById('withdrawMoneyForm').addEventListener('submit', withdrawMoney);

    }

});
