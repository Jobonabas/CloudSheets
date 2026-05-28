declare module 'y-websocket' {
  export function setupWSConnection(
    conn: any,
    req: any,
    opts?: { docName?: string } //optional settings like sheet id
  ): void;
}

declare module 'y-websocket/bin/utils.js' {
  export function setupWSConnection(
    conn: any,
    req: any,
    opts?: { docName?: string }
  ): void;
}

declare module 'y-websocket/bin/utils' {
  export function setupWSConnection(
    conn: any,
    req: any,
    options?: { docName?: string }
  ): void;
  
  export function setPersistence(persistence: any): void;
  export const docs: Map<string, any>;
}