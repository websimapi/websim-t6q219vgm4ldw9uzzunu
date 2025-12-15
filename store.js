// Data Management Layer
// Handles the strict "One Row Per User" requirement
// Now includes IndexedDB Sync for robustness (Auto-patching)

const room = new WebsimSocket();

const DB_CONSTANTS = {
    COLLECTION: 'user_vault_v1',
    IDB_NAME: 'RemixArenaDB',
    IDB_STORE: 'user_vaults'
};

// --- IndexedDB Helper ---
const IDB = {
    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONSTANTS.IDB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(DB_CONSTANTS.IDB_STORE)) {
                    db.createObjectStore(DB_CONSTANTS.IDB_STORE, { keyPath: 'username' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    async get(username) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_CONSTANTS.IDB_STORE, 'readonly');
            const store = tx.objectStore(DB_CONSTANTS.IDB_STORE);
            const req = store.get(username);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async put(data) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_CONSTANTS.IDB_STORE, 'readwrite');
            const store = tx.objectStore(DB_CONSTANTS.IDB_STORE);
            const req = store.put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
};

// Initialize empty structure for columns 3-19
const getEmptyColumns = () => {
    let cols = {};
    for (let i = 3; i <= 19; i++) {
        cols[`col_${i}`] = {};
    }
    return cols;
};

// --- Merge Logic ---
// Merges two arrays of objects based on ID, returning a unique set
const mergeArrays = (arr1, arr2) => {
    const map = new Map();
    [...(arr1 || []), ...(arr2 || [])].forEach(item => {
        if (item && item.id && !map.has(item.id)) {
            map.set(item.id, item);
        }
    });
    // Sort by date desc
    return Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
};

const DataStore = {
    // Internal method to merge Local and Remote data
    // Patches missing data in either direction
    async _syncData(remoteRecord, user) {
        const localRecord = await IDB.get(user.username);
        
        let mergedGenerations = [];
        let mergedRemixes = [];
        
        // Sources
        const remoteGens = remoteRecord?.col_1?.generations || [];
        const localGens = localRecord?.col_1?.generations || [];
        
        const remoteRemixes = remoteRecord?.col_2?.remixes || [];
        const localRemixes = localRecord?.col_2?.remixes || [];

        // Merge
        mergedGenerations = mergeArrays(remoteGens, localGens);
        mergedRemixes = mergeArrays(remoteRemixes, localRemixes);

        // Recalculate Currency based on verified data
        const currency = mergedGenerations.length * 10;
        const gems = mergedRemixes.length * 5;

        // Construct Merged State
        const mergedState = {
            username: user.username,
            // Merge other columns deeply if needed, but for now spread works for empty/simple objs
            ...getEmptyColumns(), // Defaults
            ...(localRecord || {}),
            ...(remoteRecord || {}), // Remote takes precedence for metadata like 'id' if exists
            col_1: {
                generations: mergedGenerations,
                currency: currency
            },
            col_2: {
                remixes: mergedRemixes,
                gems: gems
            }
        };

        // 1. Patch Remote if needed (Remote is missing items)
        if (remoteRecord && (mergedGenerations.length > remoteGens.length || mergedRemixes.length > remoteRemixes.length)) {
            console.log("Sync: Patching Remote DB with missing items...");
            await room.collection(DB_CONSTANTS.COLLECTION).update(remoteRecord.id, {
                col_1: mergedState.col_1,
                col_2: mergedState.col_2
            });
        }

        // 2. Patch Local if needed (Local is missing items or is new)
        // We always update local to be safe and fresh
        await IDB.put(mergedState);

        return mergedState;
    },

    // Get the current user's single row. Syncs with IndexedDB.
    async getMyVault() {
        const user = await window.websim.getCurrentUser();
        
        // 1. Try to get Remote
        const existingRemote = await room.collection(DB_CONSTANTS.COLLECTION)
            .filter({ username: user.username })
            .getList();

        let remoteRecord = existingRemote.length > 0 ? existingRemote[0] : null;

        // 2. If no remote, check local for recovery
        if (!remoteRecord) {
            const localRecord = await IDB.get(user.username);
            if (localRecord) {
                // Recover from Local to Remote
                console.log("Sync: Recovering Remote from Local...");
                remoteRecord = await room.collection(DB_CONSTANTS.COLLECTION).create({
                    ...localRecord,
                    // Ensure we don't accidentally try to set the ID manually if it's reserved
                    id: undefined, 
                    created: undefined,
                    updated: undefined
                });
            } else {
                // Create brand new
                remoteRecord = await room.collection(DB_CONSTANTS.COLLECTION).create({
                    col_1: { generations: [], currency: 0 },
                    col_2: { remixes: [], gems: 0 },
                    ...getEmptyColumns()
                });
            }
        }

        // 3. Perform Bidirectional Sync/Patch
        return await this._syncData(remoteRecord, user);
    },

    // Add a new generation
    async addGeneration(imageUrl, prompt) {
        // Sync first to ensure we have latest state
        let vault = await this.getMyVault();
        const user = await window.websim.getCurrentUser();

        const newGen = {
            id: Date.now().toString(), // Simple unique ID
            url: imageUrl,
            prompt: prompt,
            date: new Date().toISOString()
        };

        const updatedCol1 = {
            ...vault.col_1,
            generations: [newGen, ...(vault.col_1.generations || [])],
            currency: (vault.col_1.currency || 0) + 10
        };

        // Optimistic Update Local
        vault.col_1 = updatedCol1;
        await IDB.put(vault);

        // Update Remote
        // We re-fetch or use the ID we know
        const remoteList = await room.collection(DB_CONSTANTS.COLLECTION).filter({ username: user.username }).getList();
        if (remoteList.length > 0) {
            await room.collection(DB_CONSTANTS.COLLECTION).update(remoteList[0].id, {
                col_1: updatedCol1
            });
        }

        return updatedCol1;
    },

    // Add a remix
    async addRemix(remixUrl, prompt, originalSourceUrl) {
        let vault = await this.getMyVault();
        const user = await window.websim.getCurrentUser();

        const newRemix = {
            id: Date.now().toString(),
            url: remixUrl,
            prompt: prompt,
            source: originalSourceUrl,
            date: new Date().toISOString()
        };

        const updatedCol2 = {
            ...vault.col_2,
            remixes: [newRemix, ...(vault.col_2.remixes || [])],
            gems: (vault.col_2.gems || 0) + 5
        };

        // Optimistic Local
        vault.col_2 = updatedCol2;
        await IDB.put(vault);

        // Update Remote
        const remoteList = await room.collection(DB_CONSTANTS.COLLECTION).filter({ username: user.username }).getList();
        if (remoteList.length > 0) {
            await room.collection(DB_CONSTANTS.COLLECTION).update(remoteList[0].id, {
                col_2: updatedCol2
            });
        }

        return updatedCol2;
    },

    subscribeToFeed(callback) {
        // Construct feed by aggregating from all user vaults
        // Note: Feed doesn't use IndexedDB, it's live from server for social aspect
        return room.collection(DB_CONSTANTS.COLLECTION).subscribe(records => {
            let allItems = [];
            
            records.forEach(vault => {
                const authorName = vault.username;
                const authorAvatar = `https://images.websim.com/avatar/${vault.username}`;

                // Col 1: Generations
                if (vault.col_1 && Array.isArray(vault.col_1.generations)) {
                    vault.col_1.generations.forEach(gen => {
                        allItems.push({
                            id: gen.id + "_" + vault.id, 
                            type: 'generation',
                            imageUrl: gen.url,
                            prompt: gen.prompt,
                            date: gen.date,
                            authorName,
                            authorAvatar,
                            ownerVaultId: vault.id
                        });
                    });
                }

                // Col 2: Remixes
                if (vault.col_2 && Array.isArray(vault.col_2.remixes)) {
                    vault.col_2.remixes.forEach(remix => {
                        allItems.push({
                            id: remix.id + "_" + vault.id,
                            type: 'remix',
                            imageUrl: remix.url,
                            prompt: remix.prompt,
                            sourceUrl: remix.source,
                            date: remix.date,
                            authorName,
                            authorAvatar,
                            ownerVaultId: vault.id
                        });
                    });
                }
            });

            // Sort by Date Descending
            allItems.sort((a, b) => new Date(b.date) - new Date(a.date));

            callback(allItems);
        });
    },

    subscribeToMyVault(callback) {
        // When we subscribe, we also want to ensure any incoming data matches our local robustness rules
        window.websim.getCurrentUser().then(user => {
            room.collection(DB_CONSTANTS.COLLECTION)
                .filter({ username: user.username })
                .subscribe(async (records) => {
                    if (records.length > 0) {
                        // Whenever we get a remote update, we sync it with local to ensure integrity
                        // This handles the "Auto patches" requirement if remote has something local missed
                        // or if remote was updated by another session
                        const syncedData = await this._syncData(records[0], user);
                        callback(syncedData);
                    }
                });
        });
    }
};