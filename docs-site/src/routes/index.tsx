import { Link, createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import config from "../../docs.config";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout nav={{ title: config.name }}>
      <div className="flex flex-col items-center justify-center text-center flex-1">
        <h1 className="font-medium text-xl mb-4">{config.description}</h1>
        <Link
          to="/docs/$"
          params={{ _splat: "" }}
          className="px-3 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm mx-auto"
        >
          Open Docs
        </Link>
      </div>
    </HomeLayout>
  );
}
