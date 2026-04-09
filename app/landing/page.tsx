import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-black/5 bg-white/85 backdrop-blur-md animate-fade-down">
        <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between px-4 py-4 md:px-8 xl:px-12">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dff6f0] text-[#13c9a0] shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="text-2xl font-semibold tracking-tight">Messenger</span>
          </div>

          <Link
            href="/login"
            className="rounded-xl bg-[#13c9a0] px-6 py-2.5 font-medium text-white transition-transform duration-200 hover:scale-[1.02] hover:bg-[#10b48f]"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="relative flex min-h-screen items-center overflow-hidden px-4 pb-20 pt-28 md:px-8 xl:px-12">
        <div className="landing-bg-orb landing-bg-orb-left" />
        <div className="landing-bg-orb landing-bg-orb-right" />

        <div className="relative z-10 mx-auto grid w-full max-w-[92rem] items-center gap-12 md:grid-cols-2">
          <div>
            <h1 className="animate-fade-up text-5xl font-semibold tracking-tight text-slate-900 md:text-6xl lg:text-7xl">
              Connect instantly.
              <br />
              Everywhere.
            </h1>
            <p className="animate-fade-up animation-delay-150 mt-6 max-w-xl text-xl leading-8 text-slate-600">
              Seamless messaging across web and mobile. Stay close to the people who matter most, wherever life takes you.
            </p>

            <div className="animate-fade-up animation-delay-300 mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/login"
                className="rounded-xl bg-[#13c9a0] px-8 py-4 text-center font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:bg-[#10b48f]"
              >
                Open Web App
              </Link>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-8 py-4 font-medium text-slate-700 transition-all duration-200 hover:scale-[1.02] hover:bg-slate-50"
              >
                Download for Android
              </button>
            </div>
          </div>

          <div className="animate-fade-left animation-delay-200 relative">
            <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-[0_35px_80px_-35px_rgba(0,0,0,0.4)]">
              <Image
                src="https://images.unsplash.com/photo-1758876200754-17a09a6c2728?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200"
                alt="People connecting through messenger"
                width={1200}
                height={1200}
                className="h-full w-full rounded-[20px] object-cover"
              />
            </div>
            <div className="landing-float-glow" />
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 animate-fade-in animation-delay-700">
          <div className="flex h-10 w-6 justify-center rounded-full border-2 border-[#13c9a0]/40 pt-2">
            <span className="h-2 w-1 animate-scroll-dot rounded-full bg-[#13c9a0]/70" />
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-28 md:px-8 xl:px-12">
        <div className="mx-auto max-w-[92rem]">
          <div className="animate-fade-up text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl">Built for connection</h2>
            <p className="mx-auto mt-5 max-w-2xl text-xl text-slate-600">Everything you need to stay in touch, wherever you are.</p>
          </div>

          <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-14">
            <article className="feature-card animate-fade-up animation-delay-100">
              <div className="feature-icon">⚡</div>
              <h3 className="mt-5 text-2xl font-semibold text-slate-900">Lightning fast</h3>
              <p className="mt-3 text-lg text-slate-600">Messages delivered instantly. No lag, no delays.</p>
            </article>
            <article className="feature-card animate-fade-up animation-delay-250">
              <div className="feature-icon">🔒</div>
              <h3 className="mt-5 text-2xl font-semibold text-slate-900">Private and secure</h3>
              <p className="mt-3 text-lg text-slate-600">End-to-end encryption keeps your conversations safe.</p>
            </article>
            <article className="feature-card animate-fade-up animation-delay-400">
              <div className="feature-icon">🌐</div>
              <h3 className="mt-5 text-2xl font-semibold text-slate-900">Cross-platform</h3>
              <p className="mt-3 text-lg text-slate-600">Start on web, continue on mobile. Seamlessly synced.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#f5fbf9] px-4 py-28 md:px-8 xl:px-12">
        <div className="mx-auto grid max-w-[92rem] items-center gap-16 md:grid-cols-2">
          <div className="animate-fade-right">
            <h2 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl">Always within reach</h2>
            <p className="mt-7 text-xl leading-8 text-slate-600">
              Whether you are at your desk or on the go, your conversations travel with you. Pick up where you left off on any device.
            </p>
            <ul className="mt-8 space-y-4 text-lg text-slate-700">
              <li className="flex items-start gap-3"><span className="mt-2 h-2 w-2 rounded-full bg-[#13c9a0]" />Real-time sync across devices</li>
              <li className="flex items-start gap-3"><span className="mt-2 h-2 w-2 rounded-full bg-[#13c9a0]" />Rich media sharing and voice messages</li>
              <li className="flex items-start gap-3"><span className="mt-2 h-2 w-2 rounded-full bg-[#13c9a0]" />Group chats with unlimited members</li>
            </ul>
          </div>

          <div className="animate-fade-left animation-delay-150 relative">
            <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-[0_30px_70px_-35px_rgba(0,0,0,0.45)]">
              <Image
                src="https://images.unsplash.com/photo-1622532349398-3d9b2b8598c3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=900"
                alt="Person using messenger app on mobile"
                width={900}
                height={1125}
                className="h-full w-full rounded-[20px] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-28 text-center md:px-8 xl:px-12">
        <div className="mx-auto max-w-4xl animate-fade-up">
          <h2 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl">Start connecting today</h2>
          <p className="mt-6 text-xl text-slate-600">Join millions already using Messenger to stay in touch.</p>

          <div className="mt-12 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="rounded-xl bg-[#13c9a0] px-10 py-4 font-medium text-white transition-transform duration-200 hover:scale-[1.02] hover:bg-[#10b48f]"
            >
              Launch Web App
            </Link>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-slate-50 px-10 py-4 font-medium text-slate-700 transition-transform duration-200 hover:scale-[1.02] hover:bg-slate-100"
            >
              Get Android App
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5 bg-white px-4 py-10 md:px-8 xl:px-12">
        <div className="mx-auto flex max-w-[92rem] flex-col items-center justify-between gap-5 md:flex-row">
          <div className="flex items-center gap-2 text-slate-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dff6f0] text-[#13c9a0]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="font-semibold">Messenger</span>
          </div>
          <p className="text-slate-500">© 2026 Messenger. Connect everywhere.</p>
        </div>
      </footer>
    </div>
  );
}
