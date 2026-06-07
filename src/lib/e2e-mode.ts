type EnvSource = Partial<Pick<NodeJS.ProcessEnv, "E2E_TEST_MODE" | "NODE_ENV">>;

export function isE2eTestMode(env: EnvSource = process.env) {
  return env.E2E_TEST_MODE === "1" && env.NODE_ENV !== "production";
}
