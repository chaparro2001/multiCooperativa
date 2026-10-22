import { Fragment, useMemo } from 'react';
import { Platform, StyleSheet, type TextStyle, View } from 'react-native';

import { Text } from '@/ui/paper';

import { type Inline, parseMarkdown } from './markdown';

/** Renders an assistant answer: the Markdown subset of `markdown.ts`, selectable. */
export function MarkdownText({ source, style }: { source: string; style?: TextStyle }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => {
        const content = <Inlines inlines={block.inlines} />;
        if (block.kind === 'bullet' || block.kind === 'numbered') {
          return (
            <View key={index} style={styles.item}>
              <Text variant="bodyLarge" style={[style, styles.marker]}>
                {block.kind === 'bullet' ? '•' : block.marker}
              </Text>
              <Text variant="bodyLarge" style={[style, styles.itemText]} selectable>
                {content}
              </Text>
            </View>
          );
        }
        return (
          <Text
            key={index}
            variant="bodyLarge"
            style={[style, block.kind === 'heading' && styles.bold]}
            selectable
          >
            {content}
          </Text>
        );
      })}
    </View>
  );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((inline, index) => (
        <Fragment key={index}>
          {inline.bold || inline.code ? (
            <Text style={[inline.bold && styles.bold, inline.code && styles.code]}>
              {inline.text}
            </Text>
          ) : (
            inline.text
          )}
        </Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: 6 },
  item: { flexDirection: 'row', gap: 6 },
  marker: { minWidth: 14 },
  itemText: { flex: 1 },
  bold: { fontWeight: '700' },
  code: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
