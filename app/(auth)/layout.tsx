// LD-108: without this the auth pages are a landmark-less island. Someone
// using a screen reader on /login had no main region to jump to.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <main id="main" className="w-full max-w-md">
        {children}
      </main>
    </div>
  );
}
