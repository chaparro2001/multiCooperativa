import { useRef } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { useBrand } from './brand';

/**
 * The cooperative's logo, or nothing when it has none. A link that stopped working (it expires)
 * is renewed once; a file that keeps failing does not turn into a request loop.
 */
export function BrandLogo({
  size,
  style,
  testID,
}: {
  size: number;
  style?: StyleProp<ImageStyle>;
  testID?: string;
}) {
  const { logoUrl, refreshLogo } = useBrand();
  const renewed = useRef(false);
  if (!logoUrl) return null;
  return (
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri: logoUrl }}
      onLoad={() => {
        renewed.current = false;
      }}
      onError={() => {
        if (renewed.current) return;
        renewed.current = true;
        refreshLogo();
      }}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
      testID={testID}
    />
  );
}
