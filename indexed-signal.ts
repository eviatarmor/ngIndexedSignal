import {computed, CreateSignalOptions, DestroyRef, inject, signal, WritableSignal} from '@angular/core';
import {fromEvent, Subject, takeUntil} from 'rxjs';

/**
 * Configuration options for creating an indexed signal
 */
export interface CreateIndexedSignalOptions<T> extends CreateSignalOptions<T> {
  /** IndexedDB database name (default: 'indexedSignalDB') */
  dbName?: string;
  /** IndexedDB object store name (default: 'indexedSignalStore') */
  storeName?: string;
  /** Unique key for storing the signal value in IndexedDB */
  key: string;
}

/**
 * A writable signal that persists to IndexedDB and synchronizes across browser tabs
 */
export interface IndexedWritableSignal<T> extends WritableSignal<T> {
  /**
   * Returns a promise that resolves when the initial value has been loaded from IndexedDB
   */
  waitUntilReady(): Promise<void>;
}

/**
 * Service for managing IndexedDB operations
 * Handles database connection, initialization, and CRUD operations
 */
class IndexedDBService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<void> | null = null;

  constructor(
    private dbName: string,
    private storeName: string
  ) {
  }

  /**
   * Opens the IndexedDB database and creates the object store if needed
   * Uses singleton pattern to ensure only one database connection
   */
  async open(): Promise<void> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      // Create object store on first run or version upgrade
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Retrieves a value from IndexedDB by key
   * @param key The key to look up
   * @returns The stored value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    await this.open();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };

      request.onerror = () => {
        console.error('Get error:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Stores a value in IndexedDB
   * @param key The key to store the value under
   * @param value The value to store
   */
  async set<T>(key: string, value: T): Promise<void> {
    await this.open();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Set error:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Closes the database connection and resets state
   * Should be called during cleanup to prevent memory leaks
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }
}

/**
 * Creates a writable signal that automatically persists to IndexedDB and synchronizes across browser tabs
 * 
 * @param initialValue The initial value to use if no stored value exists
 * @param options Configuration options including the required unique key
 * @returns An IndexedWritableSignal that can be used like a regular Angular signal
 * 
 * @example
 * ```typescript
 * const counter = indexedSignal(0, { key: 'my-counter' });
 * 
 * // Use like a regular signal
 * console.log(counter()); // Read value
 * counter.set(5); // Set value (persists and syncs)
 * counter.update(n => n + 1); // Update value (persists and syncs)
 * 
 * // Wait for initialization if needed
 * await counter.waitUntilReady();
 * ```
 */
export function indexedSignal<T>(initialValue: T, options: CreateIndexedSignalOptions<T>): IndexedWritableSignal<T> {
  // Inject Angular's DestroyRef for automatic cleanup
  const destroyRef = inject(DestroyRef);
  const destroy$ = new Subject<void>();

  // Setup IndexedDB and BroadcastChannel configuration
  const dbName = options.dbName || 'indexedSignalDB';
  const storeName = options.storeName || 'indexedSignalStore';
  const signalKey = options.key;
  const channelId = `indexed-signal-${signalKey}`;

  const idbService = new IndexedDBService(dbName, storeName);
  const channel = new BroadcastChannel(channelId);

  // Create the internal Angular signal
  const internalSignal = signal<T>(initialValue, options);
  let isInitialized = false;

  // Initialize signal with stored value from IndexedDB
  // This promise resolves once the initial load is complete
  const initPromise = new Promise<void>(async (resolve) => {
    try {
      const storedValue = await idbService.get<T>(signalKey);
      if (storedValue !== null) {
        internalSignal.set(storedValue);
      }
    } catch (e) {
      console.error('Failed to load initial data from IndexedDB:', e);
    } finally {
      isInitialized = true;
      resolve();
    }
  });

  // Listen for changes from other tabs via BroadcastChannel
  // Note: BroadcastChannel does NOT send messages back to the sender,
  // so we only receive updates from other browser tabs/windows
  fromEvent<MessageEvent>(channel, 'message')
    .pipe(takeUntil(destroy$))
    .subscribe(event => {
      // Update our signal with the value from another tab
      internalSignal.set(event.data);
    });

  /**
   * Broadcasts changes to other tabs and persists to IndexedDB
   * This function is called whenever set() or update() is invoked
   */
  const broadcast = async (value: T) => {
    // Send to other tabs via BroadcastChannel
    channel.postMessage(value);

    // Persist to IndexedDB for durability across sessions
    try {
      await idbService.set(signalKey, value);
    } catch (err) {
      console.error('Error saving to IndexedDB:', err);
    }
  };

  // Register cleanup when the injection context is destroyed
  // This ensures no memory leaks and proper resource disposal
  destroyRef.onDestroy(() => {
    destroy$.next();
    destroy$.complete();
    channel.close();
    idbService.close();
  });

  // Create the public signal interface
  const getter = () => internalSignal();
  const indexedSignalInstance = getter as unknown as IndexedWritableSignal<T>;

  // Copy the iterator symbol to maintain signal compatibility
  indexedSignalInstance[Symbol.iterator] = internalSignal[Symbol.iterator];

  /**
   * Sets a new value and broadcasts/persists it
   */
  indexedSignalInstance.set = (value: T) => {
    internalSignal.set(value);
    broadcast(value);
  };

  /**
   * Updates the value using a function and broadcasts/persists the result
   */
  indexedSignalInstance.update = (updateFn: (value: T) => T) => {
    const newValue = updateFn(internalSignal());
    internalSignal.set(newValue);
    broadcast(newValue);
  };

  /**
   * Returns a readonly version of the signal
   */
  indexedSignalInstance.asReadonly = () => {
    return computed(() => internalSignal());
  };

  /**
   * Returns a promise that resolves when initial data has been loaded from IndexedDB
   */
  indexedSignalInstance.waitUntilReady = () => {
    return initPromise;
  };

  // Copy any internal symbols from the original signal to maintain full compatibility
  for (const prop of Object.getOwnPropertySymbols(internalSignal)) {
    (indexedSignalInstance as any)[prop] = (internalSignal as any)[prop];
  }

  return indexedSignalInstance;
}
