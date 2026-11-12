import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Pause } from "lucide-react";

const highlights = [
  "Order food, shop, or book rides in one app",
  "Real-time GPS tracking on every delivery",
  "Secure payments and instant notifications",
];

const VideoShowcase = () => {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  return (
    <section
      ref={sectionRef}
      id="see-it-in-action"
      className="relative w-full bg-brand-dark px-8 md:px-20 py-24 border-t border-white/5 overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-32 right-0 w-[480px] h-[480px] rounded-full bg-brand-orange/10 blur-[120px]" />
        <div className="absolute bottom-0 -left-32 w-[360px] h-[360px] rounded-full bg-brand-red/8 blur-[100px]" />
      </div>

      <div className="max-w-7xl mx-auto relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-6"
        >
          <span className="text-brand-orange text-sm font-bold tracking-widest uppercase">
            See It In Action
          </span>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
            Watch Alabiq{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
              work for you
            </span>
          </h2>

          <p className="text-brand-grey text-base md:text-lg leading-relaxed max-w-lg">
            From browsing restaurants to live order tracking, see how
            Alabiq makes everyday delivery and booking effortless.
          </p>

          <ul className="space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-brand-orange/20 text-brand-orange flex items-center justify-center text-xs shrink-0">
                  ✓
                </span>
                <span className="text-white/80 text-sm md:text-base">{item}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative w-full"
        >
          <div className="absolute -inset-4 bg-brand-orange/15 rounded-[2rem] blur-2xl opacity-60 pointer-events-none" />

          <div className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/40 group">
            <video
              ref={videoRef}
              src="/media/alabiq-ads.mp4"
              autoPlay
              loop
              muted
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-linear-to-t from-brand-dark/70 via-transparent to-brand-dark/20 pointer-events-none" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none" />

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause video" : "Play video"}
              className="absolute inset-0 flex items-center justify-center cursor-pointer group/play"
            >
              <span
                className={`flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-brand-orange/90 text-white shadow-xl shadow-brand-orange/40 transition-all duration-300 ${
                  isPlaying
                    ? "opacity-0 group-hover/play:opacity-100 scale-90 group-hover/play:scale-100"
                    : "opacity-100 scale-100 hover:scale-110"
                }`}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 md:w-7 md:h-7 fill-current" />
                ) : (
                  <Play className="w-6 h-6 md:w-7 md:h-7 fill-current ml-0.5" />
                )}
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default VideoShowcase;
