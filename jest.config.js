/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: { allowJs: true } }]
  },
  transformIgnorePatterns: ["node_modules/(?!cookie/)"],
  testEnvironment: "node",
  rootDir: ".",
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/*.tests.ts"
  ],
  collectCoverageFrom: ["src/**/*.ts"],
  coverageDirectory: "coverage"
};
