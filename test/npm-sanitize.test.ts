import { describe, expect, test } from 'vitest';
import {
  isForeignBinarySharpPackage,
  parseUnsupportedPlatformPackage,
} from '../src/core/npm-sanitize.js';

describe('isForeignBinarySharpPackage', () => {
  test('linux rejects win32 sharp binary', () => {
    expect(isForeignBinarySharpPackage('@img/sharp-win32-x64', 'linux')).toBe(true);
    expect(isForeignBinarySharpPackage('@img/sharp-linux-x64', 'linux')).toBe(false);
  });

  test('win32 rejects linux sharp binary', () => {
    expect(isForeignBinarySharpPackage('@img/sharp-linux-x64', 'win32')).toBe(true);
    expect(isForeignBinarySharpPackage('@img/sharp-win32-x64', 'win32')).toBe(false);
  });

  test('darwin rejects win32', () => {
    expect(isForeignBinarySharpPackage('@img/sharp-win32-x64', 'darwin')).toBe(true);
    expect(isForeignBinarySharpPackage('@img/sharp-darwin-x64', 'darwin')).toBe(false);
  });
});

describe('parseUnsupportedPlatformPackage', () => {
  test('parses scoped name with version suffix', () => {
    const msg =
      'npm error notsup Unsupported platform for @img/sharp-win32-x64@0.34.5: wanted {"os":"win32"}';
    expect(parseUnsupportedPlatformPackage(msg)).toBe('@img/sharp-win32-x64');
  });
});
