import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** A photo or PDF of a delivery note or invoice, ready to upload (US-INV-05). */
export interface ScanFile {
  uri: string;
  name: string;
  mimeType: 'image/jpeg' | 'application/pdf';
}

/** NFR-INV-03: images are reduced on the device, longest side of 2000 px at most. */
export const MAX_IMAGE_SIDE = 2000;

/** The camera exists on devices; on the web only the gallery / file chooser does. */
export const cameraAvailable = Platform.OS !== 'web';

export type PickResult =
  { kind: 'ok'; file: ScanFile } | { kind: 'cancelled' } | { kind: 'denied' };

async function fromImage(asset: ImagePicker.ImagePickerAsset): Promise<ScanFile> {
  const longest = Math.max(asset.width, asset.height);
  const resize =
    longest > MAX_IMAGE_SIDE
      ? asset.width >= asset.height
        ? { width: MAX_IMAGE_SIDE }
        : { height: MAX_IMAGE_SIDE }
      : null;
  const result = await manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  const base = (asset.fileName ?? 'scan').replace(/\.[^.]+$/, '');
  return { uri: result.uri, name: `${base}.jpg`, mimeType: 'image/jpeg' };
}

/** Camera (devices only). */
export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { kind: 'denied' };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { kind: 'ok', file: await fromImage(asset) } : { kind: 'cancelled' };
}

/** Gallery on devices, file chooser on the web. */
export async function chooseImage(): Promise<PickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { kind: 'ok', file: await fromImage(asset) } : { kind: 'cancelled' };
}

export async function choosePdfScan(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset
    ? { kind: 'ok', file: { uri: asset.uri, name: asset.name, mimeType: 'application/pdf' } }
    : { kind: 'cancelled' };
}

/**
 * Appends the file to a FormData. React Native reads `{ uri, name, type }`;
 * the web needs a real Blob, which `fetch` gives for blob: and data: URIs.
 */
export async function appendScan(form: FormData, field: string, file: ScanFile): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    form.append(field, new Blob([blob], { type: file.mimeType }), file.name);
    return;
  }
  form.append(field, {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
}
