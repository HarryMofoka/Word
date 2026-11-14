declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts' {}

declare module 'jsr:@supabase/supabase-js@2' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type SupabaseClient = any;
  export interface User {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(...args: any[]): SupabaseClient;
}

declare module 'npm:@supabase/supabase-js@2' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type SupabaseClient = any;
  export interface User {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(...args: any[]): SupabaseClient;
}

declare module 'npm:ethers@6.13.4' {
  export const ZeroAddress: string;
  export const ZeroHash: string;
  export interface TypedDataDomain {
    name?: string;
    version?: string;
    chainId?: number | bigint;
    verifyingContract?: string;
    salt?: string;
  }
  export interface TypedDataField {
    name: string;
    type: string;
  }
  export class AbiCoder {
    static defaultAbiCoder(): {
      encode(types: readonly string[], values: readonly unknown[]): string;
    };
  }
  export function getAddress(address: string): string;
  export function isAddress(value: unknown): value is string;
  export function keccak256(data: Uint8Array | string): string;
  export function toUtf8Bytes(str: string): Uint8Array;
  export function verifyMessage(message: string | Uint8Array, sig: string): string;
  export function verifyTypedData(
    domain: TypedDataDomain | Record<string, unknown>,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, unknown>,
    signature: string
  ): string;
  export class TypedDataEncoder {
    static hash(
      domain: TypedDataDomain | Record<string, unknown>,
      types: Record<string, Array<TypedDataField>>,
      value: Record<string, unknown>
    ): string;
  }
}
