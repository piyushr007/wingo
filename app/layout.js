import './globals.css';

export const metadata = {
  title: 'WINGO',
  description: 'A multiplayer WINGO game',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-wdark text-white">{children}</body>
    </html>
  );
}
