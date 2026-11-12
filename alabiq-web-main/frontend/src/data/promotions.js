export const sponsoredReels = [
  {
    id: "taster-reel",
    brand: "Taster",
    partnerName: "Taster",
    tagline: "Featured partner",
    title: "Watch the latest from",
    titleHighlight: "Taster",
    description:
      "Catch our newest promo reel and discover comfort food favorites, available to order on Alabiq.",
    reelUrl: "https://www.facebook.com/reel/1951260275808733",
    logo: "/brands/taster.png",
    active: true,
  },
];

export const activeSponsoredReel =
  sponsoredReels.find((promo) => promo.active) ?? null;
