declare module 'y-websocket' {
  export function setupWSConnection(
    conn: any,
    req: any,
    opts?: { docName?: string } //optional settings like sheet id
  ): void;
}