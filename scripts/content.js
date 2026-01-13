// Cache for exchange rates to avoid frequent API calls
let exchangeRateCache = {
  rates: null,
  timestamp: 0,
  cacheDuration: 5 * 60 * 1000 // 5 minutes
};

// Global variables for cleanup
let observer = null;
let intervalId = null;

async function fetchExchangeRate(baseCurrency) {
  // Check cache first
  const now = Date.now();
  if (exchangeRateCache.rates && (now - exchangeRateCache.timestamp) < exchangeRateCache.cacheDuration) {
    return exchangeRateCache.rates;
  }

  try {
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();

    // Update cache
    exchangeRateCache.rates = data.rates;
    exchangeRateCache.timestamp = now;

    return data.rates;
  } catch (error) {
    console.error("Failed to fetch exchange rate:", error);
    // Return cached rates if available, even if expired
    if (exchangeRateCache.rates) {
      console.warn("Using cached exchange rates due to API error");
      return exchangeRateCache.rates;
    }
    return null;
  }
}

function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function replacePrices(node, rate, selectedCurrency) {
  if (node.nodeType === Node.TEXT_NODE) {
    // Skip if already converted (contains currency symbol)
    if (node.textContent.includes(selectedCurrency)) {
      return;
    }
    
    const oldText = node.textContent;
    // Fix Bug 1: Use replace directly instead of test() + replace() to avoid lastIndex issues
    // When a global regex is used with test(), it advances lastIndex, causing replace() to start from wrong position
    const regex = /\$\s?(\d+(\.\d+)?)/g;
    const newText = oldText.replace(regex, (match, amount) => {
      const converted = (parseFloat(amount) * rate).toFixed(2);
      return `${selectedCurrency} ${converted}`;
    });

    if (oldText !== newText) {
      const span = document.createElement("span");
      span.innerText = newText;
      span.classList.add("flash-effect");
      node.parentNode.replaceChild(span, node);
    }
  }
}
function scanAndReplace(element, rate, selectedCurrency) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let node;
  while ((node = walker.nextNode())) {
    replacePrices(node, rate, selectedCurrency);
  }
}

async function convertPrices() {
  // Cleanup previous observers/intervals
  cleanup();

  chrome.storage.sync.get(["selectedCurrency"], async (result) => {
    const selectedCurrency = result.selectedCurrency || "INR";
    const rates = await fetchExchangeRate("USD");
    
    if (!rates || !rates[selectedCurrency]) {
      console.error("Exchange rate not found for", selectedCurrency);
      return;
    }

    const rate = rates[selectedCurrency];
    console.log(`Using exchange rate: 1 USD = ${rate} ${selectedCurrency}`);

    // Initial scan
    scanAndReplace(document.body, rate, selectedCurrency);

    // Set up MutationObserver for dynamic content
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            replacePrices(node, rate, selectedCurrency);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            scanAndReplace(node, rate, selectedCurrency);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Run periodic scan for dynamic content (less aggressive)
    intervalId = setInterval(() => {
      scanAndReplace(document.body, rate, selectedCurrency);
    }, 500); // Reduced from 50ms to 500ms for better performance

    // Stop the interval after 5 seconds (as intended)
    setTimeout(() => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log("Interval stopped after 5 seconds.");
      }
    }, 5000);

    console.log("Follow on github: https://github.com/04amanrajj");
  });
}

// Listen for messages from popup to update currency
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateCurrency") {
    convertPrices();
    sendResponse({ success: true });
  }
  return true;
});

// Ensure script runs after page loads
if (document.readyState === "loading") {
  window.addEventListener("load", convertPrices);
} else {
  convertPrices();
}
