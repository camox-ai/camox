import { Type, createBlock } from "camox/createBlock";

import { Pill } from "@/components/Pill";

const largeVideo = createBlock({
  id: "large-video",
  title: "Large Video",
  description:
    "Use this block to showcase a container-wide video with a small pill label above it. Good fit for product demos, walkthroughs, or any section where a single video should take center stage.",
  content: {
    pill: Type.String({
      default: "Watch the demo",
      title: "Pill label",
    }),
    video: Type.File({
      accept: ["video/mp4", "video/webm", "video/quicktime"],
      title: "Video",
    }),
  },
  settings: {
    autoplay: Type.Boolean({
      default: false,
      title: "Autoplay",
    }),
    hideControls: Type.Boolean({
      default: false,
      title: "Hide controls",
    }),
  },
  component: LargeVideoComponent,
  toMarkdown: (c) => [c.pill, c.video],
});

function LargeVideoComponent() {
  const autoplay = largeVideo.useSetting("autoplay");
  const hideControls = largeVideo.useSetting("hideControls");
  return (
    <section className="py-12 sm:py-16">
      <div className="container mx-auto px-4">
        <largeVideo.Field name="pill">
          {(props) => <Pill {...props} className="mb-4 sm:mb-6" />}
        </largeVideo.Field>
        <div className="bg-accent/30 border-accent overflow-hidden rounded-xl border">
          <largeVideo.File name="video">
            {(_props, { url }) => (
              <video
                src={url}
                controls={!hideControls}
                autoPlay={autoplay}
                muted={autoplay}
                loop={autoplay}
                playsInline
                className="h-full w-full"
              />
            )}
          </largeVideo.File>
        </div>
      </div>
    </section>
  );
}

export { largeVideo as block };
