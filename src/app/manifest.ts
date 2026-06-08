import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Briefly",
    short_name: "Briefly",
    description:
      "En digital hverdagsplatform, der samler det vigtigste i en rolig, intelligent briefing.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#153d32",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
