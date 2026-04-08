/**
 * This script tests the hostname cleaning logic we're about to put into db.js.
 * It simulates various "bad" inputs to ensure we extract a clean hostname.
 */

function cleanHost(rawHost) {
  if (!rawHost) return "";
  
  let host = rawHost.trim();
  
  // 1. Handle full URIs (e.g. mysql://user:pass@host:port/db)
  try {
    if (host.includes("://")) {
      const url = new URL(host);
      host = url.hostname;
    } else if (host.includes("/")) {
      // Handle partial paths like "host/database"
      host = host.split("/")[0];
    }
  } catch (e) {
    // If URL parsing fails, continue with simple replacement
  }

  // 2. Handle host:port format
  if (host.includes(":")) {
    host = host.split(":")[0];
  }

  // 3. Aiven-specific fix for the ".d." segment
  if (host.includes(".d.aivencloud.com")) {
    host = host.replace(".d.aivencloud.com", ".aivencloud.com");
  }

  return host;
}

const testCases = [
  { input: "saarthi-database.aivencloud.com", expected: "saarthi-database.aivencloud.com" },
  { input: "  saarthi-database.aivencloud.com  ", expected: "saarthi-database.aivencloud.com" },
  { input: "mysql://saarthi-database.aivencloud.com", expected: "saarthi-database.aivencloud.com" },
  { input: "saarthi-database.aivencloud.com:14118", expected: "saarthi-database.aivencloud.com" },
  { input: "saarthi-database.d.aivencloud.com", expected: "saarthi-database.aivencloud.com" },
  { input: "mysql://user:pass@saarthi-database.d.aivencloud.com:14118/defaultdb", expected: "saarthi-database.aivencloud.com" }
];

console.log("Testing Hostname Cleaning Logic:\n");
testCases.forEach((tc, i) => {
  const result = cleanHost(tc.input);
  const passed = result === tc.expected;
  console.log(`Test ${i + 1}: ${passed ? "✅" : "❌"}`);
  console.log(`  Input:    [${tc.input}]`);
  console.log(`  Expected: [${tc.expected}]`);
  console.log(`  Result:   [${result}]\n`);
});
