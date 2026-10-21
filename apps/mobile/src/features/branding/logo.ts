import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** A logo chosen by the administrator, already reduced and ready to upload (BR-ACC-17). */
export interface PickedLogo {
  uri: string;
  name: string;
  mimeType: 'image/png';
}

/** The API accepts up to 1024 px per side; the logo is shown small, so 512 is plenty and keeps the file light. */
export const LOGO_MAX_SIDE = 512;

export type PickLogoResult = { kind: 'ok'; logo: PickedLogo } | { kind: 'cancelled' };

/**
 * Gallery on devices, file chooser on the web. The image is reduced on the device and saved as
 * PNG, which keeps transparency; whatever the original format (HEIC, WebP...), the API only sees PNG.
 */
export async function pickLogo(): Promise<PickLogoResult> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { kind: 'cancelled' };

  const longest = Math.max(asset.width, asset.height);
  const resize =
    longest > LOGO_MAX_SIDE
      ? asset.width >= asset.height
        ? { width: LOGO_MAX_SIDE }
        : { height: LOGO_MAX_SIDE }
      : null;
  const reduced = await manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    format: SaveFormat.PNG,
  });
  return { kind: 'ok', logo: { uri: reduced.uri, name: 'logo.png', mimeType: 'image/png' } };
}

/** React Native reads `{ uri, name, type }`; the web needs a real Blob, which `fetch` gives for blob: and data: URIs. */
export async function appendLogo(form: FormData, logo: PickedLogo): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(logo.uri)).blob();
    form.append('file', new Blob([blob], { type: logo.mimeType }), logo.name);
    return;
  }
  form.append('file', {
    uri: logo.uri,
    name: logo.name,
    type: logo.mimeType,
  } as unknown as Blob);
}
