// Hides the credentials of a connection string before it is printed, e.g.
// mongodb+srv://user:secret@cluster0.example.net/db -> mongodb+srv://***@cluster0.example.net/db
export const redactConnectionString = (url: string): string =>
  url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1***@');
