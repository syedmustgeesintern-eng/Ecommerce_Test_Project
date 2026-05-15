export const cleanValue = (val: any) =>
  val === 'undefined' || val === undefined ? null : val;

import csvParser from 'csv-parser';
import { Readable } from 'stream';

export async function* parseCsvStream<T>(
  stream: Readable,
): AsyncGenerator<T> {
  const csvStream = stream.pipe(csvParser());

  for await (const row of csvStream) {
    yield row as T;
  }
}