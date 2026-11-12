import React from "react";
import Navbar from "./components/Navbar";
import Hero from "./sections/Hero";
import AboutUs from "./sections/AboutUs";
import Services from "./sections/Services";
import VideoShowcase from "./sections/VideoShowcase";
import PromoBanners from "./sections/PromoBanners";
import HowItWorks from "./sections/HowItWorks";
import SponsoredReel from "./sections/SponsoredReel";
import FAQ from "./sections/FAQ";
import Footer from "./sections/Footer";
import PopularNearYou from "./sections/PopularNearYou";

function App() {
  return (
    <div className="min-h-screen bg-brand-light text-brand-dark pt-20">
      <Navbar />

      <main>
        <Hero />
        <div className="hidden 2xl:block">
          <PopularNearYou />
          <Services />
          <PromoBanners />
          <VideoShowcase />
          <HowItWorks />
          <SponsoredReel />
          <AboutUs />
          <FAQ />
        </div>
        <Footer />
      </main>
    </div>
  );
}

export default App;
