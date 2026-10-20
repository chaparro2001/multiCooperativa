import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { type KeyValueStore, MemoryKeyValueStore } from './key-value-store';

/**
 * Keychain (iOS) and Keystore (Android): tokens never go to plain storage
 * (NFR-ACC-03). Bound to this device and readable only while it is unlocked.
 */
class SecureKeyValueStore implements KeyValueStore {
  private readonly options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };

  get(key: string) {
    return SecureStore.getItemAsync(key, this.options);
  }

  set(key: string, value: string) {
    return SecureStore.setItemAsync(key, value, this.options);
  }

  remove(key: string) {
    return SecureStore.deleteItemAsync(key, this.options);
  }
}

/** SecureStore does not exist on web: there the session lasts until the page reloads. */
export function createDeviceStore(): KeyValueStore {
  return Platform.OS === 'web' ? new MemoryKeyValueStore() : new SecureKeyValueStore();
}
