// State Management
const state = {
    activeCups: parseInt(localStorage.getItem('activeCups')) || 0,
    history: JSON.parse(localStorage.getItem('cupHistory')) || [],
    cupCodes: new Map(JSON.parse(localStorage.getItem('cupCodes') || '[]')),
    lastSync: localStorage.getItem('lastSync') || new Date().toISOString(),
    pendingAction: null
};

// DOM Elements
const elements = {
    cupCount: document.getElementById('cupCount'),
    borrowBtn: document.getElementById('borrowBtn'),
    returnBtn: document.getElementById('returnBtn'),
    scannerContainer: document.getElementById('scannerContainer'),
    closeScanner: document.getElementById('closeScanner'),
    alert: document.getElementById('alert'),
    historyList: document.getElementById('historyList'),
    clearHistory: document.getElementById('clearHistory'),
    totalBorrowed: document.getElementById('totalBorrowed'),
    totalReturned: document.getElementById('totalReturned'),
    scannerOverlay: document.getElementById('scannerOverlay'),
    overlay: document.getElementById('overlay')
};

let html5QrcodeScanner = null;

// Cup Icons Update
function updateCupIcons() {
    const cupIcons = document.querySelectorAll('.cup-icon');
    cupIcons.forEach((icon, index) => {
        if (index < state.activeCups) {
            icon.classList.add('active');
            icon.classList.remove('inactive');
        } else {
            icon.classList.add('inactive');
            icon.classList.remove('active');
        }
    });
}

// State Management Functions
function saveState() {
    try {
        localStorage.setItem('activeCups', state.activeCups);
        localStorage.setItem('cupHistory', JSON.stringify(state.history));
        localStorage.setItem('cupCodes', JSON.stringify(Array.from(state.cupCodes.entries())));
        localStorage.setItem('lastSync', new Date().toISOString());
    } catch (error) {
        showAlert('Error saving data', 'error');
        console.error('Storage error:', error);
    }
}

function updateStats() {
    const totalBorrowed = state.history.filter(item => item.action === 'borrow').length;
    const totalReturned = state.history.filter(item => item.action === 'return').length;
    elements.totalBorrowed.textContent = totalBorrowed;
    elements.totalReturned.textContent = totalReturned;
    
    // Update clear history button state
    elements.clearHistory.disabled = state.activeCups > 0;
    elements.clearHistory.title = state.activeCups > 0 ? 
        'Cannot clear history while cups are active' : 
        'Clear all history';
}

function updateButtons() {
    elements.borrowBtn.disabled = state.activeCups >= 3;
    elements.returnBtn.disabled = state.activeCups === 0;
    updateCupIcons();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-AU', options);
}

function showAlert(message, type) {
    elements.alert.textContent = message;
    elements.alert.className = `alert ${type}`;
    setTimeout(() => {
        elements.alert.className = 'alert';
    }, 3000);
}

// QR Scanner Functions
async function checkCameraPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (err) {
        return false;
    }
}

async function startScanner(action) {
    const hasPermission = await checkCameraPermission();
    if (!hasPermission) {
        showAlert('Camera permission is required. Please enable it in your browser settings.', 'error');
        return;
    }

    state.pendingAction = action;
    elements.scannerContainer.className = 'scanner-container active';
    elements.overlay.classList.add('active');
    
    if (html5QrcodeScanner) {
        await html5QrcodeScanner.clear();
    }

    html5QrcodeScanner = new Html5Qrcode("reader");
    
    try {
        await html5QrcodeScanner.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
                elements.scannerOverlay.style.display = 'flex';
                handleScan(decodedText);
            },
            (error) => {
                // Ignore continuous scanning errors
            }
        );
    } catch (err) {
        showAlert('Cannot access camera. Please check permissions.', 'error');
        console.error(err);
        stopScanner();
    }
}

async function stopScanner() {
    if (html5QrcodeScanner) {
        try {
            await html5QrcodeScanner.stop();
            elements.scannerOverlay.style.display = 'none';
            elements.scannerContainer.className = 'scanner-container';
            elements.overlay.classList.remove('active');
        } catch (err) {
            console.error('Error stopping scanner:', err);
        }
    }
}

function handleScan(decodedText) {
    console.log('Scanned:', decodedText, 'Intended action:', state.pendingAction);
    
    if (state.pendingAction === 'borrow') {
        if (state.activeCups >= 3) {
            showAlert('Maximum limit reached (3 cups)', 'error');
        } else if (state.cupCodes.has(decodedText) && state.cupCodes.get(decodedText).status === 'borrowed') {
            showAlert('This cup is already borrowed', 'error');
        } else {
            state.activeCups++;
            state.cupCodes.set(decodedText, {
                borrowed: new Date().toISOString(),
                status: 'borrowed'
            });
            showAlert(`Cup borrowed successfully! You now have ${state.activeCups} active cups.`, 'success');
            addHistoryItem('borrow', decodedText);
        }
    } else if (state.pendingAction === 'return') {
        if (state.activeCups <= 0) {
            showAlert('No cups to return', 'error');
        } else if (!state.cupCodes.has(decodedText)) {
            showAlert('This cup was not borrowed by you', 'error');
        } else if (state.cupCodes.get(decodedText).status === 'returned') {
            showAlert('This cup was already returned', 'error');
        } else {
            state.activeCups--;
            state.cupCodes.get(decodedText).status = 'returned';
            state.cupCodes.get(decodedText).returned = new Date().toISOString();
            showAlert(`Cup returned successfully! You now have ${state.activeCups} active cups.`, 'success');
            addHistoryItem('return', decodedText);
        }
    }

    updateButtons();
    updateStats();
    saveState();
    stopScanner();
}

function addHistoryItem(action, qrCode) {
    const item = {
        id: Date.now(),
        action,
        qrCode,
        timestamp: new Date().toISOString(),
        cupCount: state.activeCups
    };
    state.history.unshift(item);
    if (state.history.length > 50) {
        state.history.pop();
    }
    updateHistoryDisplay();
    updateStats();
    saveState();
}

function updateHistoryDisplay() {
    elements.historyList.innerHTML = state.history.map(item => `
        <div class="history-item ${item.action}" data-id="${item.id}">
            <div>
                <div>
                    ${item.action === 'borrow' ? '☕ Borrowed Cup' : '↩️ Returned Cup'}
                    (${item.cupCount} active)
                </div>
                <div class="history-item-code">Cup ID: ${item.qrCode}</div>
            </div>
            <span class="history-item-time">${formatDate(item.timestamp)}</span>
        </div>
    `).join('');
}

function clearHistory() {
    if (state.activeCups > 0) {
        showAlert('Cannot clear history while cups are active', 'error');
        return;
    }

    if (confirm('Are you sure you want to clear your history? This cannot be undone.')) {
        state.history = [];
        state.cupCodes = new Map();
        updateHistoryDisplay();
        updateStats();
        saveState();
        showAlert('History cleared successfully', 'success');
    }
}

// Event Listeners
elements.borrowBtn.addEventListener('click', () => startScanner('borrow'));
elements.returnBtn.addEventListener('click', () => startScanner('return'));
elements.closeScanner.addEventListener('click', stopScanner);
elements.clearHistory.addEventListener('click', clearHistory);
elements.overlay.addEventListener('click', stopScanner);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.scannerContainer.classList.contains('active')) {
        stopScanner();
    }
});

// Storage sync across tabs
window.addEventListener('storage', (e) => {
    if (e.key === 'cupHistory' || e.key === 'activeCups' || e.key === 'cupCodes') {
        state.activeCups = parseInt(localStorage.getItem('activeCups')) || 0;
        state.history = JSON.parse(localStorage.getItem('cupHistory')) || [];
        state.cupCodes = new Map(JSON.parse(localStorage.getItem('cupCodes') || '[]'));
        updateButtons();
        updateHistoryDisplay();
        updateStats();
    }
});

// Online/Offline handling
window.addEventListener('online', () => {
    showAlert('Connection restored', 'success');
});

window.addEventListener('offline', () => {
    showAlert('Working offline', 'warning');
});

// Initialize
function initializeApp() {
    if (!isLocalStorageAvailable()) {
        showAlert('Local storage is not available. Your data will not be saved.', 'warning');
    }
    
    updateButtons();
    updateHistoryDisplay();
    updateStats();

    if (!localStorage.getItem('firstVisit')) {
        showAlert('Welcome to the UoM Cup Tracking System! Scan a QR code to get started.', 'success');
        localStorage.setItem('firstVisit', 'true');
    }
}

function isLocalStorageAvailable() {
    try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        return true;
    } catch (e) {
        return false;
    }
}

// Start the application
initializeApp();
