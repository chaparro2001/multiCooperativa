import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Style the confirm button as destructive (native only). */
  destructive?: boolean;
  onConfirm(): void;
}

/**
 * Asks before an action that cannot be undone. `Alert.alert` with buttons does nothing on the
 * web (react-native-web ships a no-op), so there the browser's own dialog is used.
 */
export function confirmAction(options: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${options.title}\n\n${options.message}`)) options.onConfirm();
    return;
  }
  Alert.alert(options.title, options.message, [
    { text: options.cancelLabel, style: 'cancel' },
    {
      text: options.confirmLabel,
      style: options.destructive ? 'destructive' : 'default',
      onPress: options.onConfirm,
    },
  ]);
}
