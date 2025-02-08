const versionUrl = "https://raw.githubusercontent.com/darort/blockname/main/version3.json";  // Store version online

async function checkVersion() {
    try {
        const response = await fetch(versionUrl);
        if (!response.ok) throw new Error("Failed to fetch version.");
        
        const data = await response.json();
        console.log("Online Version:", data.version);
        
        if (data.version !== chrome.runtime.getManifest().version) {
            alert(`New version available: ${data.version}. Please update!`);
        }
    } catch (error) {
        console.error("Version check failed:", error);
    }
}

// Run version check
checkVersion();
