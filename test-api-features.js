#!/usr/bin/env node

require("dotenv").config({ quiet: true })
const axios = require("axios")

const PORT = process.env.PORT || "3001"
const API_URL = `http://localhost:${PORT}`

function getErrorMessage(error) {
  return error?.response?.data?.error || error?.message || String(error)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function testFeatures() {
  console.log("🧪 Testing Upgrade Feature Coverage\n")
  console.log(`Using API: ${API_URL}\n`)

  const createdCollectionIds = []

  try {
    console.log("Test 1: Health endpoint")
    const health = await axios.get(`${API_URL}/api/health`)
    assert(health.data.success === true, "Health endpoint did not succeed")
    assert(health.data.services, "Health response missing services")
    console.log(`  Status: ${health.data.status}`)
    console.log(`  Queue size: ${health.data.queue?.size ?? "unknown"}`)
    console.log("  ✓ Success\n")

    console.log("Test 2: Metadata sync status endpoint")
    const metadataSync = await axios.get(`${API_URL}/api/metadata-sync-status`)
    assert(metadataSync.data.success === true, "Metadata sync endpoint did not succeed")
    assert(metadataSync.data.sync, "Metadata sync response missing sync data")
    console.log(`  Running: ${metadataSync.data.sync.running}`)
    console.log(`  Queued: ${metadataSync.data.sync.queued}`)
    console.log("  ✓ Success\n")

    console.log("Test 3: Queue inspection endpoint")
    const queue = await axios.get(`${API_URL}/api/queue`)
    assert(queue.data.success === true, "Queue endpoint did not succeed")
    assert(Array.isArray(queue.data.queue), "Queue response missing queue array")
    console.log(`  Items tracked: ${queue.data.queue.length}`)
    console.log("  ✓ Success\n")

    console.log("Test 4: Recent downloads endpoint")
    const recentDownloads = await axios.get(`${API_URL}/api/recent-downloads`)
    assert(recentDownloads.data.success === true, "Recent downloads endpoint did not succeed")
    assert(Array.isArray(recentDownloads.data.games), "Recent downloads missing games array")
    console.log(`  Recent downloads: ${recentDownloads.data.games.length}`)
    console.log("  ✓ Success\n")

    console.log("Test 5: Collections lifecycle")
    const gamesResponse = await axios.get(`${API_URL}/api/games`)
    assert(gamesResponse.data.success === true, "Games endpoint did not succeed")
    assert(Array.isArray(gamesResponse.data.games), "Games response missing games array")
    assert(gamesResponse.data.games.length > 0, "No games available for collection test")

    const sampleGame = gamesResponse.data.games[0]
    const collectionName = `Copilot Validation ${Date.now()}`

    const createdCollection = await axios.post(`${API_URL}/api/collections`, {
      name: collectionName,
      description: "Temporary validation collection",
    })
    assert(createdCollection.data.success === true, "Collection creation failed")
    const collectionId = createdCollection.data.collection.id
    createdCollectionIds.push(collectionId)
    console.log(`  Created collection: ${collectionName}`)

    const collections = await axios.get(`${API_URL}/api/collections`)
    assert(collections.data.success === true, "Collections list failed")
    assert(
      collections.data.collections.some((collection) => collection.id === collectionId),
      "Created collection not found in list",
    )
    console.log("  Collection listed successfully")

    const addGame = await axios.post(
      `${API_URL}/api/collections/${collectionId}/games`,
      { gameId: sampleGame.id },
    )
    assert(addGame.data.success === true, "Adding game to collection failed")
    console.log(`  Added sample game: ${sampleGame.name}`)

    const collectionGames = await axios.get(
      `${API_URL}/api/collections/${collectionId}/games`,
    )
    assert(collectionGames.data.success === true, "Collection games fetch failed")
    assert(
      collectionGames.data.games.some((game) => game.id === sampleGame.id),
      "Added game not found in collection",
    )
    console.log("  Collection contents verified")

    const removeGame = await axios.delete(
      `${API_URL}/api/collections/${collectionId}/games/${sampleGame.id}`,
    )
    assert(removeGame.data.success === true, "Removing game from collection failed")
    console.log("  Removed game from collection")

    const deleteCollection = await axios.delete(
      `${API_URL}/api/collections/${collectionId}`,
    )
    assert(deleteCollection.data.success === true, "Deleting collection failed")
    createdCollectionIds.pop()
    console.log("  Deleted collection")
    console.log("  ✓ Success\n")

    console.log("✅ Upgrade feature coverage complete!")
  } catch (error) {
    while (createdCollectionIds.length > 0) {
      const collectionId = createdCollectionIds.pop()
      try {
        await axios.delete(`${API_URL}/api/collections/${collectionId}`)
      } catch (_cleanupError) {
        // Best-effort cleanup only for temporary validation data.
      }
    }

    console.error("❌ Error:", getErrorMessage(error))
    process.exit(1)
  }
}

testFeatures()
