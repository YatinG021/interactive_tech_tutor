import { ButtonLink, Logo } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <Logo className="justify-center" />
        <h1 className="mt-10 text-4xl font-semibold tracking-tight text-fg">This page isn&apos;t here</h1>
        <p className="mt-3 text-fg-muted">The link may be out of date.</p>
        <ButtonLink href="/" className="mt-8">
          Back to home
        </ButtonLink>
      </div>
    </main>
  );
}
