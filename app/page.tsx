export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-5xl w-full text-center">
        <h1 className="text-6xl font-bold mb-6">
          Lucid
        </h1>
        <p className="text-2xl text-muted-foreground mb-8">
          Privacy-first Personal Data Bank
        </p>
        <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto">
          Your data. Your bank. Your rules. Store, manage, and license access to your personal data
          under explicit consent without ever surrendering ownership.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/register"
            className="rounded-lg bg-primary px-8 py-3 text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Get Started
          </a>
          <a
            href="/login"
            className="rounded-lg border border-border px-8 py-3 font-medium hover:bg-accent transition-colors"
          >
            Login
          </a>
        </div>
      </div>
    </main>
  );
}
