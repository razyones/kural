import { define } from "gunshi";

export default define({
  name: "kural",
  description:
    "Structural scoring system for TypeScript codebases — answers 'where should this code live?'",
  run: () => {
    console.log("Run `kural --help` to see available commands.");
  },
});
