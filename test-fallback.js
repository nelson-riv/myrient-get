#!/usr/bin/env node

require("dotenv").config({ quiet: true })
const axios = require("axios")

const PORT = process.env.PORT || "3001"
const API_URL = `http://localhost:${PORT}`

function getErrorMessage(error) {
    return error?.response?.data?.error || error?.message || String(error)
}

/**
 * Test the metadata endpoints with fallback
 */
async function testMetadata() {
    console.log("🧪 Testing Metadata Fallback Integration\n")
    console.log(`Using API: ${API_URL}\n`)

    try {
        // Test 1: Game in LaunchBox
        console.log("Test 1: Game in LaunchBox (Advance Wars)")
        const lb1 = await axios.post(`${API_URL}/api/launchbox-metadata`, {
            gameName: "Advance Wars",
        })
        console.log(`  Source: ${lb1.data.source}`)
        console.log(
            `  Metadata: ${lb1.data.metadata.name} (${lb1.data.metadata.releaseYear})`,
        )
        console.log(`  ✓ Success\n`)

        // Test 2: Check metadata stats
        console.log("Test 2: Metadata Service Stats")
        const stats = await axios.get(`${API_URL}/api/metadata-stats`)
        console.log(
            `  LaunchBox: ${stats.data.launchbox.gameCount} games (${stats.data.launchbox.status})`,
        )
        console.log(
            `  TheGamesDB: ${stats.data.thegamesdb.status} (${stats.data.thegamesdb.requestCount} requests)`,
        )
        console.log(`  ✓ Success\n`)

        if (stats.data.thegamesdb.status !== "ready") {
            console.log("ℹ️ TheGamesDB fallback is unavailable; skipping direct fallback checks.")
            console.log("   Set THEGAMESDB_API_KEY to re-enable the full fallback test.\n")
            console.log("✅ All available tests completed!")
            return
        }

        // Test 3: Direct TheGamesDB search
        console.log("Test 3: Direct TheGamesDB Search (Pokemon)")
        const gdb = await axios.get(`${API_URL}/api/thegamesdb-search`, {
            params: { name: "Pokemon Sapphire" },
        })
        if (gdb.data.success) {
            console.log(`  Found: ${gdb.data.metadata?.name || gdb.data.game?.name}`)
            console.log(`  Release Date: ${gdb.data.metadata?.releaseDate || "Unknown"}`)
            console.log(`  Has Box Art: ${gdb.data.boxArt ? "Yes" : "No"}`)
            console.log(`  ✓ Success\n`)
        } else {
            console.log(`  Not found\n`)
        }

        // Test 4: Fallback scenario - uncommon game that might not be in LaunchBox
        console.log("Test 4: Fallback Scenario (Testing Uncommon Game)")
        const fallback = await axios.post(`${API_URL}/api/launchbox-metadata`, {
            gameName: "Kirby and the Amazing Mirror",
        })
        if (fallback.data.success) {
            console.log(`  Found in ${fallback.data.source}`)
            console.log(`  Title: ${fallback.data.metadata.name}`)
            console.log(`  ✓ Success\n`)
        } else {
            console.log(`  Not found in either service\n`)
        }

        console.log("✅ All tests completed!")
    } catch (error) {
        console.error("❌ Error:", getErrorMessage(error))
        process.exit(1)
    }
}

testMetadata()
