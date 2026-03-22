import {
  requireOptionalNativeModule,
  type IntBasedTypedArray,
  type UintBasedTypedArray,
} from 'expo-modules-core';
import nacl from 'tweetnacl';

type RandomValueArray = IntBasedTypedArray | UintBasedTypedArray;

interface ExpoCryptoModule {
  getRandomValues<T extends RandomValueArray>(typedArray: T): T;
}

interface CryptoLike {
  getRandomValues?<T extends RandomValueArray>(typedArray: T): T;
}

const RANDOM_VALUES_CHUNK_SIZE = 65536;

function fillRandomValues<T extends RandomValueArray>(
  typedArray: T,
  getRandomValues: <U extends RandomValueArray>(chunk: U) => U,
): T {
  for (let offset = 0; offset < typedArray.length; offset += RANDOM_VALUES_CHUNK_SIZE) {
    const chunk = typedArray.subarray(
      offset,
      Math.min(typedArray.length, offset + RANDOM_VALUES_CHUNK_SIZE),
    ) as T;
    getRandomValues(chunk);
  }

  return typedArray;
}

function installSecureRandom(): void {
  const g = globalThis as any;
  const existingCrypto = g.crypto as CryptoLike | undefined;

  const existingGetRandomValues = existingCrypto?.getRandomValues?.bind(existingCrypto);
  if (existingGetRandomValues) {
    nacl.setPRNG((buffer, length) => {
      fillRandomValues(buffer.subarray(0, length), existingGetRandomValues);
    });
    return;
  }

  const expoCrypto = requireOptionalNativeModule<ExpoCryptoModule>('ExpoCrypto');
  if (!expoCrypto?.getRandomValues) {
    throw new Error(
      '[crypto] ExpoCrypto.getRandomValues is unavailable. In Expo Go SDK 54 this module should be bundled; avoid importing a mismatched expo-crypto package version.',
    );
  }

  const getRandomValues = <T extends RandomValueArray>(typedArray: T): T =>
    fillRandomValues(typedArray, (chunk) => expoCrypto.getRandomValues(chunk));

  const cryptoLike: CryptoLike = existingCrypto ?? {};
  cryptoLike.getRandomValues = getRandomValues;
  g.crypto = cryptoLike;

  nacl.setPRNG((buffer, length) => {
    getRandomValues(buffer.subarray(0, length));
  });
}

installSecureRandom();
