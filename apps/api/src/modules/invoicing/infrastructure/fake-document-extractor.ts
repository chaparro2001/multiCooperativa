import type { DocumentExtractor, RawExtraction } from '../application/ports/document-extractor';

/** Test double of the vision model: returns a canned reading and records what it was given. */
export class FakeDocumentExtractor implements DocumentExtractor {
  readonly calls: { mediaType: string; bytes: number }[] = [];

  constructor(private reading: RawExtraction | null) {}

  setReading(reading: RawExtraction | null) {
    this.reading = reading;
  }

  async extract(file: { content: Uint8Array; mediaType: string }): Promise<RawExtraction | null> {
    this.calls.push({ mediaType: file.mediaType, bytes: file.content.byteLength });
    return this.reading;
  }
}
