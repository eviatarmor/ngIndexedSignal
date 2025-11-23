# ngIndexedSignal

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight Angular library that provides persistent, cross-tab synchronised signals using IndexedDB and BroadcastChannel APIs.

## ✨ Features

- **Cross-tab synchronisation** - Changes propagate instantly across all open tabs
- **Automatic persistence** - Signal values are automatically saved to IndexedDB
- **Zero configuration** - Works out of the box with sensible defaults
- **Angular integration** - Leverages Angular's dependency injection and lifecycle hooks
- **Automatic cleanup** - Resources are properly cleaned up when components are destroyed

## 🚀 Quick Start
```typescript
import { Component } from '@angular/core';
import { indexedSignal } from 'ng-indexed-signal';

@Component({
  selector: 'app-counter',
  template: `
    <div>
      <p>Counter: {{ counter() }}</p>
      <button (click)="increment()">Increment</button>
      <button (click)="reset()">Reset</button>
    </div>
  `
})
export class CounterComponent {
  // Create a persistent, synchronised signal
  counter = indexedSignal(0, { key: 'app-counter' });

  increment() {
    this.counter.update(value => value + 1);
  }

  reset() {
    this.counter.set(0);
  }
}
```

Open the same app in multiple tabs and watch them stay in sync! 🎉

## 💡 Usage Examples

### User Preferences
```typescript
interface UserPrefs {
  theme: 'light' | 'dark';
  language: string;
}

const prefs = indexedSignal<UserPrefs>(
  { theme: 'light', language: 'en' },
  { key: 'user-preferences' }
);

prefs.update(p => ({ ...p, theme: 'dark' }));
```

### Shopping Cart
```typescript
interface CartItem {
  id: string;
  name: string;
  quantity: number;
}

const cart = indexedSignal<CartItem[]>([], { key: 'shopping-cart' });

// Add item
cart.update(items => [...items, newItem]);

// Remove item
cart.update(items => items.filter(i => i.id !== itemId));
```

### Async Initialisation
```typescript
async ngOnInit() {
  // Wait for the signal to load from IndexedDB
  await this.counter.waitUntilReady();
  
  console.log('Loaded value:', this.counter());
}
```

### Custom Database
```typescript
const mySignal = indexedSignal(
  'initial',
  {
    key: 'my-key',
    dbName: 'myCustomDB',
    storeName: 'myCustomStore'
  }
);
```

### Readonly Signals
```typescript
class MyService {
  private _count = indexedSignal(0, { key: 'count' });
  
  // Expose readonly version
  public readonly count = this._count.asReadonly();
  
  increment() {
    this._count.update(n => n + 1);
  }
}
```

## 🌐 Browser Support

Requires browsers that support:
- **IndexedDB** - [Can I use IndexedDB?](https://caniuse.com/indexeddb)
- **BroadcastChannel API** - [Can I use BroadcastChannel?](https://caniuse.com/broadcastchannel)
- **Angular 14+**

## ⚠️ Important Notes

- Each signal requires a **unique key**
- IndexedDB operations are asynchronous but non-blocking
- The `BroadcastChannel` only sends messages to **other** tabs, not back to itself
- Cleanup is automatic when the injection context is destroyed (using RxJS)

## 🛠️ Installation
```bash
# Install dependencies
npm install @eviatarmor/indexed-signal
```

## 📄 Licence

MIT © Eviatar Mor

## 🐛 Issues

Found a bug? Please [open an issue]([https://github.com/yourusername/ng-indexed-signal/issues](https://github.com/eviatarmor/ngIndexedSignal/issues/new)).
