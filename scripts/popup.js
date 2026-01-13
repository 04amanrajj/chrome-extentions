// Load saved currency on popup open
chrome.storage.sync.get(["selectedCurrency"], (result) => {
    const savedCurrency = result.selectedCurrency || "INR";
    document.getElementById("currency").value = savedCurrency;
});

// Save currency selection
document.getElementById("save").addEventListener("click", () => {
    const currency = document.getElementById("currency").value;
    chrome.storage.sync.set({ selectedCurrency: currency }, () => {
        // Better UX: show a brief message instead of alert
        const button = document.getElementById("save");
        const originalText = button.textContent;
        button.textContent = "Saved!";
        button.style.background = "#28a745";
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = "#007bff";
        }, 1000);
        
        // Notify content script to update prices
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "updateCurrency" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error sending message:", chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log("Currency update message sent successfully");
                    }
                });
            }
        });
    });
});
