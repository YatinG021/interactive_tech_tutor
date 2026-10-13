import { FeatureReel } from "@/components/landing/FeatureReel";
import {
  FeatureGrid,
  FinalCta,
  Hero,
  HowItWorks,
  SectionHeading,
  SiteFooter,
  SiteNav,
  TopicMarquee
} from "@/components/landing/Sections";

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <TopicMarquee />
        <HowItWorks />
        <section id="reel" className="relative scroll-mt-20 py-24">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHeading
              eyebrow="See it in action"
              title="One topic, four ways to learn it"
              body="Watch the simulation, steer it with your voice, question the tutor, then test yourself."
            />
            <div className="mt-14">
              <FeatureReel />
            </div>
          </div>
        </section>
        <FeatureGrid />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
