import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/**
 * Opens a (pre-signed) file URL. Devices use the in-app browser. On the web a popup opened
 * after an `await` is often blocked, so if it is, the current tab navigates to the file; the
 * session survives in sessionStorage.
 */
export async function openUrl(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Not the 'noopener' feature: with it `open` always returns null, so a tab that did open
    // looked blocked and the current tab navigated too. Cut the opener by hand instead.
    const opened = globalThis.open(url, '_blank');
    if (opened) {
      opened.opener = null;
      return;
    }
    globalThis.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}
